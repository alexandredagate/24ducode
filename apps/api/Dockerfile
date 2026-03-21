FROM node:20-alpine
WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json turbo.json ./

# Copy only the packages & app we need
COPY packages/types/ ./packages/types/
COPY apps/api/ ./apps/api/

# Install all deps (workspace-aware, tsx needed at runtime)
RUN npm ci

EXPOSE 3001
CMD ["npx", "tsx", "apps/api/index.ts"]
