import { Injectable, OnModuleInit, Inject, OnModuleDestroy } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { TELEGRAF_BOT } from './telegram.constants'; // <--- Import from new file
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(TELEGRAF_BOT) private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService
  ) { }

  // ... (rest of your TelegramService code remains the same)
  async onModuleInit() {
    console.log('TelegramService initialized. Registering bot commands...');
    const appEnv = this.configService.get<string>('NODE_ENV');
    console.log(`Running in environment: ${appEnv}`);
    this.bot.start((ctx) => ctx.reply('Welcome! Send me a message.'));
    this.bot.help((ctx) => ctx.reply('Send me any text!'));
    this.bot.on('text', (ctx) => ctx.reply(`You said: "${ctx.message.text}"`));
    this.bot.hears('hi', (ctx) => ctx.reply('Hey there!'));

    // 1. Register the /start command
    this.bot.command('start', (ctx) => {
      ctx.reply('Welcome to the bot! I can help you with some tasks. Try /edit or /quit.');
      // You might add logic here to initialize user session, show main menu, etc.
    });

    // 2. Register the /edit command
    this.bot.command('edit', (ctx) => {
      ctx.reply("You've entered the edit mode.What would you like to edit ? ");
      // Here, you would typically transition the user to an 'editing' state,
      // perhaps ask for specific input, and then handle that input in subsequent messages.
    });

    // 3. Register the /quit command
    this.bot.command('quit', (ctx) => {
      ctx.reply('Are you sure you want to quit? (Yes/No)');
      // For more complex flows, you might introduce a confirmation step here.
    });
    await this.bot.launch();
    console.log('Telegram bot launched and listening for updates.');
  }

  async onModuleDestroy() {
    console.log('Shutting down Telegram bot...');
    this.bot.stop('NestJS application shutdown');
    console.log('Telegram bot stopped.');
  }

  async sendMessageToUser(chatId: number, message: string) {
    try {
      await this.bot.telegram.sendMessage(chatId, message);
      console.log(`Message sent to ${chatId}: ${message}`);
    } catch (error) {
      console.error(`Failed to send message to ${chatId}:`, error);
    }
  }
}
