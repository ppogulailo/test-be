import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserType } from '@prisma/client';
import { AuthService } from './auth.service';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_OPTIONS,
  COOKIE_CLEAR_OPTIONS,
} from './auth.constants';
import { CurrentUser } from './current-user.decorator';
import type { RequestUser } from './auth.types';
import { AuthDto } from './dto/auth.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestWithAuth } from '../common/context/request.types';

type RequestWithCookies = RequestWithAuth & {
  cookies?: Record<string, string | undefined>;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'Created. Returns JWT and user id; sets cookies.' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async signup(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.signUp({
      email: dto.email,
      password: dto.password,
    });
    return this.setCookiesAndReturnTokens(res, tokens);
  }

  @Post('signin')
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 201, description: 'Success. Returns JWT and id; sets access_token and refresh_token cookies.' })
  @ApiResponse({ status: 400, description: 'Invalid email or password' })
  async signin(
    @Body() dto: AuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.signIn({
      email: dto.email,
      password: dto.password,
    });
    return this.setCookiesAndReturnTokens(res, tokens);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'Current user id, email, role (client | candidate)' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async me(@CurrentUser() user: RequestUser) {
    const me = await this.auth.getMe(user.userId);
    const role = me.type === UserType.CANDIDATE ? 'candidate' : 'client';
    return { id: me.id, email: me.email, role };
  }

  @UseGuards(JwtAuthGuard)
  @Get('logout')
  @ApiOperation({ summary: 'Log out and clear auth cookies' })
  @ApiResponse({ status: 200, description: 'Cookies cleared' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.userId);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Get('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh_token cookie' })
  @ApiResponse({ status: 200, description: 'New JWT returned; access_token cookie updated' })
  @ApiResponse({ status: 403, description: 'Refresh token missing or invalid' })
  async refresh(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[COOKIE_REFRESH_TOKEN] as string;
    const { accessToken } = await this.auth.refreshTokens(refreshToken);
    res.cookie(COOKIE_ACCESS_TOKEN, accessToken, COOKIE_OPTIONS);
    return { jwt: accessToken };
  }

  private setCookiesAndReturnTokens(
    res: Response,
    tokens: { accessToken: string; refreshToken: string; id: number },
  ) {
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { jwt: tokens.accessToken, id: tokens.id };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie(COOKIE_ACCESS_TOKEN, accessToken, COOKIE_OPTIONS);
    res.cookie(COOKIE_REFRESH_TOKEN, refreshToken, COOKIE_OPTIONS);
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(COOKIE_ACCESS_TOKEN, COOKIE_CLEAR_OPTIONS);
    res.clearCookie(COOKIE_REFRESH_TOKEN, COOKIE_CLEAR_OPTIONS);
  }
}
