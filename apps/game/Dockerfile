FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY apps/game/package.json ./apps/game/
COPY packages/ ./packages/

RUN npm ci

COPY apps/game ./apps/game

CMD ["npx", "turbo", "run", "dev", "--filter=game"]
