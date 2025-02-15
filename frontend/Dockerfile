FROM node:16

WORKDIR /app

COPY package*.json ./

# 환경변수 설정을 Docker 레벨에서 처리
ENV NODE_OPTIONS=--openssl-legacy-provider

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"] 