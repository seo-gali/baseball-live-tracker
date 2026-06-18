# backend 의존성 설치 단계
FROM node:20-slim AS deps

WORKDIR /app

# Node.js 20에 포함된 corepack을 활성화하고 pnpm 버전을 고정
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate

# 의존성 설치에 필요한 파일만 먼저 복사
# Docker layer cache를 활용하기 위해 소스 전체보다 먼저 복사
COPY package.json pnpm-lock.yaml ./

# lockfile 기준으로 의존성을 정확히 설치
RUN pnpm install --frozen-lockfile


# TypeScript build 단계
FROM node:20-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.3 --activate

# deps 단계의 node_modules를 build 단계로 복사
COPY --from=deps /app/node_modules ./node_modules

# backend 전체 소스를 복사
COPY . .

# TypeScript 코드를 dist 디렉터리로 빌드
RUN pnpm build


# 실제 실행 단계
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.34.3 --activate

# production 의존성 설치에 필요한 파일만 복사
COPY package.json pnpm-lock.yaml ./

# 실행에 필요한 production 의존성만 설치
RUN pnpm install --prod --frozen-lockfile

# build 단계에서 생성한 dist 결과물만 복사
COPY --from=build /app/dist ./dist

# WebSocket Server 포트
EXPOSE 4000

# Docker Compose가 env_file로 주입한 환경변수를 process.env에서 사용
CMD ["pnpm", "start:docker"]