import { Injectable, OnModuleInit, Inject, OnModuleDestroy } from '@nestjs/common';
import { Telegraf, Context, Markup } from 'telegraf';
import { CallbackQuery, InlineKeyboardMarkup } from 'telegraf/types';
import { TELEGRAF_BOT, REGIONS, SKILLS, NOTIFICATION_TYPES } from './telegram.constants'; // Import NOTIFICATION_TYPES
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Regions } from '@prisma/client' // Ensure Regions enum is imported if used directly for type

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(TELEGRAF_BOT) private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) { }

  private getFlagForRegion(region: string): string {
    switch (region.toUpperCase()) {
      case 'INDIA': return '🇮🇳';
      case 'VIETNAM': return '🇻🇳';
      case 'GERMANY': return '🇩🇪';
      case 'TURKEY': return '🇹🇷';
      case 'MEXICO': return '🇲🇽';
      case 'UK': return '🇬🇧';
      case 'UAE': return '🇦🇪';
      case 'NIGERIA': return '🇳🇬';
      case 'ISRAEL': return '🇮🇱';
      case 'BRAZIL': return '🇧🇷';
      case 'MALAYSIA': return '🇲🇾';
      case 'BALKAN': return '🇧🇦'; // Using Bosnia and Herzegovina as a representative flag
      case 'PHILIPPINES': return '🇵🇭';
      case 'JAPAN': return '🇯🇵';
      case 'FRANCE': return '🇫🇷';
      case 'CANADA': return '🇨🇦';
      case 'SINGAPORE': return '🇸🇬';
      case 'POLAND': return '🇵🇱';
      case 'KOREA': return '🇰🇷';
      case 'IRELAND': return '🇮🇪';
      case 'UKRAINE': return '🇺🇦';
      case 'ARGENTINA': return '🇦🇷';
      case 'USA': return '🇺🇸';
      case 'SPAIN': return '🇪🇸';
      default: return '🌍'; // Default globe emoji
    }
  }

  // Don't forget to add this helper method to your TelegramService class if it's not there already:
  private capitalizeFirstLetter(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async onModuleInit() {
    console.log('TelegramService initialized. Registering bot commands...');
    const appEnv = this.configService.get<string>('NODE_ENV');
    console.log(`Running in environment: ${appEnv}`);
    this.bot.help((ctx) => ctx.reply('Send me any text!'));
    this.bot.hears('hi', (ctx) => ctx.reply('Hey there!'));

    // 1. Register the /start command
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id;
      const firstName = ctx.from.first_name;
      const lastName = ctx.from.last_name || '';
      const username = ctx.from.username;

      console.log(`User ID: ${userId}`);
      console.log(`First Name: ${firstName}`);
      console.log(`Last Name: ${lastName}`);
      console.log(`Username: ${username}`);

      const mentionLink = `<a href="tg://user?id=${userId}">@${username ?? userId}</a>`;

      let telegramUser;
      try {
        telegramUser = await this.prisma.telegramUser.upsert({
          where: { id: userId },
          update: {},
          create: {
            id: userId,
            region: 'GLOBAL',
            skills: ['ALL'] as any, // Default skills for new users
            notificationPreferences: [] as any, // Default empty array for new users
            setup: false, // New users start with setup: false
          },
        });
        console.log(`Telegram user handled in DB: ${telegramUser.id}, Region: ${telegramUser.region}, Setup: ${telegramUser.setup}`);
      } catch (error) {
        console.error('Error upserting Telegram user:', error);
        await ctx.reply('Oops! Something went wrong while setting up your profile. Please try again later.');
        return;
      }

      // --- Conditional Logic based on User Setup Status ---
      if (telegramUser.setup) {
        const currentSkills = (telegramUser.skills as string[]) || [];
        const currentNotifications = (telegramUser.notificationPreferences as string[]) || [];

        // Get the flag for the current region
        const regionFlag = this.getFlagForRegion(telegramUser.region);

        // Capitalize each skill and format as a list
        const skillsList = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· <b>${this.capitalizeFirstLetter(skill.toLowerCase())}</b>`).join('')
          : `\n· Not set`;

        // Capitalize each notification type and format as a list
        const notificationsList = currentNotifications.length > 0
          ? currentNotifications.map(notif => `\n· ${this.capitalizeFirstLetter(notif.toLowerCase())}`).join('')
          : `\n· None`;

        await ctx.reply(
          `Welcome back, ${mentionLink} 👋\n\n` +
          `Your current region is  ${regionFlag} <b>${this.capitalizeFirstLetter(telegramUser.region.toLowerCase())}</b>\n\n` +
          `Your skills are : \n${skillsList}\n\n` + // No extra newline here, as skillsList already adds them
          `Your notifications are set for :\n${notificationsList}\n\n` + // No extra newline here either
          `You can update your preferences anytime:\n\n` +
          `🌍 Update your region with /region.\n` +
          `🛠️ Update your skills with the /skills.\n` +
          `🔔 Update notification settings with /notifications.`,
          { parse_mode: 'HTML' } // Keep HTML parse_mode for <b> and <a> tags
        );
      } else {
        // If setup is false, proceed with the initial setup flow (region selection)
        await ctx.reply(`Hi ${mentionLink}, welcome to the Superteam Earn bot 👋\n`, {
          parse_mode: 'HTML'
        });

        let messageText = 'Please select your region from the list below:';
        if (telegramUser.region) {
          // Get the flag for the current region
          const regionFlag = this.getFlagForRegion(telegramUser.region);
          messageText += `\n\nYour current region is: ${regionFlag} <b>${this.capitalizeFirstLetter(telegramUser.region.toLowerCase())}</b>`;
        }

        await ctx.reply(messageText, {
          ...this.getRegionKeyboard(),
          parse_mode: 'HTML'
        });
      }
    });

    // 2. /region edit command
    this.bot.command('region', async (ctx) => {
      const userId = ctx.from.id;
      const userInDb = await this.prisma.telegramUser.findUnique({ where: { id: userId } });
      const currentRegion = userInDb?.region;

      let messageText = 'Please select your region from the list below:';
      if (currentRegion) {
        // Get the flag for the current region
        const regionFlag = this.getFlagForRegion(userInDb.region);
        messageText += `\n\nYour current region is ${regionFlag} <b>${this.capitalizeFirstLetter(userInDb.region.toLowerCase())}</b>`;
      }

      await ctx.reply(messageText, {
        ...this.getRegionKeyboard(),
        parse_mode: 'HTML'
      });
    });

    // 3. /skills edit command
    this.bot.command('skills', async (ctx) => {
      const userId = ctx.from.id;
      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { skills: true }
        });
        const currentSkills: string[] = (userInDb?.skills as string[]) || [];

        // Format skills as a list
        const skillsListDisplay = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
          : `\n· Not set`;

        await ctx.reply(
          `Please select your skills. You can choose multiple:\n\nYour skills are :${skillsListDisplay}`,
          {
            ...this.getSkillsKeyboard(currentSkills),
            parse_mode: 'HTML' // Changed to HTML for consistency
          }
        );
      } catch (error) {
        console.error('Error fetching skills for /skills command:', error);
        await ctx.reply('There was an error retrieving your skills. Please try again.');
      }
    });
    // 4. NEW: /notifications command
    this.bot.command('notifications', async (ctx) => {
      const userId = ctx.from.id;
      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { notificationPreferences: true }
        });
        const currentNotifications: string[] = (userInDb?.notificationPreferences as string[]) || [];

        await ctx.reply(
          `Please select what kind of notifications you'd like to receive:\n\nCurrently receiving for: *${currentNotifications.join(', ') || 'None'}*`,
          {
            ...this.getNotificationKeyboard(currentNotifications),
            parse_mode: 'Markdown'
          }
        );
      } catch (error) {
        console.error('Error fetching notification preferences for /notifications command:', error);
        await ctx.reply('There was an error retrieving your notification preferences. Please try again.');
      }
    });

    // 5. Register the /quit command
    this.bot.command('quit', (ctx) => {
      ctx.reply('Are you sure you want to quit? (Yes/No)');
    });

    // --- Action Handlers ---

    // Handles region selection
    this.bot.action(/^region_/, async (ctx) => {
      const callbackQueryData = ctx.callbackQuery as CallbackQuery.DataQuery;
      const userId = ctx.from.id;
      const callbackData = callbackQueryData.data;
      const selectedRegionString = callbackData.replace('region_', '').toUpperCase();
      const selectedRegion: Regions = selectedRegionString as Regions;

      try {
        // Update the region first
        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { region: selectedRegion },
        });
        console.log(`User ${userId} updated region to: ${selectedRegion} in DB`);

        // Fetch the user's *updated* and *complete* data including setup status
        const updatedUser = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          // Select all fields needed for the summary message
          select: {
            region: true,
            skills: true,
            notificationPreferences: true,
            setup: true,
          }
        });

        const isSetupComplete = updatedUser?.setup;
        const currentSkills = (updatedUser?.skills as string[]) || [];
        const currentNotifications = (updatedUser?.notificationPreferences as string[]) || [];

        // Re-use your formatting logic for skills and notifications
        const skillsList = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· <b>${this.capitalizeFirstLetter(skill.toLowerCase())}</b>`).join('')
          : `\n· Not set`;

        const notificationsList = currentNotifications.length > 0
          ? currentNotifications.map(notif => `\n· ${this.capitalizeFirstLetter(notif.toLowerCase())}`).join('')
          : `\n· None`;

        // Get the flag for the updated region
        const regionFlag = this.getFlagForRegion(updatedUser.region);

        let replyMessage: string;
        let replyKeyboard: InlineKeyboardMarkup | undefined; // replyKeyboard can be undefined if no keyboard is needed

        if (isSetupComplete) {
          // If setup is true, display the full summary message
          replyMessage =
            `Your region has been updated to  ${regionFlag} <b>${this.capitalizeFirstLetter(updatedUser.region.toLowerCase())}</b>\n\n` +
            `Your skills are :\n${skillsList}\n\n` +
            `Your notifications are set for :\n${notificationsList}\n\n` +
            `You can update your preferences anytime:\n\n` +
            `🌍 Update your region with /region.\n` +
            `🛠️ Update your skills with the /skills.\n` +
            `🔔 Update notification settings with /notifications.`;
          // No inline keyboard needed here as per the desired output for existing users
          replyKeyboard = undefined; // Explicitly set to undefined if no keyboard
        } else {
          // If setup is false, prompt for skills selection (initial setup flow)
          replyMessage = `Your region has been set to: <b>${this.capitalizeFirstLetter(selectedRegion.toLowerCase())}</b> ${regionFlag}.\n\nReady to select your skills?`;
          replyKeyboard = Markup.inlineKeyboard([
            Markup.button.callback('🚀 Select My Skills', 'action_select_skills')
          ]).reply_markup;
        }

        try {
          if (ctx.callbackQuery?.message) { // Check if there's a message to edit
            await ctx.editMessageText(replyMessage, {
              reply_markup: replyKeyboard,
              parse_mode: 'HTML' // Use HTML parse mode for bold and mention tags
            });
          } else { // Fallback if message can't be edited (e.g., too old)
            await ctx.reply(replyMessage, {
              reply_markup: replyKeyboard,
              parse_mode: 'HTML'
            });
          }
        } catch (error) {
          // Catch error if message cannot be edited (e.g., "message is not modified")
          console.error('Error editing message or sending new one after region update:', error);
          await ctx.reply(replyMessage, {
            reply_markup: replyKeyboard,
            parse_mode: 'HTML'
          });
        }

        await ctx.answerCbQuery(`Region set to ${selectedRegion}`);

      } catch (error) {
        console.error('Error handling region selection:', error);
        await ctx.answerCbQuery('Error updating region. Please try again.');
        await ctx.reply('An error occurred while updating your region. Please try again.');
      }
    });


    // Handles proceeding to skills selection
    this.bot.action('action_select_skills', async (ctx) => {
      const userId = ctx.from.id;

      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { skills: true }
        });
        const currentSkills: string[] = (userInDb?.skills as string[]) || [];

        // Format skills as a list
        const skillsListDisplay = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
          : `\n· Not set`;

        // Ensure the message is editable, otherwise send new one
        if (ctx.callbackQuery?.message) {
          await ctx.editMessageText(
            `Please select your skills. You can choose multiple:\n\nYour skills are :${skillsListDisplay}`,
            {
              ...this.getSkillsKeyboard(currentSkills),
              parse_mode: 'HTML' // Changed to HTML for consistency
            }
          );
        } else {
          await ctx.reply(
            `Please select your skills. You can choose multiple:\n\nYour skills are :${skillsListDisplay}`,
            {
              ...this.getSkillsKeyboard(currentSkills),
              parse_mode: 'HTML'
            }
          );
        }
      } catch (error) {
        console.error('Error fetching skills or sending skills keyboard:', error);
        await ctx.reply('There was an error fetching your skills. Please try again.');
      }

      await ctx.answerCbQuery('Proceeding to skill selection...');
    });


    // Handles skill selection toggling
    this.bot.action(/^skill_toggle_/, async (ctx) => {
      const callbackQueryData = ctx.callbackQuery as CallbackQuery.DataQuery;
      const userId = ctx.from.id;
      const callbackData = callbackQueryData.data;
      const skillToToggle: string = callbackData.replace('skill_toggle_', '');

      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { skills: true }
        });

        let currentSkills: string[] = (userInDb?.skills as string[]) || [];

        if (currentSkills.includes(skillToToggle)) {
          currentSkills = currentSkills.filter(skill => skill !== skillToToggle);
        } else {
          currentSkills.push(skillToToggle);
        }

        const ALL_SKILL = 'ALL';

        // Logic for 'ALL' skill handling
        if (skillToToggle === ALL_SKILL) {
          if (currentSkills.includes(ALL_SKILL) && currentSkills.length > 1) {
            currentSkills = [ALL_SKILL]; // If ALL is selected, clear other skills
          } else if (!currentSkills.includes(ALL_SKILL) && currentSkills.length === 0) {
            // If ALL was unselected and no other skills are, leave it empty or revert to ALL as desired default
            // For now, if ALL is unselected and no others are picked, it remains empty
          }
        } else {
          // If a specific skill is toggled, and ALL is currently selected, unselect ALL
          if (currentSkills.includes(ALL_SKILL)) {
            currentSkills = currentSkills.filter(skill => skill !== ALL_SKILL);
          }
        }


        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { skills: currentSkills as any },
        });
        console.log(`User ${userId} updated skills to: ${JSON.stringify(currentSkills)} in DB`);

        // Format skills as a list for the updated message
        const skillsListDisplay = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
          : `\n· Not set`;

        // Ensure the message is editable, otherwise send new one
        if (ctx.callbackQuery?.message) {
          await ctx.editMessageText(
            `Please select your skills. You can choose multiple:\n\nYour skills are :\n${skillsListDisplay}`,
            {
              ...this.getSkillsKeyboard(currentSkills),
              parse_mode: 'HTML' // Changed to HTML for consistency
            }
          );
        } else {
          await ctx.reply(
            `Please select your skills. You can choose multiple:\n\nYour skills are :\n${skillsListDisplay}`,
            {
              ...this.getSkillsKeyboard(currentSkills),
              parse_mode: 'HTML'
            }
          );
        }
        await ctx.answerCbQuery(`${this.capitalizeFirstLetter(skillToToggle.toLowerCase())} ${currentSkills.includes(skillToToggle) ? 'selected' : 'unselected'}`);

      } catch (error) {
        console.error('Error toggling skill:', error);
        await ctx.answerCbQuery('Error updating skills. Please try again.');
      }
    });

    // MODIFIED: Handle "Done Selecting Skills" callback
    this.bot.action('skills_done', async (ctx) => {
      const userId = ctx.from.id;

      try {
        // Fetch user's complete data, including setup status
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: {
            setup: true,
            region: true,
            skills: true,
            notificationPreferences: true,
          }
        });

        const isSetupComplete = userInDb?.setup;

        if (!isSetupComplete) {
          // If setup is FALSE (new user), proceed to notification settings
          const currentNotifications: string[] = (userInDb?.notificationPreferences as string[]) || [];

          let messageText = `Great! Now, please select what kind of notifications you'd like to receive for future opportunities:\n\nCurrently receiving for:`;
          const notificationsListDisplay = currentNotifications.length > 0
            ? currentNotifications.map(notif => `\n· ${this.capitalizeFirstLetter(notif.toLowerCase())}`).join('')
            : `\n· None`;

          await ctx.editMessageText(
            `${messageText}${notificationsListDisplay}`,
            {
              ...this.getNotificationKeyboard(currentNotifications),
              parse_mode: 'HTML' // Use HTML for consistent list formatting
            }
          );
          await ctx.answerCbQuery('Skills selection complete! Proceeding to notifications.');
        } else {
          // If setup is TRUE (existing user), show profile summary
          const currentSkills = (userInDb?.skills as string[]) || [];
          const currentNotifications = (userInDb?.notificationPreferences as string[]) || [];

          const regionFlag = this.getFlagForRegion(userInDb.region);

          const skillsListDisplay = currentSkills.length > 0
            ? currentSkills.map(skill => `\n· <b>${this.capitalizeFirstLetter(skill.toLowerCase())}</b>`).join('')
            : `\n· Not set`;

          const notificationsListDisplay = currentNotifications.length > 0
            ? currentNotifications.map(notif => `\n· ${this.capitalizeFirstLetter(notif.toLowerCase())}`).join('')
            : `\n· None`;

          const mentionLink = `<a href="tg://user?id=${userId}">@${ctx.from.username ?? userId}</a>`; // Re-create mention link if needed

          const summaryMessage =
            `Welcome back, ${mentionLink} 👋\n\n` +
            `Your current region is <b>${this.capitalizeFirstLetter(userInDb.region.toLowerCase())}</b> ${regionFlag}\n\n` +
            `Your skills are :\n${skillsListDisplay}\n\n` +
            `Your notifications are set for :\n${notificationsListDisplay}\n\n` +
            `You can update your preferences anytime :\n\n` +
            `🌍 Update your region with /region.\n` +
            `🛠️ Update your skills with the /skills.\n` +
            `🔔 Update notification settings with /notifications.`;

          await ctx.editMessageText(summaryMessage, {
            parse_mode: 'HTML'
          });
          await ctx.answerCbQuery('Skills updated!');
        }
      } catch (error) {
        console.error('Error in skills_done action:', error);
        await ctx.answerCbQuery('Error finalizing skills. Please try again.');
        await ctx.reply('An error occurred while updating your skills. Please try again.');
      }
    });
    // NEW: Handle notification type toggling
    this.bot.action(/^notification_toggle_/, async (ctx) => {
      const callbackQueryData = ctx.callbackQuery as CallbackQuery.DataQuery;
      const userId = ctx.from.id;
      const callbackData = callbackQueryData.data;
      const notificationToToggle: string = callbackData.replace('notification_toggle_', '');

      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { notificationPreferences: true }
        });

        let currentNotifications: string[] = (userInDb?.notificationPreferences as string[]) || [];

        const IS_BOUNTIES = 'Bounties';
        const IS_PROJECTS = 'Projects';
        const IS_BOTH = 'Both';

        if (notificationToToggle === IS_BOTH) {
          if (currentNotifications.includes(IS_BOTH)) {
            // If "Both" was selected, unselect it
            currentNotifications = currentNotifications.filter(notif => notif !== IS_BOTH);
          } else {
            // If "Both" was not selected, select it and unselect Bounties/Projects
            currentNotifications = [IS_BOTH];
          }
        } else {
          // If selecting Bounties or Projects
          if (currentNotifications.includes(notificationToToggle)) {
            // If already selected, unselect it
            currentNotifications = currentNotifications.filter(notif => notif !== notificationToToggle);
          } else {
            // If not selected, add it
            currentNotifications.push(notificationToToggle);
          }
          // If "Both" is present, remove it if specific type is selected
          if (currentNotifications.includes(IS_BOTH)) {
            currentNotifications = currentNotifications.filter(notif => notif !== IS_BOTH);
          }
          // If Bounties and Projects are BOTH now selected, ensure 'Both' isn't there, and if it was desired, re-add.
          // For simplicity, if Bounties and Projects are individually selected, they stay individual.
          // If user wants 'Both', they click 'Both'.
          // If Bounties and Projects are manually selected, 'Both' is automatically de-selected.
        }

        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { notificationPreferences: currentNotifications as any },
        });
        console.log(`User ${userId} updated notifications to: ${JSON.stringify(currentNotifications)} in DB`);

        await ctx.editMessageText(
          `Please select what kind of notifications you'd like to receive:\n\nCurrently receiving for: *${currentNotifications.join(', ') || 'None'}*`,
          {
            ...this.getNotificationKeyboard(currentNotifications),
            parse_mode: 'Markdown'
          }
        );
        await ctx.answerCbQuery(`${notificationToToggle} ${currentNotifications.includes(notificationToToggle) ? 'selected' : 'unselected'}`);

      } catch (error) {
        console.error('Error toggling notification:', error);
        await ctx.answerCbQuery('Error updating notification preferences. Please try again.');
      }
    });


    // NEW: Handle "Done Selecting Notifications" callback - FINAL STEP OF INITIAL SETUP
    this.bot.action('notifications_done', async (ctx) => {
      const userId = ctx.from.id;

      try {
        // Update user's setup status to true
        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { setup: true },
        });

        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { notificationPreferences: true }
        });
        const finalNotifications: string[] = (userInDb?.notificationPreferences as string[]) || [];

        const notificationsMessage = finalNotifications.length > 0
          ? `Your notifications are set for: *${finalNotifications.join(', ')}*.`
          : 'You have not selected any specific notification types.';

        await ctx.editMessageText(`Thank you for completing the setup!\n\n${notificationsMessage}`, {
          parse_mode: 'Markdown'
        });
        await ctx.answerCbQuery('Setup complete!');
      } catch (error) {
        console.error('Error finalizing setup or notifications:', error);
        await ctx.answerCbQuery('Error completing setup. Please try again.');
      }
    });

    await this.bot.launch();
    console.log('Telegram bot launched and listening for updates.');
  }

  async onModuleDestroy() {
    console.log('Shutting down Telegram bot...');
    this.bot.stop('NestJS application shutdown');
    console.log('Telegram bot stopped.');
  }

  // --- Helper to Generate Inline Keyboard for Regions (now a class method) ---
  private getRegionKeyboard() {
    const buttonsPerRow = 3;
    let buttons = REGIONS.map(region => {
      let flag = '';
      switch (region.toUpperCase()) {
        case 'INDIA': flag = '🇮🇳'; break;
        case 'VIETNAM': flag = '🇻🇳'; break;
        case 'GERMANY': flag = '🇩🇪'; break;
        case 'TURKEY': flag = '🇹🇷'; break;
        case 'MEXICO': flag = '🇲🇽'; break;
        case 'UK': flag = '🇬🇧'; break;
        case 'UAE': flag = '🇦🇪'; break;
        case 'NIGERIA': flag = '🇳🇬'; break;
        case 'ISRAEL': flag = '🇮🇱'; break;
        case 'BRAZIL': flag = '🇧🇷'; break;
        case 'MALAYSIA': flag = '🇲🇾'; break;
        case 'BALKAN': flag = '🇧🇦'; break;
        case 'PHILIPPINES': flag = '🇵🇭'; break;
        case 'JAPAN': flag = '🇯🇵'; break;
        case 'FRANCE': flag = '🇫🇷'; break;
        case 'CANADA': flag = '🇨🇦'; break;
        case 'SINGAPORE': flag = '🇸🇬'; break;
        case 'POLAND': flag = '🇵🇱'; break;
        case 'KOREA': flag = '🇰🇷'; break;
        case 'IRELAND': flag = '🇮🇪'; break;
        case 'UKRAINE': flag = '🇺🇦'; break;
        case 'ARGENTINA': flag = '🇦🇷'; break;
        case 'USA': flag = '🇺🇸'; break;
        case 'SPAIN': flag = '🇪🇸'; break;
        default: flag = '🌍';
      }
      return Markup.button.callback(`${flag} ${region}`, `region_${region.toLowerCase()}`);
    });

    buttons.push(Markup.button.callback('❓ Not Listed', 'region_global'));

    const rows = [];
    for (let i = 0; i < buttons.length; i += buttonsPerRow) {
      rows.push(buttons.slice(i, i + buttonsPerRow));
    }
    return Markup.inlineKeyboard(rows);
  }

  // --- Helper to Generate Inline Keyboard for Skills (now a class method) ---
  private getSkillsKeyboard(selectedSkills: string[]) {
    const buttonsPerRow = 2;
    const skillButtons = SKILLS.map(skill => {
      const isSelected = selectedSkills.includes(skill);
      const emoji = isSelected ? '✅ ' : '';
      return Markup.button.callback(`${emoji}${skill}`, `skill_toggle_${skill}`);
    });

    const rows = [];
    for (let i = 0; i < skillButtons.length; i += buttonsPerRow) {
      rows.push(skillButtons.slice(i, i + buttonsPerRow));
    }

    rows.push([Markup.button.callback('✅ Done Selecting Skills', 'skills_done')]);

    return Markup.inlineKeyboard(rows);
  }

  // NEW: Helper to Generate Inline Keyboard for Notifications (class method)
  private getNotificationKeyboard(selectedNotifications: string[]) {
    const buttonsPerRow = 2;
    const notificationButtons = NOTIFICATION_TYPES.map(type => {
      const isSelected = selectedNotifications.includes(type);
      const emoji = isSelected ? '✅ ' : '';
      return Markup.button.callback(`${emoji}${type}`, `notification_toggle_${type}`);
    });

    const rows = [];
    for (let i = 0; i < notificationButtons.length; i += buttonsPerRow) {
      rows.push(notificationButtons.slice(i, i + buttonsPerRow));
    }

    rows.push([Markup.button.callback('✅ Done with Notifications', 'notifications_done')]); // New 'Done' button

    return Markup.inlineKeyboard(rows);
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
