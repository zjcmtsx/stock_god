## 1. 项目脚手架与构建

- [x] 1.1 初始化 `package.json`：name `mygod-stock`、displayName `我不是股神`、publisher 占位、engines.vscode `^1.74.0`、main `./dist/extension.js`
- [x] 1.2 配置 `tsconfig.json`：target ES2020, module commonjs, strict, outDir dist
- [x] 1.3 添加依赖：`iconv-lite`（axios 因体积考量改用 node 内置 https）；devDeps：`typescript`, `@types/vscode`, `@types/node`, `esbuild`
- [x] 1.4 添加 esbuild 构建脚本（dev watch + production minify）
- [x] 1.5 添加 `.vscodeignore`、`.gitignore`、`README.md` 占位、`CHANGELOG.md`
- [x] 1.6 创建源码目录骨架：`src/extension.ts`, `src/service/`, `src/view/`, `src/store/`, `src/model/`

## 2. 数据模型与持久化

- [x] 2.1 定义 `src/model/stock.ts`：`Stock` 接口（code/name/price/prevClose/open/high/low/change/changePct/volume/date/time/updatedAt）
- [x] 2.2 定义 `WatchListState` 类型与默认值
- [x] 2.3 实现 `src/store/watchListStore.ts`：基于 `globalState` 的 CRUD（add/remove/togglePin/setInStatusBar/reorderStatusBar/applyMaxItemsCap），暴露 `onDidChange` 事件
- [x] 2.4 排序辅助：`sortByPinnedThenInsertion(stocks)` 用于 TreeView

## 3. 行情数据源

- [x] 3.1 实现 `src/service/sinaApi.ts` 的 `batchQuote(codes: string[]): Promise<Map<code, Stock>>`，含 GBK 解码与字段解析
- [x] 3.2 实现 `search(keyword: string): Promise<Array<{code, name, type}>>` 调用 suggest 接口，过滤仅 A 股
- [x] 3.3 添加 5s 超时 + 1 次重试逻辑；解码失败回退 UTF-8
- [x] 3.4 单条解析容错：单行格式异常时跳过该 code，不影响其它

## 4. 调度器

- [x] 4.1 实现 `src/service/tradingHours.ts`：`isInTradingSession(date): boolean`，覆盖周一~五 + 9:25-11:30 + 12:55-15:05
- [x] 4.2 实现 `src/service/scheduler.ts`：1s tick、双 nextDue、合并请求、`tree-updated`/`status-updated` 事件
- [x] 4.3 接入可见性判定：`treeView.onDidChangeVisibility` + 状态栏存在 = 活跃
- [x] 4.4 接入交易时段门控；非交易时段不发起请求
- [x] 4.5 配置变更钩子：刷新间隔变化时重置 nextDue
- [x] 4.6 错误降级：请求失败保留缓存，不抛出至上层
- [x] 4.7 关注列表/状态栏列表为空时跳过对应路；都空时整体待机

## 5. 配置项与颜色

- [x] 5.1 在 `package.json` 声明 `contributes.configuration`：refreshInterval/statusBarRefreshInterval/statusBarMaxItems/4 个颜色项
- [x] 5.2 在 `package.json` 声明 `contributes.colors`：upColor/downColor（light/dark/highContrast 默认）
- [x] 5.3 实现 `src/service/configService.ts`：读取所有配置 + 边界兜底（最小值 1、最大值 20）
- [x] 5.4 实现 `resolveColor(value): string | ThemeColor`：合法 hex 直返、空/非法回退 ThemeColor
- [x] 5.5 注册 `onDidChangeConfiguration` 监听：分发到 scheduler/statusBarManager/treeProvider

## 6. TreeView

