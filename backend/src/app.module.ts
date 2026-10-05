import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BannersModule } from './banners/banners.module';
import { CamerasModule } from './cameras/cameras.module';
import { CertificatesModule } from './certificates/certificates.module';
import { EquipmentModule } from './equipment/equipment.module';
import { HealthModule } from './health/health.module';
import { InspectionsModule } from './inspections/inspections.module';
import { LegalModule } from './legal/legal.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistryModule } from './registry/registry.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379' },
      }),
    }),
    PrismaModule,
    StorageModule,
    AuditModule,
    BannersModule,
    EquipmentModule,
    HealthModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    OrganizationsModule,
    RegistryModule,
    InspectionsModule,
    LegalModule,
    CertificatesModule,
    PaymentsModule,
    CamerasModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
