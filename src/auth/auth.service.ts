import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from './auth.constants';
import type {
  AuthTokens,
  JwtPayload,
  SignInInput,
  SignUpInput,
} from './auth.types';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signUp(input: SignUpInput): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        password: passwordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
      },
      select: { id: true, email: true },
    });

    return this.issueTokens(user.id, user.email);
  }

  async signIn(input: SignInInput): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true, email: true, password: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(input.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    return this.issueTokens(user.id, user.email);
  }

  async getMe(
    userId: number,
  ): Promise<{ id: number; email: string; type: UserType }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, type: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async logout(userId: number): Promise<void> {
    // Client clears cookies; server can invalidate refresh sessions here if stored in DB
    await Promise.resolve(userId);
  }

  async refreshTokens(
    refreshToken: string | undefined,
  ): Promise<{ accessToken: string }> {
    if (!refreshToken) {
      throw new ForbiddenException('Refresh token required');
    }

    try {
      const payload = this.jwt.verify<JwtPayload & { type: string }>(
        refreshToken,
        { algorithms: ['HS256'] },
      );
      if (payload.type !== 'refresh') {
        throw new ForbiddenException('Invalid or expired refresh token');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: Number(payload.sub) },
        select: { id: true, email: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw new ForbiddenException('Invalid or expired refresh token');
      }

      const accessToken = await this.jwt.signAsync(
        { email: user.email },
        {
          subject: String(user.id),
          expiresIn: ACCESS_TOKEN_EXPIRY,
        },
      );

      return { accessToken };
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid or expired refresh token');
    }
  }

  private async issueTokens(
    userId: number,
    email: string,
  ): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { email },
        { subject: String(userId), expiresIn: ACCESS_TOKEN_EXPIRY },
      ),
      this.jwt.signAsync(
        { email, type: 'refresh' },
        { subject: String(userId), expiresIn: REFRESH_TOKEN_EXPIRY },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      id: userId,
    };
  }
}
