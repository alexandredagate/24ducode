FROM --platform=linux/amd64 node:20-alpine AS base
WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json turbo.json ./

# Copy dash app and shared packages
COPY apps/dash/ ./apps/dash/
COPY packages/ ./packages/

# Install deps + native bindings for Alpine x64 (musl)
RUN npm ci && npm install --no-save lightningcss-linux-x64-musl @tailwindcss/oxide-linux-x64-musl

# Build Next.js — bake the API URL at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npx turbo run build --filter=dash

# --- Production stage ---
FROM --platform=linux/amd64 node:20-alpine
WORKDIR /app

COPY --from=base /app/apps/dash/.next/standalone ./
COPY --from=base /app/apps/dash/.next/static ./apps/dash/.next/static
COPY --from=base /app/apps/dash/public ./apps/dash/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/dash/server.js"]
