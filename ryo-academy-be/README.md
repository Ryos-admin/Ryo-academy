# Ryo Academy Backend

The backend API for Ryo Academy, built with [NestJS](https://nestjs.com/), TypeScript, PostgreSQL, and Prisma.

## Prerequisites

- Node.js 20 or later
- npm
- A running PostgreSQL database

## Setup

1. Enter the backend directory and install the dependencies:

   ```bash
   cd ryo-academy-be
   npm install
   ```

2. Create your local environment file from the example:

   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your PostgreSQL connection string:

   ```env
   NODE_ENV=development
   PORT=3000
   API_PREFIX=api/v1
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
   ```

   Replace `USER`, `PASSWORD`, `HOST`, and `DATABASE` with your database details. The `.env` file is ignored by Git and must not be committed.

4. Generate the Prisma client and apply the committed migrations:

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

   For local schema changes during development, use `npx prisma migrate dev` instead of `prisma migrate deploy`.

## Running the API

```bash
# Development with file watching
npm run start:dev

# Debug mode
npm run start:debug

# Production build and start
npm run build
npm run start:prod
```

The API listens on `http://localhost:3000` by default. The global API prefix defaults to `/api/v1`; set `API_PREFIX` in `.env` to change it.

## Verify the setup

With the server running, request the health/example endpoint:

```bash
curl http://localhost:3000/api/v1
```

The application connects to PostgreSQL on startup and logs `Database connected` when the connection succeeds.

## Quality checks

```bash
# Lint and auto-fix supported issues
npm run lint

# Format source and test files
npm run format

# Unit tests
npm test

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Useful Prisma commands

```bash
# Open Prisma Studio
npx prisma studio

# Check migration status
npx prisma migrate status
```
