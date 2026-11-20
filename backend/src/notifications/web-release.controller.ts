import {Body,Controller,Get,Headers,Post,UseGuards} from '@nestjs/common';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {CurrentUser,RequestUser} from '../common/current-user';
import {WebReleaseService} from './web-release.service';
@UseGuards(JwtAuthGuard)
@Controller('notifications/push')
export class WebReleaseController {
 constructor(private readonly releases:WebReleaseService){}
 @Get() config(@CurrentUser() user:RequestUser){return this.releases.config(user);}
 @Post() subscribe(@CurrentUser() user:RequestUser,@Body() body:any,@Headers('origin') origin:string){return this.releases.subscribe(user,body,origin);}
 @Post('unsubscribe') disable(@CurrentUser() user:RequestUser,@Body() body:any){return this.releases.unsubscribe(user,body);}
}
