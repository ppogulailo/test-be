export type JwtPayload = {
  sub: string;
  email: string;
};

export type RequestUser = {
  userId: number;
  email: string;
};

export type SignUpInput = { email: string; password: string; role: 'client' | 'candidate' };
export type SignInInput = { email: string; password: string };
export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  id: number;
};
