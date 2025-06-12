import { Module } from '@nestjs/common';
import { BountyCacheService } from './bounty-cache.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    NotificationModule,
  ],
  providers: [
    BountyCacheService,
  ],
  exports: [BountyCacheService],
})
export class BountyCacheModule { }
