import { Module } from '@nestjs/common';
import { RbacSmokeTestController } from './rbac-smoke-test.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RbacSmokeTestController],
})
export class DevModule {}
