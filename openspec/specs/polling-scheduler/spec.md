# polling-scheduler Specification

## Purpose
TBD - created by archiving change bootstrap-stock-watcher. Update Purpose after archive.
## Requirements
### Requirement: 统一调度器双轨刷新

系统 SHALL 维护单一 1 秒 tick 调度器，分别按 `refreshInterval`（默认 5 秒）和 `statusBarRefreshInterval`（默认 3 秒）触发关注列表与状态栏的刷新。每次 tick 取两路待刷新的 code 并集，发起单次批量请求；按各自时序发出 `tree-updated` / `status-updated` 事件。

#### Scenario: 仅列表到期
- **WHEN** 距离上次列表刷新已 ≥ 5 秒、距离状态栏刷新仅 1 秒
- **THEN** 调度器发起请求 codes = 关注列表全集，仅触发 `tree-updated`

#### Scenario: 列表与状态栏同时到期
- **WHEN** 两路同一 tick 都达到刷新阈值
- **THEN** 调度器发起一次合并请求，codes 为两个集合的并集去重，依次触发 `tree-updated` 与 `status-updated`

#### Scenario: 都未到期
- **WHEN** 两路都未达到阈值
- **THEN** 当 tick 不发出任何 HTTP 请求

#### Scenario: 状态栏列表为空
- **WHEN** `statusBarOrder` 为空
- **THEN** 调度器仅按 `refreshInterval` 触发列表刷新，不计算状态栏到期

### Requirement: 视图可见性暂停

当 TreeView 与 StatusBar 全部不可见时，系统 SHALL 暂停轮询直到任一视图恢复可见。

#### Scenario: TreeView 隐藏但状态栏存在
- **WHEN** 用户折叠 TreeView，但状态栏仍展示股票
- **THEN** 调度器继续按状态栏间隔轮询

#### Scenario: 都不可见
- **WHEN** TreeView 不可见且 `statusBarOrder` 为空
- **THEN** 调度器暂停，1 秒 tick 不触发请求

#### Scenario: 恢复可见立即刷新
- **WHEN** 用户从隐藏状态展开 TreeView
- **THEN** 调度器立即触发一次列表刷新（无须等下个 tick）

### Requirement: 配置热更新

系统 SHALL 监听 VSCode `onDidChangeConfiguration`。当 `mygod.stock.refreshInterval` 或 `mygod.stock.statusBarRefreshInterval` 变更时，重置对应的 `nextDue` 时间为"现在 + 新间隔"，无须重启插件。

#### Scenario: 缩短列表间隔
- **WHEN** 用户将 `refreshInterval` 从 5 改为 2
- **THEN** 在最近 2 秒内即触发下一次列表刷新

#### Scenario: 间隔小于最小值
- **WHEN** 用户填入 0 或负数
- **THEN** 系统按最小值 1 秒兜底，不发起秒内请求洪泛

