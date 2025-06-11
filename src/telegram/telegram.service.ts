import { Injectable, OnModuleInit, Inject, OnModuleDestroy } from '@nestjs/common';
import { Telegraf, Context, Markup } from 'telegraf';
import { CallbackQuery } from 'telegraf/types';
import { TELEGRAF_BOT, REGIONS } from './telegram.constants';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Regions } from '@prisma/client'

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(TELEGRAF_BOT) private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService, // Inject PrismaService
  ) { }

  async onModuleInit() {
    console.log('TelegramService initialized. Registering bot commands...');
    const appEnv = this.configService.get<string>('NODE_ENV');
    console.log(`Running in environment: ${appEnv}`);
    this.bot.help((ctx) => ctx.reply('Send me any text!'));
    this.bot.hears('hi', (ctx) => ctx.reply('Hey there!'));

    // --- User Data Storage (In-memory, for demonstration) ---
    // In a real application, replace this with a database (e.g., MongoDB, PostgreSQL, Redis)
    const userSettings = {}; // Stores user ID as key, and their region as value
    // Function to get user settings
    function getUserSetting(userId) {
      return userSettings[userId];
    }

    // Function to set user settings
    function setUserSetting(userId, region) {
      userSettings[userId] = region;
      console.log(`User ${userId} set region to: ${region}`);
    }

    // 1. Register the /start command
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id;
      const firstName = ctx.from.first_name;
      const lastName = ctx.from.last_name || ''; // Last name might be undefined
      const username = ctx.from.username; // Username might be undefined

      console.log(`User ID: ${userId}`);
      console.log(`First Name: ${firstName}`);
      console.log(`Last Name: ${lastName}`);
      console.log(`Username: ${username}`);

      // --- User Existence Check and Creation in Database ---
      try {
        const telegramUser = await this.prisma.telegramUser.upsert({
          where: { id: userId }, // 'id' from Telegram is an integer, so map it to your 'id' field in TelegramUser
          update: {}, // No updates needed if user exists, just ensure it's there
          create: {
            id: userId, // Use Telegram's user ID as the primary key
            region: 'GLOBAL', // Default region if creating a new user
          },
        });
        console.log(`Telegram user handled in DB: ${telegramUser.id}, Region: ${telegramUser.region}`);
      } catch (error) {
        console.error('Error upserting Telegram user:', error);
        // Handle database error appropriately, e.g., notify user or log
      }


      // --- Helper to Generate Inline Keyboard ---
      function getRegionKeyboard() {
        const buttonsPerRow = 3; // How many buttons per row
        let buttons = REGIONS.map(region =>
          Markup.button.callback(region, `region_${region.toLowerCase()}`) // Callback data like 'region_india'
        );

        // Add "Not Listed" option
        buttons.push(Markup.button.callback('Not Listed', 'region_not_listed'));

        // Arrange buttons into rows
        const rows = [];
        for (let i = 0; i < buttons.length; i += buttonsPerRow) {
          rows.push(buttons.slice(i, i + buttonsPerRow));
        }

        return Markup.inlineKeyboard(rows);
      }


      //ctx.reply(`Hi @${userId}, welcome to the Superteam Earn bot 👋`);

      const mentionLink = `<a href="tg://user?id=${userId}">@${username ?? userId}</a>`;

      // TODO : check if user already exists in database, if not register
      ctx.reply(`Hi ${mentionLink}, welcome to the Superteam Earn bot 👋\n`, {
        parse_mode: 'HTML'
      });


      // Fetch the current region from the database, not in-memory
      let currentRegion;
      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
        });
        currentRegion = userInDb?.region;
      } catch (error) {
        console.error('Error fetching user region from DB:', error);
        currentRegion = null; // Fallback
      }

      let messageText = 'Please select your region from the list below:';
      if (currentRegion) {
        messageText += `\n\nYour current region is: *${currentRegion}*`;
      }

      ctx.reply(messageText, {
        ...getRegionKeyboard(), // Attach the inline keyboard
        parse_mode: 'Markdown' // For bolding the current region
      });

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

    this.bot.action(/^region_/, async (ctx) => {
      // Type assertion to ensure callbackQuery is treated as a DataQuery
      const callbackQueryData = ctx.callbackQuery as CallbackQuery.DataQuery;

      const userId = ctx.from.id;
      // Access data from the asserted type
      const callbackData = callbackQueryData.data; // e.g., 'region_india' or 'region_not_listed'
      const selectedRegionString = callbackData.replace('region_', '').toUpperCase();
      const selectedRegion: Regions = selectedRegionString as Regions;// Extract the region name

      try {
        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { region: selectedRegion },
        });
        console.log(`User ${userId} updated region to: ${selectedRegion} in DB`);
      } catch (error) {
        console.error('Error updating user region in DB:', error);
        // Handle error appropriately
      }

      // Edit the message to show the selected choice and remove the keyboard
      try {
        await ctx.editMessageText(`Your region has been set to: *${selectedRegion}*.`, {
          parse_mode: 'Markdown'
        });
      } catch (error) {
        // This might happen if the message is too old or already edited/deleted
        console.error('Error editing message:', error);
        await ctx.reply(`Your region has been set to: *${selectedRegion}*.`, {
          parse_mode: 'Markdown'
        });
      }

      await ctx.answerCbQuery(`Region set to ${selectedRegion}`); // Acknowledge the callback query
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
