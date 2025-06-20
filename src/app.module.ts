import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
        DATABASE_URL: Joi.string().required(), // Add validation for your Prisma database URL
      }),
      validationOptions: {
        allowUnknown: true, // Allow other env vars not in schema
        abortEarly: true,   // Abort validation on first error
      },
    }),
    CacheModule.register({ // Configure CacheModule for in-memory cache
      ttl: 0,     // no expiry, since we override values
      max: 1,      // only 1 cached item, being a snapshot of the `Bounties` on the database
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
