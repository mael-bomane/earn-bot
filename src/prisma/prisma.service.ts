import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      //log: ['query', 'info', 'warn', 'error'], // Optional: Add logging for better debugging
    });
  }


  async onModuleInit() {
    await this.$connect();
    //console.log('PrismaService connected to the database.');

    //// --- Optional: Log available models (tables) from the Prisma client ---
    //// This will show you the methods available on the Prisma client,
    //// which correspond to your models/tables in schema.prisma.
    //// It does NOT directly show the actual database structure or data.
    //console.log('Available Prisma models (tables):');
    //for (const key in this) {
    //  // Check if the key corresponds to a Prisma model property (starts with lowercase)
    //  // and is not a private method or internal property.
    //  if (key.match(/^[a-z]/) && !key.startsWith('$')) {
    //    console.log(`- ${key}`);
    //  }
    //}
    //// You can also try to query a specific table to see if it works,
    //// which would throw an error if the table doesn't exist in the DB.
    //try {
    //  // This will only work if the table exists and has at least one record,
    //  // or if you're querying for count.
    //  // Replace 'telegramUser' with any model name from your schema.
    //  const telegramUsersCount = await this.telegramUser.count();
    //  console.log(`TelegramUser table exists. Number of records: ${telegramUsersCount}`);
    //} catch (error) {
    //  console.error('Error querying TelegramUser table. It might not exist or be empty:', error);
    //  console.error('Please ensure you have run `npx prisma migrate dev` or `npx prisma db push`.');
    //}
  }


  // Use OnModuleDestroy for graceful shutdown instead of a custom enableShutdownHooks
  // NestJS will automatically call onModuleDestroy when the application shuts down
  async onModuleDestroy() {
    await this.$disconnect();
  }

}
