## ADDED Requirements

### Requirement: 关注列表持久化存储

系统 SHALL 在 VSCode `globalState` 中以 key `mygod.stock.watchList` 维护关注列表，结构包含 `version`、`stocks` 数组（每项含 `code`、`name`、`pinned`、`inStatusBar`）和 `statusBarOrder` 字符串数组。状态在所有工作区共享。

#### Scenario: 首次启动初始化空状态
- **WHEN** 用户首次安装并激活插件
- **THEN** 系统读取 `globalState.mygod.stock.watchList` 得到 `undefined`，初始化为 `{ version: 1, stocks: [], statusBarOrder: [] }` 并写回

#### Scenario: 重启后恢复状态
- **WHEN** 用户曾添加股票后关闭并重新打开 VSCode
- **THEN** TreeView 立即渲染上次的关注列表（包含名称、置顶、状态栏标记），行情字段显示为 `--` 直到首次轮询返回

### Requirement: 添加股票

系统 SHALL 提供命令 `mygod.stock.add`，弹出 QuickPick 接受用户输入股票代码或名称，调用 suggest 搜索接口返回候选项；用户选择后将该股票追加至关注列表末尾。

#### Scenario: 通过代码添加
- **WHEN** 用户在 QuickPick 输入 `600000`
- **THEN** 候选下拉显示 `sh600000 浦发银行`，选中后追加至列表末尾

#### Scenario: 通过中文名称添加
- **WHEN** 用户输入 `浦发`
- **THEN** 候选下拉至少包含 `sh600000 浦发银行`，可选中添加

#### Scenario: 重复添加
- **WHEN** 用户尝试添加已在关注列表的股票
- **THEN** 系统不重复添加并通过 `showInformationMessage` 提示"该股票已在关注列表"

#### Scenario: 搜索无结果
- **WHEN** 输入关键字 suggest 接口返回空
- **THEN** QuickPick 显示空状态文本"无匹配结果"，用户可取消

### Requirement: 删除股票

系统 SHALL 提供命令 `mygod.stock.remove`，将目标股票从关注列表与 `statusBarOrder` 中同时移除。

#### Scenario: 删除普通股票
- **WHEN** 用户在 TreeView 右键选择"删除"
- **THEN** 该股票从关注列表移除，TreeView 立即重绘

#### Scenario: 删除已添加至状态栏的股票
- **WHEN** 被删除股票 `inStatusBar` 为 `true`
- **THEN** 系统从 `statusBarOrder` 移除该 code，对应 StatusBarItem dispose

### Requirement: 置顶股票

系统 SHALL 提供命令 `mygod.stock.pin` 切换股票的 `pinned` 标记。TreeView 排序规则为：`pinned=true` 在前（按添加顺序），其后是 `pinned=false`（按添加顺序）。

#### Scenario: 置顶单只股票
- **WHEN** 用户对列表中第 5 项执行置顶
- **THEN** 该项移动到列表最顶部，其余顺序保持

#### Scenario: 取消置顶
- **WHEN** 用户对已置顶股票再次执行置顶命令
- **THEN** 该股票回到非置顶区域末尾

#### Scenario: 多只置顶按添加顺序
- **WHEN** 列表存在 3 只置顶股票
- **THEN** 它们按各自被置顶的先后顺序展示，互相不重排
