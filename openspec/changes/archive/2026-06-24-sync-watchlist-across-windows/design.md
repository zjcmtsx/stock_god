## Context

插件用 `context.globalState`（VSCode Memento，底层全局 SQLite）存储自选股状态。`globalState` 跨窗口共享磁盘存储，但每个 Extension Host 进程在激活时把数据载入内存，之后 `memento.get()` 只读内存缓存，不会重读磁盘；`memento.update()` 仅在本进程内通过 `EventEmitter` 通知 UI。因此多窗口下 A 的修改不会传播到 B，必须重启 B 才会在 `activate` 时重新加载。

`探索结论`：定时 `get` 轮询无效（缓存读不到盘）；文件真相源 + 文件监听是可靠解法。

## Goals / Non-Goals

**Goals:**
- 任一窗口修改自选股 / 分组 / 状态栏配置后，其他窗口秒级自动刷新，无需重启。
- 保持现有 UI 刷新接线（`store.onDidChange`）与 v1/v2 迁移逻辑不变。
- 老用户从 `globalState` 平滑迁移，无感知。

**Non-Goals:**
- 不同步实时行情价格（各窗口 `scheduler` 各自拉取的瞬态数据）。
- 不做冲突合并 / CRDT；并发写采用最后写入者胜出。
- 不引入外部依赖或后台服务。

## Decisions

### 决策 1：真相源迁移到 JSON 文件
`WatchListStore` 构造参数从 `vscode.Memento` 改为存储目录（`context.globalStorageUri.fsPath`），状态读写走 `globalStorageUri/watchList.json`。

- **为何**：`globalStorageUri` 是全局共享路径（非 workspace），所有窗口指向同一文件；文件可被 `fs.watch` 跨进程监听。
- **替代方案**：保留 globalState + 信号文件 → 仍受 memento 缓存所限，reload 时拿不到新值，实现别扭，已排除。

### 决策 2：原子写
写入时先写 `watchList.json.tmp`，再 `fs.rename` 覆盖到正式文件。

- **为何**：避免其他窗口在写入中途读到不完整 JSON 导致解析失败。
- **注意**：Node `fs.rename` 在 Windows 上覆盖已存在目标的行为需实现时验证（必要时回退到先 unlink 或 copyFile + 重试）。

### 决策 3：文件监听 + 去抖 + 自写抑制
用 `fs.watch`（监听文件或其所在目录）侦测外部变更。

- **去抖**：监听回调 debounce ~150ms，合并连发事件后再 reload。
- **自写抑制**：每次本进程写入后记录所写内容的哈希（或序列化字符串）；reload 时若读到的内容与"最后一次自写内容"一致则跳过，避免无意义刷新与潜在抖动。
- **reload 后**：替换内存 `this.state` 并 fire 现有的 `onDidChange`，复用 `extension.ts` 已有的 tree/状态栏/装饰刷新接线。

### 决策 4：首次迁移
`activate` 时若 `watchList.json` 不存在但 `globalState` 中存在 `mygod.stock.watchList`，则读出该数据、迁移（复用现有 migrate），写入 json 文件作为初始真相源。globalState 旧 key 保留不动（作历史备份，不再读取）。

## Risks / Trade-offs

- [并发写丢失]：两窗口同秒写不同改动 → 最后写入者胜出可能覆盖对方。**Mitigation**：自选股写操作频率极低，可接受；写前可读取最新文件再合并基准（可选增强，非必须）。
- [Windows rename 覆盖失败] → 实现中验证并准备回退（unlink+rename 或 copyFile）。
- [fs.watch 平台差异/事件丢失]：某些平台/网络盘 fs.watch 不稳定 → 监听目录而非单文件，并对事件做存在性校验后再 reload；失败时不影响本窗口正常使用。
- [文件损坏/被外部删除] → 解析失败时复用现有降级（重置为空 v2 并 warning）；文件缺失时用内存状态重建。

## Migration Plan

1. 实现文件后端 store + 监听。
2. `activate` 中执行首次迁移逻辑（globalState → json）。
3. 回滚策略：如需回退，旧 globalState 数据仍在，可改回构造 `new WatchListStore(context.globalState)`。
