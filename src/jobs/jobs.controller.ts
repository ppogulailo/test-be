import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentOrgId } from '../common/context/auth-context.decorators';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';

// todo: replace it with business logic. It was created just to demonstrate the usage of auth + org context and rbac

@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('jobs')
export class JobsController {
  @Post()
  @RequirePermission('job:create')
  create(@CurrentOrgId() orgId: string) {
    return { ok: true, orgId };
  }

  @Post('publish')
  @RequirePermission('job:publish')
  publish(@CurrentOrgId() orgId: string) {
    return { ok: true, orgId };
  }
}
