import { Module } from '@nestjs/common';
import { FetcherService } from './fetcher.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TELEGRAF_BOT } from 'src/telegram/telegram.constants'; // Assuming you want to notify bot
import { Telegraf } from 'telegraf';

@Module({
  imports: [], // HttpModule and ConfigModule are global
  providers: [
    // Redis Client Provider
    {
      provide: 'REDIS_CLIENT', // Custom token for Redis client
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST');
        const port = configService.get<number>('REDIS_PORT');
        const password = configService.get<string>('REDIS_PASSWORD');
        const db = configService.get<number>('REDIS_DB');

        const redis = new Redis({
          host,
          port,
          password,
          db,
        });

        redis.on('error', (err) => {
          console.error('Redis Client Error:', err);
        });

        redis.on('connect', () => {
          console.log('Redis Client Connected');
        });

        return redis;
      },
      inject: [ConfigService],
    },
    FetcherService,
  ],
  exports: [FetcherService], // Export if other modules need to use FetcherService
})
export class FetcherModule { }
