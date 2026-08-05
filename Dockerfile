# 微信云托管部署镜像（云托管构建系统使用此文件，必须使用标准写法）
FROM node:20-alpine

WORKDIR /app

# 先装依赖，利用缓存
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# 拷贝源码
COPY . .

ENV NODE_ENV=production

# 云托管服务端口（默认 80，可在控制台配置）
EXPOSE 80

CMD ["node", "src/server.js"]
