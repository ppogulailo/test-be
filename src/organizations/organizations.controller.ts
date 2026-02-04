import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { AuthCtx } from '../common/context/auth-context.decorators';
import type { AuthContext } from '../common/context/auth-context.types';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('access_token')
@UseGuards(JwtAuthGuard, OrgContextGuard)
@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List organizations the user belongs to' })
  @ApiResponse({ status: 200, description: 'Current org id and list of orgs with role' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'No active membership' })
  async list(@AuthCtx() ctx: AuthContext) {
    return {
      currentOrgId: ctx.currentOrgId,
      orgs: await this.orgs.listForUser(
        Number(ctx.userId),
        Number(ctx.currentOrgId),
      ),
    };
  }

  @Post(':orgId/switch')
  @ApiOperation({ summary: 'Switch current organization' })
  @ApiResponse({ status: 200, description: 'New auth context (currentOrgId, roleKey, permissions)' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Not a member of the org' })
  @ApiResponse({ status: 404, description: 'Org not found for user' })
  async switchOrg(
    @AuthCtx() ctx: AuthContext,
    @Param('orgId', ParseIntPipe) orgId: number,
  ) {
    return this.orgs.switchOrg(Number(ctx.userId), ctx.email, orgId);
  }
}
