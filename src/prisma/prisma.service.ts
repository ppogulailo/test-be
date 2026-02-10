import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is required but not set');

    const adapter = new PrismaPg({ connectionString: url });

    super({
      adapter,
      // log: ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a block of Prisma work in a transaction with RLS context set.
   * Sets app.current_org_id for the session so Postgres RLS policies can enforce org isolation.
   * Use for all org-scoped reads/writes when RLS is enabled.
   */
  async runWithOrgContext<T>(
    orgId: number | string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const orgIdStr = String(orgId);
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_org_id', $1, true)",
        orgIdStr,
      );
      return fn(tx);
    });
  }
}
