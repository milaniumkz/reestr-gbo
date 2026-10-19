import {safeDetails,safeText} from '../observability/safe-data';
import {traceFields} from '../observability/request-context';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(){
    super();
    this.$use(async(params,next)=>{
      if(params.model==='AuditLog'&&['create','createMany','upsert'].includes(params.action)){
        const clean=(data:any)=>{if(!data)return data;const {location,...trace}=traceFields();return {...trace,...data,metadata:data.metadata?safeDetails(data.metadata):undefined,entityId:data.entity==='auth'&&data.entityId&&/\d{8,}/.test(data.entityId)?undefined:data.entityId};};
        if(params.action==='createMany')params.args.data=Array.isArray(params.args.data)?params.args.data.map(clean):clean(params.args.data);
        else if(params.action==='upsert'){params.args.create=clean(params.args.create);params.args.update=clean(params.args.update);}
        else params.args.data=clean(params.args.data);
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
