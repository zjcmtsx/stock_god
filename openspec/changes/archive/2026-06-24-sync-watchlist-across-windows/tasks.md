## 1. 存储层改造（文件后端）

- [x] 1.1 `WatchListStore` 构造参数从 `vscode.Memento` 改为存储目录路径（来自 `context.globalStorageUri.fsPath`）；解析出 `watchList.json` 完整路径
- [x] 1.2 实现 `loadFromFile()`：读取 `watchList.json` → JSON.parse → 复用现有 `migrate()`；文件不存在或解析失败时复用现有降级逻辑（重置空 v2 + warning）
- [x] 1.3 实现原子写 `persistToFile()`：序列化 state → 写 `watchList.json.tmp` → `fs.rename` 覆盖；Windows 覆盖失败时回退（unlink/copyFile 重试）
- [x] 1.4 确保 `globalStorageUri` 目录存在（`fs.mkdir recursive`）
- [x] 1.5 将所有 `persist()` 内的 `memento.update` 替换为 `persistToFile()`，并记录最后自写内容（哈希或序列化字符串）用于自写抑制

## 2. 跨窗口同步（文件监听）

- [x] 2.1 在 store 中用 `fs.watch`（监听 `watchList.json` 所在目录）启动监听
- [x] 2.2 监听回调做去抖（~150ms），合并连发事件
- [x] 2.3 reload 流程：读文件 → 与最后自写内容比对，一致则跳过；不一致则替换 `this.state` 并 fire `onDidChange`
- [x] 2.4 处理文件被外部删除：以内存状态为准，下次写入时重建
- [x] 2.5 在 `dispose()` 中关闭 `fs.watch` 句柄

## 3. 首次迁移与接线

- [x] 3.1 `activate` 中改为 `new WatchListStore(context.globalStorageUri.fsPath)`
- [x] 3.2 首次迁移：若 `watchList.json` 不存在但 `globalState.mygod.stock.watchList` 有数据，迁移写入 json（旧 key 保留不动）
- [x] 3.3 确认 `extension.ts` 中订阅 `store.onDidChange` 的 UI 刷新接线对 reload 同样生效（无需改动则确认即可）

## 4. 验证

- [x] 4.1 编译通过（`npm run compile` / esbuild），无类型错误
- [ ] 4.2 多窗口手测：A 窗口增删/置顶/分组/状态栏变更，B 窗口秒级自动刷新无需重启
- [ ] 4.3 老用户迁移手测：已有 globalState 数据，升级后首次启动数据完整出现在 json 并正常渲染
- [ ] 4.4 边界手测：文件损坏降级、外部删除文件后下次写入重建、自写不产生多余刷新
