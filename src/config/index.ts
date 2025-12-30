import type { CleanupConfig } from '../types/index.js';

/**
 * 服务器配置
 */
export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '3100', 10),
  HOST: process.env.HOST || '0.0.0.0',
} as const;

/**
 * 数据库配置
 */
export const DB_CONFIG = {
  /** 数据库文件路径 */
  DB_PATH: process.env.DB_PATH || './data/tools_memory.db',
} as const;

/**
 * 清理配置
 */
export const CLEANUP_CONFIG: CleanupConfig = {
  /** 最大记录数量 - 超过此数量会删除最旧的记录 */
  maxRecords: parseInt(process.env.MAX_RECORDS || '1000', 10),
  /** 记录最大保留分钟数 - 超过此时间的记录会被删除 */
  maxAgeMinutes: parseInt(process.env.MAX_AGE_MINUTES || '30', 10),
  /** 自动清理间隔 - 默认每5分钟执行一次 */
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '300000', 10),
} as const;

/**
 * 查询默认配置
 */
export const QUERY_CONFIG = {
  /** 默认返回数量 */
  DEFAULT_LIMIT: 50,
  /** 最大返回数量 */
  MAX_LIMIT: 500,
} as const;
