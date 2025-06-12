import { Module } from '@nestjs/common';
import { BountyNotificationService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    PrismaModule,
    TelegramModule
  ],
  providers: [BountyNotificationService],
  exports: [BountyNotificationService],
})
export class NotificationModule { }
