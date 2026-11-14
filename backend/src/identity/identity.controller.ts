import {Body,Controller,Get,Param,Post,Query,Res,Request,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {RolesGuard} from '../common/roles.guard';
import {Roles} from '../common/roles.decorator';
import {InspectorIdentityService} from './identity.service';
@Controller('auth/identity')
@UseGuards(JwtAuthGuard,RolesGuard)
export class InspectorIdentityController {
 constructor(private readonly identity:InspectorIdentityService){}
 @Get('status') status(@Request() r:any){return this.identity.status(r.user);}
 @Post('challenge') challenge(@Request() r:any,@Body() b:{consentVersion:string}){return this.identity.challenge(r.user,b.consentVersion);}
 @Post(':id/video') @UseInterceptors(FileInterceptor('video',{limits:{fileSize:16*1024*1024,files:1,fields:1}}))
 video(@Request() r:any,@Param('id') id:string,@Body() b:{challengeToken:string},@UploadedFile() file:any){return this.identity.submit(r.user,id,b.challengeToken,file?.buffer);}
 @Post('challenge-status') result(@Request() r:any,@Body() b:{challengeId:string;challengeToken:string}){return this.identity.result(r.user,b.challengeId,b.challengeToken);}
 @Get('admin/:userId') @Roles('super_admin') adminStatus(@Param('userId') id:string){return this.identity.adminStatus(id);}
 @Get('admin/:userId/video') @Roles('super_admin') async adminVideo(@Request() r:any,@Param('userId') id:string,@Query('challengeId') challengeId:string|undefined,@Res() response:any){
  const video=await this.identity.adminVideo(r.user,id,challengeId);
  response.set({'Content-Type':video.readUInt32BE(0)===0x1a45dfa3?'video/webm':'video/mp4','Cache-Control':'no-store','Content-Length':video.length,'X-Content-Type-Options':'nosniff'}).send(video);
 }
 @Post('admin/:userId/reset') @Roles('super_admin') reset(@Request() r:any,@Param('userId') id:string,@Body() b:{reason:string}){return this.identity.reset(r.user,id,b.reason);}
}
