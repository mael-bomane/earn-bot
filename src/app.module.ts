import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
// import { FetcherModule } from './fetcher/fetcher.module';
import { PrismaModule } from './prisma/prisma.module'; // Import PrismaModule
// import { RedisModule } from './redis/redis.module';   // Import RedisModule

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
    ScheduleModule.forRoot(),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    PrismaModule,
    //RedisModule,
    TelegramModule,
    //FetcherModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
