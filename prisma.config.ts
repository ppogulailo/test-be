// prisma.config.ts
import { defineConfig } from 'prisma/config';

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // Use compiled seed (dist/prisma/seed.js) so no ts-node needed in production
    seed: 'node dist/prisma/seed.js',
  },
});
