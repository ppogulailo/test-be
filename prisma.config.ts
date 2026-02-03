// prisma.config.ts
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: "postgresql://appuser:strong_password_here@localhost:5432/deveteria?schema=public", // docker run -e DATABASE_URL=...
  },
});
