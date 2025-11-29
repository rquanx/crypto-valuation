# tracked card modal 图表与估值方案

## 目标
- 在 tracked card 弹窗内，用同一张图表可勾选展示 holders_revenue / revenue / fees，默认仅显示 revenue，不同颜色区分。
- 支持日/周/月柱状图与累计（Cumulative）折线视图；累计模式对已选序列做前缀和。
- 时间范围可控：根据最旧/最新日期生成范围调节器，只渲染选中窗口的数据，并驱动估值计算。
- 弹窗内有 PE 输入框，默认取卡片上的值，只在弹窗内生效；实时用当前窗口的 revenue 合计 × PE 给出估值。

## 图表库选型（开源）
- 选用 Apache ECharts + `echarts-for-react`（MIT，活跃维护，内置 brush/zoom、时间轴、区间选择、柱/折线切换）。
- 安装：`pnpm add echarts echarts-for-react`
- Next 16/React 19 处理：`TrackedCardChart = dynamic(() => import('./tracked-card-chart'), { ssr: false })`，组件内按需 `import('echarts')`，避免 SSR 报错。

## 数据输入与约束
- 复用 `/api/metrics/[slug]` 返回的 `pointsByMetric`，包含 `holders_revenue` / `revenue` / `fees` 的 `{ date: 'YYYY-MM-DD', value: number }[]`。
- 需要推导 `minDate`/`maxDate`：从所有 metric 的点集中取最小/最大日期（无数据时提示空状态）。
- 弹窗 props 建议：`{ slug, name, logo, peFromCard, seriesByMetric: pointsByMetric }`，避免在弹窗内重复请求；若父层已有 React Query 数据可直接下发。

## 交互与状态
- 复选框：`selectedMetrics`（默认 `['revenue']`）。取消勾选仅隐藏图层，不影响估值数据源（仍基于 revenue）。
- 图表模式：`viewMode = 'bar' | 'cumulative'`；当为 bar 时，`interval = 'day' | 'week' | 'month'`，默认 day。
- 时间范围：双端滑杆或日期范围选择器，初始 `[minDate, maxDate]`，范围变化触发重新聚合。
- PE：`peLocal` 初始 `peFromCard`，仅存于弹窗 state；失焦或输入时实时更新估值。非法值（<=0 或非数）提示并禁用估值展示。

## 数据处理流程（前端 memo 化 selector）
1. **预清洗**：将三类 metric 点按日期排序，去掉无效值（`value <= 0` 可直接忽略）。
2. **截取时间窗**：根据当前 `dateRange` 过滤出窗口内的点；若窗口为空，图表与估值展示空状态。
3. **按粒度聚合**：
   - day：原始点，缺失日期可留空（ECharts 会断点）或补零（若需要连续柱）。
   - week：ISO 周或周一为起点，按周 `sum`。
   - month：自然月 `sum`。
4. **累计模式**：对聚合后的序列按时间排序求前缀和，作为折线数据。
5. **图表配置**：
   - 颜色映射：`revenue=#3CC8FF`，`holders_revenue=#7EE0C3`，`fees=#F6B26B`。
   - 图例与勾选联动；tooltip 展示日期 + 各序列值 + 当前窗口 revenue 合计 + 估值。
   - 轴：X 轴为时间类，Y 轴共享，柱宽在月/周模式下加大便于点击。
   - 交互：开启内部 dataZoom（缩略滑块）与 hover 提示。

## 估值计算
- 数据源：始终使用 `revenue` 的窗口合计（即使用户隐藏 revenue 图层），公式：`valuation = sum(revenueInWindow) * peLocal`。
- `sum(revenueInWindow)` 对应当前粒度的总和（非累计视图下等价）；若 revenue 数据为空或 `peLocal` 非法，估值显示 `—`。
- 在 tooltip 或估值区域展示：“当前窗口收入：$X；PE：Y；估值：$Z”，随范围/PE 变化即时刷新。

## 组件与实现要点
- `TrackedCardModal`：控制开关、承接 props、维护局部 state（metric 勾选、viewMode、interval、dateRange、peLocal）。
- `TrackedCardChart`：仅负责 ECharts 渲染，接受格式化后的 `series[]`、`xAxisLabels`、`viewMode`、`colors`，内部构造 option。
- `useAggregatedSeries` hook：输入 `seriesByMetric` + `viewMode` + `interval` + `dateRange`，返回 `{ filteredSeries, revenueSum, minDate, maxDate }`，便于在弹窗与估值区复用。
- 触发入口：在卡片上增加“查看走势”按钮，点击拉起 modal；关闭 modal 不回写外部 pe。
- 性能：对聚合/累计使用 `useMemo`；滑杆 onChange 可 debounce，防止频繁重算。

