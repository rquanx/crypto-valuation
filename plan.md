# Crypto 估值需求梳理与数据库设计

## 功能梳理（当前实现）
- Next.js + SQLite（better-sqlite3）应用，抓取并保存 DefiLlama 的日级 fees/revenue/holders_revenue 数据，前端用本地 PE 计算估值。
- 跟踪列表与 PE 保存在浏览器 localStorage（key：`crypto-valuation-tracked`），刷新按钮仅触发重新请求数据。
- 前端流程：列表页 → 新增协议弹窗（搜索/选择协议，输入 PE，默认 15） → 卡片展示；搜索框仅在本地跟踪列表中筛选名称/slug，移除也只影响本地状态。
- 数据展示：每个卡片并列展示 holders_revenue 与 revenue 两套收入/估值，不做自动口径降级或 fees 兜底；窗口为 1/7/30/90/180/365 天，估值 =（窗口收入 / 天数 * 365）× PE。
- 明细：显示最新日期、窗口累计收入与折算估值；暂未包含市值、口径说明、数据点数量或 fees。
- 新增协议会调用 `/api/tracked` 在后端登记 slug 并（若首次）触发即时抓取。

## 数据库表设计（当前实现）
- `protocols_raw`：`defillama_id` UNIQUE，`slug/name/display_name/protocol_type/category/chains/logo/gecko_id/cmc_id/module/methodology_url/has_label_breakdown/parent_protocol/linked_protocols`，时间戳。
- `protocols`：聚合后的协议目录，仅含 `id/slug/name/display_name/logo` + 时间戳，`slug` UNIQUE。
- `protocol_metrics`：`id/slug/metric_type/date/value_usd/breakdown_json/source_ts` + 时间戳，UNIQUE(`slug`,`metric_type`,`date`)，索引(`slug`,`metric_type`,`date`)，FK -> `protocols.slug`。
- `ingest_runs`：`run_at/status/note/items_fetched`。
- `ingest_cursors`：`slug/metric_type/last_date` UNIQUE，FK -> `protocols.slug`。
- `tracked_protocols`：记录已被跟踪的 `slug`，UNIQUE。

## 数据与定时任务（当前实现）
- 数据源：DefiLlama `/overview/fees` 初始化协议目录；`/summary/fees/{slug}?dataType=dailyFees|dailyRevenue|dailyHoldersRevenue` 拉取日级序列。
- Catalog 同步：`syncProtocolCatalog` 先写入 `protocols_raw`，再按 parentProtocol/linkedProtocols 聚合到 `protocols`（仅保留 slug/name/displayName/logo）。
- 抓取范围：仅对 `tracked_protocols` 中的协议与指定 metricTypes（默认 holders_revenue/revenue/fees）；新增跟踪时自动触发该 slug 的即时抓取。
- 增量：`ingest_cursors` 记录每个 slug+metric 的 `last_date`，抓取时会向前补齐 `INGEST_BACKFILL_DAYS`（默认 5 天）再写入；`ingest_runs` 记录状态与写入条数。
- 速率/并发：DefiLlama 请求节流到 `DEFILLAMA_MAX_REQUESTS_PER_MIN`（默认 90，顺序串行）；协议并发 `INGEST_CONCURRENCY` 默认 3。
- 定时：`instrumentation.ts` 用 node-cron 定期向 `/api/scheduler` 发起 HTTP 触发；默认 01:10 UTC ingest、02:00 UTC catalog，可 `INGEST_RUN_ON_BOOT` 自动启动一次；`DISABLE_INGEST_SCHEDULER` 可关闭；`INGEST_SECRET` 可保护调度接口。

## 后端接口（当前实现）
- `GET /api/metrics/[id]`：返回指定 slug/id 的协议信息、各 metric（fees/revenue/holders_revenue）的可用数量、最新日期与全部日级点；前端卡片使用。
- `GET /api/coverage`：返回协议基础信息 + 每种 metric 是否有数据及最新日期；支持 `search/limit/trackedOnly/ids/slugs`，默认仅 tracked 协议，新增弹窗以 `trackedOnly=false` 拉取。
- `GET|POST /api/tracked`：受 `INGEST_SECRET` 保护；GET 返回已跟踪协议（可按 `slug` 过滤）；POST 根据 body/query 的 `slug` 添加，若为新增则按可选 `metrics` 触发该 slug 的 ingest。
- `POST /api/ingest`：触发 ingest，支持 `metrics`、`slugs` 过滤与 `dryRun`，默认通过 scheduler 互斥执行，`useDirect=true` 可绕过互斥直接跑。
- `GET|POST /api/scheduler`：受 `INGEST_SECRET` 保护，`job=ingest|catalog`，调用 `triggerIngestNow` 或 `syncProtocolCatalog`；用于 cron HTTP 触发。

## 统计/查询策略（当前实现）
- 前端估值：`sumWindow` 以最新日期为右边界，累加窗口内日级点；估值 =（窗口收入 / 天数 * 365）× PE；PE 与跟踪列表仅存 localStorage，不入库。
- 覆盖查询：`getCoverageList` 基于 `protocol_metrics` 行数判断 coverage，附带各 metric 最新日期，供搜索/新增使用。
- 过滤：API 层支持 `search/ids/slugs`，UI 搜索只在本地跟踪列表匹配名称/slug。
- 其他：当前未实现市值/价格、口径说明、数据点计数展示；fees 数据仅在后端接口中可用。
