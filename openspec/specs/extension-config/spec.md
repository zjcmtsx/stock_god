# extension-config Specification

## Purpose
TBD - created by archiving change bootstrap-stock-watcher. Update Purpose after archive.
## Requirements
### Requirement: 配置项注册

系统 SHALL 在 `package.json` 的 `contributes.configuration` 注册以下配置项，并提供合理默认值：

| key | type | default | min | max |
|---|---|---|---|---|
| `mygod.stock.refreshInterval` | number | 5 | 1 | — |
| `mygod.stock.statusBarRefreshInterval` | number | 3 | 1 | — |
| `mygod.stock.statusBarMaxItems` | number | 5 | 1 | 20 |
| `mygod.stock.list.upColor` | string | `#FF2E2E` | — | — |
| `mygod.stock.list.downColor` | string | `#00B578` | — | — |
| `mygod.stock.statusBar.upColor` | string | `#FF2E2E` | — | — |
| `mygod.stock.statusBar.downColor` | string | `#00B578` | — | — |

#### Scenario: 默认值生效
- **WHEN** 用户未在 settings.json 设置任何配置
- **THEN** 系统使用上表中的 default 值

#### Scenario: 数值越界
- **WHEN** 用户将 `refreshInterval` 设为 0
- **THEN** 系统按最小值 1 兜底，不报错也不接受 0

### Requirement: 颜色解析回退

系统 SHALL 解析颜色配置时优先使用合法 hex/css 字符串；若值为空字符串或非法，SHALL 回退到 ThemeColor `mygod.stock.upColor` / `mygod.stock.downColor`，由 `contributes.colors` 提供 light/dark 默认。

#### Scenario: 用户填合法 hex
- **WHEN** 用户设置 `mygod.stock.statusBar.upColor = "#FF0000"`
- **THEN** StatusBarItem.color 直接使用字符串 `#FF0000`

#### Scenario: 用户填空字符串
- **WHEN** 用户清空 `mygod.stock.statusBar.upColor` 为 `""`
- **THEN** StatusBarItem.color 使用 `new ThemeColor('mygod.stock.upColor')`，跟随主题

#### Scenario: 用户填非法值
- **WHEN** 用户填入 `"red123"` 等非 hex/非颜色名值
- **THEN** 系统回退至 ThemeColor，并在 console 输出一次警告

### Requirement: 配置变更监听

系统 SHALL 监听 `vscode.workspace.onDidChangeConfiguration`。变更涉及刷新间隔时立即重置调度器；涉及上限时按新值重新校验状态栏列表；涉及颜色时刷新所有 StatusBarItem 与 TreeItem 的样式。

#### Scenario: 修改刷新间隔
- **WHEN** 用户修改 `refreshInterval` 从 5 到 10
- **THEN** 调度器下次 tick 起按 10 秒间隔触发列表刷新

#### Scenario: 修改颜色
- **WHEN** 用户修改 `statusBar.upColor` 从 `#FF2E2E` 到 `#FF8800`
- **THEN** 系统遍历当前所有 StatusBarItem，对 `changePct > 0` 的项应用新颜色，无须重启

#### Scenario: 修改上限缩小
- **WHEN** 用户修改 `statusBarMaxItems` 从 5 到 3，当前 5 支股票在状态栏
- **THEN** 系统保留 `statusBarOrder` 前 3 支，其余 dispose 并将 `inStatusBar` 置 false

### Requirement: 颜色贡献项

系统 SHALL 在 `contributes.colors` 注册 `mygod.stock.upColor` 与 `mygod.stock.downColor`，分别提供 light/dark/highContrast 默认值，供主题与高级用户在 `workbench.colorCustomizations` 中自定义。

#### Scenario: 主题切换
- **WHEN** 用户从浅色主题切换到深色主题，且简单配置项为空
- **THEN** 涨跌色按对应主题档的默认色生效

