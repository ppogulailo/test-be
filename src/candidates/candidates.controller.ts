import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthCtx } from '../common/context/auth-context.decorators';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { CandidatesService } from './candidates.service';

@ApiTags('candidates')
@ApiBearerAuth('access_token')
@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  @RequirePermission('candidate:read')
  @ApiOperation({
    summary:
      'List candidates (HM/Admin/Viewer: org-wide; Recruiter: only candidates tied to own/assigned jobs)',
  })
  @ApiQuery({
    name: 'jobId',
    required: false,
    type: Number,
    description: 'Optional: filter candidates by job id',
  })
  @ApiResponse({ status: 200, description: 'List of candidate profiles' })
  list(
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
    @Query('jobId', new ParseIntPipe({ optional: true })) jobId?: number,
  ) {
    return this.candidates.list(
      {
        companyId: Number(auth.currentOrgId),
        userId: Number(auth.userId),
        roleKey: auth.roleKey,
      },
      jobId,
    );
  }

  @Get(':id')
  @RequirePermission('candidate:read')
  @ApiOperation({
    summary:
      'Get candidate profile (HM/Admin/Viewer: org-wide; Recruiter: only if tied to own/assigned jobs)',
  })
  @ApiResponse({ status: 200, description: 'Candidate profile' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  getOne(
    @Param('id', ParseIntPipe) id: number,
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
  ) {
    return this.candidates.getOne(id, {
      companyId: Number(auth.currentOrgId),
      userId: Number(auth.userId),
      roleKey: auth.roleKey,
    });
  }
}

