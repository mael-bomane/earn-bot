import { Injectable, OnModuleInit, Inject, OnModuleDestroy, OnApplicationBootstrap } from '@nestjs/common';
import { Telegraf, Context, Markup } from 'telegraf';
import { CallbackQuery } from 'telegraf/types';
import { TELEGRAF_BOT, REGIONS, SKILLS } from './telegram.constants';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Regions, TelegramUser, NotificationType } from '@prisma/client'

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap {
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

  private capitalizeFirstLetter(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Generates the user's profile summary message.
   * @param user The TelegramUser object from the database.
   * @param mentionLink The pre-formatted Telegram mention link for the user.
   * @returns The formatted HTML string for the profile summary.
   */
  private generateProfileSummary(user: TelegramUser, mentionLink: string): string {
    const currentSkills = (user.skills as string[]) || [];
    const currentNotificationType = user.notificationPreferences;
    const regionFlag = this.getFlagForRegion(user.region);

    const skillsList = currentSkills.length > 0
      ? currentSkills.map(skill => `\n· <b>${this.capitalizeFirstLetter(skill.toLowerCase())}</b>`).join('')
      : `\n· Not set`;

    // Determine emoji for Bounty and Project based on currentNotificationType
    let bountyEmoji: string;
    let projectEmoji: string;

    switch (currentNotificationType) {
      case NotificationType.BOUNTY:
        bountyEmoji = '✅';
        projectEmoji = '❌';
        break;
      case NotificationType.PROJECT:
        bountyEmoji = '❌';
        projectEmoji = '✅';
        break;
      case NotificationType.BOTH:
        bountyEmoji = '✅';
        projectEmoji = '✅';
        break;
      case NotificationType.NONE:
      default: // Also defaults to NONE if somehow unhandled
        bountyEmoji = '❌';
        projectEmoji = '❌';
        break;
    }

    const notificationsList =
      `\n${bountyEmoji} Bounties` +
      `\n${projectEmoji} Projects`;

    const minAskDisplay = user.minAsk === 0 ? 'Any' : `${user.minAsk} USD`;


    return (
      `Your current region is ${regionFlag} <b>${this.capitalizeFirstLetter(user.region.toLowerCase())}</b>\n\n` +
      `Your skills are : \n${skillsList}\n\n` +
      `Your notifications are set for :\n${notificationsList}\n\n` +
      `Minimum reward: <b>${minAskDisplay}</b>\n\n` + // Display minAsk
      `You can update your preferences anytime:\n\n` +
      `🌍 Update your /region\n` +
      `🛠️ Update your /skills\n` +
      `🔔 Update /notifications\n` +
      `💸 Update /reward` // New command for reward/minAsk
    );
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
      const username = ctx.from.username;

      const mentionLink = `<a href="tg://user?id=${userId}">@${username ?? userId}</a>`;

      let telegramUser;
      try {
        telegramUser = await this.prisma.telegramUser.upsert({
          where: { id: userId },
          update: {},
          create: {
            id: userId,
            region: 'GLOBAL',
            skills: ['ALL'] as any,
            notificationPreferences: NotificationType.NONE, // Default to NONE
            minAsk: 0, // Default minAsk
            setup: false,
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
        await ctx.reply(
          `Welcome back, ${mentionLink} 👋\n\n` +
          this.generateProfileSummary(telegramUser, mentionLink)
          , { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`Hi ${mentionLink}, welcome to the Superteam Earn bot 👋\n`, {
          parse_mode: 'HTML'
        });

        let messageText = 'Please select your region from the list below:';
        if (telegramUser.region) {
          const regionFlag = this.getFlagForRegion(telegramUser.region);
          messageText += `\n\nYour current region is: ${regionFlag} <b>${this.capitalizeFirstLetter(telegramUser.region.toLowerCase())}</b>`;
        }

        await ctx.reply(messageText, {
          ...this.getRegionKeyboard(),
          parse_mode: 'HTML'
        });
      }
    });

    // /region edit command
    this.bot.command('region', async (ctx) => {
      const userId = ctx.from.id;
      const userInDb = await this.prisma.telegramUser.findUnique({ where: { id: userId } });
      const currentRegion = userInDb?.region;

      let messageText = 'Please select your region from the list below:';
      if (currentRegion) {
        const regionFlag = this.getFlagForRegion(userInDb.region);
        messageText += `\n\nYour current region is ${regionFlag} <b>${this.capitalizeFirstLetter(userInDb.region.toLowerCase())}</b>`;
      }

      await ctx.reply(messageText, {
        ...this.getRegionKeyboard(),
        parse_mode: 'HTML'
      });
    });

    // /skills edit command
    this.bot.command('skills', async (ctx) => {
      const userId = ctx.from.id;
      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { skills: true }
        });
        const currentSkills: string[] = (userInDb?.skills as string[]) || [];

        const skillsListDisplay = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
          : `\n· Not set`;

        await ctx.reply(
          `Select your skills with the buttons below this messages.\n\nYour currently selected skills are :\n${skillsListDisplay}`,
          {
            ...this.getSkillsKeyboard(currentSkills),
            parse_mode: 'HTML'
          }
        );
      } catch (error) {
        console.error('Error fetching skills for /skills command:', error);
        await ctx.reply('There was an error retrieving your skills. Please try again.');
      }
    });

    // 4. /notifications command
    this.bot.command('notifications', async (ctx) => {
      const userId = ctx.from.id;
      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { notificationPreferences: true }
        });
        const currentNotificationType: NotificationType = userInDb?.notificationPreferences || NotificationType.NONE;

        const notificationDisplay = currentNotificationType === NotificationType.NONE
          ? `\n· None`
          : `\n· ${this.capitalizeFirstLetter(currentNotificationType.toLowerCase())}`;

        await ctx.reply(
          `Please select what kind of notifications you'd like to receive:\n\nCurrently receiving for:${notificationDisplay}`,
          {
            ...this.getNotificationKeyboard(), // Pass the single enum value
            parse_mode: 'HTML'
          }
        );
      } catch (error) {
        console.error('Error fetching notification preferences for /notifications command:', error);
        await ctx.reply('There was an error retrieving your notification preferences. Please try again.');
      }
    });

    // /reward command to modify user minimum reward 
    this.bot.command('reward', async (ctx) => {
      const userId = ctx.from.id;
      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
          select: { minAsk: true }
        });
        const currentMinAsk = userInDb?.minAsk ?? 0;

        const minAskDisplay = currentMinAsk === 0 ? 'Any' : `${currentMinAsk} USD`;

        await ctx.reply(
          `Please select the minimum USD reward value you wish to be notified for:\n\nCurrently set to: <b>${minAskDisplay}</b>`,
          {
            ...this.getMinAskKeyboard(currentMinAsk),
            parse_mode: 'HTML'
          }
        );
      } catch (error) {
        console.error('Error fetching minAsk for /reward command:', error);
        await ctx.reply('There was an error retrieving your minimum reward preferences. Please try again.');
      }
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
        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { region: selectedRegion },
        });
        console.log(`User ${userId} updated region to: ${selectedRegion} in DB`);

        const updatedUser = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
        });

        const isSetupComplete = updatedUser?.setup;

        if (isSetupComplete && updatedUser) {
          const mentionLink = `<a href="tg://user?id=${userId}">@${ctx.from.username ?? userId}</a>`;
          const replyMessage = this.generateProfileSummary(updatedUser, mentionLink);
          if (ctx.callbackQuery?.message) {
            await ctx.editMessageText(replyMessage, {
              parse_mode: 'HTML'
            });
          } else {
            await ctx.reply(replyMessage, {
              parse_mode: 'HTML'
            });
          }
        } else {
          // Immediately proceed to skills selection
          const userInDb = await this.prisma.telegramUser.findUnique({
            where: { id: userId },
            select: { skills: true }
          });
          const currentSkills: string[] = (userInDb?.skills as string[]) || [];

          const skillsListDisplay = currentSkills.length > 0
            ? currentSkills.map(skill => `\n· ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
            : `\n· Not set`;

          if (ctx.callbackQuery?.message) {
            await ctx.editMessageText(
              `Region set to: <b>${this.capitalizeFirstLetter(selectedRegion.toLowerCase())}</b> ${this.getFlagForRegion(selectedRegion)}.\n\nPlease select your skills. You can choose multiple:\n\nYour skills are :${skillsListDisplay}`,
              {
                ...this.getSkillsKeyboard(currentSkills),
                parse_mode: 'HTML'
              }
            );
          } else {
            await ctx.reply(
              `Your region has been set to: <b>${this.capitalizeFirstLetter(selectedRegion.toLowerCase())}</b> ${this.getFlagForRegion(selectedRegion)}.\n\nPlease select your skills. You can choose multiple:\n\nYour skills are :${skillsListDisplay}`,
              {
                ...this.getSkillsKeyboard(currentSkills),
                parse_mode: 'HTML'
              }
            );
          }
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

        const skillsListDisplay = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
          : `\n· Not set`;

        if (ctx.callbackQuery?.message) {
          await ctx.editMessageText(
            `Please select your skills. You can choose multiple:\n\nYour skills are :${skillsListDisplay}`,
            {
              ...this.getSkillsKeyboard(currentSkills),
              parse_mode: 'HTML'
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

        if (skillToToggle === ALL_SKILL) {
          if (currentSkills.includes(ALL_SKILL) && currentSkills.length > 1) {
            currentSkills = [ALL_SKILL];
          } else if (!currentSkills.includes(ALL_SKILL) && currentSkills.length === 0) {
          }
        } else {
          if (currentSkills.includes(ALL_SKILL)) {
            currentSkills = currentSkills.filter(skill => skill !== ALL_SKILL);
          }
        }

        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { skills: currentSkills as any },
        });
        console.log(`User ${userId} updated skills to: ${JSON.stringify(currentSkills)} in DB`);

        const skillsListDisplay = currentSkills.length > 0
          ? currentSkills.map(skill => `\n· ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
          : `\n· Not set`;

        if (ctx.callbackQuery?.message) {
          await ctx.editMessageText(
            `Please select your skills. You can choose multiple:\n\nYour skills are :\n${skillsListDisplay}`,
            {
              ...this.getSkillsKeyboard(currentSkills),
              parse_mode: 'HTML'
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

    // Handle "Done Selecting Skills" callback
    this.bot.action('skills_done', async (ctx) => {
      const userId = ctx.from.id;

      try {
        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
        });

        const isSetupComplete = userInDb?.setup;

        if (!isSetupComplete && userInDb) {
          const currentNotificationType: NotificationType = userInDb.notificationPreferences || NotificationType.NONE;

          const notificationDisplay = currentNotificationType === NotificationType.NONE
            ? `\n· None`
            : `\n· ${this.capitalizeFirstLetter(currentNotificationType.toLowerCase())}`;

          await ctx.editMessageText(
            `🔔For which opportunies should we notify you ?`,
            {
              ...this.getNotificationKeyboard(), // Pass the single enum value
              parse_mode: 'HTML'
            }
          );
          await ctx.answerCbQuery('Skills selection complete! Proceeding to notifications.');
        } else if (userInDb) {
          const mentionLink = `<a href="tg://user?id=${userId}">@${ctx.from.username ?? userId}</a>`;
          const summaryMessage = this.generateProfileSummary(userInDb, mentionLink);

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

    // Handle notification type selection - now leads to minAsk if in setup
    this.bot.action(/^notification_select_/, async (ctx) => {
      const callbackQueryData = ctx.callbackQuery as CallbackQuery.DataQuery;
      const userId = ctx.from.id;
      const callbackData = callbackQueryData.data;
      const selectedNotificationTypeString: string = callbackData.replace('notification_select_', '');
      const selectedNotificationType: NotificationType = selectedNotificationTypeString.toUpperCase() as NotificationType;

      try {
        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { notificationPreferences: selectedNotificationType },
        });
        console.log(`User ${userId} updated notifications to: ${selectedNotificationType} in DB`);

        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
        });

        if (userInDb) {
          // If setup is still false, proceed to minAsk selection
          if (!userInDb.setup) {
            const currentMinAsk = userInDb.minAsk ?? 0;
            const minAskDisplay = currentMinAsk === 0 ? 'Any' : `${currentMinAsk} USD`;

            await ctx.editMessageText(
              `Great! Now, please select the minimum USD value you wish to be notified for:\n\nCurrently set to: <b>${minAskDisplay}</b>`,
              {
                ...this.getMinAskKeyboard(currentMinAsk),
                parse_mode: 'HTML'
              }
            );
            await ctx.answerCbQuery('Notification preferences set! Proceeding to minimum ask selection.');
          } else {
            // If setup was already true, just confirm the update and show summary
            const mentionLink = `<a href="tg://user?id=${userId}">@${ctx.from.username ?? userId}</a>`;
            const replyMessage = this.generateProfileSummary(userInDb, mentionLink);

            if (ctx.callbackQuery?.message) {
              await ctx.editMessageText(replyMessage, {
                parse_mode: 'HTML'
              });
            } else {
              await ctx.reply(replyMessage, {
                parse_mode: 'HTML'
              });
            }
            await ctx.answerCbQuery(`Notifications set to ${selectedNotificationType.toLowerCase()}`);
          }
        }
      } catch (error) {
        console.error('Error setting notification preference:', error);
        await ctx.answerCbQuery('Error updating notification preferences. Please try again.');
      }
    });

    // Handle minAsk selection (removed custom input logic)
    this.bot.action(/^minask_select_/, async (ctx) => {
      const callbackQueryData = ctx.callbackQuery as CallbackQuery.DataQuery;
      const userId = ctx.from.id;
      const callbackData = callbackQueryData.data;
      const selectedMinAskString = callbackData.replace('minask_select_', '');

      let selectedMinAsk: number;
      try {
        selectedMinAsk = parseInt(selectedMinAskString, 10);
        if (isNaN(selectedMinAsk) || selectedMinAsk < 0) {
          // This should ideally not happen if buttons are properly generated
          // but good for defensive programming.
          throw new Error('Invalid number selected from keyboard');
        }
      } catch (error) {
        console.error('Error parsing selected minAsk:', error);
        await ctx.answerCbQuery('Error processing selection. Please try again.');
        // Optionally, re-display the keyboard if an error occurs
        const userInDb = await this.prisma.telegramUser.findUnique({ where: { id: userId }, select: { minAsk: true } });
        const currentMinAsk = userInDb?.minAsk ?? 0;
        await ctx.editMessageText(
          `There was an error with your selection. Please try again:\n\nCurrently set to: <b>${currentMinAsk === 0 ? 'Any' : `${currentMinAsk} USD`}</b>`,
          {
            ...this.getMinAskKeyboard(currentMinAsk),
            parse_mode: 'HTML'
          }
        );
        return;
      }

      try {
        await this.prisma.telegramUser.update({
          where: { id: userId },
          data: { minAsk: selectedMinAsk, setup: true }, // commit setup=true for TelegramUser on DB for future interactions
        });
        console.log(`User ${userId} updated minAsk to: ${selectedMinAsk} in DB`);

        const userInDb = await this.prisma.telegramUser.findUnique({
          where: { id: userId },
        });

        if (userInDb) {
          const mentionLink = `<a href="tg://user?id=${userId}">@${ctx.from.username ?? userId}</a>`;
          const replyMessage = `Thank you for completing the setup!\n\n${this.generateProfileSummary(userInDb, mentionLink)}`;

          if (ctx.callbackQuery?.message) {
            await ctx.editMessageText(replyMessage, {
              parse_mode: 'HTML'
            });
          } else {
            await ctx.reply(replyMessage, {
              parse_mode: 'HTML'
            });
          }
          await ctx.answerCbQuery(`Minimum ask set to ${selectedMinAsk === 0 ? 'Any' : `${selectedMinAsk} USD`}`);
        }
      } catch (error) {
        console.error('Error setting minAsk preference:', error);
        await ctx.answerCbQuery('Error updating minimum ask preferences. Please try again.');
      }
    });

    console.log('Telegram bot launched and listening for updates.');
  }

  async onApplicationBootstrap() { // This hook will be called after ALL modules are initialized
    console.log('--- TelegramService onApplicationBootstrap: Launching Telegram bot ---');
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
      const flag = this.getFlagForRegion(region);
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

  /**
   * Helper to Generate Inline Keyboard for Notifications.
   * Now takes a single selected NotificationType.
   * @param currentNotificationType The currently selected NotificationType enum.
   * @returns InlineKeyboardMarkup for notification selection.
   */
  private getNotificationKeyboard() {
    const buttonsPerRow = 2;
    const notificationTypes = [NotificationType.BOUNTY, NotificationType.PROJECT, NotificationType.BOTH, NotificationType.NONE]; // Explicit list

    const notificationButtons = notificationTypes.map(type => {
      let emoji = '';
      let buttonText = '';
      switch (type) {
        case NotificationType.BOUNTY:
          emoji = '⚡️ '; // Zap lightning emoji
          buttonText = 'Bounty';
          break;
        case NotificationType.PROJECT:
          emoji = '💼 '; // Briefcase emoji
          buttonText = 'Project';
          break;
        case NotificationType.BOTH:
          emoji = '🔥 '; // Fire emoji
          buttonText = 'Both';
          break;
        case NotificationType.NONE:
          emoji = '❌ '; // Red cross emoji
          buttonText = 'None';
          break;
      }
      return Markup.button.callback(`${emoji}${buttonText}`, `notification_select_${type.toLowerCase()}`);
    });
    const rows = [];
    for (let i = 0; i < notificationButtons.length; i += buttonsPerRow) {
      rows.push(notificationButtons.slice(i, i + buttonsPerRow));
    }

    // Removed the "Done" button as selection is now direct
    return Markup.inlineKeyboard(rows);
  }

  /**
   * Helper to Generate Inline Keyboard for Minimum Ask (USD value).
   * @param currentMinAsk The currently selected minimum ask value.
   * @returns InlineKeyboardMarkup for minAsk selection.
   */
  private getMinAskKeyboard(currentMinAsk: number) {
    const minAskOptions = [0, 50, 100, 1000]; // "Any", 50, 100, 1000 - No "Custom"
    const buttonsPerRow = 2;

    const minAskButtons = minAskOptions.map(value => {
      const isSelected = currentMinAsk === value;
      const emoji = isSelected ? '✅ ' : '';
      const text = value === 0 ? 'Any' : `${value} USD`;
      return Markup.button.callback(`${emoji}${text}`, `minask_select_${value}`);
    });

    const rows = [];
    for (let i = 0; i < minAskButtons.length; i += buttonsPerRow) {
      rows.push(minAskButtons.slice(i, i + buttonsPerRow));
    }

    return Markup.inlineKeyboard(rows);
  }


  async sendMessageToUser(chatId: number, message: string) {
    try {
      await this.bot.telegram.sendMessage(chatId, message,
        {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true }
        }
      );
      //console.log(`Message sent to ${chatId}: ${message}`);
    } catch (error) {
      console.error(`Failed to send message to ${chatId}:`, error);
    }
  }
}
