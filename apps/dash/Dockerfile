FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json turbo.json ./

# Copy dash app and shared packages
COPY apps/dash/ ./apps/dash/
COPY packages/ ./packages/

# Install deps
RUN npm ci

# Build Next.js — bake the API URL at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npx turbo run build --filter=dash

# --- Production stage ---
FROM node:20-alpine
WORKDIR /app

COPY --from=base /app/apps/dash/.next/standalone ./
COPY --from=base /app/apps/dash/.next/static ./apps/dash/.next/static
COPY --from=base /app/apps/dash/public ./apps/dash/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/dash/server.js"]
