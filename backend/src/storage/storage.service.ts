import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
    const publicUrl = this.config.get<string>('S3_PUBLIC_URL');
    return {
      objectKey,
      url: publicUrl
        ? `${publicUrl}/${this.bucket}/${objectKey}`
        : `/storage/${this.bucket}/${objectKey}`,
    };
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
    await this.prisma.storageObject.upsert({
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
    return result;
  }
}
