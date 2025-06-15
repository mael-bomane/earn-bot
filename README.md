# Earn Bot

👉 [UX Demo](https://youtu.be/Mek6DReBdl8)

## Description

Telegram Bot for [Superteam Earn](https://earn.superteam.fun) notifications.

This project uses the following technologies :

- [pnpm](https://pnpm.io/) package manager
- [NestJS](https://nestjs.com/) backend
- [telegraf.js](https://github.com/telegraf/telegraf) telegram framework
- [MySQL](https://www.mysql.com/) database
- [Prisma](https://www.prisma.io/) ORM

## Features

- User preferences setup & update in telegram : **region**, **skills**, **listing value**.
- Notify users on telegram for **new** or **updated** (region or deadline change) bounties based on user preferences.
- Respects Telegram API's rate-limit of 30 notifications per second.
- Ignores hackathons listings and bounties/projects that are closed, under review or private

## Project setup

### Environment Variables

`.env.example` explain all mandatory and optional environment variables.

### Development Setup

```bash

$ pnpm i # run install 

$ npx prisma generate # generate prisma client based on `prisma/schema.prisma`

$ npx prisma db push # development only, creates tables in the local database

$ npx prisma db seed # development only, seed database with dummy data using src/prisma/seed.ts
```

### Database

This project expects a `DATABASE_URL` environment variable for `Mysql` with this format : `mysql://user:password@host:port/database`

`docker-compose.yaml` convinience to spin up `MySQL` database and `phpMyAdmin` dashboard on localhost.

```bash
$ docker compose up
$ docker compose down # deletes containers and volumes 
```

The Database Schema is a copy of [Superteam Earn Database Schema](https://github.com/SuperteamDAO/earn/blob/main/prisma/schema.prisma), with the following additions : 

```prisma

model TelegramUser {
  id                    BigInt             @id @unique // telegram user ID
  region                Regions            @default(GLOBAL)
  skills                Json               @default("[\"ALL\"]")
  setup                 Boolean            @default(false) // true after /start initial setup 
  notificationPreferences NotificationType @default(NONE) // Bounty, Project, Both or None
  minAsk                Int                @default(0) // 0 = any listing value
  bountyNotifications   BountyNotification[] // for backtracking with BountyNotification model
}

model BountyNotification {
  id               String            @id @default(uuid())
  telegramUserId   BigInt            
  telegramUser     TelegramUser      @relation(fields: [telegramUserId], references: [id])
  bountyId         String            
  bountyDetails    Json             
  notificationType String           
  sendAt           DateTime        
  sent             Boolean           @default(false)
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  // index for faster lookup of unsent notifications by sendAt
  @@index([sendAt, sent])
}

enum NotificationType {
  BOUNTY
  PROJECT
  BOTH
  NONE
}

```

### Directory Tree

```
earn-bot/
├── src/
│   ├── schema.prisma # additions but no deletions/modifications of existing models
│   └── seed.ts # used by `npx prisma db seed` for testing
├── src/
│   ├── bounty-cache/
│   │   └── bounty-cache.service.ts # compare DB with cached values & schedule notifications
│   │
│   ├── telegram/
│   │   └── telegram.service.ts # telegram bot related-code tp setup user, update settings, send message
│   │
│   └── prisma/
│       ├── prisma.module.ts
│       ├── prisma.controller.ts
│       ├── prisma.service.ts
│       └── dto/
│
├── test/
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
│
├── docker-compose.yaml # convinience file to spin a MySQL & phpMyAdmin on localhost
└── .env.example # explains required and optional environment variables
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Technical Considerations 

The current [Superteam Earn Database Schema](https://github.com/SuperteamDAO/earn/blob/main/prisma/schema.prisma) uses `Json`
type for `skills` on both `User` and `Bounties` tables and allows `null` or `undefined` values resulting in "type guessing", 
I assumed a string array — which is valid `Json`, but if any adjustments are needed feel free to DM me.

## Stay in touch

- Author - [Mael Bomane](https://x.com/mael_bomane)

