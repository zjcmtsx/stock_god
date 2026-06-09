## 1. 数据模型升级

- [x] 1.1 在 `src/model/stock.ts` 新增 `Group` 接口（id/name/isDefault/order）
- [x] 1.2 新增 `Market` 类型 `'A' | 'HK' | 'US' | 'OTHER'`，`Stock.market` 字段（可选）
- [x] 1.3 升级 `WatchListState` 为 `version: 2`，加 `groups: Group[]`，`WatchListItem` 加 `groupId: string`
- [x] 1.4 添加 `DEFAULT_GROUP_ID = 'default'` 常量与默认分组工厂函数
- [x] 1.5 添加 `generateGroupId(): string`（uuid 或时间戳+随机）

## 2. 持久化与迁移

- [x] 2.1 `WatchListStore.load()` 支持读取 v1，自动迁移到 v2（创建默认分组、所有 stock.groupId='default'）
- [x] 2.2 迁移失败时 try/catch 兜底，重置为空 v2 state 并通知用户
- [x] 2.3 新增 `getGroups(): Group[]`（按 order 升序）
- [x] 2.4 新增 `addGroup(name): Promise<Group>`（校验：非空 / 长度 1-20 / 不重名）
- [x] 2.5 新增 `renameGroup(id, name): Promise<void>`（校验同上 + 拒绝默认分组）
- [x] 2.6 新增 `removeGroup(id): Promise<void>`（拒绝默认 + 组内股票 groupId 改为 default）
- [x] 2.7 新增 `reorderGroups(id, newOrder): Promise<void>` 重新计算所有分组的 order
- [x] 2.8 新增 `getStocksByGroup(id): WatchListItem[]`（组内置顶在前 + 添加顺序）
- [x] 2.9 新增 `moveStocks(codes[], targetGroupId, insertBeforeCode?): Promise<void>` 跨组迁移与重排
- [x] 2.10 修改 `add()`：默认 `groupId = 'default'`
- [x] 2.11 排序辅助函数从全局排序改为"分组内排序"

## 3. 多市场行情解析

- [x] 3.1 在 `src/service/sinaApi.ts` 提取 `parseAStockLine` 为独立函数（拆分现有逻辑）
- [x] 3.2 实现 `parseHKStockLine`：识别 `hq_str_hkXXXXX`，按港股字段顺序解析
- [x] 3.3 实现 `parseUSStockLine`：识别 `hq_str_(gb_|usr_)XXX`，按美股字段顺序解析
- [x] 3.4 `batchQuote` 路由：按 code 前缀正则分发到对应 parser，未知前缀返回 null
- [x] 3.5 各 parser 严格列数校验，不足则返回 null
- [x] 3.6 `Stock` 输出统一字段；市场专属字段（如港股每手）v1 不展示

## 4. 多市场搜索

- [x] 4.1 移除 `search()` 中的 `isAStockCode` 过滤
- [x] 4.2 为每条结果计算 `market`：sh/sz→A, hk→HK, gb_/usr_→US, 其它→OTHER
- [x] 4.3 按 market 优先级排序（A>HK>US>OTHER），同市场内保序
- [x] 4.4 限制最多 20 条

## 5. TreeView 两层结构

- [x] 5.1 引入 `TreeNode` 联合类型（GroupNode / StockNode）
- [x] 5.2 改造 `StockTreeProvider`：`getChildren(undefined) → groups`，`getChildren(group) → stocks`
- [x] 5.3 实现 `GroupItem` 渲染：label = `${name} (${count})`，iconPath = ThemeIcon('folder')，collapsibleState = Expanded
- [x] 5.4 GroupItem.contextValue：默认分组 = `group-default`，其它 = `group-custom`
- [x] 5.5 StockItem 增加 `parentGroupId` 信息以辅助拖拽（通过 TreeNode.groupId 传递）
- [x] 5.6 调整 FileDecorationProvider URI 解析（保持兼容现有 `mygodstock://stock/<code>`，未变）
- [x] 5.7 树重绘：`tree-updated` / `status-updated` 事件触发整树重绘

## 6. 拖拽控制器

- [x] 6.1 新建 `src/view/treeDragAndDrop.ts` 实现 `TreeDragAndDropController<TreeNode>`
- [x] 6.2 定义 mime: `application/vnd.code.tree.mygodstockwatchlist`
- [x] 6.3 `handleDrag`：序列化拖拽项 `{kind, ids[]}` 到 dataTransfer
- [x] 6.4 `handleDrop` for stock → group node：`store.moveStocks(ids, group.id, undefined)`
- [x] 6.5 `handleDrop` for stock → stock node：跨组迁移或同组重排，按 target 位置插入
- [x] 6.6 `handleDrop` for group → group node：`store.reorderGroups(srcId, target.order)`
- [x] 6.7 拖拽到目标自身 / 同位置 → no-op
- [x] 6.8 拖动 pinned 股票到非置顶位置 → 自动 `pinned=false`（store.moveStocks 中处理）
- [x] 6.9 在 `vscode.window.createTreeView` 时传入 `dragAndDropController`

## 7. 命令实现

- [x] 7.1 注册 `mygod.stock.addGroup`：弹 InputBox（校验非空/长度/不重名）→ `store.addGroup`
- [x] 7.2 注册 `mygod.stock.renameGroup`：参数 `groupId` 或 GroupNode → InputBox 预填当前名 → 同样校验 → `store.renameGroup`
- [x] 7.3 注册 `mygod.stock.removeGroup`：参数 `groupId` → 二次确认 → `store.removeGroup`
- [x] 7.4 在 package.json `commands` 添加上述 3 个命令的声明
- [x] 7.5 在 `view/title` 菜单加 "添加分组" 按钮，icon `$(new-folder)`
- [x] 7.6 在 `view/item/context` 加分组菜单 when `viewItem == group-custom`：重命名 / 删除
- [x] 7.7 commandPalette when `false` 隐藏 renameGroup/removeGroup 命令（避免误触）

## 8. 集成与回归

- [x] 8.1 `extension.ts` 注入 `TreeDragAndDropController` 到 `createTreeView`
- [x] 8.2 注册新命令到 context.subscriptions
- [x] 8.3 移除/调整旧的"全局列表"逻辑，确保 store.add 默认进入 default 组
- [x] 8.4 验证 `Scheduler` 无须改动（仍消费 `getRawStocks().map(s=>s.code)`）
- [x] 8.5 验证 StatusBarManager 无须改动
- [x] 8.6 更新 README：新增"分组管理"与"港美股支持"段落
- [x] 8.7 移除调度器交易时段门控（休市时间也持续轮询；保留 `tradingHours.ts` 文件以备后续使用）

## 9. 自测

- [ ] 9.1 F5 启动；从 v1 数据升级，验证默认分组出现且包含所有股票（**待用户手动验证**）
- [ ] 9.2 添加分组、重命名、删除（含非空分组迁移）（**待用户手动验证**）
- [ ] 9.3 拖股票跨分组、同分组重排、拖分组重排（**待用户手动验证**）
- [ ] 9.4 默认分组重命名/删除菜单不出现（**待用户手动验证**）
- [ ] 9.5 添加港股 hk00700、美股 gb_aapl，行情字段正确显示（**待用户手动验证**）
- [ ] 9.6 状态栏行为不受分组影响（**待用户手动验证**）
- [x] 9.7 esbuild 生产构建通过（dist/extension.js 508KB）
