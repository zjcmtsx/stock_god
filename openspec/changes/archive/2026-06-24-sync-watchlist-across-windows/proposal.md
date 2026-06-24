## Why

当用户同时打开多个 VSCode 窗口时，在其中一个窗口修改自选股（增删、置顶、分组、状态栏配置）不会同步到其他窗口，必须重启才能看到变化。根因是数据存于 `context.globalState`，各 Extension Host 进程持有独立的内存副本，写入不跨进程传播。

## What Changes

- **BREAKING**（内部存储层）持久化真相源从 `globalState` 迁移到独立 JSON 文件 `globalStorageUri/watchList.json`；首次启动时若文件不存在但 `globalState` 有数据则一次性迁移，老用户无感。
- 新增基于文件监听（`fs.watch`）的跨窗口近实时同步：任一窗口写入后，其他窗口在秒级内自动 reload 并刷新 TreeView / 状态栏 / 装饰。
- 采用原子写（写 `.tmp` 后 rename）避免其他窗口读到半截文件。
- 自写抑制：进程过滤掉由自身写入触发的文件事件，避免无意义 reload。
- 并发写采用"最后写入者胜出"策略。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `watchlist`: 持久化存储需求从 `globalState` 改为 JSON 文件真相源，并新增跨窗口近实时同步行为；保留 v1/v2 迁移逻辑与失败降级。

## Impact

- 代码：`src/store/watchListStore.ts`（存储层重写为文件后端 + 监听）、`src/extension.ts`（构造 store 传入 `globalStorageUri` 而非 `globalState`，注册监听器的 dispose）。
- 行为：UI 刷新接线（`extension.ts` 中订阅 `store.onDidChange`）复用，reload 时复用同一事件，无需改动。
- 范围：仅影响持久化状态（自选股 / 分组 / 状态栏配置）；实时行情为各窗口瞬态数据，不在同步范围。
- 风险：跨平台文件 rename 覆盖行为（Windows）需在实现中验证。
