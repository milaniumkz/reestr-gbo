import {BadRequestException} from '@nestjs/common';
import {mediaGrant} from './media-security';
import {requestContext} from '../observability/request-context';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, writeFile,readFile,realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StorageService {
  private readonly bucket: string;
  private readonly client: S3Client;
  private bucketChecked = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'ersi-gbo';
    this.client = new S3Client({
      endpoint: this.config.get<string>('S3_ENDPOINT'),
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? 'ersi',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? 'ersi_password',
      },
    });
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType?: string;
    createdById?: string;
  }) {
    this.assertKey(input.key);
    const b=input.body;
    input.contentType=b.subarray(0,5).toString()==='%PDF-'?'application/pdf':b.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.subarray(0,3).toString()==='GIF'?'image/gif':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'image/webp':'application/octet-stream';
    if (this.config.get<string>('STORAGE_DRIVER') === 'local') {
      const root = this.config.get<string>('LOCAL_STORAGE_PATH') ?? '/opt/reestr/storage';
      const objectPath = join(root, this.bucket, input.key);
      await mkdir(dirname(objectPath), { recursive: true });
      await writeFile(objectPath, input.body);
      return this.recordObject(input);
    }

    await this.ensureBucket();
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }));
    return this.recordObject(input);
  }

  objectUrl(objectKey: string) {
    if(process.env.MEDIA_SIGNING_ENABLED==='true'){
      const actor=requestContext.getStore()?.request.user;
      const grant=mediaGrant({key:objectKey,actorId:actor?.sub,sid:actor?.sid});
      const origin=this.config.get<string>('MEDIA_PUBLIC_ORIGIN')??'https://89-207-255-42.sslip.io';
      return {objectKey,url:`${origin}/api/v1/media/view?grant=${grant}`};
    }

    const publicUrl = this.config.get<string>('S3_PUBLIC_URL');
    return {
      objectKey,
      url: publicUrl
        ? `${publicUrl}/${this.bucket}/${objectKey}`
        : `/storage/${this.bucket}/${objectKey}`,
    };
  }

  private assertKey(key:string){if(!key||key.includes('\\')||key.includes('\0')||key.startsWith('/')||key.split('/').some(part=>part==='..'||part==='.'||!part))throw new BadRequestException('Недопустимый путь файла');}
  async readObject(key:string){
    this.assertKey(key);
    if(this.config.get<string>('STORAGE_DRIVER')==='local'){
      const root=await realpath(join(this.config.get<string>('LOCAL_STORAGE_PATH')??'/opt/reestr/storage',this.bucket));
      const path=await realpath(join(root,key));if(!path.startsWith(root+'/'))throw new BadRequestException('Файл вне закрытого хранилища');
      return readFile(path);
    }
    const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));
    if(!response.Body)throw new BadRequestException('Файл недоступен');return Buffer.from(await response.Body.transformToByteArray());
  }

  private async ensureBucket() {
    if (this.bucketChecked) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    this.bucketChecked = true;
  }

  private async recordObject(input: {
    key: string;
    body: Buffer;
    contentType?: string;
    createdById?: string;
  }) {
    const result = this.objectUrl(input.key);
    const recorded=await this.prisma.storageObject.upsert({
      where: { objectKey: input.key },
      update: {
        bucket: this.bucket,
        contentType: input.contentType,
        sizeBytes: input.body.length,
        checksum: createHash('sha256').update(input.body).digest('hex'),
        createdById: input.createdById,
      },
      create: {
        objectKey: input.key,
        bucket: this.bucket,
        contentType: input.contentType,
        sizeBytes: input.body.length,
        checksum: createHash('sha256').update(input.body).digest('hex'),
        createdById: input.createdById,
      },
    });
    return {...result,id:recorded.id};
  }
}
