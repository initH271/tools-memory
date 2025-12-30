# 多阶段构建 - 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 设置 npm 使用官方源并安装所有依赖
RUN npm config set registry https://registry.npmjs.org/ && npm ci

# 复制源代码
COPY tsconfig.json ./
COPY src ./src

# 构建 TypeScript
RUN npm run build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 设置 npm 使用官方源并只安装生产依赖
RUN npm config set registry https://registry.npmjs.org/ && npm ci --omit=dev

# 从构建阶段复制编译后的代码
COPY --from=builder /app/dist ./dist

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3100

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "dist/index.js"]
