// test/utils/db-test-utils.ts
import { exec as _exec } from 'child_process';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const exec = promisify(_exec);

const prismaTestClient = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

export const runMigrations = async (): Promise<void> => {
  console.log('Running Prisma migrations for test database...');
  try {
    const { stdout, stderr } = await exec('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      cwd: process.cwd(),
    });
    console.log('Migrations stdout:', stdout);
    if (stderr) console.error('Migrations stderr:', stderr);
    console.log('Prisma migrations applied successfully.');
  } catch (error) {
    console.error('Error running Prisma migrations:', error);
    throw error;
  }
};

export const cleanDatabase = async (): Promise<void> => {
  console.log('Cleaning test database...');
  try {
    // IMPORTANT: Order matters due to foreign key constraints!
    // Delete from child tables first, then parent tables.
    const tableNames = [
      'Comments', // Depends on Bounties, Submission, PoW, GrantApplication, User
      'Submission', // Depends on Bounties, User
      'GrantApplication', // Depends on Grants, User
      'GrantTranche', // Depends on GrantApplication, Grants
      'Scouts', // Depends on Bounties, User
      'TalentRankings', // Depends on User
      'PoW', // Depends on User
      'EmailSettings', // Depends on User
      'UserSponsors', // Depends on User, Sponsors
      'UserInvites', // Depends on User, Sponsors
      'SubscribeBounty', // Depends on User, Bounties
      'SubscribeHackathon', // Depends on User, Hackathon
      'CreditLedger', // Depends on User, Submission
      'Bounties', // Depends on Sponsors, User, BountiesTemplates, Hackathon
      'BountiesTemplates', // Depends on Sponsors, User
      'Grants', // Depends on Sponsors, User
      'Hackathon', // Depends on Sponsors
      'User',
      'Sponsors',
      'Account',
      'Session',
      'emailLogs',
      'ResendLogs',
      'UnsubscribedEmail',
      'BlockedEmail',
      'VerificationToken'
    ];

    // Disable foreign key checks for the duration of the cleaning
    await prismaTestClient.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

    for (const tableName of tableNames) {
      await prismaTestClient.$executeRawUnsafe(`DELETE FROM \`${tableName}\`;`);
      // Reset auto-increment for all tables, if applicable (UUIDs don't need it, but good for other tables)
      // MySQL does not allow ALTER TABLE ... AUTO_INCREMENT = 1 for tables with UUID PKs.
      // So, you might need to selectively apply this or just rely on UUIDs.
      // If you have `id Int @id @default(autoincrement())` in other models, this is useful.
      // For this schema, only EmailSettings has `Int @id @default(autoincrement())`.
      if (tableName === 'EmailSettings' || tableName === 'Hackathon' /* if Hackathon uses int autoincrement */) {
        await prismaTestClient.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1;`);
      }
    }

    // Re-enable foreign key checks
    await prismaTestClient.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');

    console.log('Test database cleaned successfully.');
  } catch (error) {
    console.error('Error cleaning test database:', error);
    throw error;
  } finally {
    // Disconnect if this is the last operation on this client in the global teardown
    // For beforeEach, keep it connected.
  }
};

export const seedDatabaseFromSql = async (filePath: string): Promise<void> => {
  console.log(`Seeding database from SQL file: ${filePath}`);
  try {
    const sql = await fs.readFile(filePath, 'utf-8');
    // Split by semicolon, filter out empty strings, and execute each statement
    const statements = sql.split(';').filter(s => s.trim() !== '');

    for (const statement of statements) {
      if (statement.trim().length > 0) {
        await prismaTestClient.$executeRawUnsafe(statement);
      }
    }
    console.log('Database seeded successfully from SQL file.');
  } catch (error) {
    console.error('Error seeding database from SQL file:', error);
    throw error;
  }
};


export const setupE2eDatabase = async (): Promise<void> => {
  console.log('Setting up e2e test database...');
  await runMigrations();
  await cleanDatabase(); // Clean before seeding to ensure fresh state
  // Seed the specific SQL file for your Bounties tests
  await seedDatabaseFromSql(path.resolve(process.cwd(), 'test/data/seed_bounties.sql'));
  console.log('E2E database setup complete.');
};

export const teardownE2eDatabase = async (): Promise<void> => {
  console.log('Tearing down e2e test database...');
  await cleanDatabase(); // Final cleanup
  await prismaTestClient.$disconnect(); // Disconnect the test client
  console.log('E2E database teardown complete.');
};
