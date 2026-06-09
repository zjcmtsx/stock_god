## Context

VSCode 插件 "我不是股神" 从零开始搭建，目标是在编辑器侧栏与状态栏内嵌实时行情。前期探索已锁定数据源、UI 结构、刷新策略、配置粒度，本文沉淀技术决策以指导实现。

约束：
- 仅 Node 进程（VSCode Extension Host）发起 HTTP，不存在浏览器 CORS 问题
- VSCode StatusBar API 不支持右键菜单、不支持原生拖拽
- 新浪行情接口返回 GBK 文本，需要解码
- 用户可能配置极小刷新间隔，需要给最小值兜底防止打挂数据源

## Goals / Non-Goals

**Goals:**
- 提供与 LeekFund 接近的关注列表使用体验（红涨绿跌、批量行情、状态栏镜像）
- 列表与状态栏使用各自的刷新节奏，但请求层做合并去重
- 全部关键参数（间隔、上限、涨跌色）可通过 VSCode 配置项调整，热更新
- 非交易时段、视图都不可见时停止轮询，省 CPU 与带宽
- 数据源失败时不影响 UI 渲染（保持上次值并标注 stale）

**Non-Goals:**
- 港股/美股/期货支持（v1 仅 A 股）
- 关注列表分组（v1 单一列表）
- 走势图 / K线图 webview
- 拖拽重排（API 不支持，改为右键/QuickPick "前移/后移"）
- 收盘后行情接口降频（v1 进入交易时段外直接暂停轮询）
- 节假日表（v1 仅按周末判断；春节等节假日由用户接受 5s 一次空请求或手动停用）

## Decisions

### D1. 数据源：新浪 `hq.sinajs.cn`

行情接口：`https://hq.sinajs.cn/list=sh600000,sz000001,...`，需要 `Referer: https://finance.sina.com.cn`。返回 GBK 文本，每行 `var hq_str_<code>="名称,今开,昨收,现价,最高,最低,...,日期,时间"`.

搜索接口：`https://suggest3.sinajs.cn/suggest/key=<utf8 keyword>`，返回 GBK 文本。

**为什么选它**：免费、无 key、批量、字段够用。LeekFund 长年验证。
**Alternatives**：腾讯 `qt.gtimg.cn`（字段更全但解析复杂）、雪球（需 cookie）。后续如出问题可加腾讯做 fallback。

### D2. 调度：单 timer 1s tick + 合并请求

```
class Scheduler:
  treeNextDue, statusNextDue: timestamp
  every 1s tick:
    if not active(): skip   # 非交易时段或两视图均不可见
    needTree   = now >= treeNextDue   && watchList.notEmpty
    needStatus = now >= statusNextDue && statusBar.notEmpty
    if neither: skip
    codes = union(
      needTree   ? watchList.codes : [],
      needStatus ? statusBar.codes : []
    )
    data = sina.batchQuote(codes)
    cache.update(data)
    if needTree:   emit('tree-updated');   treeNextDue   = now + treeInterval
    if needStatus: emit('status-updated'); statusNextDue = now + statusInterval
```

**为什么**：列表与状态栏刷新间隔不同，朴素双 timer 会让状态栏股票被请求两次。1s tick 合并后 N 支股票一次 HTTP 解决。
**Alternatives**：双独立 timer（实现简单但浪费）、共享缓存 1s 窗口（折中复杂度高）。

配置变更时立即重置 `treeNextDue` 与 `statusNextDue`，不等下次 tick。

### D3. 交易时段判定

A 股：周一~周五；时段 `09:25–11:30` + `12:55–15:05`（含集合竞价 5min 缓冲）。时区使用本地系统时间，假设用户在中国大陆。**不处理节假日表**（v1 接受周末规则即可）。

可见性判定：`treeView.onDidChangeVisibility` + 状态栏自身存在即视为可见。两者皆不可见时，调度器进入 PAUSED 状态，仍然 1s tick 但什么都不做。

### D4. UI / 视图

```
TreeView (单一列表):
  按"置顶 desc, 添加顺序 asc"排序
  TreeItem:
    iconPath = ThemeIcon('arrow-up' | 'arrow-down')
    label    = "+6.96%  109.10  珂玛科技"   (label 用单字符串, 颜色靠 description+ThemeColor)
    description (灰): code
    contextValue = 'stock'  (右键菜单 when 子句用)

工具栏: + 号 / 刷新 (icon: add / refresh)
右键菜单 (contextValue == 'stock'):
  - 置顶 / 取消置顶
  - 删除
  - 添加至状态栏 / 从状态栏移除
```

```
StatusBar:
  alignment = Left
  每支股票一个 StatusBarItem
  text = "$(stock-icon) 名字 价格 (±%)"   (无 codicon stock 时退化为文字)
  color = stock.changePct > 0 ? upColor : (changePct < 0 ? downColor : 平盘色 #888)
  command = mygod.stock.statusBarItemClicked + args
  tooltip = MarkdownString (涨跌额/百分比/最高/最低/今开/昨收/成交量/更新时间, 支持渲染颜色)

priority 重映射:
  顺序数组 idx 越小越靠左 → priority = (N - idx) * 100
  插入/删除/前后移每次重新分配整列, 简单稳定
```

