## Context

v1 已发布的关注列表 + 调度器已稳定运行。本次扩展在不破坏调度/状态栏路径的前提下，给数据模型加分组维度，并扩展行情/搜索解析覆盖港美股。改动跨 model / store / service / view 四层，但核心调度器无需改动，因为它只关心 `code 集合` 而非"分组"。

## Goals / Non-Goals

**Goals:**
- 透明升级：用户从 v1 → v2 不丢数据，无需手动迁移
- 港美股使用与 A 股相同的 UX：搜索→添加→关注→状态栏均可用
- 分组操作低心智：左侧栏内右键 + 拖拽完成所有管理
- 默认分组兜底：无论删除/迁移操作如何走，股票永远有归属

**Non-Goals:**
- 不为不同市场提供差异化的字段（v1 字段已涵盖大多场景）
- 不实现"分组级别置顶到最前"——分组顺序就是真序
- 不支持嵌套分组（仅一层）
- 不支持一只股票同时属于多个分组（多对多过度设计）
- 不为状态栏分组（状态栏仍是扁平 `statusBarOrder`）

## Decisions

### D1. Schema 版本管理 v1 → v2

```ts
interface WatchListStateV2 {
  version: 2;
  groups: Group[];                // [{id:'default', name:'默认分组', isDefault:true, order:0}, ...]
  stocks: WatchListItemV2[];      // 每项加 groupId
  statusBarOrder: string[];
}

interface Group {
  id: string;          // 默认分组固定为 'default', 其它为 generateId()
  name: string;
  isDefault: boolean;
  order: number;       // 升序: 0, 1, 2...
}

interface WatchListItemV2 {
  code: string;
  name: string;
  pinned: boolean;     // v2 仍保留, 用于在"分组内"置顶
  inStatusBar: boolean;
  groupId: string;     // 必填; v1 迁移时全部填 'default'
}
```

迁移逻辑（一次性）：

```
load():
  raw = memento.get(STATE_KEY)
  if !raw → return DEFAULT_V2
  if raw.version === 1:
     groups = [{id:'default', name:'默认分组', isDefault:true, order:0}]
     stocks = raw.stocks.map(s => ({...s, groupId:'default'}))
     state = { version:2, groups, stocks, statusBarOrder: raw.statusBarOrder ?? [] }
     persist()
  else if raw.version === 2:
     state = raw
```

**Alternatives**：在 v1 schema 上加 `groupId?` 可选字段（不升 version）。被拒：`groups[]` 无处存放，UI 需要分组顺序与名称必须显式存储。

### D2. 默认分组保护

- id 固定为 `'default'`；任何创建新分组的命令禁止使用此 id
- 不允许删除（命令前置校验 `group.isDefault === false`）
- 不允许重命名（同上）
- UI 上 `contextValue = group-default` vs `group-custom`，菜单 when 子句过滤
- 即便用户通过 `globalState` 编辑器篡改，启动时迁移逻辑会重新确保 `default` 分组存在

### D3. 多市场行情解析

```
code 前缀路由:
  /^(sh|sz)\d{6}$/        →  parseAStock(line)        // 现有
  /^hk\d{5}$/             →  parseHKStock(line)       // 新增
  /^(gb_|usr_)/           →  parseUSStock(line)       // 新增

parseHKStock 字段顺序 (新浪 hq_str_hk00700):
  英文名, 中文名, 今开, 昨收, 现价, 最高, 最低, 成交量, 成交额, ...,
  日期, 时间, ...

parseUSStock (hq_str_gb_aapl):
  名称, 现价, 涨跌幅, 时间, 涨跌额, 今开, 最高, 最低, 52周高, 52周低,
  成交量, ..., 昨收, 市值, ...
```

各 parser 适配到统一 `Stock` 接口（共同字段：name/price/prevClose/open/high/low/change/changePct/volume/amount/date/time）。市场专属字段（如美股盘前盘后、港股每手股数）v1 不展示。

容错：未知前缀 → 返回 null，不阻塞批量。

### D4. 搜索解除过滤

```
search() 不再调用 isAStockCode 过滤。
返回结果按 type 标记 market:
  '11' / 'sh_a' / 'sz_a'  → 'A'
  'hk'                    → 'HK'
  'us' / 'gb_oba' / 'osr' → 'US'
  其它                    → 'OTHER' (ETF/指数等)

QuickPick 渲染:
  label:       股票名
  description: code · market 标记 (如 "sh600000 · A")
  detail:      type 原值 (调试用, 可隐藏)
```

### D5. TreeView 两层结构

