## Why

v1 仅支持 A 股、单一关注列表，无法满足多市场（港美股）持仓与按主题/板块分组的实际使用场景。当前用户搜港股美股得不到结果；股票数量增加后查找混乱。本次扩展引入多市场行情解析与分组管理，使插件具备覆盖主流市场关注与分类组织的能力。

## What Changes

- 新增港股（`hk` 前缀）与美股（`gb_` / `usr_` 前缀）行情接入：按 code 前缀分发到不同 parser
- 搜索（`mygod.stock.add`）取消"仅 A 股"过滤，QuickPick 默认返回全市场候选（含 A/HK/US/ETF/指数）；候选项展示市场标记
- 引入分组（Group）实体：用户可创建多个分组，每个股票从属唯一一个分组
- **BREAKING**: `WatchListState` schema 从 v1 升级到 v2；启动时自动迁移：v1 所有 stock 进入新建的"默认分组"
- 默认分组：固定 id `default`、名称"默认分组"、`isDefault=true`；不可重命名、不可删除
- TreeView 改为两层结构：分组节点 → 股票节点；分组节点显示名称与计数
- 工具栏新增"添加分组"按钮（`+ 分组`）
- 分组节点右键菜单：重命名（仅非默认）、删除（仅非默认）、置顶（在分组列表中提前）
- 删除非默认分组时：组内股票自动迁移至默认分组
- 启用 `TreeDragAndDropController`：
  - 拖股票到另一分组节点 → 改 `groupId`
  - 拖股票到另一只股票上 → 插入到该位置（同组重排或跨组移动）
  - 拖分组节点到另一分组节点 → 改分组顺序
- 状态栏行为不变（仍是按 `statusBarOrder` 扁平展示，跨分组）
- 移除调度器的"仅交易时段轮询"门控：休市/周末/盘前盘后也持续轮询。仅保留"视图均不可见"时的暂停

## Capabilities

### New Capabilities
- `stock-groups`: 关注列表分组实体的 CRUD、默认分组保护、分组排序、拖拽重排

### Modified Capabilities
- `watchlist`: 数据模型升级到 v2（含 groups 与 stock.groupId）；添加股票默认进入"默认分组"；删除分组时股票迁移
- `quote-fetching`: 行情按 code 前缀分发到 A/HK/US 三个 parser；搜索取消 A 股过滤；返回结果带 market 标记
- `polling-scheduler`: 移除"交易时段门控" requirement；调度器在任何时间都尝试轮询，仅靠"视图可见性"决定是否暂停

## Impact

- 修改源码：`src/model/stock.ts`（新增 Group/Market）、`src/store/watchListStore.ts`（v1→v2 迁移与分组 API）、`src/service/sinaApi.ts`（多市场解析 + 解除搜索过滤）、`src/view/stockTreeProvider.ts`（两层渲染）、`src/extension.ts`（新命令注册 + DragAndDrop 注册）
- 新增源码：`src/view/treeDragAndDrop.ts`（TreeDragAndDropController 实现）
- `package.json` 新增命令：`mygod.stock.addGroup` / `renameGroup` / `removeGroup`；扩展 menus.view/title 与 view/item/context；声明 TreeView `dragAndDropController`
- 数据迁移：用户首次运行新版本时，自动将 v1 globalState 升级为 v2，无需手动操作
- 不引入新外部依赖；仍只调用 `hq.sinajs.cn` / `suggest3.sinajs.cn`
- 影响用户：UI 多一层折叠，初次升级会看到所有股票出现在"默认分组"下
