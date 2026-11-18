import {Body,Controller,Delete,Get,Param,Post,Put,Res,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {Response} from 'express';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {RolesGuard} from '../common/roles.guard';
import {Roles} from '../common/roles.decorator';
import {CurrentUser,RequestUser} from '../common/current-user';
import {InspectionDraftsService,draftPhotoType} from './inspection-drafts.service';
import {InspectionsService,UploadedInspectionFile} from './inspections.service';
@Controller('inspection-drafts')
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles('inspection_org')
export class InspectionDraftsController {
 constructor(private readonly drafts:InspectionDraftsService,private readonly inspections:InspectionsService){}
 @Get() list(@CurrentUser() user:RequestUser){return this.drafts.list(user);}
 @Get(':id') detail(@CurrentUser() user:RequestUser,@Param('id') id:string){return this.drafts.detail(user,id);}
 @Put(':id') save(@CurrentUser() user:RequestUser,@Param('id') id:string,@Body() body:{organizationId:string;version:number;fields:unknown}){return this.drafts.save(user,id,body);}
 @Delete(':id') remove(@CurrentUser() user:RequestUser,@Param('id') id:string){return this.drafts.remove(user,id);}
 @Post(':id/files/:type')
 @UseInterceptors(FileInterceptor('file',{limits:{fileSize:12*1024*1024}}))
 upload(@CurrentUser() user:RequestUser,@Param('id') id:string,@Param('type') type:string,@Body('version') version:string,@UploadedFile() file:UploadedInspectionFile){return this.drafts.upload(user,id,type,Number(version),file);}
 @Get(':id/files/:type')
 async file(@CurrentUser() user:RequestUser,@Param('id') id:string,@Param('type') type:string,@Res() response:Response){const data=await this.drafts.file(user,id,type);response.set({'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});response.send(data.buffer);}
 @Post(':id/attach/:inspectionId')
 async attach(@CurrentUser() user:RequestUser,@Param('id') id:string,@Param('inspectionId') inspectionId:string,@Body() body:{type:string;lat?:number;lng?:number}){
  const {file,buffer}=await this.drafts.file(user,id,body.type);
  return this.inspections.uploadPhoto(inspectionId,draftPhotoType(body.type),{buffer,originalname:file.name,mimetype:file.mime},user,{lat:body.lat,lng:body.lng});
 }
}