```
TreeNode 联合类型:
  | { kind: 'group', id: string }
  | { kind: 'stock', code: string, groupId: string }   // groupId 帮助拖拽定位

getChildren(element):
  if !element → groups 按 order asc → GroupNode[]
  if element is GroupNode → 该 group 下的 stocks (置顶在前) → StockNode[]

GroupItem (TreeItem):
  label = `${group.name} (${count})`
  iconPath = ThemeIcon('folder' | 'folder-opened')
  collapsibleState = Expanded (默认全展开, 持久化展开状态由 VSCode 处理)
  contextValue = isDefault ? 'group-default' : 'group-custom'

StockItem: 沿用 v1 实现, 但 contextValue 多一个 stock 标识便于菜单 when 子句
```

刷新性能：仍然是整树重绘 onDidChangeTreeData(undefined)。最坏 50 支 + 10 分组无压力。

### D6. 拖拽实现

```
new TreeDragAndDropController:
  dropMimeTypes: ['application/vnd.code.tree.mygodStockWatchList']
  dragMimeTypes: 同上 + 'text/uri-list'

  handleDrag(items, dataTransfer):
    serialize {kind, ids[]} 到自定义 mime

  handleDrop(target, dataTransfer):
    payload = parse(dataTransfer.get(mime))
    if payload.kind === 'stock' :
      if target is GroupNode  → store.moveStocks(payload.ids, target.id, /*idx*/end)
      if target is StockNode  → store.moveStocks(payload.ids, target.groupId, idx of target)
      if !target              → store.moveStocks(payload.ids, 'default', end)
    if payload.kind === 'group' (单个分组拖):
      if target is GroupNode  → store.reorderGroups(payload.id, target.order)
      其它情况忽略

跨组拖拽时 stocks 的相对顺序保持; 同组拖拽时按目标 idx 插入
被拖项不能落在自身上 (no-op)
```

### D7. 命令清单

```
mygod.stock.addGroup           工具栏 + 分组
mygod.stock.renameGroup        右键 (group-custom) → InputBox
mygod.stock.removeGroup        右键 (group-custom) → 二次确认 → stocks 迁默认 → 删
                                右键 (group-default) → 命令 when 子句不展示
```

InputBox 校验：
- 非空 / trim 后非空
- 长度 1~20
- 不允许与现有分组重名（含默认分组）

### D8. 持久化原子化

所有改动都进 store 的 `persist()` 一次写入 globalState，避免迁移中途崩溃留下 inconsistent state。

### D9. 调度器与状态栏

调度器：无变化。它只关心 `store.getRawStocks().map(s=>s.code)` 与 `store.getStatusBarOrder()`。

状态栏：无变化。`statusBarOrder` 仍是扁平 code 数组，与分组正交。删除股票（含分组迁移路径里的"组删除"）已经会同步从 statusBarOrder 移除（v1 已实现）。

## Risks / Trade-offs

- [HK/US 字段格式漂移] → 各 parser 加严格列数校验，长度不符返回 null；保留缓存旧值不阻塞
- [拖拽行为与 VSCode 默认行为冲突] → 仅注册 mygod 自定义 mime，不接管文件 URI
- [v1→v2 迁移失败] → 用 try/catch 包裹迁移逻辑，失败时降级为 fresh state 并显示通知"分组数据初始化失败，已重置"，避免无限崩溃循环
- [分组操作触发 TreeView 整树重绘] → 节点数 < 200 无可感延迟；如未来需要可改 partial refresh
- [QuickPick 中 HK/US 候选过多导致拥挤] → 按 type 排序：A 股优先，HK 次之，US 末尾；最多保留 20 条
- [拖拽 + 置顶语义冲突] → "置顶"约束于"分组内排序"。拖拽时若目标位置在该分组的非置顶区，但被拖项是 pinned，则保持 pinned 状态、按目标位置插入到非置顶区——行为定义为"拖拽自动取消置顶"

## Migration Plan

无需手动迁移。代码层一次性自动升级：

```
启动 → WatchListStore.load()
       → 读 v1 → 转 v2 → persist()
       → 之后所有读写都是 v2
```

回滚（万一）：版本退回 v1 时旧代码读到 `version: 2` 的 state，它会因为 `Array.isArray(stored.stocks)` 通过但忽略 `groupId`/`groups`，UI 会扁平展示所有股票（功能降级但不崩溃）。**建议在 v2 引入版本号校验，未来如有 v3 同样兼容向下读取。**

## Open Questions

- 分组数量上限是否要限制？v1 暂不限制，视用户反馈
- 状态栏是否在未来支持"按分组聚合"（v1 不做）
- 港股美股 hover 详情是否要展示市场专属字段（如港股每手数）？v1 不做，后续按需求加
