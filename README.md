# Earn Bot

## Description

Telegram Bot for [Superteam Earn](https://earn.superteam.fun) notifications.

This project uses the following technologies :

- [pnpm](https://pnpm.io/) package manager
- [NestJS](https://nestjs.com/) backend
- [telegraf.js](https://github.com/telegraf/telegraf) telegram framework
- [MySQL](https://www.mysql.com/) database
- [Redis](https://redis.io/) cache
- [Prisma](https://www.prisma.io/) ORM

## Project setup

### Environment Variables

You can find an exhaustive `.env.example` at the root of this repository.

### Initial Setup

```bash
# run install 
$ pnpm i
# generate prisma client based on `prisma/schema.prisma`
$ npx prisma generate
# development only, creates tables in the local database
$ npx prisma db push
```

### Local Database

This project includes a `docker-compose.yaml` file to expose a `MySQL` database, along with a `Redis` cache on localhost.

In production, these are expected to be passed as `mysql://` and `redis://` to environment variables.

```bash
$ docker compose up
```

### Database Seeding

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

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
