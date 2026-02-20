export const ACCESS_TOKEN_EXPIRY = '1h';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const COOKIE_ACCESS_TOKEN = 'access_token';
export const COOKIE_REFRESH_TOKEN = 'refresh_token';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const COOKIE_MAX_AGE_MS = THIRTY_DAYS_MS;

// Determine if we're in production (cross-domain) or development (same-domain)
const isProduction = process.env.NODE_ENV === 'production';

// Log cookie settings for debugging
console.log('[Auth] Cookie Settings:', {
  NODE_ENV: process.env.NODE_ENV,
  isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction,
});

export const COOKIE_OPTIONS = {
  maxAge: COOKIE_MAX_AGE_MS,
  httpOnly: true,
  // Use 'none' for cross-domain (production), 'lax' for same-domain (dev)
  sameSite: isProduction ? ('none' as const) : ('lax' as const),
  // Secure must be true when sameSite is 'none' (HTTPS required)
  secure: isProduction,
  // Don't set domain - let browser handle it (works better for cross-domain)
  // domain: undefined means cookie is set for exact domain (ngrok or localhost)
};

export const COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  sameSite: isProduction ? ('none' as const) : ('lax' as const),
  secure: isProduction,
};
