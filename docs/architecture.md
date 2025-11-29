# Crypto 估值架构说明

本文基于当前代码实现，描述端到端的数据流、核心模块与运行机制，便于后续演进与排障。

## 技术栈与运行时
- Next.js 16 App Router，全部 API 运行在 Node.js runtime（需文件系统与 SQLite），入口 `app/layout.tsx`、`app/page.tsx`。
- 前端：React 19、@tanstack/react-query 做数据缓存，localStorage 做本地追踪列表，react-dnd 负责卡片拖拽，echarts-for-react 用于走势图。
- 后端：better-sqlite3 本地文件库（默认 `data/crypto-valuation.db`），定时任务基于 node-cron，通过 HTTP 触发自身 API。

## 核心数据流
1) **协议追踪与新增**  
   - 前端弹窗 `components/valuation/add-protocol-modal.tsx` 调用 `GET /api/coverage` 搜索协议，用户选中后 POST `/api/tracked`（body `{ slug }`）。  
   - 后端 `app/api/tracked/route.ts` 将 slug 写入 `tracked_protocols`；若为首次新增，会立刻触发该 slug 的 ingest（`triggerIngestNow`）。  
   - 浏览器侧把追踪列表 + PE 存到 localStorage（key：`crypto-valuation-tracked`），UI 刷新只会重新拉取 metrics。

2) **数据展示与估值**  
   - 卡片 `components/valuation/tracked-card.tsx` 用 React Query 调用 `GET /api/metrics/[id]`，并将返回的协议信息反写到本地追踪元数据。  
   - `/api/metrics/[id]` 若发现协议未入库或无数据，会自动登记并触发一次 ingest，然后再返回最新序列，同时调用 `touchTracked` 更新读取时间。  
   - 估值逻辑在 `lib/valuation.ts`：对收入序列按窗口（1/7/30/90/180/365 天）求和，年化 =（窗口收入 / 天数 × 365）× PE。

3) **目录与覆盖查询**  
   - `GET /api/coverage` 调用 `lib/queries.getCoverageList`，基于 `protocol_metrics` 的行数判断各 metric 覆盖，并附带最新日期，用于新增弹窗与筛选。  
   - `GET /api/tracked` 直接返回当前追踪协议（可按 slug 过滤），供内部调试或自动化。

## 数据存储（SQLite）
路径由 `DATABASE_PATH` 覆盖，默认 `data/crypto-valuation.db`，`lib/db.ts` 负责初始化与 schema 迁移。
- `protocols_raw`：原始 DefiLlama 协议目录（含链、分类、parentProtocol 等），`defillama_id` 唯一。
- `protocols`：聚合后的协议目录，仅保留 `slug/name/display_name/logo`。  
- `protocol_metrics`：按 `slug + metric_type + date` 唯一的日级收入数据，存 USD 值与可选 breakdown JSON；索引(`slug`,`metric_type`,`date`)。  
- `ingest_runs`：抓取运行的状态记录（running/success/failed 等）及写入条数。  
- `ingest_cursors`：每个协议+metric 的最新日期游标，用于增量抓取与回填。  
- `tracked_protocols`：被跟踪的 slug 及 `last_read_at`，便于清理长期未读。

## 数据抓取与目录同步
实现集中在 `lib/ingest.ts` 与 `lib/defillama.ts`。
- **数据源**：`/overview/fees` 获取协议列表；`/summary/fees/{slug}?dataType=dailyFees|dailyRevenue|dailyHoldersRevenue` 拉取日级序列。请求通过 `scheduleRequest` 节流（默认 90 req/min，可用 `DEFILLAMA_MAX_REQUESTS_PER_MIN` 调整）。
- **目录聚合**：`syncProtocolCatalog` 先写入 `protocols_raw`，再按 `parentProtocol/linkedProtocols` 聚合，生成 `protocols`。  
- **抓取范围**：仅对 `tracked_protocols` 内的协议执行，metric 类型默认 `holders_revenue/revenue/fees`，可在 API 调用时覆盖。  
- **增量策略**：`ingest_cursors` 记录最新日期；抓取时会从最新日期向前回填 `INGEST_BACKFILL_DAYS`（默认 5 天），然后批量 UPSERT 到 `protocol_metrics`。  
- **并发与日志**：协议层并发 `INGEST_CONCURRENCY`（默认 3），每次 ingest 会写入 `ingest_runs`，异常会收集到返回的 `errors`。
- **追踪生命周期**：`pruneInactiveTracked` 按 `TRACKED_PROTOCOL_TTL_DAYS`（默认 30）删除长期未读取的追踪，并清理对应游标。

## 调度与触发
- `instrumentation.ts` 在应用启动时注册 cron：`INGEST_CRON`（默认 `0 2 * * *` UTC）抓取数据、`CATALOG_CRON`（默认 `30 1 * * *`）同步目录、`TRACKED_PRUNE_CRON`（默认 `0 1 * * *`）清理追踪。可用 `DISABLE_INGEST_SCHEDULER` 关闭；`INGEST_RUN_ON_BOOT` 控制是否在启动时立即跑三次任务。
- cron 本身不直接触库，而是通过 HTTP 调用 `/api/scheduler?job=ingest|catalog|prune`。`/api/ingest` 可用于手动触发，`useDirect=true` 可绕过互斥直接执行。互斥锁在 `lib/scheduler.ts` 以进程内状态实现，防止重复跑。
- `authorizeRequest` 通过 `INGEST_SECRET`（header `x-ingest-secret` 或 query `token`）简单鉴权；未配置时等同公开。

## 前端结构与状态
- 页面入口 `app/page.tsx`：初始化 React Query client、DndProvider，并管理本地追踪列表、搜索与“刷新数据” nonce。  
- 跟踪卡片 `components/valuation/tracked-card.tsx` 支持拖拽排序、PE 调整、移除、查看走势图。走势图弹窗 `tracked-card-modal.tsx` 支持 metric 勾选、日/周/月/累计切换、区间滑动，估值实时随 PE 与区间变化。  
- `components/valuation/use-aggregated-series.ts` 负责把日级点聚合成日/周/月或累计的对齐序列，并基于可选区间计算总收入与年化估值。

## 缓存与性能
- API 侧：`API_CACHE_TTL_SECONDS`（默认 12h）用于 `/api/coverage` 与 `/api/metrics/[id]` 的缓存头；metrics 在无数据时返回 `no-store`。  
- 客户端：React Query `staleTime` 设为 12 小时；刷新按钮仅递增 refreshNonce 触发重拉。DefiLlama 请求侧有节流队列，避免超过速率限制。

## 环境变量（主要）
- 数据库与基础：`DATABASE_PATH`、`API_CACHE_SECONDS`。  
- 抓取：`INGEST_CONCURRENCY`、`INGEST_BACKFILL_DAYS`、`DEFILLAMA_MAX_REQUESTS_PER_MIN`。  
- 调度与鉴权：`INGEST_CRON`、`CATALOG_CRON`、`TRACKED_PRUNE_CRON`、`DISABLE_INGEST_SCHEDULER`、`INGEST_RUN_ON_BOOT`、`INGEST_SECRET`、`SCHEDULER_BASE_URL`。  
- 跟踪清理：`TRACKED_PROTOCOL_TTL_DAYS`。  

以上覆盖了当前实现的关键路径，便于定位数据来源、存储位置与触发方式。需要扩展时可从对应模块入手（前端 `components/valuation/*`、API `app/api/*`、抓取 `lib/ingest.ts`、调度 `instrumentation.ts`）。 
