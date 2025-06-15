# Earn Bot

Telegram Bot for [Superteam Earn](https://earn.superteam.fun) notifications.

## UX Demo

👉 [UX Demo](https://youtu.be/Mek6DReBdl8)

## User Menu PR

👉 [User Menu PR](https://github.com/SuperteamDAO/earn/pull/1109)

## Tech Stack :

- [pnpm](https://pnpm.io/) package manager
- [NestJS](https://nestjs.com/) production-grade backend framework
- [telegraf.js](https://github.com/telegraf/telegraf) telegram SDK
- [MySQL](https://www.mysql.com/) database
- [Prisma](https://www.prisma.io/) ORM

## Features

- Notify users for new or updated *(region or deadline)* Superteam Earn opportunities
- Filtering by **Region**, **Skills** & **Listing value**
- In-App user preferences management
- 12h delay before sending notification
- Respects Telegram rate-limit of 30 messages/second
- Ignores hackathons, private/closed/reviewing bounties

## Project setup

### Environment Variables

`.env.example` explain all mandatory and optional environment variables.

### Development Setup

```bash
cp .env.example .env
pnpm i
prisma db push
prisma db seed
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

## Technical Considerations 

The current [Superteam Earn Database Schema](https://github.com/SuperteamDAO/earn/blob/main/prisma/schema.prisma) uses `Json`
type for `skills` on both `User` and `Bounties` tables and allows `null` or `undefined` values resulting in "type guessing", 
I assumed a string array — which is valid `Json`, but if any adjustments are needed feel free to DM me.

Still regarding the current Database Schema, token name in a Bounty

## Stay in touch

- Author - [Mael Bomane](https://x.com/mael_bomane)