### D5. 状态栏点击 QuickPick

VSCode StatusBarItem 不支持右键菜单。`command` 仅响应左键。点击触发 `mygod.stock.statusBarItemClicked` 命令，参数携带 stock code，弹 QuickPick：

```
$(arrow-left)  前移          # 与左侧邻居交换 idx, 最左项隐藏
$(arrow-right) 后移          # 与右侧邻居交换 idx, 最右项隐藏
$(close)       从状态栏移除
```

仅 1 项时只显示"移除"。

### D6. 颜色配置：hex 字符串优先 + ThemeColor 后备

```
contributes.configuration:
  mygod.stock.list.upColor       string  default "#FF2E2E"
  mygod.stock.list.downColor     string  default "#00B578"
  mygod.stock.statusBar.upColor       string  default "#FF2E2E"
  mygod.stock.statusBar.downColor     string  default "#00B578"

contributes.colors:
  mygod.stock.upColor      light/dark defaults
  mygod.stock.downColor    light/dark defaults

resolveColor(configValue):
  if configValue 是合法 hex → 直接返回 string
  else 返回 new ThemeColor('mygod.stock.upColor' | 'downColor')
```

**为什么**：日常用户改 hex 即可，高级用户走 `workbench.colorCustomizations` 与主题集成。

### D7. 状态栏数量上限

默认 5，最小 1，最大 20。`statusBarMaxItems` 配置项。超限时 `addToStatusBar` 命令调用 `vscode.window.showWarningMessage('状态栏已达上限 N/N')`，提供"打开设置"按钮跳转至该配置。

cap 在运行期被缩小（5 → 3）：保留状态栏顺序数组前 N 个，其余移除（不影响关注列表中的 `inStatusBar` 标记是否需要保留？决策：仍保留 `inStatusBar=true`，但渲染时按 cap 截断）。**修正**：cap 缩小时直接修改顺序数组并把被截断项的 `inStatusBar` 置 false，避免 cap 重新放大时出现"幽灵复活"导致用户困惑。

### D8. 持久化模型

```ts
// globalState key: 'mygod.stock.watchList'
interface WatchListState {
  version: 1;
  stocks: Array<{
    code: string;        // 'sh600000' | 'sz000001'
    name: string;        // '浦发银行' (缓存名称, 加速首次渲染)
    pinned: boolean;
    inStatusBar: boolean;
  }>;
  statusBarOrder: string[];  // 显式顺序数组, 来源真实即此处
}
```

行情字段（`change/changePct/price/...`）**不持久化**，重启后等首次轮询填充；展示时若无数据显示 `--`。

### D9. 错误与降级

- 行情请求 timeout 5s；失败重试 1 次（间隔 500ms），仍失败则使用 cache 旧值，TreeItem description 加 ⚠ 标记
- 解析失败的 code（找不到行情）：UI 显示"未知 — 名称"，不阻塞其它 code 渲染
- `iconv-lite` 解码异常：fallback 到 utf-8

### D10. 构建与打包

- TypeScript + `esbuild` bundle 到 `dist/extension.js`，单文件输出，启动快
- 目标 VSCode `^1.74.0`（兼容主流版本，避开过新 API）
- 不使用 webpack（体积/复杂度更高，无需要）

## Risks / Trade-offs

- [新浪接口限流或字段变更] → 抽象 `QuoteProvider` 接口，后续可加腾讯 fallback；用户层最差表现是显示 stale 数据
- [GBK 解码增加 ~30KB 依赖] → `iconv-lite` 体积可接受；esbuild bundle 后整体 < 200KB
- [非交易时段判定使用本地系统时间] → 用户系统时区不是 UTC+8 时会异常 → v1 接受此局限，文档注明，后续可加 `Asia/Shanghai` 强制
- [配置变更频繁触发调度器重置] → debounce 200ms 处理 onDidChangeConfiguration
- [TreeView 重绘性能] → 一次 onDidChangeTreeData 即重绘整棵；股票 < 50 支无压力
- [状态栏 priority 整列重映射 vs 局部更新] → 整列更简单且 5 支以内无可感差异，采纳整列重映射
- [节假日仍尝试请求] → v1 接受；周末已被排除，节假日数据返回 0 或上一交易日数据，UI 不会崩

## Migration Plan

不涉及历史数据迁移（首发版本）。后续版本若调整 `WatchListState` schema，按 `version` 字段升级：v1 → v2 时读取旧 state，转换后写回。

## Open Questions

- 是否提供"全部添加至状态栏"批量命令（v1 不做，等用户反馈）
- 是否需要支持指数（上证指数 sh000001 等）作为常驻状态栏项 → 当作普通股票 code 处理即可，无需特殊
- 集合竞价时段（9:15-9:25）是否轮询 → v1 不轮询，仅 9:25 之后开始
