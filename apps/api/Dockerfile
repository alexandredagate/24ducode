FROM node:20-alpine
WORKDIR /app

COPY package.json yarn.lock turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

RUN yarn install --frozen-lockfile

COPY apps/api ./apps/api

CMD ["npm", "run", "turbo", "run", "dev", "--filter=api"]