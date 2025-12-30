import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { DB_CONFIG, CLEANUP_CONFIG, QUERY_CONFIG } from '../config/index.js';
import type {
  ToolRecord,
  CreateRecordInput,
  UpdateRecordInput,
  QueryFilters,
  PaginatedResponse,
  CleanupResult,
} from '../types/index.js';

/**
 * 数据库管理类
 * 负责所有数据库操作和自动清理
 */
export class ToolsMemoryDB {
  private db: Database.Database;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(dbPath: string = DB_CONFIG.DB_PATH) {
    // 确保数据目录存在
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 初始化数据库
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // 创建表结构
    this.initSchema();

    // 启动自动清理
    this.startAutoCleanup();
  }

  /**
   * 初始化数据库表结构
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_records (
        id TEXT PRIMARY KEY,
        workflow_run_id TEXT NOT NULL UNIQUE,
        record TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- 索引优化查询性能
      CREATE INDEX IF NOT EXISTS idx_tool_records_workflow_run_id ON tool_records(workflow_run_id);
      CREATE INDEX IF NOT EXISTS idx_tool_records_created_at ON tool_records(created_at);
    `);
  }

  /**
   * 创建或追加记录
   * - 如果 workflow_run_id 不存在：创建新记录，record 存为数组
   * - 如果 workflow_run_id 已存在：将新 record 追加到数组末尾
   */
  createOrAppend(input: CreateRecordInput): { record: ToolRecord; isNew: boolean } {
    const existing = this.getByWorkflowRunId(input.workflow_run_id);
    const now = new Date().toISOString();

    if (existing) {
      // 追加到现有记录
      const currentRecords = Array.isArray(existing.record) ? existing.record : [existing.record];
      const newRecords = [...currentRecords, input.record];

      const stmt = this.db.prepare(`
        UPDATE tool_records 
        SET record = ?, updated_at = ?
        WHERE workflow_run_id = ?
      `);

      stmt.run(JSON.stringify(newRecords), now, input.workflow_run_id);

      return { record: this.getByWorkflowRunId(input.workflow_run_id)!, isNew: false };
    } else {
      // 创建新记录，record 存为数组
      const id = uuidv4();

      const stmt = this.db.prepare(`
        INSERT INTO tool_records (id, workflow_run_id, record, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        input.workflow_run_id,
        JSON.stringify([input.record]),  // 存为数组
        now,
        now
      );

      return { record: this.getById(id)!, isNew: true };
    }
  }

  /**
   * 根据内部ID获取记录
   */
  getById(id: string): ToolRecord | null {
    const stmt = this.db.prepare('SELECT * FROM tool_records WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToRecord(row);
  }

  /**
   * 根据 workflow_run_id 获取记录
   */
  getByWorkflowRunId(workflowRunId: string): ToolRecord | null {
    const stmt = this.db.prepare('SELECT * FROM tool_records WHERE workflow_run_id = ?');
    const row = stmt.get(workflowRunId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToRecord(row);
  }

  /**
   * 查询记录（支持过滤和分页）
   */
  query(filters: QueryFilters = {}): PaginatedResponse<ToolRecord> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    // 构建查询条件
    if (filters.workflow_run_id) {
      conditions.push('workflow_run_id = ?');
      params.push(filters.workflow_run_id);
    }

    if (filters.start_time) {
      conditions.push('created_at >= ?');
      params.push(filters.start_time);
    }

    if (filters.end_time) {
      conditions.push('created_at <= ?');
      params.push(filters.end_time);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 获取总数
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM tool_records ${whereClause}`);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // 分页参数
    const limit = Math.min(filters.limit || QUERY_CONFIG.DEFAULT_LIMIT, QUERY_CONFIG.MAX_LIMIT);
    const offset = filters.offset || 0;

    // 获取数据
    const dataStmt = this.db.prepare(`
      SELECT * FROM tool_records 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset) as Record<string, unknown>[];
    const data = rows.map((row) => this.rowToRecord(row));

    return { data, total, limit, offset };
  }

  /**
   * 根据 workflow_run_id 更新记录
   */
  updateByWorkflowRunId(workflowRunId: string, input: UpdateRecordInput): ToolRecord | null {
    const existing = this.getByWorkflowRunId(workflowRunId);
    if (!existing) return null;

    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE tool_records 
      SET record = ?, updated_at = ?
      WHERE workflow_run_id = ?
    `);

    stmt.run(JSON.stringify(input.record), now, workflowRunId);

    return this.getByWorkflowRunId(workflowRunId);
  }

  /**
   * 根据 workflow_run_id 删除记录
   */
  deleteByWorkflowRunId(workflowRunId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM tool_records WHERE workflow_run_id = ?');
    const result = stmt.run(workflowRunId);
    return result.changes > 0;
  }

  /**
   * 执行清理操作
   */
  cleanup(): CleanupResult {
    const result: CleanupResult = {
      deletedByAge: 0,
      deletedByCount: 0,
      totalDeleted: 0,
      remainingRecords: 0,
    };

    // 1. 删除过期记录（基于分钟数）
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - CLEANUP_CONFIG.maxAgeMinutes);
    const cutoffISO = cutoffDate.toISOString();

    const deleteByAgeStmt = this.db.prepare('DELETE FROM tool_records WHERE created_at < ?');
    const ageResult = deleteByAgeStmt.run(cutoffISO);
    result.deletedByAge = ageResult.changes;

    // 2. 删除超出数量限制的旧记录
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM tool_records');
    const countResult = countStmt.get() as { count: number };
    const currentCount = countResult.count;

    if (currentCount > CLEANUP_CONFIG.maxRecords) {
      const deleteCount = currentCount - CLEANUP_CONFIG.maxRecords;
      const deleteByCountStmt = this.db.prepare(`
        DELETE FROM tool_records 
        WHERE id IN (
          SELECT id FROM tool_records 
          ORDER BY created_at ASC 
          LIMIT ?
        )
      `);
      const countDelResult = deleteByCountStmt.run(deleteCount);
      result.deletedByCount = countDelResult.changes;
    }

    result.totalDeleted = result.deletedByAge + result.deletedByCount;

    // 获取剩余记录数
    const remainingResult = countStmt.get() as { count: number };
    result.remainingRecords = remainingResult.count;

    return result;
  }

