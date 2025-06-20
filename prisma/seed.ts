import { PrismaClient, BountyType, status, Source, ApplicationType, CompensationType, Regions } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  const bountiesData = []; // Declared here

  // Define your allowed skills
  const availableSkills = [
    "Frontend",
    "Backend",
    "Mobile",
    "Blockchain",
    "Design",
    "Content",
    "Community",
    "Growth",
    "Other",
  ];

  // Define bounty types for cycling
  const bountyTypes = [BountyType.bounty, BountyType.hackathon, BountyType.project];

  // --- MODIFIED: Define tokens with weights for USDC bias ---
  // Represent tokens and their relative weights.
  // For example, USDC has 5 parts, SOL 2 parts, ME 1 part.
  // Total parts = 5 + 2 + 1 = 8.
  // USDC chance: 5/8, SOL chance: 2/8, ME chance: 1/8
  const weightedTokens = [
    { token: 'USDC', weight: 5 },
    { token: 'SOL', weight: 2 },
    { token: 'ME', weight: 1 },
  ];

  // Calculate the total weight
  const totalWeight = weightedTokens.reduce((sum, item) => sum + item.weight, 0);


  // Define your allowed regions, ensuring they match the enum values (uppercase)
  const availableRegions: Regions[] = [
    Regions.INDIA, Regions.VIETNAM,
    //Regions.GERMANY, Regions.TURKEY, Regions.MEXICO,
    //Regions.UK, Regions.UAE, Regions.NIGERIA, Regions.ISRAEL, Regions.BRAZIL,
    //Regions.MALAYSIA, Regions.BALKAN, Regions.PHILIPPINES, Regions.JAPAN, Regions.FRANCE,
    //Regions.CANADA, Regions.SINGAPORE, Regions.POLAND, Regions.KOREA, Regions.IRELAND,
    //Regions.UKRAINE, Regions.ARGENTINA, Regions.USA, Regions.SPAIN
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
      name: 'Superteam',
      slug: 'dummy-sponsor',
      industry: 'Technology',
      twitter: 'https://twitter.com/superteam',
      bio: 'A great company that loves to sponsor bounties.',
      isVerified: true,
      isActive: true,
    },
  });
  console.log(`Created dummy sponsor with ID: ${dummySponsor.id}`);

  // --- Dynamic Title Generation based on Skills ---
  const numberOfBounties = 20; // You can adjust this number
  const baseTitles = {
    FRONTEND: ["Build a Responsive Web3 Dashboard", "Develop a Dynamic User Interface", "Implement a Decentralized Frontend"],
    BACKEND: ["Engineer a Scalable API for DApps", "Develop a Secure Backend Service", "Build a High-Performance Data Layer"],
    MOBILE: ["Create a Cross-Platform Mobile Wallet", "Develop an Intuitive iOS/Android App", "Optimize Mobile Performance for Web3"],
    BLOCKCHAIN: ["Audit a Solana Smart Contract", "Develop a New DeFi Protocol", "Integrate Chainlink Oracles"],
    DESIGN: ["Craft Engaging UI/UX for a dApp", "Design a Brand Identity for a Web3 Project", "Create Stunning Visual Assets"],
    CONTENT: ["Write a Compelling Whitepaper", "Produce a Series of Educational Articles", "Develop a Social Media Content Strategy"],
    COMMUNITY: ["Manage a Thriving Telegram Community", "Lead Our Discord Moderation Team", "Grow Our Web3 User Base"],
    GROWTH: ["Devise a User Acquisition Strategy", "Execute a Viral Marketing Campaign", "Analyze Growth Metrics for a dApp"],
    OTHER: ["Research Blockchain Interoperability Solutions", "Consult on Tokenomics Design", "Provide Expert Web3 Legal Advice"],
  };

  for (let i = 0; i < numberOfBounties; i++) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + ((i + 1) * 7));

    // Assign skills dynamically (ensuring at least one skill is picked for title relevance)
    const assignedSkills: string[] = [];
    const numSkills = Math.floor(Math.random() * 3) + 1; // 1 to 3 skills
    const shuffledSkills = [...availableSkills].sort(() => 0.5 - Math.random());
    for (let j = 0; j < numSkills; j++) {
      assignedSkills.push(shuffledSkills[j]);
    }

    // Ensure at least one skill is assigned if by chance none were picked (very rare, but good for robustness)
    if (assignedSkills.length === 0) {
      assignedSkills.push(availableSkills[Math.floor(Math.random() * availableSkills.length)]);
    }

    // Get a title relevant to the first assigned skill
    const primarySkill = assignedSkills[0] as keyof typeof baseTitles;
    const relevantTitles = baseTitles[primarySkill] || baseTitles.OTHER; // Fallback to OTHER
    const title = relevantTitles[Math.floor(Math.random() * relevantTitles.length)];

    // Generate a short random string to append to the slug for uniqueness
    const randomHash = Math.random().toString(36).substring(2, 8); // e.g., "kl9a1b"
    const slug = `${title.toLowerCase().replace(/\s+/g, '-')}-${randomHash}-${Date.now()}`; // Add randomHash and timestamp for strong uniqueness

    const bountyType = bountyTypes[Math.floor(Math.random() * bountyTypes.length)];

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

    if (bountyType === BountyType.project) {
      if ((i + 1) % 2 === 0) {
        compensationType = CompensationType.variable;
        rewardAmount = undefined;
        rewards = undefined;
        maxRewardAsk = 5000 + ((i + 1) * 100);
        minRewardAsk = 1000 + ((i + 1) * 50);
        usdValue = undefined;
      } else {
        compensationType = CompensationType.range;
        rewardAmount = undefined;
        rewards = undefined;
        maxRewardAsk = 3000 + ((i + 1) * 75);
        minRewardAsk = 1500 + ((i + 1) * 25);
        usdValue = (maxRewardAsk + minRewardAsk) / 2;
      }
    }

    // --- MODIFIED: Weighted random selection for token ---
    let randomWeight = Math.random() * totalWeight; // Get a random number between 0 and totalWeight
    let currentToken: string = weightedTokens[0].token; // Initialize with a default

    for (const item of weightedTokens) {
      if (randomWeight < item.weight) {
        currentToken = item.token;
        break;
      }
      randomWeight -= item.weight;
    }

    bountiesData.push({
      title: title,
      slug: slug,
      description: `This is a detailed description for a ${bountyType} focused on "${title}". It involves solving a challenging problem related to ${assignedSkills.join(', ')} development in the ${assignedRegion} region. Compensation type: ${compensationType}. The reward is in ${currentToken}.`,
      deadline: deadline,
      eligibility: { regions: [assignedRegion], skills: assignedSkills },
      status: status.OPEN,
      token: currentToken,
      rewardAmount: rewardAmount,
      rewards: rewards,
      maxBonusSpots: (i + 1) % 3,
      usdValue: usdValue,
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
      region: assignedRegion,
      pocSocials: `@pocuser${i + 1}`,
      hackathonprize: bountyType === BountyType.hackathon,
      applicationType: ApplicationType.fixed,
      timeToComplete: `${(i % 3) + 1} weeks`,
      references: { docs: 'link to docs' },
      compensationType: compensationType,
      maxRewardAsk: maxRewardAsk,
      minRewardAsk: minRewardAsk,
      language: 'English',
      shouldSendEmail: true,
      isFndnPaying: false,
    });
  }

  for (const bounty of bountiesData) {
    await prisma.bounties.create({
      data: bounty,
    });
    console.log(`Created bounty with title: "${bounty.title}", type: "${bounty.type}", region: "${bounty.region}", compensation: "${bounty.compensationType}", and token: "${bounty.token}"`);
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
