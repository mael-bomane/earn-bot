# Earn Bot

## Description

Telegram Bot for [Superteam Earn](https://earn.superteam.fun) notifications.

This project uses the following technologies :

- [pnpm](https://pnpm.io/) package manager
- [NestJS](https://nestjs.com/) backend
- [telegraf.js](https://github.com/telegraf/telegraf) telegram framework
- [MySQL](https://www.mysql.com/) database
- [Prisma](https://www.prisma.io/) ORM

## Features

- User preferences setup & update in telegram : **skills**, **region**, **listing value**.
- Notify users on telegram for **new** or **updated** bounties based on user preferences.
- Respects Telegram API's rate-limit of 30 notifications per second.
- Ignores hackathons listings and bounties/projects that are closed or under review

```
earn-bot/
├── src/
│   ├── schema.prisma # additions but no deletions/modifications of https://github.com/SuperteamDAO/earn/blob/main/prisma/schema.prisma 
│   └── seed.ts # file used by `npx prisma db seed`
├── src/
│   ├── main.ts # uses fastify for performance
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   │
│   ├── bounty-cache/
│   │   └── bounty-cache.service.ts # compare DB with cached values & schedule notifications
│   │
│   ├── telegram/
│   │   ├── telegram.constants.ts
│   │   ├── telegram.module.ts #  custom bot provider
│   │   └── telegram.service.ts # telegram bot related-code tp setup user, update settings, send message
│   │
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   │       └── create-user.dto.ts
│   │
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── guards/
│   │   │   └── auth.guard.ts
│   │   └── interceptors/
│   │       └── transform.interceptor.ts
│   │
│   └── shared/
│       ├── shared.module.ts
│       └── constants/
│           └── api-routes.ts
│
├── test/
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
│
└── .env.example
```

## Project setup

### Environment Variables

You can find an exhaustive `.env.example` at the root of this repository, explaining all expected environment variables.

### Initial Setup

```bash
# run install 
$ pnpm i
# generate prisma client based on `prisma/schema.prisma`
$ npx prisma generate
# development only, creates tables in the local database
$ npx prisma db push
```

### Database

This project expectes a `DATABASE_URL` for `Mysql` using the format `mysql://user:password@host:port/database`

This project includes a `docker-compose.yaml` file to spin up a `MySQL` database, along with a `phpMyAdmin` dashboard on localhost.

In production, don't use this `Dockerfile` are expected to be passed as `mysql://` and `redis://` to environment variables.

```bash
$ docker compose up
```

### Database Seeding (Testing)

You can seed the database with 10 Bounty items, a user and a sponsor.

```bash
$ npx prisma db seed
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
type for skills on both `User` and `Bounties` tables and allows `null` or `undefined` values resulting in "type guessing", 
I assumed a string array — which is valid `Json`, but if any adjustments are needed feel free to DM me.


## Stay in touch

- Author - [Mael Bomane](https://x.com/mael_bomane)

