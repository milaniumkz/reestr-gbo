import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {StorageService} from '../storage/storage.service';
import {RequestUser} from '../common/current-user';
import {isInspectorSubject} from '../identity/identity-policy';
import {UploadedInspectionFile} from './inspections.service';
import {PhotoModerationService} from '../photo-moderation/photo-moderation.service';
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const allowed=new Set(('screen organizationId inspectionCertificateNumber ownerId ownerName ownerPhone ownerAddress ownerKind inspectionIssuedAt vehiclePlate vehicleVin vehicleMakeModel vehicleYear vehicleColor cylinderNumber secondCylinderNumber cylinderMaker cylinderVolume cylinderProductionDate cylinderFuel reducerName controlUnitName cylinderShape draftVehicleId draftInspectionId cylinderPhotoName vehiclePhotoName techPassportPhotoName documentFileName usesTwoCylinders cylinderPhotoUploaded vehiclePhotoUploaded techPassportPhotoUploaded protectedInspectionPhotosLocked secondCylinderValues packageDocumentNames packageDocumentUploaded photoReviewNotices cylinderPhotoPosition vehiclePhotoPosition techPassportPhotoPosition packageDocumentPositions localDraftId').split(' '));
const types=new Set(('primary_cylinder primary_vehicle primary_tech cylinder_label_2 tech_passport_back applicant_application applicant_questionnaire gas_work_record cylinder_work_record gas_inspection_report cylinder_inspection_report cylinder_work_record_2 cylinder_inspection_report_2 certificate_document certificate_document_2').split(' '));
export const draftPhotoType=(type:string)=>({primary_cylinder:'cylinder_label',primary_vehicle:'vehicle_photo',primary_tech:'tech_passport'}[type]??type);
type DraftFile={objectKey:string;name:string;checksum:string;mime:string};
const changed=()=>new ConflictException('Черновик изменён на другом устройстве. Откройте его заново из списка черновиков.');
@Injectable()
export class InspectionDraftsService {
 constructor(private readonly db:PrismaService,private readonly storage:StorageService,private readonly moderation:PhotoModerationService){}
 private async inspector(actor:RequestUser){
  const user=await this.db.user.findUnique({where:{id:actor.sub},include:{roles:true,memberships:{select:{role:true}}}});
  if(!user||user.isBlocked||!isInspectorSubject(user))throw new ForbiddenException('Черновики доступны только инспектору');
 }
 private async organization(actor:RequestUser,id:string){
  if(typeof id!=='string'||!uuid.test(id))throw new BadRequestException('Недопустимый инспекционный орган');
  const m=await this.db.organizationMember.findFirst({where:{userId:actor.sub,organizationId:id,role:{in:['inspector','inspection_org']},organization:{status:'active',type:'inspection_org'}}});
  if(!m)throw new ForbiddenException('Нет доступа к инспекционному органу');
 }
 private fields(value:unknown,organizationId:string,id:string){
  if(!value||typeof value!=='object'||Array.isArray(value)||Buffer.byteLength(JSON.stringify(value))>150000)throw new BadRequestException('Недопустимые данные черновика');
  const f=value as Record<string,any>;
  if(!Number.isInteger(f.screen)||f.screen<15||f.screen>23)throw new BadRequestException('Недопустимый шаг черновика');
  if(Object.keys(f).some(k=>!allowed.has(k)))throw new BadRequestException('Неизвестное поле черновика');
  return {...f,organizationId,localDraftId:id};
 }
 private async owned(actor:RequestUser,id:string){
  if(!uuid.test(id))throw new BadRequestException('Недопустимый номер черновика');
  await this.inspector(actor);
  const row=await this.db.inspectionDraft.findFirst({where:{id,userId:actor.sub}});
  if(!row)throw new NotFoundException('Черновик не найден');
  await this.organization(actor,row.organizationId);return row;
 }
 async list(actor:RequestUser){
  await this.inspector(actor);
  return {items:await this.db.inspectionDraft.findMany({where:{userId:actor.sub,organization:{status:'active',members:{some:{userId:actor.sub,role:{in:['inspector','inspection_org']}}}}},select:{id:true,organizationId:true,fields:true,files:true,version:true,updatedAt:true},orderBy:{updatedAt:'desc'},take:100})};
 }
 async detail(actor:RequestUser,id:string){return this.owned(actor,id);}
 async save(actor:RequestUser,id:string,input:{organizationId:string;version:number;fields:unknown}){
  if(!uuid.test(id)||!Number.isInteger(input.version)||input.version<0)throw new BadRequestException('Недопустимый черновик');
  await this.inspector(actor);await this.organization(actor,input.organizationId);
  const fields=this.fields(input.fields,input.organizationId,id);
  if(input.version===0){
   try{return await this.db.inspectionDraft.create({data:{id,userId:actor.sub,organizationId:input.organizationId,fields}});}
   catch(e:any){if(e.code==='P2002')throw changed();throw e;}
  }
  const row=await this.owned(actor,id);
  if(row.organizationId!==input.organizationId)throw new ForbiddenException('Инспекционный орган черновика менять нельзя');
  const result=await this.db.inspectionDraft.updateMany({where:{id,userId:actor.sub,version:input.version},data:{fields,version:{increment:1}}});
  if(!result.count)throw changed();return this.owned(actor,id);
 }
 async upload(actor:RequestUser,id:string,type:string,version:number,file:UploadedInspectionFile){
  const row=await this.owned(actor,id);
  if(!types.has(type)||!file?.buffer?.length||file.buffer.length>12*1024*1024||!Number.isInteger(version))throw new BadRequestException('Недопустимый файл черновика');
  if(row.version!==version)throw changed();
  const files=row.files as Record<string,DraftFile>,checksum=createHash('sha256').update(file.buffer).digest('hex');
  if(files[type]?.checksum===checksum)return row;
  await this.moderation.check(file.buffer,file.originalname,draftPhotoType(type));
  const objectKey=`inspection-drafts/${actor.sub}/${id}/${randomUUID()}`;
  await this.storage.putObject({key:objectKey,body:file.buffer,createdById:actor.sub});
  const next={...files,[type]:{objectKey,name:file.originalname.slice(0,200),checksum,mime:file.buffer.subarray(0,5).toString()==='%PDF-'?'application/pdf':'application/octet-stream'}};
  const result=await this.db.inspectionDraft.updateMany({where:{id,userId:actor.sub,version},data:{files:next,version:{increment:1}}});
  if(!result.count)throw changed();return this.owned(actor,id);
 }
 async file(actor:RequestUser,id:string,type:string){
  const row=await this.owned(actor,id);if(!types.has(type))throw new BadRequestException('Недопустимый тип файла');
  const file=(row.files as Record<string,DraftFile>)[type];
  if(!file||!file.objectKey.startsWith(`inspection-drafts/${actor.sub}/${id}/`))throw new NotFoundException('Файл черновика не найден');
  const buffer=await this.storage.readObject(file.objectKey);
  if(createHash('sha256').update(buffer).digest('hex')!==file.checksum)throw new BadRequestException('Файл черновика повреждён');
  return {file,buffer};
 }
 async remove(actor:RequestUser,id:string){await this.owned(actor,id);await this.db.inspectionDraft.deleteMany({where:{id,userId:actor.sub}});return {ok:true};}
}
