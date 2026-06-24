## MODIFIED Requirements

### Requirement: 关注列表持久化存储

系统 SHALL 在全局存储目录文件 `globalStorageUri/watchList.json` 中维护关注列表（真相源），结构包含 `version`（当前 v2）、`groups` 数组（每项含 `id`、`name`、`isDefault`、`order`）、`stocks` 数组（每项含 `code`、`name`、`pinned`、`inStatusBar`、`groupId`）和 `statusBarOrder` 字符串数组。状态在所有工作区与所有窗口共享。写入 SHALL 采用原子方式（写临时文件后 rename 覆盖），避免其他窗口读到不完整内容。当读取到 v1 schema 时 SHALL 自动迁移到 v2：创建一个默认分组（id=`default`、name=`默认分组`、isDefault=true、order=0），所有 v1 stocks 设置 `groupId="default"`，写回。首次启动时若 `watchList.json` 不存在但 `globalState` 中存在旧 key `mygod.stock.watchList`，系统 SHALL 将其数据迁移（经 v1/v2 迁移逻辑）后写入 `watchList.json` 作为初始真相源。

#### Scenario: 首次启动初始化空状态
- **WHEN** 用户首次安装并激活插件，且 `watchList.json` 与旧 globalState 均无数据
- **THEN** 系统初始化为 `{ version: 2, groups: [{id:'default', name:'默认分组', isDefault:true, order:0}], stocks: [], statusBarOrder: [] }` 并写入 `watchList.json`

#### Scenario: 从旧 globalState 首次迁移
- **WHEN** 用户从旧版本升级，`watchList.json` 不存在但 `globalState.mygod.stock.watchList` 存有数据
- **THEN** 系统读取该数据、执行 v1/v2 迁移，写入 `watchList.json` 作为真相源；UI 渲染原有关注列表

#### Scenario: 重启后恢复状态
- **WHEN** 用户曾添加股票后关闭并重新打开 VSCode
- **THEN** TreeView 立即从 `watchList.json` 渲染上次的关注列表（包含分组、置顶、状态栏标记），行情字段显示为 `--` 直到首次轮询返回

#### Scenario: 自动迁移 v1 数据
- **WHEN** `watchList.json` 或迁移来源中存有 `version: 1` 的数据
- **THEN** 系统自动转换为 v2 schema：所有 v1 stocks 都被赋予 `groupId="default"`，新增一个默认分组，写回；UI 渲染所有股票位于默认分组下

#### Scenario: 数据解析失败降级
- **WHEN** 读取 `watchList.json` 时内容损坏或迁移逻辑抛出异常
- **THEN** 系统捕获异常，重置为空 v2 state，并通过 `showWarningMessage` 通知用户"分组数据初始化失败，已重置"，避免崩溃循环

## ADDED Requirements

### Requirement: 跨窗口近实时同步

系统 SHALL 监听 `watchList.json` 的外部变更（基于文件系统监听），当检测到由其他窗口写入的变更时，在秒级内重新加载状态到内存并触发 `onDidChange`，使本窗口的 TreeView、状态栏与文件装饰自动刷新，无需重启。系统 SHALL 抑制由自身写入触发的文件事件（通过内容比对），避免无意义 reload。监听回调 SHALL 做去抖处理以合并连发事件。

#### Scenario: 另一窗口添加股票后同步
- **WHEN** 窗口 A 添加一只股票并写入 `watchList.json`
- **THEN** 窗口 B 在秒级内检测到文件变更，重新加载状态，TreeView 出现该新股票，无需重启

#### Scenario: 另一窗口删除/置顶/分组变更后同步
- **WHEN** 窗口 A 删除股票、切换置顶、增删分组或调整状态栏配置并写入文件
- **THEN** 窗口 B 在秒级内 reload，TreeView 与状态栏反映最新状态

#### Scenario: 抑制自身写入的回显
- **WHEN** 当前窗口自身写入 `watchList.json` 触发文件监听事件
- **THEN** 系统比对读到的内容与最后一次自写内容一致，跳过 reload，不产生多余刷新

#### Scenario: 文件被外部删除
- **WHEN** `watchList.json` 被外部删除
- **THEN** 系统以当前内存状态为准继续运行，并在下次写入时重建该文件，不崩溃
