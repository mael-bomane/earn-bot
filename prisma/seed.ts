import { PrismaClient, BountyType, status, Source, ApplicationType, CompensationType, Regions } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  // Define your allowed skills
  const availableSkills = [
    "FRONTEND",
    "BACKEND",
    "MOBILE",
    "BLOCKCHAIN",
    "DESIGN",
    "CONTENT",
    "COMMUNITY",
    "GROWTH",
    "OTHER",
  ];

  // Define bounty types for cycling
  const bountyTypes = [BountyType.bounty, BountyType.hackathon, BountyType.project];

  // Define the tokens to alternate
  const tokens = ['USDC', 'SOL', 'ME'];
  let currentTokenIndex = 0; // Initialize index for cycling through tokens

  // Define your allowed regions, ensuring they match the enum values (uppercase)
  const availableRegions: Regions[] = [
    Regions.INDIA, Regions.VIETNAM, Regions.GERMANY, Regions.TURKEY, Regions.MEXICO,
    Regions.UK, Regions.UAE, Regions.NIGERIA, Regions.ISRAEL, Regions.BRAZIL,
    Regions.MALAYSIA, Regions.BALKAN, Regions.PHILIPPINES, Regions.JAPAN, Regions.FRANCE,
    Regions.CANADA, Regions.SINGAPORE, Regions.POLAND, Regions.KOREA, Regions.IRELAND,
    Regions.UKRAINE, Regions.ARGENTINA, Regions.USA, Regions.SPAIN
  ];

  // --- Create a dummy User for pocId ---
  const dummyUser = await prisma.user.upsert({
    where: { email: 'poc.user@example.com' },
    update: {},
    create: {
      email: 'poc.user@example.com',
      username: 'pocuserexample',
      firstName: 'POC',
      lastName: 'User',
      privyDid: 'did:privy:dummy-poc-user-did-12345',
      acceptedTOS: true,
      isKYCVerified: true,
    },
  });
  console.log(`Created dummy user with ID: ${dummyUser.id}`);

  // --- Create a dummy Sponsor for sponsorId ---
  const dummySponsor = await prisma.sponsors.upsert({
    where: { slug: 'dummy-sponsor' },
    update: {},
    create: {
      name: 'Dummy Sponsor Inc.',
      slug: 'dummy-sponsor',
      industry: 'Technology',
      twitter: 'https://twitter.com/dummies',
      bio: 'A great company that loves to sponsor bounties.',
      isVerified: true,
      isActive: true,
    },
  });
  console.log(`Created dummy sponsor with ID: ${dummySponsor.id}`);

  // --- Insert 10 Bounties items ---
  const bountiesData = [];
  for (let i = 0; i < 10; i++) {
    const title = `Bounty Title ${i + 1}`;
    const slug = `bounty-slug-${i + 1}-${Date.now()}`;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + ((i + 1) * 7));

    // Assign skills dynamically
    const assignedSkills: string[] = [];
    const numSkills = Math.floor(Math.random() * 3) + 1;
    const shuffledSkills = [...availableSkills].sort(() => 0.5 - Math.random());
    for (let j = 0; j < numSkills; j++) {
      assignedSkills.push(shuffledSkills[j]);
    }

    // Alternate bounty types
    const bountyType = bountyTypes[i % bountyTypes.length];

    // Alternate regions: Every 3rd bounty is GLOBAL, otherwise cycle through availableRegions
    let assignedRegion: Regions;
    if ((i + 1) % 3 === 0) {
      assignedRegion = Regions.GLOBAL;
    } else {
      assignedRegion = availableRegions[i % availableRegions.length];
    }

    let compensationType: CompensationType = CompensationType.fixed;
    let rewardAmount: number | undefined = 1000 + ((i + 1) * 50);
    let rewards: any = { first: 800 + (i * 10), second: 200 + (i * 5) };
    let maxRewardAsk: number | undefined = undefined;
    let minRewardAsk: number | undefined = undefined;
    let usdValue: number | undefined = 1000 + ((i + 1) * 50);

    // Specific logic for project types with variable and range compensation
    if (bountyType === BountyType.project) {
      if ((i + 1) % 2 === 0) { // Even projects: variable compensation
        compensationType = CompensationType.variable;
        rewardAmount = undefined; // Variable compensation doesn't have a fixed rewardAmount
        rewards = undefined; // Variable compensation doesn't have fixed rewards
        maxRewardAsk = 5000 + ((i + 1) * 100);
        minRewardAsk = 1000 + ((i + 1) * 50);
        usdValue = undefined; // USD value might be estimated or left out for variable
      } else { // Odd projects: range compensation
        compensationType = CompensationType.range;
        rewardAmount = undefined; // Range compensation doesn't have a fixed rewardAmount
        rewards = undefined; // Range compensation doesn't have fixed rewards
        maxRewardAsk = 3000 + ((i + 1) * 75);
        minRewardAsk = 1500 + ((i + 1) * 25);
        usdValue = (maxRewardAsk + minRewardAsk) / 2; // Estimate USD value as average
      }
    }

    // --- New Logic for Alternating Token ---
    const currentToken = tokens[currentTokenIndex];
    currentTokenIndex = (currentTokenIndex + 1) % tokens.length; // Cycle to the next token

    bountiesData.push({
      title: title,
      slug: slug,
      description: `This is a detailed description for ${bountyType} ${i + 1}. It involves solving a challenging problem related to ${assignedSkills.join(', ')} development in the ${assignedRegion} region. Compensation type: ${compensationType}. The reward is in ${currentToken}.`, // Added token to description
      deadline: deadline,
      eligibility: { regions: [assignedRegion], skills: assignedSkills },
      status: i % 2 === 0 ? status.OPEN : status.REVIEW,
      token: currentToken, // <--- This is the change!
      rewardAmount: rewardAmount, // Dynamically set
      rewards: rewards, // Dynamically set
      maxBonusSpots: (i + 1) % 3,
      usdValue: usdValue, // Dynamically set
      sponsorId: dummySponsor.id,
      pocId: dummyUser.id,
      source: Source.NATIVE,
      isPublished: true,
      isFeatured: (i + 1) % 4 === 0,
      isActive: true,
      isArchived: false,
      applicationLink: `https://example.com/apply/${i + 1}`,
      skills: assignedSkills,
      type: bountyType,
      requirements: `Applicants must have strong experience in ${assignedSkills[0].toLowerCase()} development.`,
      isWinnersAnnounced: false,
      region: /* assignedRegion */ Regions.VIETNAM,
      pocSocials: `@pocuser${i + 1}`,
      hackathonprize: bountyType === BountyType.hackathon,
      applicationType: ApplicationType.fixed,
      timeToComplete: `${(i % 3) + 1} weeks`,
      references: { docs: 'link to docs' },
      compensationType: compensationType, // Dynamically set
      maxRewardAsk: maxRewardAsk, // Dynamically set
      minRewardAsk: minRewardAsk, // Dynamically set
      language: 'English',
      shouldSendEmail: true,
      isFndnPaying: false,
    });
  }

  for (const bounty of bountiesData) {
    await prisma.bounties.create({
      data: bounty,
    });
    console.log(`Created bounty with title: "${bounty.title}", type: "${bounty.type}", region: "${bounty.region}", compensation: "${bounty.compensationType}", and token: "${bounty.token}"`); // Added token to log
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
