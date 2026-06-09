# 我不是股神 (mygod-stock)

VSCode 内嵌 A 股 / 港股 / 美股关注列表与状态栏行情。

## 功能

- 侧边栏关注列表：红涨绿跌、显示涨幅%/现价/名称
- **多市场**：A 股 (sh/sz)、港股 (hk)、美股 (gb_/usr_)
- **分组管理**：默认分组 + 自定义分组，支持新建、重命名、删除
- 拖拽支持：股票跨/同分组重排，分组顺序也可拖拽调整
- 添加按钮：支持代码 / 中文名 / 拼音模糊搜索（新浪 suggest，全市场）
- 右键菜单：置顶 / 删除 / 添加至状态栏；分组可重命名 / 删除
- 状态栏多支股票独立展示，鼠标悬停显示详情面板
- 状态栏左键点击弹出菜单：前移 / 后移 / 移除
- 关注列表与状态栏使用各自的刷新节奏（默认 5s / 3s）
- 仅在 A 股交易时段轮询，视图不可见时自动暂停

## 分组使用

- 工具栏 `+ 文件夹` 图标：新建分组
- 默认分组（"默认分组"）固定存在，不能重命名/删除
- 删除非默认分组时，组内股票自动迁移到默认分组
- 拖股票到分组节点：移到该分组末尾
- 拖股票到另一只股票：插入该位置（同/跨分组）
- 拖分组到另一分组：调整分组顺序

## 配置项

| 配置 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `mygod.stock.refreshInterval` | number | 5 | 关注列表刷新间隔（秒） |
| `mygod.stock.statusBarRefreshInterval` | number | 3 | 状态栏刷新间隔（秒） |
| `mygod.stock.statusBarMaxItems` | number | 5 | 状态栏最多展示数量（1-20） |
| `mygod.stock.statusBar.upColor` | string | `#FF2E2E` | 状态栏上涨颜色 |
| `mygod.stock.statusBar.downColor` | string | `#00B578` | 状态栏下跌颜色 |
| `mygod.stock.list.upColor` | string | `#FF2E2E` | （列表着色见下文） |
| `mygod.stock.list.downColor` | string | `#00B578` | （列表着色见下文） |

**列表着色：** VSCode TreeView 文字色仅支持 ThemeColor，使用 `workbench.colorCustomizations`：

```jsonc
"workbench.colorCustomizations": {
  "mygod.stock.upColor":   "#FF0000",
  "mygod.stock.downColor": "#00CC00"
}
```

## 数据源

- 行情：`https://hq.sinajs.cn/`
- 搜索：`https://suggest3.sinajs.cn/`

数据均存储于本地（`globalState`），不上传任何信息。

## 开发

```bash
npm install
npm run watch        # 开发模式
npm run build        # 生产构建
npm run package      # 打包 .vsix
```

按 F5 启动 Extension Development Host 调试。
