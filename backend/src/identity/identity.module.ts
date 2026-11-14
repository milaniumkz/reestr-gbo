import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {InspectorIdentityController} from './identity.controller';
import {InspectorIdentityService} from './identity.service';
import {IdentityEngine} from './identity-engine';
@Module({imports:[AuthModule],controllers:[InspectorIdentityController],providers:[InspectorIdentityService,IdentityEngine]})
export class InspectorIdentityModule{}
