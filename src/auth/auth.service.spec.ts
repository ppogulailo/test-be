import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockUserFindUnique = jest.fn();
  const mockUserCreate = jest.fn();
  const mockUserUpdate = jest.fn();
  const mockJwtSignAsync = jest.fn();
  const mockJwtVerify = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: mockUserFindUnique,
              create: mockUserCreate,
              update: mockUserUpdate,
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: mockJwtSignAsync,
            verify: mockJwtVerify,
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    mockUserFindUnique.mockReset();
    mockUserCreate.mockReset();
    mockUserUpdate.mockReset();
    mockJwtSignAsync.mockReset();
    mockJwtVerify.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signUp', () => {
    it('throws ConflictException when email already exists', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 1, email: 'u@x.com' });

      await expect(
        service.signUp({ email: 'u@x.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.signUp({ email: 'u@x.com', password: 'password123' }),
      ).rejects.toThrow('User with this email already exists');
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it('creates user and returns tokens', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: 1,
        email: 'new@x.com',
      });
      mockJwtSignAsync
        .mockResolvedValueOnce('access_token')
        .mockResolvedValueOnce('refresh_token');

      const result = await service.signUp({
        email: 'new@x.com',
        password: 'password123',
      });

      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@x.com',
            type: UserType.TEAM_MEMBER,
            isActive: true,
          }) as { email: string; type: UserType; isActive: boolean },
        }),
      );
      expect(result).toEqual({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        id: 1,
      });
    });
  });

  describe('signIn', () => {
    it('throws UnauthorizedException when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(
        service.signIn({ email: 'u@x.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.signIn({ email: 'u@x.com', password: 'pass' }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('throws UnauthorizedException when password invalid', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 1,
        email: 'u@x.com',
        password: 'hashed',
        isActive: true,
      });
      jest.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

      await expect(
        service.signIn({ email: 'u@x.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens and updates lastLogin when valid', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 1,
        email: 'u@x.com',
        password: 'hashed',
        isActive: true,
      });
      mockUserUpdate.mockResolvedValue(undefined);
      mockJwtSignAsync.mockResolvedValueOnce('at').mockResolvedValueOnce('rt');

      const result = await service.signIn({
        email: 'u@x.com',
        password: 'pass',
      });

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { lastLogin: expect.any(Date) as Date },
      });
      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', id: 1 });
    });
  });

  describe('getMe', () => {
    it('throws UnauthorizedException when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      await expect(service.getMe(999)).rejects.toThrow(UnauthorizedException);
      await expect(service.getMe(999)).rejects.toThrow('User not found');
    });

    it('returns user id, email, type', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 1,
        email: 'u@x.com',
        type: UserType.TEAM_MEMBER,
      });

      const result = await service.getMe(1);

      expect(result).toEqual({
        id: 1,
        email: 'u@x.com',
        type: UserType.TEAM_MEMBER,
      });
    });
  });

  describe('logout', () => {
    it('resolves without throwing', async () => {
      await expect(service.logout(1)).resolves.toBeUndefined();
    });
  });

  describe('refreshTokens', () => {
    it('throws ForbiddenException when refresh token missing', async () => {
      await expect(service.refreshTokens(undefined)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.refreshTokens(undefined)).rejects.toThrow(
        'Refresh token required',
      );
    });

    it('returns new access token when valid refresh token', async () => {
      mockJwtVerify.mockReturnValue({
        sub: '1',
        type: 'refresh',
      });
      mockUserFindUnique.mockResolvedValue({
        id: 1,
        email: 'u@x.com',
        isActive: true,
      });
      mockJwtSignAsync.mockResolvedValue('new_access_token');

      const result = await service.refreshTokens('valid_refresh_token');

      expect(result).toEqual({ accessToken: 'new_access_token' });
    });

    it('throws ForbiddenException when token type is not refresh', async () => {
      mockJwtVerify.mockReturnValue({ sub: '1', type: 'access' });

      await expect(service.refreshTokens('wrong_type_token')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.refreshTokens('wrong_type_token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });
  });
});
