import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import {
  CandidatesProfileService,
  type UpdateProfileDto,
} from './candidates-profile.service';

@ApiTags('candidates')
@ApiBearerAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('candidates')
export class CandidatesProfileController {
  constructor(private readonly profile: CandidatesProfileService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get candidate profile with completion' })
  @ApiResponse({ status: 200, description: 'Profile and completion' })
  getProfile(@CurrentUser() user: RequestUser) {
    return this.profile.getProfileWithCompletion(user.userId);
  }

  @Get('profile/completion')
  @ApiOperation({ summary: 'Get profile completion breakdown' })
  @ApiResponse({ status: 200, description: 'Profile with completion' })
  getCompletion(@CurrentUser() user: RequestUser) {
    return this.profile.getProfileWithCompletion(user.userId);
  }

  @Get('profile/page-data')
  @ApiOperation({ summary: 'Get full profile page data (profile, documents, completion)' })
  @ApiResponse({ status: 200, description: 'Profile page data' })
  getPageData(@CurrentUser() user: RequestUser) {
    return this.profile.getProfilePageData(user.userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update candidate profile (idempotent upserts for sub-models)' })
  @ApiResponse({ status: 200, description: 'Updated profile with completion' })
  updateProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.profile.updateProfile(user.userId, dto);
  }

  @Post('profile/resume')
  @ApiOperation({ summary: 'Add resume (provide URL from upload)' })
  @ApiResponse({ status: 201, description: 'Resume created' })
  addResume(
    @CurrentUser() user: RequestUser,
    @Body() body: { url: string; title?: string },
  ) {
    return this.profile.addResume(user.userId, body.url, body.title);
  }

  @Post('profile/cover-letter')
  @ApiOperation({ summary: 'Add cover letter (provide URL from upload)' })
  @ApiResponse({ status: 201, description: 'Cover letter created' })
  addCoverLetter(
    @CurrentUser() user: RequestUser,
    @Body() body: { url: string; title?: string },
  ) {
    return this.profile.addCoverLetter(user.userId, body.url, body.title);
  }

  @Post('profile/photo')
  @ApiOperation({ summary: 'Set profile photo (provide URL from upload)' })
  @ApiResponse({ status: 200, description: 'Photo URL stored' })
  setPhoto(@CurrentUser() user: RequestUser, @Body() body: { url: string }) {
    return this.profile.setProfilePhoto(user.userId, body.url);
  }

  @Delete('profile/photo')
  @ApiOperation({ summary: 'Remove profile photo' })
  @ApiResponse({ status: 200, description: 'Photo removed' })
  async deletePhoto(@CurrentUser() user: RequestUser) {
    await this.profile.deleteProfilePhoto(user.userId);
    return {};
  }

  @Delete('profile/resume/:id')
  @ApiOperation({ summary: 'Delete resume' })
  @ApiResponse({ status: 204, description: 'Resume deleted' })
  async deleteResume(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.profile.deleteResume(user.userId, id);
  }

  @Delete('profile/cover-letter/:id')
  @ApiOperation({ summary: 'Delete cover letter' })
  @ApiResponse({ status: 204, description: 'Cover letter deleted' })
  async deleteCoverLetter(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.profile.deleteCoverLetter(user.userId, id);
  }

  @Post('profile/resume/:id/use-for-application')
  @ApiOperation({ summary: 'Set resume as default for applications' })
  setResumeForApplication(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profile.setResumeForApplication(user.userId, id);
  }

  @Post('profile/cover-letter/:id/use-for-application')
  @ApiOperation({ summary: 'Set cover letter as default for applications' })
  setCoverLetterForApplication(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profile.setCoverLetterForApplication(user.userId, id);
  }
}