  /**
   * 启动自动清理定时器
   */
  private startAutoCleanup(): void {
    // 先执行一次清理
    this.cleanup();

    // 设置定时清理
    this.cleanupTimer = setInterval(() => {
      const result = this.cleanup();
      if (result.totalDeleted > 0) {
        console.log(`[AutoCleanup] 清理完成: 删除 ${result.totalDeleted} 条记录, 剩余 ${result.remainingRecords} 条`);
      }
    }, CLEANUP_CONFIG.cleanupIntervalMs);
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 获取数据库统计信息
   */
  getStats(): { totalRecords: number; oldestRecord: string | null; newestRecord: string | null } {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM tool_records');
    const countResult = countStmt.get() as { count: number };

    const oldestStmt = this.db.prepare('SELECT created_at FROM tool_records ORDER BY created_at ASC LIMIT 1');
    const oldestResult = oldestStmt.get() as { created_at: string } | undefined;

    const newestStmt = this.db.prepare('SELECT created_at FROM tool_records ORDER BY created_at DESC LIMIT 1');
    const newestResult = newestStmt.get() as { created_at: string } | undefined;

    return {
      totalRecords: countResult.count,
      oldestRecord: oldestResult?.created_at || null,
      newestRecord: newestResult?.created_at || null,
    };
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.stopAutoCleanup();
    this.db.close();
  }

  /**
   * 将数据库行转换为 ToolRecord 对象
   */
  private rowToRecord(row: Record<string, unknown>): ToolRecord {
    return {
      id: row.id as string,
      workflow_run_id: row.workflow_run_id as string,
      record: JSON.parse((row.record as string) || '{}'),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}

// 单例实例
let dbInstance: ToolsMemoryDB | null = null;

/**
 * 获取数据库实例（单例模式）
 */
export function getDB(): ToolsMemoryDB {
  if (!dbInstance) {
    dbInstance = new ToolsMemoryDB();
  }
  return dbInstance;
}

/**
 * 关闭数据库实例
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
