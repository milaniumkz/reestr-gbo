import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {PhotoAnalysisLimiter} from '../photo-moderation/photo-analysis-limiter';
import {assessPassportText,codeHash,PassportVehicle} from './passport-content';

@Injectable()
export class TechPassportService {
 private readonly limiter=new PhotoAnalysisLimiter(1,2,5000);
 async verify(buffer:Buffer,vehicle:PassportVehicle,back=false,primaryVerified=false) {
  if(buffer.length>12*1024*1024) throw new BadRequestException('Максимальный размер техпаспорта — 12 МБ');
  const release=await this.limiter.acquire();
  const deadline=Date.now()+45_000;
  let directory:string|undefined;
  const run=(command:string,args:string[],limit:number)=>new Promise<string>((resolve,reject)=>{
   const timeout=Math.min(limit,deadline-Date.now());
   if(timeout<=0){reject(new ServiceUnavailableException('Проверка техпаспорта заняла слишком много времени. Повторите загрузку'));return;}
   execFile(command,args,{timeout,maxBuffer:2*1024*1024,env:{...process.env,OMP_THREAD_LIMIT:'1'}},(error,stdout)=>{
    if(error){
     if((error as NodeJS.ErrnoException).code==='ENOENT') reject(new ServiceUnavailableException('Сервис проверки техпаспорта временно недоступен'));
     else if(error.killed) reject(new ServiceUnavailableException('Проверка техпаспорта заняла слишком много времени. Повторите загрузку'));
     else reject(new BadRequestException('Не удалось прочитать техпаспорт. Проверьте файл и загрузите оригинальный PDF или чёткое фото'));
    }else resolve(stdout);
   });
  });
  try{
   directory=await mkdtemp(join(tmpdir(),'reestr-passport-'));
   const pdf=buffer.subarray(0,5).toString()==='%PDF-';
   const images:string[]=[];
   if(pdf){
    const path=join(directory,'document.pdf');await writeFile(path,buffer,{mode:0o600});
    const info=await run('pdfinfo',[path],5000);
    if(/Encrypted:\s*yes/i.test(info)) throw new BadRequestException('Загрузите PDF техпаспорта без пароля');
    const pages=Number(info.match(/^Pages:\s*(\d+)/m)?.[1]);
    if(!Number.isInteger(pages)||pages<1||pages>4) throw new BadRequestException('Загрузите техпаспорт отдельным PDF: не более 4 страниц');
    for(let page=1;page<=pages;page++){
     const prefix=join(directory,'page-'+page);
     await run('pdftoppm',['-f',String(page),'-singlefile','-r','180','-scale-to','2200','-png',path,prefix],7000);
     images.push(prefix+'.png');
    }
   }else{
    const image=join(directory,'photo.png');
    try{
     await sharp(buffer,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().flatten({background:'#ffffff'}).resize({width:2200,height:2200,fit:'inside'}).png().toFile(image);
    }catch {throw new BadRequestException('Не удалось прочитать фото техпаспорта');}
    images.push(image);
   }
   let text='';
   for(const image of images) text+='\n'+await run('tesseract',[image,'stdout','-l','rus+kaz+eng','--psm','11'],12000);
   let assessment=assessPassportText(text,vehicle,pdf,back,primaryVerified);
   if(!assessment.accepted && Date.now()+4000<deadline){
    // A second page-layout mode helps cards with tightly spaced tables.
    for(const image of images) text+='\n'+await run('tesseract',[image,'stdout','-l','rus+kaz+eng','--psm','6'],10000);
    assessment=assessPassportText(text,vehicle,pdf,back,primaryVerified);
   }
   if(!assessment.accepted) throw new BadRequestException(assessment.reason);
   return {
    proof:{kind:'vehicle_registration',status:'content_matched',version:'local-passport-v1',source:pdf?'pdf_visual_ocr':'image_ocr',vinHash:codeHash(vehicle.vin),plateHash:codeHash(vehicle.plateNumber),matchedVin:assessment.matchedVin,matchedPlate:assessment.matchedPlate,checkedAt:new Date().toISOString()},
    reason:assessment.reason+'\nПодлинность ЭЦП и выдача государственным органом автоматически не подтверждены',
   };
  }finally{if(directory) await rm(directory,{recursive:true,force:true}).catch(()=>undefined);release();}
 }
}
