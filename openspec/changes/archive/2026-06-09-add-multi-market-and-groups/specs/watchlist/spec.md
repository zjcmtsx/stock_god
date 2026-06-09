## MODIFIED Requirements

### Requirement: 关注列表持久化存储

系统 SHALL 在 VSCode `globalState` 中以 key `mygod.stock.watchList` 维护关注列表，结构包含 `version`（当前 v2）、`groups` 数组（每项含 `id`、`name`、`isDefault`、`order`）、`stocks` 数组（每项含 `code`、`name`、`pinned`、`inStatusBar`、`groupId`）和 `statusBarOrder` 字符串数组。状态在所有工作区共享。当读取到 v1 schema 时 SHALL 自动迁移到 v2：创建一个默认分组（id=`default`、name=`默认分组`、isDefault=true、order=0），所有 v1 stocks 设置 `groupId="default"`，写回。

#### Scenario: 首次启动初始化空状态
- **WHEN** 用户首次安装并激活插件
- **THEN** 系统读取 `globalState.mygod.stock.watchList` 得到 `undefined`，初始化为 `{ version: 2, groups: [{id:'default', name:'默认分组', isDefault:true, order:0}], stocks: [], statusBarOrder: [] }` 并写回

#### Scenario: 重启后恢复状态
- **WHEN** 用户曾添加股票后关闭并重新打开 VSCode
- **THEN** TreeView 立即渲染上次的关注列表（包含分组、置顶、状态栏标记），行情字段显示为 `--` 直到首次轮询返回

#### Scenario: 自动迁移 v1 数据
- **WHEN** 用户从旧版本升级，本地 globalState 中存有 `version: 1` 的数据
- **THEN** 启动时系统自动转换为 v2 schema：所有 v1 stocks 都被赋予 `groupId="default"`，新增一个默认分组，写回 globalState；UI 渲染所有股票位于默认分组下

#### Scenario: v1 迁移失败降级
- **WHEN** 升级过程中迁移逻辑抛出异常
- **THEN** 系统捕获异常，重置为空 v2 state，并通过 `showWarningMessage` 通知用户"分组数据初始化失败，已重置"，避免崩溃循环

### Requirement: 添加股票

系统 SHALL 提供命令 `mygod.stock.add`，弹出 QuickPick 接受用户输入股票代码或名称，调用 suggest 搜索接口返回**全市场**候选项；用户选择后将该股票追加至**默认分组**末尾。

#### Scenario: 通过代码添加 A 股
- **WHEN** 用户在 QuickPick 输入 `600000`
- **THEN** 候选下拉显示 `浦发银行 sh600000 · A`，选中后追加至默认分组末尾，`groupId="default"`

#### Scenario: 通过代码添加港股
- **WHEN** 用户在 QuickPick 输入 `00700`
- **THEN** 候选下拉至少包含 `腾讯控股 hk00700 · HK`，可选中添加，添加到默认分组

#### Scenario: 通过代码添加美股
- **WHEN** 用户在 QuickPick 输入 `aapl` 或 `AAPL`
- **THEN** 候选下拉至少包含一项美股 `Apple Inc gb_aapl · US`（或 usr 前缀），可选中添加

#### Scenario: 通过中文名称添加
- **WHEN** 用户输入 `浦发`
- **THEN** 候选下拉至少包含 `浦发银行 sh600000`，可选中添加

#### Scenario: 重复添加
- **WHEN** 用户尝试添加已在关注列表的股票
- **THEN** 系统不重复添加并通过 `showInformationMessage` 提示"该股票已在关注列表"

#### Scenario: 搜索无结果
- **WHEN** 输入关键字 suggest 接口返回空
- **THEN** QuickPick 显示空状态文本"无匹配结果"，用户可取消

### Requirement: 删除股票

系统 SHALL 提供命令 `mygod.stock.remove`，将目标股票从关注列表与 `statusBarOrder` 中同时移除。删除股票不影响所属分组的存在。

#### Scenario: 删除普通股票
- **WHEN** 用户在 TreeView 右键选择"删除"
- **THEN** 该股票从关注列表移除，TreeView 立即重绘，所属分组的计数减一

#### Scenario: 删除已添加至状态栏的股票
- **WHEN** 被删除股票 `inStatusBar` 为 `true`
- **THEN** 系统从 `statusBarOrder` 移除该 code，对应 StatusBarItem dispose

#### Scenario: 删除分组中最后一只股票
- **WHEN** 用户删除非默认分组中的最后一只股票
- **THEN** 该分组保留为空状态（计数 0），不会自动删除

### Requirement: 置顶股票

系统 SHALL 提供命令 `mygod.stock.pin` 切换股票的 `pinned` 标记。置顶仅在所属分组内生效：每个分组内排序规则为：`pinned=true` 在前（按添加顺序），其后是 `pinned=false`（按添加顺序）。拖拽到非置顶区域时 `pinned` 自动置 false。

#### Scenario: 分组内置顶
- **WHEN** 用户对默认分组中第 5 项执行置顶
- **THEN** 该项移动到默认分组顶部，其它分组不受影响

#### Scenario: 取消置顶
- **WHEN** 用户对已置顶股票再次执行置顶命令
- **THEN** 该股票回到所属分组非置顶区域末尾

#### Scenario: 多只置顶按添加顺序
- **WHEN** 同分组中存在 3 只置顶股票
- **THEN** 它们按各自被置顶的先后顺序展示，互相不重排

#### Scenario: 拖拽自动取消置顶
- **WHEN** 用户拖动一个 `pinned=true` 的股票到该分组中非置顶区域，或拖到其它分组
- **THEN** 系统将 `pinned` 置 false，按目标位置插入
