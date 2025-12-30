/**
 * 工具调用记录的核心数据结构
 * - workflow_run_id: 工作流运行ID，用于标识一次完整的工作流执行
 * - record: 任意JSON值，存储工具调用的详细信息
 */
export interface ToolRecord {
  /** 内部唯一标识符 */
  id: string;
  /** 工作流运行ID (例如: a4f37b46-110c-4b84-946d-e65f5f2bf9eb) */
  workflow_run_id: string;
  /** 记录内容 - 任意JSON值 */
  record: unknown;
  /** 创建时间 (ISO 8601) */
  created_at: string;
  /** 更新时间 (ISO 8601) */
  updated_at: string;
}

/**
 * 创建记录的请求体
 */
export interface CreateRecordInput {
  /** 工作流运行ID */
  workflow_run_id: string;
  /** 记录内容 - 任意JSON值 */
  record: unknown;
}

/**
 * 更新记录的请求体
 */
export interface UpdateRecordInput {
  /** 记录内容 - 任意JSON值 */
  record: unknown;
}

/**
 * 查询记录的过滤条件
 */
export interface QueryFilters {
  /** 按工作流运行ID过滤 */
  workflow_run_id?: string;
  /** 开始时间 (ISO 8601) */
  start_time?: string;
  /** 结束时间 (ISO 8601) */
  end_time?: string;
  /** 返回数量限制 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * API统一响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 清理配置
 */
export interface CleanupConfig {
  /** 最大记录数量 */
  maxRecords: number;
  /** 记录最大保留分钟数 */
  maxAgeMinutes: number;
  /** 自动清理间隔 (毫秒) */
  cleanupIntervalMs: number;
}

/**
 * 清理结果
 */
export interface CleanupResult {
  deletedByAge: number;
  deletedByCount: number;
  totalDeleted: number;
  remainingRecords: number;
}
