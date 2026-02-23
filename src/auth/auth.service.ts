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

    // Map role to UserType: 'client' -> TEAM_MEMBER, 'candidate' -> CANDIDATE
    const userType = input.role === 'client' ? UserType.TEAM_MEMBER : UserType.CANDIDATE;

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        password: passwordHash,
        type: userType,
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

  async getMe(userId: number): Promise<{
    id: number;
    email: string;
    type: UserType;
    rbacRole?: string; // NEW: RBAC role from membership_roles
    company?: {
      id: number;
      name: string;
      subscriptionTier: string;
      subscriptionStatus: string;
    };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        type: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
            subscriptionTier: true,
            subscriptionStatus: true,
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    
    // Fetch RBAC role from membership_roles (separate query for cleaner types)
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { 
        userId: userId,
        isActive: true,
      },
      include: {
        roleAssignments: {
          where: { isActive: true },
          select: {
            role: true,
          },
          take: 1,
        },
      },
    });
    
    const rbacRole = membership?.roleAssignments?.[0]?.role;

    // Convert null to undefined for API consistency
    return {
      id: user.id,
      email: user.email,
      type: user.type,
      rbacRole: rbacRole ?? undefined,
      company: user.company ?? undefined,
    };
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