- [x] 6.1 在 `package.json` 声明 viewsContainers（Activity Bar 入口）+ views 注册
- [x] 6.2 实现 `src/view/stockTreeProvider.ts`：`TreeDataProvider<Stock>`，渲染 iconPath（arrow-up/arrow-down/dash）+ label（涨幅/价格/名称）
- [x] 6.3 接入 `tree-updated` 事件触发 `onDidChangeTreeData`
- [x] 6.4 行情缺失时占位 `--`、stale 数据加 ⚠ 标记
- [x] 6.5 注册工具栏按钮：`+ 添加`、`刷新`（在 `package.json` menus.view/title）
- [x] 6.6 注册右键菜单（contextValue == 'stock'）：置顶/取消置顶、删除、添加至状态栏/从状态栏移除

## 7. 命令实现

- [x] 7.1 `mygod.stock.add`：QuickPick 输入 → 调用 sina.search → 选择 → store.add → 触发立即一次刷新
- [x] 7.2 `mygod.stock.refresh`：触发调度器立即一次合并刷新
- [x] 7.3 `mygod.stock.pin`：store.togglePin（含 unpin 命令）
- [x] 7.4 `mygod.stock.remove`：store.remove + 同步从 statusBarOrder 移除
- [x] 7.5 `mygod.stock.toStatusBar`：cap 校验 → store.setInStatusBar(true) + push to statusBarOrder；超限弹 warning
- [x] 7.6 `mygod.stock.removeFromStatusBar`：从 statusBarOrder 移除 + setInStatusBar(false)
- [x] 7.7 `mygod.stock.statusBarItemClicked`：参数携带 code，弹 QuickPick（前移/后移/移除，按位置过滤）
- [x] 7.8 重复添加检测：在 add 流程中提示"已在关注列表"

## 8. 状态栏管理

- [x] 8.1 实现 `src/view/statusBarManager.ts`：根据 `statusBarOrder` diff 创建/更新/dispose StatusBarItem
- [x] 8.2 priority 重映射：每次 reorder 后整列重写 `(N - idx) * 100`
- [x] 8.3 渲染 text：`「name」 price (±changePct%)`，颜色按 resolveColor + 涨/跌/平
- [x] 8.4 渲染 tooltip：构建 MarkdownString 表格（涨跌/百分/最高/最低/今开/昨收/成交量/更新时间）
- [x] 8.5 接入 `status-updated` 事件刷新文本与颜色
- [x] 8.6 接入 `mygod.stock.statusBarItemClicked` command + 参数
- [x] 8.7 cap 缩小时截断处理：保留前 N、其余 dispose 并 setInStatusBar(false)

## 9. 集成与激活

- [x] 9.1 `src/extension.ts` 中 `activate()`：实例化 store/scheduler/treeProvider/statusBarManager，注册命令与配置监听，启动调度器
- [x] 9.2 `deactivate()`：dispose 所有资源（timer/StatusBarItem/事件订阅）
- [x] 9.3 `activationEvents`：`onStartupFinished`（VSCode 1.74+ 已自动按 view/command 触发激活，无需显式 onView 条目）
- [x] 9.4 在 README 简述安装、使用、配置项

## 10. 自测与发布准备

- [ ] 10.1 F5 启动 Extension Development Host，覆盖以下用例：添加股票（代码/名称/拼音）、置顶、删除、加入状态栏、状态栏前移/后移/移除、cap 拒绝、配置热更新、交易时段外暂停（**待用户手动验证**）
- [ ] 10.2 验证 GBK 中文名正确显示（**待用户手动验证**）
- [ ] 10.3 验证刷新间隔修改后秒级生效（**待用户手动验证**）
- [ ] 10.4 验证重启 VSCode 后状态恢复（**待用户手动验证**）
- [~] 10.5 esbuild 生产构建 `dist/extension.js` 体积 = 498KB（iconv-lite 编码表占大头；目标 200KB 未达，但功能完整。后续可考虑替换为最小化 GBK 解码实现）
- [ ] 10.6 `vsce package` 打包 .vsix 通过，安装到本地 VSCode 烟测（**待用户手动验证**）
