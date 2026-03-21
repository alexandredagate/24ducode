FROM node:20-alpine
WORKDIR /app

COPY package.json yarn.lock turbo.json ./
COPY apps/dash/package.json ./apps/dash/
COPY packages/ ./packages/

RUN yarn install --frozen-lockfile

COPY apps/dash ./apps/dash

CMD ["npm", "run", "turbo", "run", "dev", "--filter=dash"]
