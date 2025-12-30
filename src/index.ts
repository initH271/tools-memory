import express from 'express';
import cors from 'cors';
import { SERVER_CONFIG, CLEANUP_CONFIG } from './config/index.js';
import { closeDB, getDB } from './db/database.js';
import recordsRouter from './routes/records.js';
import type { ApiResponse } from './types/index.js';

const app = express();

// 中间件
app.use(cors());

// 请求日志（调试用）
app.use((req, _res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// API 路由
app.use('/records', recordsRouter);

// 健康检查
app.get('/health', (_req, res) => {
  try {
    const db = getDB();
    const stats = db.getStats();

    const response: ApiResponse<{
      status: string;
      uptime: number;
      records: number;
      config: {
        maxRecords: number;
        maxAgeMinutes: number;
        cleanupIntervalMs: number;
      };
    }> = {
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        records: stats.totalRecords,
        config: {
          maxRecords: CLEANUP_CONFIG.maxRecords,
          maxAgeMinutes: CLEANUP_CONFIG.maxAgeMinutes,
          cleanupIntervalMs: CLEANUP_CONFIG.cleanupIntervalMs,
        },
      },
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: 'Service unhealthy',
    };
    res.status(503).json(response);
  }
});

// 根路径 - API文档
app.get('/', (_req, res) => {
  const apiDoc = {
    name: 'Tools Memory API',
    version: '1.0.0',
    description: 'AI工具调用记录服务 - 按 workflow_run_id 记录、查询、管理工具调用历史',
    endpoints: {
      'GET /': 'API文档',
      'GET /health': '健康检查',
      'POST /records': '创建/追加记录 (body: { workflow_run_id, record })',
      'GET /records': '查询记录列表 (query: workflow_run_id, start_time, end_time, limit, offset)',
      'GET /records/stats': '获取统计信息',
      'POST /records/cleanup': '手动触发清理',
      'GET /records/:workflow_run_id': '根据 workflow_run_id 获取记录 (不存在返回 null)',
      'PUT /records/:workflow_run_id': '根据 workflow_run_id 更新记录 (body: { record })',
      'DELETE /records/:workflow_run_id': '根据 workflow_run_id 删除记录',
    },
    dataModel: {
      id: 'string - 内部唯一标识符',
      workflow_run_id: 'string - 工作流运行ID (如: a4f37b46-110c-4b84-946d-e65f5f2bf9eb)',
      record: 'array - 记录数组，每次 POST 会追加到数组末尾',
      created_at: 'string (ISO 8601) - 创建时间',
      updated_at: 'string (ISO 8601) - 更新时间',
    },
    cleanupPolicy: {
      maxRecords: `${CLEANUP_CONFIG.maxRecords} 条`,
      maxAgeMinutes: `${CLEANUP_CONFIG.maxAgeMinutes} 分钟`,
      autoCleanupInterval: `${CLEANUP_CONFIG.cleanupIntervalMs / 1000 / 60} 分钟`,
    },
    example: {
      create: {
        method: 'POST /records',
        body: {
          workflow_run_id: 'a4f37b46-110c-4b84-946d-e65f5f2bf9eb',
          record: {
            tool_calls: [
              { tool: 'read_file', params: { path: '/src/index.ts' }, result: '...' },
            ],
            summary: 'Read file',
          },
        },
      },
    },
  };

  res.json(apiDoc);
});

// 404 处理
app.use((_req, res) => {
  const response: ApiResponse = {
    success: false,
    error: '接口不存在',
  };
  res.status(404).json(response);
});

// JSON 解析错误处理 (必须放在路由之后，4个参数)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('[JSON Parse Error]', err.message);
    res.status(400).json({
      success: false,
      error: `JSON 解析错误: ${err.message}`,
    });
    return;
  }
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: `服务器错误: ${err.message}`,
  });
});

// 启动服务器
const server = app.listen(SERVER_CONFIG.PORT, SERVER_CONFIG.HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           🧠 Tools Memory API 服务已启动                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  地址: http://${SERVER_CONFIG.HOST}:${SERVER_CONFIG.PORT}                             ║`);
  console.log(`║  文档: http://localhost:${SERVER_CONFIG.PORT}/                            ║`);
  console.log(`║  健康: http://localhost:${SERVER_CONFIG.PORT}/health                      ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  最大记录数: ${CLEANUP_CONFIG.maxRecords} 条                                  ║`);
  console.log(`║  保留时间:   ${CLEANUP_CONFIG.maxAgeMinutes} 分钟                                   ║`);
  console.log(`║  清理间隔:   ${CLEANUP_CONFIG.cleanupIntervalMs / 1000 / 60} 分钟                                    ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// 优雅关闭
const gracefulShutdown = (signal: string) => {
  console.log(`\n收到 ${signal} 信号，正在关闭服务...`);
  server.close(() => {
    console.log('HTTP 服务器已关闭');
    closeDB();
    console.log('数据库连接已关闭');
    process.exit(0);
  });

  // 强制退出超时
  setTimeout(() => {
    console.error('强制退出');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
