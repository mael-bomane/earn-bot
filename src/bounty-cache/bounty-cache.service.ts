import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Bounties, BountyType, status, Regions, NotificationType } from '@prisma/client'; // Import ScheduledNotificationStatus
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { BountyDetails } from '../interfaces/bounty.interface';
import { BountyNotificationService } from '../notifications/notifications.service';
import { TelegramUser } from '@prisma/client';

// Define the cron schedule based on NODE_ENV
// This constant will be evaluated when the module loads
const CRON_SCHEDULE =
  process.env.NODE_ENV === 'production'
    ? CronExpression.EVERY_HOUR
    : CronExpression.EVERY_MINUTE; // This covers 'development' and 'test'

@Injectable()
export class BountyCacheService implements OnModuleInit {
  private readonly logger = new Logger(BountyCacheService.name);
  private readonly CACHE_KEY = 'published_active_bounties';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly bountyNotificationService: BountyNotificationService,
  ) { }

  async onModuleInit() {
    console.log('BountyCacheService started');
    // Initial cache warm-up on application start
    this.logger.log('Warming up bounty cache on application start...');
    try {
      await this.fetchAndCacheBounties();
    } catch (error) {
      console.log(error)
    }
  }

  @Cron(CRON_SCHEDULE, { name: 'bounty-cache' }) // This cron will now also trigger the comparison
  async handleCron() {
    this.logger.debug('Starting cron job: Fetching, caching, and comparing bounties...');

    const previousBountiesMap = await this.getCachedBountiesMap(); // Get current cache content
    let currentBounties: BountyDetails[] = [];

    try {
      // Step 1: Fetch the latest active bounties from the database
      const bountiesFromDb = await this.prisma.bounties.findMany({
        where: {
          isPublished: true,
          isActive: true,
          deadline: {
            gte: new Date(),
          },
          status: status.OPEN,
          // Exclude hackathons right here
          type: {
            in: [BountyType.bounty, BountyType.project],
          },
        },
        select: {
          id: true,
          title: true, // Assuming a 'title' field for the bounty name
          slug: true,
          rewardAmount: true,
          token: true,
          minRewardAsk: true,
          maxRewardAsk: true,
          compensationType: true,
          deadline: true,
          skills: true, // This is JSONB in Prisma, so skills will be string[]
          region: true,
          type: true,
          sponsor: {
            select: {
              name: true,
            },
          },
        },
      });

      currentBounties = bountiesFromDb.map(bounty => {
        // Ensure skills are an array of strings and converted to uppercase for consistent comparison
        const skillsArray = Array.isArray(bounty.skills)
          ? bounty.skills.map((s: any) => String(s).toUpperCase())
          : [];

        return {
          id: bounty.id,
          name: bounty.title, // Map bounty's title to 'name' for the notification interface
          link: `https://earn.superteam.fun/listing/${bounty.slug}?utm_source=telegrambot`, // bounty link with utm tracking
          payout: bounty.rewardAmount,
          token: bounty.token || 'N/A',
          minRewardAsk: bounty.minRewardAsk?.toFixed(0).toString() || null,
          maxRewardAsk: bounty.maxRewardAsk?.toFixed(0).toString() || null,
          compensationType: bounty.compensationType,
          sponsorName: bounty.sponsor.name,
          deadline: bounty.deadline,
          skillsNeeded: skillsArray,
          region: bounty.region as Regions,
          slug: bounty.slug,
          type: bounty.type,
        };
      });

      this.logger.log(`Fetched ${currentBounties.length} published, active bounties from DB.`);
    } catch (error) {
      console.log(error)
      this.logger.error('Failed to fetch bounties from DB:', error.message, error.stack);
      return; // Abort if database fetch fails
    }

    // Step 2: Compare with previous bounties and schedule notifications
    const detectedChanges: {
      type: 'NEW_BOUNTY' | 'REGION_UPDATED' | 'DEADLINE_UPDATED';
      bounty: BountyDetails;
      oldRegion?: Regions;
      oldDeadline?: Date | null;
    }[] = [];

    // Check for NEW bounties and UPDATED bounties
    for (const currentBounty of currentBounties) {
      const prevBounty = previousBountiesMap[currentBounty.id];

      if (!prevBounty) {
        // This is a NEW bounty
        detectedChanges.push({ type: 'NEW_BOUNTY', bounty: currentBounty });
      } else {
        // Check for UPDATED bounties (region, deadline)
        if (prevBounty.region !== currentBounty.region) {
          detectedChanges.push({
            type: 'REGION_UPDATED',
            bounty: currentBounty,
            oldRegion: prevBounty.region,
          });
        }

        // Compare deadlines (convert to ISO string for reliable comparison)
        const currentDeadlineISO = currentBounty.deadline ? currentBounty.deadline.toISOString() : null;
        const prevDeadlineISO = prevBounty.deadline ? prevBounty.deadline.toISOString() : null;

        if (currentDeadlineISO !== prevDeadlineISO) {
          detectedChanges.push({
            type: 'DEADLINE_UPDATED',
            bounty: currentBounty,
            oldDeadline: prevBounty.deadline,
          });
        }
        // Add more comparison logic for other relevant fields if needed (e.g., payout, skills)
      }
    }

    // Step 3: Schedule notifications for detected changes, checking for duplicates
    if (detectedChanges.length > 0) {
      this.logger.log(`Detected ${detectedChanges.length} changes. Scheduling notifications...`);
      for (const change of detectedChanges) {
        // Fetch all Telegram users who match the bounty's criteria
        const relevantUsers = await this.getRelevantTelegramUsers(change.bounty);

        for (const user of relevantUsers) {
          // --- NEW CHECK: Prevent duplicate scheduled notifications ---
          const existingScheduledNotification = await this.prisma.bountyNotification.findFirst({
            where: {
              telegramUserId: user.id,
              bountyId: change.bounty.id,
              // Check for existing notifications for this user and bounty
              // that are either not yet sent (pending) or have already been sent.
              OR: [
                {
                  sent: false, // Notification is scheduled but not yet sent
                  notificationType: change.type, // Check for pending notifications of the same change type
                },
                {
                  sent: true, // Notification has already been sent
                  notificationType: change.type, // Check for already sent notifications of the same change type
                },
              ],
            },
          });

          if (existingScheduledNotification) {
            this.logger.log(
              `Skipping notification for user ${user.id} and bounty ${change.bounty.id} ` +
              `(${change.type}): A BountyNotification already exists and is ` +
              `${existingScheduledNotification.sent ? 'sent' : 'pending'} with type ${existingScheduledNotification.notificationType}.`
            );
            continue; // Skip to the next user if a notification already exists
          }
          // --- END NEW CHECK ---

          // Prepare the bounty details for the notification, including old values if applicable
          const bountyDataForNotification: BountyDetails = {
            ...change.bounty,
            oldRegion: change.oldRegion,
            oldDeadline: change.oldDeadline,
          };

          await this.bountyNotificationService.scheduleBountyNotification(
            user.id, // telegramUser.id is BigInt here
            change.bounty.id,
            bountyDataForNotification,
            change.type, // Pass the specific change type (NEW_BOUNTY, REGION_UPDATED, DEADLINE_UPDATED)
            change.bounty.type, // Pass BOUNTY/PROJECT type for user filtering in message
          );
        }
      }
    } else {
      this.logger.log('No new or updated bounties detected.');
    }

    // Step 4: Update the cache with the new bounties for the next comparison cycle
    await this.cacheManager.set(this.CACHE_KEY, currentBounties, 0); // Cache for 24 hours
    this.logger.log(`Cache updated with ${currentBounties.length} latest bounties.`);
  }

  // Helper method to just fetch and cache without comparison (used for initial warm-up)
  private async fetchAndCacheBounties(): Promise<void> {
    try {
      const bountiesFromDb = await this.prisma.bounties.findMany({
        where: {
          isPublished: true,
          isActive: true,
          deadline: {
            gte: new Date(),
          },
          status: status.OPEN,
          type: {
            in: [BountyType.bounty, BountyType.project], // Only cache Bounties and Projects
          },
        },
        select: {
          id: true,
          title: true,
          slug: true,
          usdValue: true,
          token: true,
          compensationType: true,
          minRewardAsk: true,
          maxRewardAsk: true,
          deadline: true,
          skills: true,
          region: true,
          type: true,
          sponsor: {
            select: {
              name: true,
            },
          },
        },
      });

      const cachedData: BountyDetails[] = bountiesFromDb.map(bounty => {
        const skillsArray = Array.isArray(bounty.skills)
          ? bounty.skills.map((s: any) => String(s).toUpperCase())
          : [];
        return {
          id: bounty.id,
          name: bounty.title,
          link: `https://earn.superteam.fun/listing/${bounty.slug}?utm_source=telegrambot`,
          payout: bounty.usdValue,
          token: bounty.token || 'USDC',
          compensationType: bounty.compensationType || null,
          minRewardAsk: bounty.minRewardAsk?.toString() || null,
          maxRewardAsk: bounty.maxRewardAsk?.toString() || null,
          sponsorName: bounty.sponsor.name,
          deadline: bounty.deadline,
          skillsNeeded: skillsArray,
          region: bounty.region as Regions,
          slug: bounty.slug,
          type: bounty.type,
        };
      });

      await this.cacheManager.set(this.CACHE_KEY, cachedData);
      this.logger.log(`Successfully cached ${cachedData.length} published and active bounties.`);
    } catch (error) {
      this.logger.error('Failed to fetch and cache bounties for warm-up:', error.message, error.stack);
    }
  }

  async getCachedBounties(): Promise<BountyDetails[] | null> {
    try {
      const cachedBounties = await this.cacheManager.get<BountyDetails[]>(this.CACHE_KEY);
      if (cachedBounties) {
        this.logger.debug('Retrieved bounties from cache.');
        return cachedBounties;
      }
      this.logger.warn('No published/active bounties found in cache. Attempting to re-fetch and cache.');
      await this.fetchAndCacheBounties(); // Re-fetch if cache is empty
      return await this.cacheManager.get<BountyDetails[]>(this.CACHE_KEY); // Try to get again
    } catch (error) {
      this.logger.error('Error retrieving bounties from cache:', error.message);
      return null;
    }
  }

  private async getCachedBountiesMap(): Promise<Record<string, BountyDetails>> {
    const cachedBounties = (await this.cacheManager.get<BountyDetails[]>(this.CACHE_KEY)) || [];
    const cachedBountiesMap: Record<string, BountyDetails> = {};
    for (const bounty of cachedBounties) {
      cachedBountiesMap[bounty.id] = bounty;
    }
    return cachedBountiesMap;
  }

  /**
   * Filters Telegram users based on bounty criteria (region, skills) and notification preferences (Bounty/Project).
   * Ignores Hackathon types.
   * @param bounty The bounty that has changed.
   * @returns An array of TelegramUser objects (only ID, region, skills, and notification preferences are needed).
   */
  private async getRelevantTelegramUsers(bounty: BountyDetails): Promise<Pick<TelegramUser, 'id' | 'region' | 'skills' | 'notificationPreferences'>[]> {
    // Fetch all users who have set up their profile and want bounty or project notifications
    const users = await this.prisma.telegramUser.findMany({
      where: {
        setup: true,
        OR: [
          { notificationPreferences: NotificationType.BOUNTY },
          { notificationPreferences: NotificationType.PROJECT },
          { notificationPreferences: NotificationType.BOTH },
        ],
      },
      select: { // Select only the necessary fields for filtering
        id: true,
        region: true,
        skills: true,
        notificationPreferences: true,
      },
    });

    this.logger.log(`Found ${users.length} users to notify !`);

    return users.filter(user => {
      // 1. Filter by Notification Type Preference (already mostly handled in Prisma query)
      //    Explicitly re-check here for safety and specific scenarios like "BOUNTY" vs "PROJECT"
      if (bounty.type === BountyType.hackathon) {
        return false; // Explicitly ignore hackathons
      }
      if (bounty.type === BountyType.bounty && user.notificationPreferences === NotificationType.PROJECT) {
        return false; // User only wants projects, but this is a bounty
      }
      if (bounty.type === BountyType.project && user.notificationPreferences === NotificationType.BOUNTY) {
        return false; // User only wants bounties, but this is a project
      }

      // 2. Filter by Region
      // User region is 'GLOBAL' OR user region matches bounty's region
      const userRegion = user.region;
      const bountyRegion = bounty.region;
      this.logger.log(`User region : ${userRegion.toString()} Bounty region : ${bountyRegion.toString()}`);

      const regionMatch = userRegion.toString().toLowerCase() == bountyRegion.toLowerCase().toLowerCase() || bountyRegion == Regions.GLOBAL;
      if (!regionMatch) {
        this.logger.log(`User region mismatch !`);
        return false;
      }

      // 3. Filter by Skills
      // Ensure user skills are an array of strings and converted to uppercase for comparison
      const userSkills = (user.skills as string[] || []).map(s => s.toUpperCase());
      const bountySkills = bounty.skillsNeeded.map(s => s.toUpperCase());

      // If user has 'ALL' skill selected, they are interested in any skill
      const userWantsAllSkills = userSkills.includes('ALL');
      if (userWantsAllSkills) {
        return true; // If user wants all skills, and region/type match, they're relevant
      }

      // If user has specific skills, check for intersection with bounty skills
      const hasMatchingSkills = bountySkills.some(bountySkill => userSkills.includes(bountySkill));
      return hasMatchingSkills;
    });
  }
}
