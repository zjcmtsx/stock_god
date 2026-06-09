## ADDED Requirements

### Requirement: 状态栏多 item 渲染

系统 SHALL 为 `statusBarOrder` 中每个 code 创建独立的 `StatusBarItem`（alignment = Left），text 格式为 `「名称」 价格 (±涨跌幅%)`，颜色根据涨跌使用 `mygod.stock.statusBar.upColor` / `downColor` 配置项。

#### Scenario: 上涨样式
- **WHEN** 股票 `changePct > 0`
- **THEN** StatusBarItem.color 取 upColor，text 形如 `「珂玛科技」 109.82 (+7.67%)`

#### Scenario: 下跌样式
- **WHEN** 股票 `changePct < 0`
- **THEN** StatusBarItem.color 取 downColor

#### Scenario: 平盘样式
- **WHEN** `changePct == 0`
- **THEN** StatusBarItem.color 取灰色 `#888`，text 形如 `「股票名」 价格 (0.00%)`

### Requirement: 状态栏数量上限

系统 SHALL 在添加股票至状态栏前校验当前 `statusBarOrder.length < statusBarMaxItems`（默认 5）。超限时拒绝添加并提示。

#### Scenario: 未达上限正常添加
- **WHEN** 当前 3 支在状态栏，上限 5
- **THEN** 添加第 4 支成功，新增 StatusBarItem 出现在最右侧

#### Scenario: 达到上限拒绝添加
- **WHEN** 当前 5 支在状态栏，上限 5，用户尝试添加第 6 支
- **THEN** 系统弹 `showWarningMessage('状态栏已达上限 5/5')`，提供"打开设置"按钮跳转配置项 `mygod.stock.statusBarMaxItems`

#### Scenario: 上限被调小后截断
- **WHEN** 用户将上限从 5 调到 3，当前已有 5 支
- **THEN** 系统保留 `statusBarOrder` 前 3 支，其余 2 支的 `inStatusBar` 置为 false 并 dispose 对应 StatusBarItem

### Requirement: 状态栏顺序调整

系统 SHALL 通过 StatusBarItem `command = mygod.stock.statusBarItemClicked` 在左键点击时弹出 QuickPick，提供"前移 / 后移 / 从状态栏移除"选项；选择后系统更新 `statusBarOrder` 并重新映射所有 StatusBarItem 的 priority。

#### Scenario: 前移
- **WHEN** 用户点击 `statusBarOrder` 中索引 2 的项，选择"前移"
- **THEN** 该项与索引 1 项交换，UI 上即与左侧邻居互换位置

#### Scenario: 后移
- **WHEN** 用户点击索引 0 项，选择"后移"
- **THEN** 该项与索引 1 项交换

#### Scenario: 最左项隐藏前移
- **WHEN** 用户点击索引 0 的项
- **THEN** QuickPick 不展示"前移"选项

#### Scenario: 最右项隐藏后移
- **WHEN** 用户点击末尾项
- **THEN** QuickPick 不展示"后移"选项

#### Scenario: 单项时仅展示移除
- **WHEN** `statusBarOrder.length === 1`
- **THEN** QuickPick 仅展示"从状态栏移除"

#### Scenario: 移除
- **WHEN** 用户选择"从状态栏移除"
- **THEN** 对应 code 从 `statusBarOrder` 移除，`inStatusBar` 置 false，dispose 对应 StatusBarItem

### Requirement: 状态栏 Hover 详情

系统 SHALL 为每个 StatusBarItem 设置 `tooltip` 为 `MarkdownString`（`isTrusted = false`），渲染表格形式展示涨跌、最高、最低、今开、昨收、成交量、更新时间。

#### Scenario: 鼠标悬停显示
- **WHEN** 用户鼠标悬停 StatusBarItem 超过系统 hover 延迟
- **THEN** 弹出面板显示「今日行情 名称(code)」标题，包含涨跌、百分、最高、最低、今开、昨收、成交量、更新时间

#### Scenario: 数据缺失占位
- **WHEN** 当前缓存中无该股票行情
- **THEN** tooltip 显示"暂无数据，等待刷新"
