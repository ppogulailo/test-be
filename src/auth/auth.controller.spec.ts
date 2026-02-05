import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

type MockResponse = {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
} & Response;

describe('AuthController', () => {
  let controller: AuthController;

  const mockSignUp = jest.fn();
  const mockSignIn = jest.fn();
  const mockGetMe = jest.fn();
  const mockLogout = jest.fn();
  const mockRefreshTokens = jest.fn();

  const mockRes: MockResponse = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as MockResponse;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            signUp: mockSignUp,
            signIn: mockSignIn,
            getMe: mockGetMe,
            logout: mockLogout,
            refreshTokens: mockRefreshTokens,
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    mockSignUp.mockReset();
    mockSignIn.mockReset();
    mockGetMe.mockReset();
    mockLogout.mockReset();
    mockRefreshTokens.mockReset();
    mockRes.cookie.mockClear();
    mockRes.clearCookie.mockClear();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signup', () => {
    it('calls auth.signUp and returns jwt and id', async () => {
      mockSignUp.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        id: 1,
      });

      const result = await controller.signup(
        { email: 'new@x.com', password: 'password123' },
        mockRes,
      );

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@x.com',
        password: 'password123',
      });
      expect(mockRes.cookie.mock.calls.length).toBeGreaterThan(0);
      expect(result).toEqual({ jwt: 'at', id: 1 });
    });
  });

  describe('signin', () => {
    it('calls auth.signIn and returns jwt and id', async () => {
      mockSignIn.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        id: 1,
      });

      const result = await controller.signin(
        { email: 'u@x.com', password: 'pass' },
        mockRes,
      );

      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'u@x.com',
        password: 'pass',
      });
      expect(result).toEqual({ jwt: 'at', id: 1 });
    });
  });

  describe('me', () => {
    it('returns id, email, role (client when TEAM_MEMBER)', async () => {
      mockGetMe.mockResolvedValue({
        id: 1,
        email: 'u@x.com',
        type: 'TEAM_MEMBER',
      });

      const result = await controller.me({ userId: 1, email: 'u@x.com' });

      expect(mockGetMe).toHaveBeenCalledWith(1);
      expect(result).toEqual({ id: 1, email: 'u@x.com', role: 'client' });
    });

    it('returns role candidate when user type is CANDIDATE', async () => {
      mockGetMe.mockResolvedValue({
        id: 2,
        email: 'c@x.com',
        type: 'CANDIDATE',
      });

      const result = await controller.me({ userId: 2, email: 'c@x.com' });

      expect(result.role).toBe('candidate');
    });
  });

  describe('logout', () => {
    it('calls auth.logout and clearAuthCookies, returns { ok: true }', async () => {
      mockLogout.mockResolvedValue(undefined);

      const result = await controller.logout(
        { userId: 1, email: 'u@x.com' },
        mockRes,
      );

      expect(mockLogout).toHaveBeenCalledWith(1);
      expect(mockRes.clearCookie.mock.calls.length).toBeGreaterThan(0);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('refresh', () => {
    it('calls auth.refreshTokens with cookie and returns new jwt', async () => {
      mockRefreshTokens.mockResolvedValue({ accessToken: 'new_at' });

      const result = await controller.refresh(
        { cookies: { refresh_token: 'rt_value' } } as never,
        mockRes,
      );

      expect(mockRefreshTokens).toHaveBeenCalledWith('rt_value');
      expect(mockRes.cookie.mock.calls.length).toBeGreaterThan(0);
      expect(result).toEqual({ jwt: 'new_at' });
    });
  });
});
