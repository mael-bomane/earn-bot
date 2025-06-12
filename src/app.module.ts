import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
//import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
import { PrismaModule } from './prisma/prisma.module';
import { BountyCacheModule } from './bounty-cache/bounty-cache.module';
import { NotificationModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: false,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        APP_PORT: Joi.number().default(3000),
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        REDIS_DB: Joi.number().optional().default(0), // Often 0 for default DB
        DATABASE_URL: Joi.string().required(), // Add validation for your Prisma database URL
        ADMIN_CHAT_ID: Joi.string().optional(), // For Telegram notifications
      }),
      validationOptions: {
        allowUnknown: true, // Allow other env vars not in schema
        abortEarly: true,   // Abort validation on first error
      },
    }),
    CacheModule.register({ // Configure CacheModule for in-memory cache
      ttl: 3600,     // Cache TTL in seconds (e.g., 1 hour)
      max: 100,      // Max number of items in cache (optional, default is unlimited)
      isGlobal: true,
    }),
    PrismaModule,
    TelegramModule,
    BountyCacheModule,
    NotificationModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
