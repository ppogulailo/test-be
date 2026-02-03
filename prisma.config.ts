// prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const config = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
};

export default defineConfig(config);
