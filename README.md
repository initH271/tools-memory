# Tools Memory API

AI工具调用记录服务 - 按 `workflow_run_id` 记录、查询、管理工具调用历史，帮助AI记住之前执行的工具情况。

## 功能特性

- ✅ 按 `workflow_run_id` 存储任意JSON记录
- ✅ 完整的CRUD操作（增删改查）
- ✅ 自动清理过期记录（默认30分钟）
- ✅ SQLite存储，无需额外数据库服务

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式启动 (端口 3100)
npm run dev

# 生产模式
npm run build
npm start
```

## 数据模型

```typescript
interface ToolRecord {
  id: string;               // 内部唯一标识符
  workflow_run_id: string;  // 工作流运行ID (如: a4f37b46-110c-4b84-946d-e65f5f2bf9eb)
  record: any;              // 任意JSON值 - 存储工具调用详情
  created_at: string;       // 创建时间 (ISO 8601)
  updated_at: string;       // 更新时间 (ISO 8601)
}
```

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/` | API文档 |
| GET | `/health` | 健康检查 |
| POST | `/records` | 创建记录 |
| GET | `/records` | 查询记录列表 |
| GET | `/records/stats` | 获取统计信息 |
| POST | `/records/cleanup` | 手动触发清理 |
| GET | `/records/:workflow_run_id` | 获取记录 |
| PUT | `/records/:workflow_run_id` | 更新记录 |
| DELETE | `/records/:workflow_run_id` | 删除记录 |

## 使用示例

### 创建记录

```bash
curl -X POST http://localhost:3100/records \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_run_id": "a4f37b46-110c-4b84-946d-e65f5f2bf9eb",
    "record": {
      "tool_calls": [
        {"tool": "read_file", "params": {"path": "/src/index.ts"}, "result": "..."},
        {"tool": "grep", "params": {"pattern": "TODO"}, "result": "..."}
      ],
      "summary": "Read and searched files"
    }
  }'
```

### 查询记录

```bash
# 查询所有记录
curl http://localhost:3100/records

# 按 workflow_run_id 获取
curl http://localhost:3100/records/a4f37b46-110c-4b84-946d-e65f5f2bf9eb

# 分页查询
curl "http://localhost:3100/records?limit=10&offset=0"
```

### 更新记录

```bash
curl -X PUT http://localhost:3100/records/a4f37b46-110c-4b84-946d-e65f5f2bf9eb \
  -H "Content-Type: application/json" \
  -d '{
    "record": {
      "tool_calls": [...],
      "summary": "Updated summary"
    }
  }'
```

### 删除记录

```bash
curl -X DELETE http://localhost:3100/records/a4f37b46-110c-4b84-946d-e65f5f2bf9eb
```

## 自动清理策略

服务会自动清理记录以防止存储爆满：

- **最大记录数**: 1000条 (可配置)
- **保留时间**: 30分钟 (可配置)
- **清理间隔**: 每5分钟 (可配置)

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| PORT | 3100 | 服务端口 |
| HOST | 0.0.0.0 | 绑定地址 |
| DB_PATH | ./data/tools_memory.db | 数据库文件路径 |
| MAX_RECORDS | 1000 | 最大记录数量 |
| MAX_AGE_MINUTES | 30 | 记录最大保留分钟数 |
| CLEANUP_INTERVAL_MS | 300000 | 清理间隔(毫秒) |

## 项目结构

```
tools_memory/
├── src/
│   ├── config/       # 配置文件
│   ├── db/           # 数据库层
│   ├── routes/       # API路由
│   ├── types/        # TypeScript类型定义
│   └── index.ts      # 主入口
├── data/             # SQLite数据库文件
├── package.json
└── tsconfig.json
```
