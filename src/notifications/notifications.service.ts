import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { BountyNotification, NotificationType, Regions, BountyType } from '@prisma/client';
import { BountyDetails } from '../interfaces/bounty.interface';

// Define the cron schedule based on NODE_ENV
// This constant will be evaluated when the module loads
const CRON_SCHEDULE =
  process.env.NODE_ENV === 'production'
    ? CronExpression.EVERY_HOUR
    : CronExpression.EVERY_MINUTE; // This covers 'development' and 'test'

@Injectable()
export class BountyNotificationService {
  private readonly logger = new Logger(BountyNotificationService.name);

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
          message = `${bountyTypeName.toLowerCase() == 'project' ? '💼' : '⚡'} <b>${this.capitalizeFirstLetter(bountyTypeName.toLowerCase())}</b> by <b>${bounty.sponsorName}</b>\n\n` +
            `<a href="${bounty.link}"><b>${bounty.name}</b></a>\n\n` +
            `<b>${bounty.payout ?? 'N/A'} ${bounty.token ?? 'N/A'}</b> \n\n` +
            /*`${this.capitalizeFirstLetter(bounty.region.toLowerCase())} ${this.getFlagForRegion(bounty.region)}\n\n` +*/
            `Required Skills :\n ${skillsListDisplay}\n\n` +
            (bounty.deadline ? `*Deadline:* ${new Date(bounty.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}\n\n` : '') +
            `${bounty.region == 'GLOBAL' ?
              `Available Worldwide ${this.getFlagForRegion(bounty.region)}`
              : `Regional Listing for ${this.capitalizeFirstLetter(bounty.region.toLowerCase())} ${this.getFlagForRegion(bounty.region)}`}\n\n` +
            `👉 <a href="${bounty.link}">View on Superteam Earn</a>`;
          break;
        case 'REGION_UPDATED':
          message = `📍 The region for a ${bountyTypeName.toLowerCase()} you might be interested in has been updated!\n\n` +
            `*Title:* ${bounty.name}\n` +
            `*Old Region:* ${this.capitalizeFirstLetter(bounty.oldRegion.toLowerCase()) || 'N/A'} ${this.getFlagForRegion(bounty.region)}\n` + // Display old region
            `*New Region:* ${this.capitalizeFirstLetter(bounty.oldRegion.toLowerCase())} ${this.getFlagForRegion(bounty.region)}\n` +
            `👉 <a href="${bounty.link}">View on Superteam Earn</a>`;
          break;
        case 'DEADLINE_UPDATED':
          message = `⏳ The deadline for a ${bountyTypeName.toLowerCase()} you might be interested in has been updated!\n\n` +
            `*Title:* ${bounty.name}\n` +
            `*Old Deadline:* ${bounty.oldDeadline ? new Date(bounty.oldDeadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}\n` + // Display old deadline
            `*New Deadline:* ${new Date(bounty.deadline!).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}\n` +
            `👉 <a href="${bounty.link}">View on Superteam Earn</a>`;
          break;
        default:
          this.logger.warn(`Unknown notification type: ${notificationType} for bounty ${bountyId}.`);
          continue; // Skip this notification if type is unknown
      }

      try {
        // Telegram bot libraries (like Telegraf) often expect a Number for chat IDs,
        // so convert BigInt to Number. Be aware of potential precision loss for extremely large BigInts,
        // though Telegram user IDs should fit within standard Number limits.
        await this.telegramService.sendMessageToUser(Number(telegramUser.id), message);
        await this.prisma.bountyNotification.update({
          where: { id: notification.id },
          data: { sent: true }, // Mark as sent upon successful (or attempted) delivery
        });
        this.logger.log(`Successfully sent notification ${notification.id} to user ${telegramUser.id}.`);
      } catch (error) {
        this.logger.error(`Failed to send notification ${notification.id} to user ${telegramUser.id}:`, error);
        // Even if sending fails, mark as sent to avoid repeated attempts for the same notification
        // unless you implement a more sophisticated retry mechanism.
        await this.prisma.bountyNotification.update({
          where: { id: notification.id },
          data: { sent: true },
        });
      }
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
          sent: true, // Only clean up notifications that have been marked as sent
          createdAt: {
            lte: sevenDaysAgo, // Older than 7 days
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
