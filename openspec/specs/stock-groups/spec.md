# stock-groups Specification

## Purpose
管理关注列表的分组结构。提供默认分组与用户自定义分组的创建、重命名、删除、重排，以及股票在分组之间的迁移与排序。

## Requirements
### Requirement: 分组实体与默认分组

系统 SHALL 维护分组（Group）实体，包含 `id`、`name`、`isDefault`、`order` 字段。系统 SHALL 在初始化或从 v1 升级时自动创建一个 `id="default"`、`name="默认分组"`、`isDefault=true`、`order=0` 的默认分组。默认分组不可被重命名、不可被删除。

#### Scenario: 首次启动创建默认分组
- **WHEN** 用户首次启动新版本，本地无任何 watchList 持久化数据
- **THEN** 系统在 globalState 写入包含一个默认分组的 v2 state，TreeView 渲染该分组节点（计数 0）

#### Scenario: 从 v1 升级保留默认分组
- **WHEN** 用户升级前 globalState 中存在 v1 数据（无 groups 字段）
- **THEN** 系统创建默认分组，将所有 v1 stocks 设置 `groupId="default"` 并写回 v2 state

#### Scenario: 默认分组重命名被拒绝
- **WHEN** 用户尝试通过命令对默认分组执行重命名
- **THEN** 系统不展示重命名菜单项；如通过 API 直接调用，命令前置校验返回错误并提示"默认分组不可重命名"

#### Scenario: 默认分组删除被拒绝
- **WHEN** 用户尝试通过命令删除默认分组
- **THEN** 系统不展示删除菜单项；如通过 API 直接调用，命令前置校验返回错误并提示"默认分组不可删除"

### Requirement: 创建分组

系统 SHALL 提供命令 `mygod.stock.addGroup`，弹出 InputBox 让用户输入新分组名称；校验通过后追加到分组数组末尾（`order = max(existing) + 1`）。

#### Scenario: 创建合法分组
- **WHEN** 用户在工具栏点击"添加分组"，输入"港股仓位"
- **THEN** 分组数组末尾增加 `{id:<uuid>, name:"港股仓位", isDefault:false, order:<next>}`，TreeView 立即出现该折叠节点（默认展开，计数 0）

#### Scenario: 名称为空
- **WHEN** 用户在 InputBox 输入空字符串或仅空格
- **THEN** InputBox 显示校验提示"分组名称不能为空"，不创建

#### Scenario: 名称重复
- **WHEN** 用户输入的名称与现有分组（含默认分组）重名
- **THEN** InputBox 显示校验提示"分组名称已存在"，不创建

#### Scenario: 名称超长
- **WHEN** 用户输入超过 20 字符的名称
- **THEN** InputBox 显示校验提示"分组名称最长 20 字符"，不创建

### Requirement: 重命名分组

系统 SHALL 提供命令 `mygod.stock.renameGroup`（仅作用于非默认分组），弹出 InputBox 预填当前名称，用户修改并确认后更新 `group.name`。

#### Scenario: 重命名合法
- **WHEN** 用户右键非默认分组选择"重命名"，将"港股仓位"改为"港股核心仓"
- **THEN** 分组名更新，TreeView 立即重绘

#### Scenario: 重命名为空
- **WHEN** 用户在 InputBox 清空内容
- **THEN** InputBox 显示校验提示"分组名称不能为空"，不更新

#### Scenario: 重命名为重复
- **WHEN** 用户将分组名改为与其它分组（含默认分组）相同
- **THEN** InputBox 显示校验提示"分组名称已存在"，不更新

#### Scenario: 取消重命名
- **WHEN** 用户在 InputBox 按 ESC
- **THEN** 不做任何修改

### Requirement: 删除分组

系统 SHALL 提供命令 `mygod.stock.removeGroup`（仅作用于非默认分组）。删除前 SHALL 弹出确认对话框；确认后 SHALL 将该分组下所有股票的 `groupId` 改为默认分组的 id，再删除分组。状态栏中的股票（如有）保持原状。

#### Scenario: 删除空分组
- **WHEN** 用户右键空分组选择"删除分组"，弹出确认后选"确定"
- **THEN** 分组从 groups 数组移除，TreeView 重绘

#### Scenario: 删除非空分组迁移股票
- **WHEN** 用户删除"港股仓位"，其下含有 3 只股票
- **THEN** 这 3 只股票的 `groupId` 变更为 "default"，分组被移除，TreeView 中默认分组多出 3 项

#### Scenario: 取消删除
- **WHEN** 确认对话框中用户选"取消"
- **THEN** 分组与股票均不变更

### Requirement: 分组顺序

系统 SHALL 按 `group.order` 升序展示分组节点。默认分组的 `order=0` 不变，但允许其它分组通过拖拽排在默认分组之前（即 `order < 0`）。

#### Scenario: 新建分组排在末尾
- **WHEN** 当前 3 个分组 order=[0,1,2]，用户新建"自选"
- **THEN** 新分组 order=3，渲染时排在最后

#### Scenario: 顺序持久化
- **WHEN** 用户调整分组顺序后重启 VSCode
- **THEN** 重启后分组按上次保存的顺序展示

### Requirement: 拖拽分组重排

系统 SHALL 通过 `TreeDragAndDropController` 支持拖拽分组节点到另一分组节点上方/下方以调整 `order`。

#### Scenario: 分组拖到另一分组之前
- **WHEN** 用户将"港股"拖到"默认分组"上
- **THEN** "港股" 的 order 变为小于 "默认分组" 的值，UI 中"港股"显示在"默认分组"之前

#### Scenario: 分组拖到自己上面
- **WHEN** 用户拖动一个分组到自身
- **THEN** 不发生变化（no-op）

### Requirement: 拖拽股票变更分组与位置

系统 SHALL 通过 `TreeDragAndDropController` 支持拖拽股票节点到分组节点（移动到该分组末尾）或到另一只股票节点（插入到该位置）。同分组内拖拽实现重排，跨分组拖拽实现迁移并保持相对顺序。

#### Scenario: 跨分组拖拽
- **WHEN** 用户将默认分组下的"腾讯控股 hk00700"拖到"港股仓位"分组节点
- **THEN** 该股票的 `groupId` 变为"港股仓位"id，被追加到该分组末尾

#### Scenario: 同分组内重排
- **WHEN** 用户将"珂玛科技"拖到同分组的"汇通能源"上
- **THEN** "珂玛科技"插入到"汇通能源"之前的位置

#### Scenario: 拖到另一只股票实现跨分组插入
- **WHEN** 用户将股票 A（默认分组）拖到股票 B（港股分组）上
- **THEN** A 的 `groupId` 变为港股分组的 id，并插入到 B 当前位置

#### Scenario: 拖动 pinned 股票到非置顶位置
- **WHEN** 用户拖动一个 `pinned=true` 的股票到该分组中非置顶区域
- **THEN** 系统自动将 `pinned` 置为 false，按目标位置插入

#### Scenario: 多选拖拽保持相对顺序
- **WHEN** 用户多选 3 只股票拖到另一分组
- **THEN** 3 只股票的相对顺序保持不变，依次插入目标位置
