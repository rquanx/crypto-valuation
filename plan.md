# Crypto 估值需求梳理与数据库设计

## 功能梳理
- 目标：为用户提供一个 Next.js 应用，用本地 sqlite 存储加密项目收入数据，按自定义 PE 计算估值。
- 估值模型：估值 = 收入 × 自定义 PE；收入口径可在 `revenue` 与 `holders_revenue` 间切换，默认优先 `holders_revenue`（更贴近协议留存），缺失时降级到 `revenue`，再缺失才用 `fees` 兜底。
- 前端流程：列表页 -> 添加弹窗（下拉选择要追踪的加密货币/协议，选择估值口径 revenue/holders_revenue，输入自定义 PE，默认启用） -> 列表展示。
- 前端负责统计：从后端拿到日级数据后自行按 1/7/30/90/365 天窗口求和、按口径优先级挑选 metric，再计算估值；后端仅存储与返回原始数据。
- 列表字段：图标、名称、估值口径、PE、当前市值、前 1 日/1 周/1 月/1 季度/1 年收入与估值；必要时显示“使用的收入口径”说明。
- 指标明细：列表卡片同时展示 fees/revenue/holders_revenue 的数据点数量、最近日期以及 7/30/365 天原始收入，便于快速了解覆盖情况。
- 常用筛选：符号/名称搜索
- 单用户场景：用户自定义的 PE 与“跟踪列表”仅存于前端 localStorage，后端与数据库不存用户偏好。

## 数据与定时任务
- 数据源（基于 https://api-docs.defillama.com/ ）：
  - `GET /overview/fees`：列出所有支持的链/协议，字段包含 `defillamaId`、`name`/`displayName`、`slug`、`protocolType`（chain/protocol）、`category`、`logo`、`chains`、`total24h/total7d/total30d/total1y/totalAllTime`、`change_*`、`breakdown24h/30d`。
  - `GET /summary/fees/{slug}?dataType=<dailyFees|dailyRevenue|dailyHoldersRevenue>`：返回单个对象的元数据 + `totalDataChart` 时间序列（timestamp 秒、值或带细分的对象），用于日级收入/费用。需分别抓取 `dailyRevenue` 与 `dailyHoldersRevenue`；支持 `hasLabelBreakdown`，时间序列可直接用于聚合。
- 更新策略：启动时先用 overview 初始化协议列表（仅存元数据，不拉收入，便于前端展示可选币种），且定期刷新币种列表；仅对“被前端添加追踪”的协议拉取收入数据；新增追踪时立即补拉；在 DefiLlama 发布新数据后延迟 10 分钟触发（若无法获知精确发布时间，则每天定时拉取 + 启动时补拉 + 容错重试）；记录最近成功拉取时间，按增量（最近 N 天）获取（基于 `totalDataChart` 最新点），两种收入口径各自维护增量。
- 计算口径：估值 = 收入（对应时间窗总和） × 自定义 PE。收入以 USD 计，时间窗使用自然日聚合（1/7/30/90/365 天），同时返回“使用的收入口径”以便前端标注。

## 后端接口草案
- GET `/api/metrics/:id`：不再需要 `days`/`metric` 参数，直接返回该协议所有可用的日级序列（fees/revenue/holders_revenue 各自独立）及各指标最新日期；前端自行按窗口聚合与择优口径，并可展示各指标原始值。
- GET `/api/coverage`：返回哪些协议具备 `holders_revenue`/`revenue`，便于前端弹窗搜索时标识数据完整度。
- GET `/api/tokens`：可选辅助接口，提供服务端聚合的窗口收入；前端也可全部在浏览器端自行统计。
- POST `/api/tracked`：添加/查看被追踪的协议；新增时触发该协议的即时补拉。

## 数据库表设计草案（sqlite）
- `protocols`：`id` PK，`defillama_id`（如 `chain#solana`，UNIQUE），`slug`，`name`，`display_name`，`protocol_type`（chain/protocol），`category`，`chains`（JSON 数组），`logo`，`gecko_id`，`cmc_id`，`module`，`methodology_url`，`has_label_breakdown`（BOOLEAN），`created_at`，`updated_at`。
- `protocol_metrics`：`id` PK，`protocol_id` FK -> protocols，`metric_type`（fees|revenue|holders_revenue，命名使用下划线规范化 DefiLlama 的 `holdersRevenue`），`date`（DATE, UTC），`value_usd`（REAL），`breakdown_json`（可选，存 `totalDataChart` 中的对象以保留细分），`source_ts`（DATETIME 原始 timestamp），UNIQUE(`protocol_id`,`metric_type`,`date`); 索引：`protocol_id, metric_type, date`.
- `ingest_runs`：`id` PK，`run_at`，`status`（success/failed），`note`（错误信息），`items_fetched`。
- `ingest_cursors`：`id` PK，`protocol_id` FK -> protocols，`metric_type`，`last_date`（DATE），UNIQUE(`protocol_id`,`metric_type`)；用于增量抓取，`revenue` 与 `holders_revenue` 独立记录。
- `tracked_protocols`：`id` PK，`protocol_id` UNIQUE FK -> protocols，`created_at`；仅对表中协议执行定时/手动拉取；协议表由启动时的 overview 初始化，保证前端列表可用。
- 可按需增加视图/物化视图（如 `protocol_metrics_latest`）以加速窗口聚合。

### 统计/查询策略
- 收入口径优先级：优先 `holders_revenue`，缺失时用 `revenue`，再缺失用 `fees`（需标注为“无收入数据，使用 fees 估值”）。
- 前端聚合：浏览器获取日级时间序列后在前端按 1/7/30/90/365 天窗口求和并执行口径降级，再与本地 PE 计算估值；后端不存储用户侧的窗口聚合结果。
- 当前市值：当前价格 * 最大流通量（价格与供应可来自后续扩展的价格源；若缺失则显示为 N/A）。
- 过滤：链/类型来自 `protocols.chain/category`，趋势用近 7/30 天收入环比；PE 过滤由前端在 localStorage 数据上完成。
- 请求限流：对 DefiLlama 的访问需要调度，每分钟 10~200 次的限制，批量拉取时按配置节流（默认小于 100/min，环境变量可调）。
