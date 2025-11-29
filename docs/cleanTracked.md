# tracked_protocols 过期清理方案

## 背景与目标
- `tracked_protocols` 控制 ingest 抓取范围；长期未读取的条目会放大定时抓取成本。
- 目标：追踪条目超过指定时间（默认 30 天）未被读取则自动移除；用户再次访问 `/api/metrics/[id]` 时可自动恢复追踪。

## 数据库与数据约束
- `tracked_protocols` 结构：
  - `created_at` DATETIME DEFAULT `CURRENT_TIMESTAMP`
  - `last_read_at` DATETIME DEFAULT `CURRENT_TIMESTAMP`
  - 索引 `idx_tracked_protocols_last_read_at`（覆盖 `last_read_at`）
- 迁移策略：
  - 初始化时检查缺失列并 `ALTER TABLE ... ADD COLUMN`，老数据回填 `CURRENT_TIMESTAMP`；索引使用 `IF NOT EXISTS`，幂等可重复执行。
  - 清理仅删除 `tracked_protocols` 与关联的 `ingest_cursors`（同 slug），不触及 `protocols` 或历史 `protocol_metrics`。

## TTL 与配置
- TTL 来自 `TRACKED_PROTOCOL_TTL_DAYS`（正整数）或 `pruneInactiveTracked({ olderThanDays })` 的显式参数；非法值回退到默认 30。
- 过期判定：`last_read_at < now() - TTL`。
- `getTrackedProtocolTtlDays()` 暴露当前 TTL（含默认/配置解析）。

## 读取与恢复策略
- **刷新 last_read_at**：`touchTracked(slugs: string[])` 对去重/trim 后的 slug 批量执行 `last_read_at = CURRENT_TIMESTAMP`，无匹配返回 0 变更，不抛错。
- **当前触发点**：仅 `/api/metrics/[id]` 成功返回（HTTP 200 且 `ok: true`）后调用 `touchTracked([slug])`；`/api/coverage` 与 `/api/tracked` 暂未刷新 `last_read_at`。
- **自动恢复追踪**：`/api/metrics/[id]` 如不存在数据或 slug 未被追踪，会调用 `addTrackedProtocolBySlug` 重建追踪并触发一次 `triggerIngestNow`（仅该 slug）；找不到协议返回 404，不刷新 `last_read_at`。

## 清理执行
- `pruneInactiveTracked({ olderThanDays?, logger? })`：
  - 计算 TTL 后查找过期 slug，事务性删除对应 `ingest_cursors` 与 `tracked_protocols`，返回 `{ deleted, slugs }`（slugs 超过 20 只在日志中截断预览）。
  - 无过期条目仅记录日志；异常捕获后记录错误并返回 `{ deleted: 0, slugs: [] }`。
- 调度：
  - `instrumentation.ts` 使用 `node-cron` 按 `TRACKED_PRUNE_CRON`（默认 `0 1 * * *`，UTC）调用 `/api/scheduler?job=prune`；`INGEST_RUN_ON_BOOT` 未关闭时启动后也会立即触发一次。
  - `/api/scheduler` 经 `authorizeRequest` 保护（需要 `x-ingest-secret` 等凭证），支持 GET/POST 触发 `job=prune` 进行手动清理。
- 清理与 ingest 调度解耦，不在 `ingestDefillama` 入口自动执行。

## 可观测性与安全
- 日志：`pruneInactiveTracked` 使用提供的 logger（默认 `[ingest]` 前缀）输出删除数量及 slug 预览；调度层使用 `[scheduler-cron]`/`[scheduler-api]` 打印启动与结果。
- 幂等性与一致性：`touchTracked` 无匹配时返回 0；`pruneInactiveTracked` 空集或重复调用均安全，删除操作在单事务内确保 `tracked_protocols` 与 `ingest_cursors` 同步。

## 测试点（后续实现时需要覆盖）
- 升级已有 `tracked_protocols` 表后，`created_at`/`last_read_at` 被回填且索引存在。
- `TRACKED_PROTOCOL_TTL_DAYS` 或 `olderThanDays` 解析非法值时回退到 30 天，`getTrackedProtocolTtlDays` 返回值正确。
- `/api/metrics/[id]`：未追踪或无数据时会重新登记并触发一次 ingest；成功响应后 `last_read_at` 被更新，404 不触发更新。
- `touchTracked` 去重/trim 输入，未命中行时返回 0。
- `pruneInactiveTracked` 按 TTL 删除 `tracked_protocols` 与对应 `ingest_cursors`，空结果或异常仅记录日志；返回包含删除的 slug 列表。
- `instrumentation` 定时与 `/api/scheduler?job=prune` 触发路径需要授权，按配置的 cron（及启动时）能执行清理。
