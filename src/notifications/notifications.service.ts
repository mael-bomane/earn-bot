import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { BountyNotification, BountyType } from '@prisma/client';
import { BountyDetails } from '../types/bounty.interface';

// Define the cron schedule based on NODE_ENV
const CRON_SCHEDULE =
  process.env.NODE_ENV === 'production'
    ? CronExpression.EVERY_HOUR
    : CronExpression.EVERY_MINUTE; // This covers 'development' and 'test'

@Injectable()
export class BountyNotificationService {
  private readonly logger = new Logger(BountyNotificationService.name);
  // Define a delay for rate limiting. 1000 ms / 30 messages = ~33.33 ms per message.
  // We'll use 40ms to be safe and account for network latency/processing time.
  private readonly MESSAGE_DELAY_MS = 40;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) { }

  /**
   * Helper for flag emoji in bot notification message 
   * @param region user or bounty region
   */
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

  private formatDeadlineRemaining = (deadline: Date | string): string => {
    const now = new Date();
    const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline;

    // Calculate the difference in milliseconds
    const diffMs = deadlineDate.getTime() - now.getTime();

    // If the deadline is in the past
    if (diffMs <= 0) {
      return 'Expired';
    }

    const oneHourMs = 60 * 60 * 1000;
    const oneDayMs = 24 * oneHourMs;

    if (diffMs < oneDayMs) {
      // If less than a day, show in hours
      const hours = Math.ceil(diffMs / oneHourMs);
      return `⏳ Due in ${hours} hour${hours === 1 ? '' : 's'}`;
    } else {
      // Otherwise, show in days
      const days = Math.ceil(diffMs / oneDayMs);
      return `⏳ Due in ${days} day${days === 1 ? '' : 's'}`;
    }
  }

  /**
   * Schedules a bounty notification to be sent after a delay.
   * @param userId The ID of the Telegram user to notify (BigInt).
   * @param bountyId The unique ID of the bounty.
   * @param bountyDetails Relevant details about the bounty and changes, conforming to BountyDetails interface.
   * @param changeType The specific change type (e.g., 'NEW_BOUNTY', 'REGION_UPDATED').
   * @param notificationBountyType The original type of the bounty (e.g., BountyType.BOUNTY, BountyType.PROJECT)
   * for more precise messaging if needed.
   */
  async scheduleBountyNotification(
    userId: bigint, // Changed to bigint to match TelegramUser.id
    bountyId: string,
    bountyDetails: BountyDetails, // Use the specific interface
    changeType: 'NEW_BOUNTY' | 'REGION_UPDATED' | 'DEADLINE_UPDATED', // Be specific about accepted types
    notificationBountyType: BountyType, // Pass the original type (BOUNTY, PROJECT)
  ): Promise<BountyNotification> {

    const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development' || 'test';
    const delayMilliseconds = isDevelopment ? 5 * 1000 : 12 * 60 * 60 * 1000; // 5 seconds for dev, 12 hours for prod
    const sendAt = new Date(Date.now() + delayMilliseconds);

    this.logger.log(`Scheduling notification for user ${userId} about bounty ${bountyId} (change type: ${changeType}, bounty type: ${notificationBountyType}) to be sent at ${sendAt.toISOString()}`);
    return this.prisma.bountyNotification.create({
      data: {
        telegramUserId: userId,
        bountyId: bountyId,
        bountyDetails: bountyDetails as any,
        notificationType: changeType, // Storing the change type (e.g., NEW_BOUNTY)
        sendAt: sendAt,
        sent: false,
      },
    });
  }

  /**
   * Utility to pause execution for a given number of milliseconds.
   * @param ms The number of milliseconds to wait.
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cron job to send overdue bounty notifications.
   * Runs every 10 minutes.
   */
  @Cron(CRON_SCHEDULE, { name: 'bounty-notifications' })
  async handleScheduledNotifications() {
    this.logger.debug('Checking for overdue bounty notifications...');
    const now = new Date();

    const overdueNotifications = await this.prisma.bountyNotification.findMany({
      where: {
        sendAt: {
          lte: now, // Less than or equal to current time
        },
        sent: false,
      },
      include: {
        telegramUser: { // Only include the ID of the related TelegramUser
          select: {
            id: true,
          },
        },
      },
      // Order by 'createdAt' or 'sendAt' to process older notifications first
      orderBy: {
        sendAt: 'asc',
      },
    });

    if (overdueNotifications.length === 0) {
      this.logger.debug('No overdue notifications found.');
      return;
    }

    this.logger.log(`Found ${overdueNotifications.length} overdue notifications.`);

    for (const notification of overdueNotifications) {
      const { telegramUser, bountyDetails, notificationType, bountyId } = notification;

      // Ensure telegramUser and its ID exist and are of the expected BigInt type
      if (!telegramUser || typeof telegramUser.id !== 'bigint') {
        this.logger.warn(`Skipping notification ${notification.id}: Telegram user ID not found or invalid type.`);
        await this.prisma.bountyNotification.update({
          where: { id: notification.id },
          data: { sent: true }, // Mark as sent to prevent re-processing
        });
        continue;
      }

      // Cast bountyDetails to the specific interface for type safety
      const bounty = bountyDetails as unknown as BountyDetails;
      let message = 'New opportunity available!';
      const bountyTypeName = this.capitalizeFirstLetter(bounty.type.toLowerCase()); // e.g., "Bounty" or "Project"

      const skillsListDisplay = bounty.skillsNeeded.length > 0
        ? bounty.skillsNeeded.map(skill => `\n · ${this.capitalizeFirstLetter(skill.toLowerCase())}`).join('')
        : `\n · N/A`;

      switch (notificationType) {
        case 'NEW_BOUNTY':
          message =
            `${bountyTypeName.toLowerCase() == 'project' ? '💼' : '⚡'} New <b>${this.capitalizeFirstLetter(bountyTypeName.toLowerCase())}</b> >` +
            `${bounty.region == 'GLOBAL' ?
              ` available globally ${this.getFlagForRegion(bounty.region)}\n\n`
              :
              ` available for <b>${this.capitalizeFirstLetter(bounty.region.toLowerCase())}</b> ${this.getFlagForRegion(bounty.region)}`}\n\n` +
            `<a href="${bounty.link}"><b>${bounty.name}</b></a>\n` +
            `By <b>${bounty.sponsorName}</b>\n\n` +
            (bounty.compensationType == 'fixed' ?
              `<b>${bounty.payout}</b> `
              :
              `<b>${bounty.minRewardAsk} ~ ${bounty.maxRewardAsk}</b> `
            ) +
            `<b>${bounty.token ?? 'N/A'}</b> <i>${bounty.compensationType.toLocaleLowerCase() !== '— Fixed' ? '— Variable' : ''} Compensation </i> \n\n` +
            `Required Skills :\n ${skillsListDisplay}\n\n` +
            (bounty.deadline ?
              `${this.formatDeadlineRemaining(bounty.deadline)}\n\n`
              : ''
            )
            +
            `👉 <a href="${bounty.link}">View on Superteam Earn</a>`;
          break;
        case 'REGION_UPDATED':
          message = `📍 The region for a ${bountyTypeName.toLowerCase()} you might be interested in has been updated!\n\n` +
            `<a href="${bounty.link}"><b>${bounty.name}</b></a>\n\n` +
            `Region updated to : <b>${this.capitalizeFirstLetter(bounty.region.toLowerCase())}</b> ${this.getFlagForRegion(bounty.region)}\n` +
            `Previously : <b>${this.capitalizeFirstLetter(bounty.oldRegion.toLowerCase() || 'N/A')}</b> ${this.getFlagForRegion(bounty.oldRegion || '')}\n` + // Display old region, handle potential undefined
            `👉 <a href="${bounty.link}">View on Superteam Earn</a>`;
          break;
        case 'DEADLINE_UPDATED':
          message = `⏳ The deadline for a ${bountyTypeName.toLowerCase()} you might be interested in has been updated!\n\n` +
            `<a href="${bounty.link}"><b>${bounty.name}</b></a>\n\n` +
            `New Deadline : ${new Date(bounty.deadline!).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}\n` +
            `Previous Deadline : ${bounty.oldDeadline ? new Date(bounty.oldDeadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}\n` + // Display old deadline
            `👉 <a href="${bounty.link}">View on Superteam Earn</a>`;
          break;
        default:
          this.logger.warn(`Unknown notification type: ${notificationType} for bounty ${bountyId}.`);
          continue; // Skip this notification if type is unknown
      }

      try {
        await this.telegramService.sendMessageToUser(Number(telegramUser.id), message);
        await this.prisma.bountyNotification.update({
          where: { id: notification.id },
          data: { sent: true },
        });
        this.logger.log(`Successfully sent notification ${notification.id} to user ${telegramUser.id}.`);
      } catch (error) {
        this.logger.error(`Failed to send notification ${notification.id} to user ${telegramUser.id}:`, error);
        await this.prisma.bountyNotification.update({
          where: { id: notification.id },
          data: { sent: true },
        });
      }

      // delay after each message to respect rate limits
      await this.delay(this.MESSAGE_DELAY_MS);
    }
  }

  /**
   * Cron job to clean up sent bounty notifications older than 7 days.
   * Runs every day at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupSentNotifications() {
    this.logger.debug('Cleaning up sent bounty notifications older than 7 days...');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.bountyNotification.deleteMany({
        where: {
          sent: true,
          createdAt: {
            lte: sevenDaysAgo,
          },
        },
      });
      this.logger.log(`Cleaned up ${count} sent bounty notifications.`);
    } catch (error) {
      this.logger.error('Error during cleanup of sent notifications:', error);
    }
  }

  // Helper function to capitalize the first letter of a string
  private capitalizeFirstLetter(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
