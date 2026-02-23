#!/bin/bash

echo "🚀 Starting backend in PRODUCTION mode..."
echo ""
echo "This enables cross-domain cookies (sameSite: none, secure: true)"
echo "Required for Vercel → ngrok authentication"
echo ""

# Set production environment
export NODE_ENV=production

# Show current settings
echo "Environment Variables:"
echo "  NODE_ENV: $NODE_ENV"
echo "  PORT: ${PORT:-4000}"
echo ""

echo "Cookie Settings (will be logged on startup):"
echo "  sameSite: none"
echo "  secure: true"
echo "  httpOnly: true"
echo ""

echo "⚠️  IMPORTANT: Watch for this log after startup:"
echo "  [Auth] Cookie Settings: { NODE_ENV: 'production', sameSite: 'none', secure: true }"
echo ""

# Start the backend
echo "Starting NestJS backend..."
echo "Press Ctrl+C to stop"
echo ""

npm run start:dev

# Alternative: Use this for production build
# npm run build && npm run start:prod
