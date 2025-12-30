# CLAUDE.md

这个文件为 Claude Code (claude.ai/code) 提供在此代码库中工作的指导。

## 项目概述

Tools Memory API 是一个 AI 工具调用记录服务,使用 TypeScript + Express + SQLite 构建。它按 `workflow_run_id` 记录、查询和管理工具调用历史,帮助 AI 记住之前执行的工具情况。

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式 (使用 tsx watch,自动重载)
npm run dev

# 构建 TypeScript 到 dist/
npm run build

# 运行生产版本
npm start

# 清理构建产物
npm run clean
```

## Docker 部署

### 使用 Docker Compose (推荐)

```bash
# 构建并启动服务
docker compose up -d

# 查看日志
docker compose logs -f

# 停止服务
docker compose down

# 停止服务并删除数据卷
docker compose down -v

# 重新构建镜像
docker compose build --no-cache
```

### 环境变量配置

在项目根目录创建 `.env` 文件来覆盖默认配置:

```env
PORT=3100
MAX_RECORDS=2000
MAX_AGE_MINUTES=60
CLEANUP_INTERVAL_MS=600000
```

### Docker 架构说明

- **多阶段构建**: Dockerfile 使用两个阶段
  - 构建阶段: 安装完整依赖并编译 TypeScript
  - 生产阶段: 仅包含生产依赖和编译后的代码，优化镜像大小
- **数据持久化**: 使用命名卷 `tools-memory-data` 持久化 SQLite 数据库
- **健康检查**: 每 30 秒检查 `/health` 端点确保服务健康
- **优雅关闭**: 容器停止时正确处理 SIGTERM 信号

## 核心架构

### 数据库层 (src/db/database.ts)

- **ToolsMemoryDB 类**: 使用 better-sqlite3,管理所有数据库操作
- **单例模式**: 通过 `getDB()` 和 `closeDB()` 导出单例实例
- **自动清理机制**:
  - 启动时自动初始化定时器 (`startAutoCleanup()`)
  - 按年龄删除记录 (超过 `maxAgeMinutes`)
  - 按数量删除记录 (超过 `maxRecords` 时删除最旧的)
  - 每 `cleanupIntervalMs` 毫秒运行一次

### 记录存储模式 (重要!)

- **POST /records**: 创建或追加模式
  - 如果 `workflow_run_id` 不存在: 创建新记录,record 存储为数组 `[record]`
  - 如果 `workflow_run_id` 已存在: 将新 record 追加到现有数组末尾
  - 特殊处理: 如果 POST body 的 `record` 字段包含 `context` 子字段,仅存储 `context` 的内容 (src/routes/records.ts:46-54)
- **PUT /records/:workflow_run_id**: 完全替换模式
  - 覆盖整个 record 字段

### API 路由 (src/routes/records.ts)

所有路由挂载在 `/records` 路径下:

- `POST /records` - 创建/追加记录
- `GET /records` - 查询列表(支持过滤和分页)
- `GET /records/stats` - 获取统计信息
- `POST /records/cleanup` - 手动触发清理
- `GET /records/:workflow_run_id` - 按 ID 获取(不存在返回 `data: null`,不报错)
- `PUT /records/:workflow_run_id` - 按 ID 更新
- `DELETE /records/:workflow_run_id` - 按 ID 删除

### 配置系统 (src/config/index.ts)

所有配置通过环境变量覆盖:

- `PORT` (默认 3100) - 服务端口
- `HOST` (默认 0.0.0.0) - 绑定地址
- `DB_PATH` (默认 ./data/tools_memory.db) - 数据库路径
- `MAX_RECORDS` (默认 1000) - 最大记录数
- `MAX_AGE_MINUTES` (默认 30) - 记录最大保留分钟数
- `CLEANUP_INTERVAL_MS` (默认 300000) - 清理间隔毫秒

### 类型定义 (src/types/index.ts)

核心接口:
- `ToolRecord` - 数据库记录结构
- `CreateRecordInput` / `UpdateRecordInput` - API 请求体
- `QueryFilters` - 查询过滤条件
- `ApiResponse<T>` - 统一响应格式
- `CleanupResult` - 清理操作结果

## 数据流关键点

1. **主入口** (src/index.ts): Express 应用初始化,中间件配置,优雅关闭处理
2. **数据库初始化**: 应用启动时通过 `getDB()` 触发,自动创建表结构和索引
3. **自动清理**: 数据库实例化时自动启动,进程退出时自动停止
4. **优雅关闭**: SIGTERM/SIGINT 信号会触发服务器关闭和数据库连接清理

## 数据库 Schema

```sql
CREATE TABLE tool_records (
  id TEXT PRIMARY KEY,                     -- UUID v4
  workflow_run_id TEXT NOT NULL UNIQUE,    -- 工作流运行 ID
  record TEXT NOT NULL DEFAULT '{}',       -- JSON 字符串
  created_at TEXT NOT NULL,                -- ISO 8601 时间戳
  updated_at TEXT NOT NULL                 -- ISO 8601 时间戳
);

-- 索引
CREATE INDEX idx_tool_records_workflow_run_id ON tool_records(workflow_run_id);
CREATE INDEX idx_tool_records_created_at ON tool_records(created_at);
```

## TypeScript 配置要点

- **模块系统**: NodeNext (ESM)
- **输出目录**: dist/
- **源码目录**: src/
- **严格模式**: 启用所有严格检查
- **导入规范**: 必须使用 `.js` 扩展名 (ESM 要求)

## 常见修改场景

- **添加新 API 端点**: 在 src/routes/records.ts 中添加路由处理
- **修改数据模型**: 更新 src/types/index.ts 和 src/db/database.ts 的 schema
- **调整清理策略**: 修改 src/config/index.ts 中的 CLEANUP_CONFIG
- **数据库查询优化**: 编辑 src/db/database.ts 中的相关方法
