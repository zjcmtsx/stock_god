## Why

开发者在写代码时需要随时瞄一眼自选股的实时行情，又不想频繁切到行情软件打断思路。VSCode 是绝大多数开发者每天主战场，把"关注列表 + 状态栏行情"嵌进去，成本最低、感知最强。本变更从零搭建插件 "我不是股神" 的首个可用版本（v1）。

## What Changes

- 新建 VSCode 插件 `mygod-stock`（Activity Bar 入口 + 状态栏入口）
- 提供股票关注列表 TreeView：红涨绿跌、显示涨幅%/现价/名称
- 提供 + 号添加按钮：QuickPick 输入代码或名称，调用新浪 suggest 模糊搜索
- 关注列表项右键菜单：置顶 / 删除 / 添加至状态栏
- 状态栏每支股票一个独立 StatusBarItem，左键点击弹 QuickPick：前移 / 后移 / 移除
- 状态栏 item hover 显示 MarkdownString 详情（涨跌额、最高、最低、今开、昨收、成交量、更新时间）
- 统一调度器（1s tick + 合并请求）驱动两路独立轮询：列表默认 5s、状态栏默认 3s
- 仅在交易时段（A 股 9:25–11:30、12:55–15:05，周一至周五）轮询；TreeView + StatusBar 都不可见时暂停
- 状态栏数量上限默认 5（可配），添加超限时拒绝并提示
- 涨跌色（列表/状态栏各一对）、刷新间隔、状态栏上限均通过 VSCode 配置项暴露，热生效
- 关注列表与状态栏顺序使用 `globalState` 持久化，跨工作区共享

## Capabilities

### New Capabilities
- `watchlist`: 自选股关注列表的增删、置顶、持久化与展示
- `quote-fetching`: 行情数据源接入（新浪 hq.sinajs.cn 行情 + suggest 搜索），含 GBK 解码与批量请求
- `polling-scheduler`: 统一调度器，按可配间隔合并触发列表/状态栏刷新，含交易时段与可见性暂停
- `status-bar-display`: 状态栏多 item 渲染、上限管理、顺序调整、点击 QuickPick、hover 详情
- `extension-config`: 配置项注册（刷新间隔、状态栏上限、涨跌色），含热更新

### Modified Capabilities
<!-- 无，新插件项目 -->

## Impact

- 新增源码目录 `src/`（extension entry、service、view、store、model）
- 新增 `package.json` 声明：activationEvents、views、commands、menus、statusBar、configuration、colors
- 新增依赖：`axios`（HTTP）、`iconv-lite`（GBK 解码）；TypeScript + esbuild 打包
- 不影响其它仓库或外部系统；运行时仅对外发起 HTTPS 请求至 `hq.sinajs.cn` 与 `suggest3.sinajs.cn`
- 用户隐私：关注列表存储在本地 `globalState`，不上传任何数据
