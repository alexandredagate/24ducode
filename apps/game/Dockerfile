FROM node:20-alpine
WORKDIR /app

COPY package.json yarn.lock turbo.json ./
COPY apps/game/package.json ./apps/game/
COPY packages/ ./packages/

RUN yarn install --frozen-lockfile

COPY apps/game ./apps/game

CMD ["npm", "run", "turbo", "run", "dev", "--filter=game"]
