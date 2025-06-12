import { Module, Provider } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { Telegraf, Context } from 'telegraf';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { TELEGRAF_BOT } from './telegram.constants';
import { PrismaService } from '../prisma/prisma.service';

// Custom provider for the Telegraf bot
const telegrafBotProvider: Provider = {
  provide: TELEGRAF_BOT,
  useFactory: (configService: ConfigService) => {
    const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables.');
    }
    return new Telegraf<Context>(token);
  },
  inject: [ConfigService],
};

@Module({
  imports: [ConfigModule],
  providers: [
    telegrafBotProvider,
    TelegramService,
    PrismaService
  ],
  exports: [
    TelegramService,
    TELEGRAF_BOT,
  ],
})
export class TelegramModule { }
