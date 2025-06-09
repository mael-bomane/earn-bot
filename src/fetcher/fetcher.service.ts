import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis'; // Import the Redis type
import { TELEGRAF_BOT } from 'src/telegram/telegram.constants'; // Import bot token
import { Telegraf, Context } from 'telegraf';

@Injectable()
export class FetcherService {
  private readonly logger = new Logger(FetcherService.name);
  private readonly FETCH_KEY = 'last_fetched_data'; // Redis key to store last fetched data

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis, // Inject Redis client
    @Inject(TELEGRAF_BOT) private readonly bot: Telegraf<Context>, // Inject the Telegram bot
  ) { }

  @Cron(CronExpression.EVERY_MINUTE) // This decorator schedules the method to run every minute
  async handleCron() {
    this.logger.debug('Cron job running: Fetching data from URL...');
    const url = this.configService.get<string>('FETCH_URL');

    if (!url) {
      this.logger.error('FETCH_URL is not configured. Skipping fetch.');
      return;
    }

    try {
      const response = await firstValueFrom(this.httpService.get<any[]>(url)); // Assuming array of objects
      const newData = response.data;

      // 1. Fetch previous data from Redis
      const previousDataJson = await this.redisClient.get(this.FETCH_KEY);
      let previousData: any[] = [];
      if (previousDataJson) {
        try {
          previousData = JSON.parse(previousDataJson);
        } catch (parseError) {
          this.logger.error(`Error parsing previous data from Redis: ${parseError.message}`);
          previousData = []; // Reset if parsing fails
        }
      }

      // 2. Compare for new entries
      const newEntries = this.compareData(previousData, newData);

      if (newEntries.length > 0) {
        this.logger.warn(`Found ${newEntries.length} new entries!`);
        // Notify via Telegram bot
        const notificationMessage = `🚨 New entries detected!\n\n${newEntries.map(entry => `- ${JSON.stringify(entry)}`).join('\n')}`;
        // You'll need to know a chatId to send the notification to.
        // For simplicity, let's assume you have a hardcoded admin chat ID for now.
        // In a real app, you might fetch this from a DB or have a command for users to subscribe.
        const adminChatId = this.configService.get<string>('ADMIN_CHAT_ID') || process.env.ADMIN_CHAT_ID; // Add ADMIN_CHAT_ID to .env and Joi schema
        if (adminChatId) {
          await this.bot.telegram.sendMessage(adminChatId, notificationMessage);
        } else {
          this.logger.warn('ADMIN_CHAT_ID not set. Cannot send Telegram notification.');
        }

      } else {
        this.logger.log('No new entries found.');
      }

      // 3. Register the new data in Redis (overwrite previous)
      await this.redisClient.set(this.FETCH_KEY, JSON.stringify(newData));
      this.logger.debug('Fetched data registered in Redis.');

    } catch (error) {
      this.logger.error(`Error fetching or processing data: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  /**
   * Compares two arrays of objects to find new entries.
   * Assumes each item in the array has a unique identifier property (e.g., 'id').
   * YOU MIGHT NEED TO CUSTOMIZE THIS BASED ON YOUR DATA STRUCTURE.
   * @param oldData The previously fetched data.
   * @param newData The newly fetched data.
   * @returns An array of new entries.
   */
  private compareData(oldData: any[], newData: any[]): any[] {
    if (!oldData || oldData.length === 0) {
      // If no old data, all new data are "new" entries
      return newData;
    }

    const oldDataIds = new Set(oldData.map(item => item.id || JSON.stringify(item))); // Use 'id' or stringify full object
    const newEntries: any[] = [];

    for (const newItem of newData) {
      const newItemId = newItem.id || JSON.stringify(newItem); // Consistent ID or stringified object
      if (!oldDataIds.has(newItemId)) {
        newEntries.push(newItem);
      }
    }
    return newEntries;
  }
}
