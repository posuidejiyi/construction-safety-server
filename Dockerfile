# 微信云托管部署镜像（云托管构建系统使用此文件，必须使用标准写法）
FROM node:20-alpine

WORKDIR /app

# 时区设为北京时间：容器默认 UTC，会导致周重置/周一提醒等“本周口径”偏移 8 小时
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

# 先装依赖，利用缓存
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# 拷贝源码
COPY . .

ENV NODE_ENV=production

# 云托管服务端口（默认 80，可在控制台配置）
EXPOSE 80

CMD ["node", "src/server.js"]
