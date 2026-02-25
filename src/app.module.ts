import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ContextModule } from './common/context/context.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { JobsModule } from './jobs/jobs.module';
import { ApplicationsModule } from './applications/applications.module';
import { CandidatesModule } from './candidates/candidates.module';
import { DevModule } from './dev/dev.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ContextModule,
    OrganizationsModule,
    RbacModule,
    JobsModule,
    ApplicationsModule,
    CandidatesModule,
    DashboardModule,
    DevModule, // RBAC smoke testing
  ],
})
export class AppModule {}
