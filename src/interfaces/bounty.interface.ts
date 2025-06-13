
import { BountyType, Regions } from '@prisma/client';

/**
 * Defines the structure for a bounty object as it would be cached and
 * stored in the `bountyDetails` JSON column for notifications.
 */
export interface BountyDetails {
  id: string;
  name: string; // Add name (or title) of the bounty
  link: string; // Add link (or URL) of the bounty
  payout: number | null;
  token?: string | null;
  minRewardAsk?: string | null;
  maxRewardAsk?: string | null;
  compensationType?: string | null;
  sponsorName: string;
  deadline: Date | null;
  skillsNeeded: string[];
  region: Regions;
  slug: string;
  type: BountyType;
  // Add optional fields for tracking changes (used when updating)
  oldRegion?: Regions;
  oldDeadline?: Date | null;
}

