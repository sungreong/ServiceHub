FROM node:16

WORKDIR /app

# package.json과 package-lock.json만 먼저 복사하여 종속성 설치
COPY package*.json ./

# 환경변수 설정 (Node.js 16에서는 --openssl-legacy-provider 옵션이 필요하지 않음)
ENV NODE_ENV=development
ENV GENERATE_SOURCEMAP=false
ENV TSC_COMPILE_ON_ERROR=true
ENV ESLINT_NO_DEV_ERRORS=true
ENV CI=false

# 캐시 클리어 및 모든 의존성 설치
RUN npm cache clean --force && \
    npm install

# @tailwindcss/forms 명시적 설치
RUN npm install @tailwindcss/forms

# cross-env 전역 설치
RUN npm install -g cross-env

# 소스 코드 복사
COPY . .

# 프로덕션 빌드
RUN npm run build

# 환경 변수 변경
ENV NODE_ENV=production

EXPOSE 3000

# 프로덕션 서버 실행
CMD ["npm", "run", "start"] 