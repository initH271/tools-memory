import { Router, Request, Response } from 'express';
import { getDB } from '../db/database.js';
import type {
  ApiResponse,
  ToolRecord,
  CreateRecordInput,
  UpdateRecordInput,
  QueryFilters,
  PaginatedResponse,
  CleanupResult,
} from '../types/index.js';

const router = Router();

/**
 * POST /records - 创建或追加记录
 * Body: { workflow_run_id: string, record: any }
 * 
 * - 如果 record 包含 context 字段，只存储 context 的内容
 * - workflow_run_id 不存在：创建新记录
 * - workflow_run_id 已存在：将 record 追加到数组末尾
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const input = req.body as CreateRecordInput;

    // 验证必填字段
    if (!input.workflow_run_id) {
      const response: ApiResponse = {
        success: false,
        error: 'workflow_run_id 是必填字段',
      };
      res.status(400).json(response);
      return;
    }

    if (input.record === undefined) {
      const response: ApiResponse = {
        success: false,
        error: 'record 是必填字段',
      };
      res.status(400).json(response);
      return;
    }

    // 如果 record 是对象且包含 context 字段，只存储 context
    let recordToStore: unknown = input.record;
    if (
      typeof input.record === 'object' &&
      input.record !== null &&
      'context' in input.record
    ) {
      recordToStore = (input.record as Record<string, unknown>).context;
    }

    const db = getDB();
    const { record, isNew } = db.createOrAppend({
      workflow_run_id: input.workflow_run_id,
      record: recordToStore,
    });

    const response: ApiResponse<ToolRecord> = {
      success: true,
      data: record,
      message: isNew ? '记录创建成功' : '记录追加成功',
    };

    res.status(isNew ? 201 : 200).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: `操作失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    res.status(500).json(response);
  }
});

/**
 * GET /records - 查询记录列表
 * Query: workflow_run_id, start_time, end_time, limit, offset
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const filters: QueryFilters = {
      workflow_run_id: req.query.workflow_run_id as string | undefined,
      start_time: req.query.start_time as string | undefined,
      end_time: req.query.end_time as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };

    const db = getDB();
    const result = db.query(filters);

    const response: ApiResponse<PaginatedResponse<ToolRecord>> = {
      success: true,
      data: result,
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: `查询记录失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    res.status(500).json(response);
  }
});

/**
 * GET /records/stats - 获取统计信息
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const db = getDB();
    const stats = db.getStats();

    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats,
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: `获取统计信息失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    res.status(500).json(response);
  }
});

/**
 * POST /records/cleanup - 手动触发清理
 */
router.post('/cleanup', (_req: Request, res: Response) => {
  try {
    const db = getDB();
    const result = db.cleanup();

    const response: ApiResponse<CleanupResult> = {
      success: true,
      data: result,
      message: `清理完成，共删除 ${result.totalDeleted} 条记录`,
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: `清理失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    res.status(500).json(response);
  }
});

/**
 * GET /records/:workflow_run_id - 根据 workflow_run_id 获取记录
 * 如果不存在返回 data: null，不报错
 */
router.get('/:workflow_run_id', (req: Request, res: Response) => {
  try {
    const { workflow_run_id } = req.params;
    const db = getDB();
    const record = db.getByWorkflowRunId(workflow_run_id);

    const response: ApiResponse<ToolRecord | null> = {
      success: true,
      data: record,  // 存在返回记录，不存在返回 null
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: `获取记录失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    res.status(500).json(response);
  }
});

/**
 * PUT /records/:workflow_run_id - 根据 workflow_run_id 更新记录
 * Body: { record: any }
 */
router.put('/:workflow_run_id', (req: Request, res: Response) => {
  try {
    const { workflow_run_id } = req.params;
    const input = req.body as UpdateRecordInput;

    if (input.record === undefined) {
      const response: ApiResponse = {
        success: false,
        error: 'record 是必填字段',
      };
      res.status(400).json(response);
      return;
    }

    const db = getDB();
    const record = db.updateByWorkflowRunId(workflow_run_id, input);

    if (!record) {
      const response: ApiResponse = {
        success: false,
        error: '记录不存在',
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse<ToolRecord> = {
      success: true,
      data: record,
      message: '记录更新成功',
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: `更新记录失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    res.status(500).json(response);
  }
});

/**
 * DELETE /records/:workflow_run_id - 根据 workflow_run_id 删除记录
 */
router.delete('/:workflow_run_id', (req: Request, res: Response) => {
  try {
    const { workflow_run_id } = req.params;
    const db = getDB();
    const deleted = db.deleteByWorkflowRunId(workflow_run_id);

    if (!deleted) {
      const response: ApiResponse = {
        success: false,
        error: '记录不存在',
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: '记录删除成功',
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: `删除记录失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    res.status(500).json(response);
  }
});

export default router;