## 边界与校验
- 无数据：显示“暂无可绘制的数据”，隐藏图表与估值。
- 单点数据：柱状/折线均可渲染；累计模式即该点值。
- PE 校验：`peLocal <= 0` 或 NaN 时，估值区域展示警告，不调用回调。
- 时间窗口无交集：提示重新选择范围。

## 开发步骤（建议）
1. 引入 ECharts 依赖，新增 `components/valuation/tracked-card-chart.tsx`（SSR 关闭的动态导入）。
2. 在 `lib/valuation` 新增聚合/累计工具函数（按日/周/月分组，返回有序数组），并编写简单单测/故事数据以验证聚合正确性。
3. 开发 `TrackedCardModal` 组件：包括复选框、模式/粒度切换、时间范围控件、PE 输入与估值展示，占位/错误状态。
4. 在现有 `TrackedCard` 中添加入口按钮，并复用已加载的 metrics 数据传给 modal；无数据时可在 modal 内重新触发加载或提示。
5. 联调：确认默认只显示 revenue，切换模式/范围/PE 时图表与估值同步，关闭弹窗不修改卡片 PE。


# tracked card modal 图表与估值实现

## 场景与入口
- TrackedCard 上的“查看走势”按钮拉起 `TrackedCardModal`，数据沿用 React Query 的 `/api/metrics/[slug]` 结果；`seriesByMetric` 未显式传入时，会回退到 `data.pointsByMetric`。
- 弹窗仅管理本地态（metric 勾选、视图模式、时间范围、PE），关闭后不会回写卡片上的 PE。

## 数据来源与聚合
- 输入结构：`Partial<Record<NormalizedMetricType, { date: string; value: number }[]>>`，涵盖 `holders_revenue/revenue/fees`。
- 清洗：`sanitizeSeries` 过滤非法日期、非数或 `<=0` 的点，并按日期升序排序。
- 聚合：`aggregateByInterval` 按日/周/月求和（周以周一为起点，月取当月 1 号）；`cumulativeSeries` 对聚合结果做前缀和，供累计折线使用。
- 视图：`viewMode='bar'` 使用聚合后的柱状数据，`cumulative` 使用前缀和折线；`xAxis` 为所有 metric 聚合日期的并集，缺口用 `null` 对齐。
- 日期域：`minDate/maxDate/availableDates` 来自 `xAxis`，`clampDateRange` 将当前选择限制在该域内，默认使用全量范围。
- 汇总：`sumSeriesByRange` 基于聚合后的 revenue 与 `[start,end]` 求和；`windowDays` 依 interval 折算天数（1/7/当月天数），`computeAnnualizedValuation` 输出年化收入 × PE。

## 状态与交互
- Metric 勾选：`selectedMetrics` 默认 `['revenue']`，切换时至少保留 1 条；只影响图层可见性，估值始终基于 revenue。
- 模式切换：按钮含 `day/week/month/cumulative`。非累计模式为柱状，`interval` 等于所选模式；累计模式为折线，沿用最近一次柱状模式的粒度（`barInterval`）。
- 时间范围：ECharts inside+slider `dataZoom` 驱动 `handleRangeChange`，根据事件中的索引定位 `availableDates` 写入 `[start,end]`；图表缩放由 ECharts 管理，收入合计与估值随范围重算。
- PE：输入框本地存储 `peLocal`（初始为卡片值，`type=number` 且 `min=0`）；非正/无效值被当作 0 参与估值，不提示错误，且不会同步到卡片。

## 展示与格式
- Header：展示协议头像/名称、PE 输入、“当前窗口收入”和“估值”，使用 `formatUSD`（compact）或数值大于 `1e8` 时的 `formatYi`，缺失时显示 `—`；估值存在时文字为绿色，否则为橙色。
- 图表：`TrackedCardChart` 通过 dynamic 关闭 SSR，组件内 `import('echarts')`。柱状在日/周/月模式下调整柱宽，累计模式启用平滑折线+圆点；legend 顶部，月份轴标签裁剪为 `YYYY-MM`，tooltip 使用 ECharts 默认 axis 展示。
- 交互：内置 dataZoom 滑杆（高 32，蓝色填充）与 inside 缩放（throttle 80ms）；加载 echarts 时显示“加载图表中...”，无数据时显示“暂无可绘制的数据”占位。
- 颜色：`METRIC_COLORS` 固定映射 revenue `#3CC8FF`、holders_revenue `#7EE0C3`、fees `#F6B26B`，在标签和图例中复用。

## 组件职责
- `TrackedCardModal`：合并 props 数据、维护本地状态、渲染头部指标/控件，将 `alignedSeries/xAxis/revenueSum/valuation` 等交给图表，并处理 `dataZoom` 回调更新范围。
- `TrackedCardChart`：纯渲染 ECharts 配置，支持柱状/折线与 dataZoom 事件向上抛。
- `useAggregatedSeries`：封装清洗、聚合、日期域推导、范围裁剪、收入合计与年化估值的 memo 化逻辑。
