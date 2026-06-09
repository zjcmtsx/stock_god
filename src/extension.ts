import * as vscode from 'vscode';
import { WatchListStore } from './store/watchListStore';
import { Scheduler } from './service/scheduler';
import { StockTreeProvider } from './view/stockTreeProvider';
import { StatusBarManager } from './view/statusBarManager';
import { StockDecorationProvider } from './view/stockDecorationProvider';
import { StockDragAndDropController } from './view/treeDragAndDrop';
import { TreeNode, isGroupNode, isStockNode } from './view/treeNode';
import { readConfig, affectsConfig } from './service/configService';
import { search } from './service/sinaApi';

export function activate(context: vscode.ExtensionContext): void {
  const store = new WatchListStore(context.globalState);
  let config = readConfig();

  const scheduler = new Scheduler(store, {
    treeIntervalSec: config.refreshInterval,
    statusIntervalSec: config.statusBarRefreshInterval
  });

  const treeProvider = new StockTreeProvider(store, scheduler, config);
  const dndController = new StockDragAndDropController(store);
  const treeView = vscode.window.createTreeView<TreeNode>('mygodStockWatchList', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
    canSelectMany: true,
    dragAndDropController: dndController
  });

  const statusBar = new StatusBarManager(store, scheduler, config);
  statusBar.refresh();

  const decorationProvider = new StockDecorationProvider(scheduler, store);
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider)
  );

  scheduler.setTreeVisible(treeView.visible);
  context.subscriptions.push(
    treeView.onDidChangeVisibility(e => scheduler.setTreeVisible(e.visible))
  );

  context.subscriptions.push(
    scheduler.onTreeUpdated(() => {
      treeProvider.refresh();
      decorationProvider.refresh(buildAllUris(store));
    }),
    scheduler.onStatusUpdated(() => {
      statusBar.refresh();
      decorationProvider.refresh(buildAllUris(store));
    })
  );

  context.subscriptions.push(
    store.onDidChange(() => {
      treeProvider.refresh();
      statusBar.refresh();
      decorationProvider.refresh(buildAllUris(store));
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (!e.affectsConfiguration('mygod.stock')) return;
      config = readConfig();
      scheduler.updateOptions({
        treeIntervalSec: config.refreshInterval,
        statusIntervalSec: config.statusBarRefreshInterval
      });
      treeProvider.updateConfig(config);
      statusBar.updateConfig(config);
      if (affectsConfig(e, 'statusBarMaxItems')) {
        const removed = await store.applyMaxItemsCap(config.statusBarMaxItems);
        if (removed.length > 0) {
          vscode.window.showInformationMessage(
            `状态栏上限调整为 ${config.statusBarMaxItems}，已移除 ${removed.length} 支股票`
          );
        }
      }
    })
  );

  registerCommands(context, store, scheduler, () => config);

  scheduler.start();

  context.subscriptions.push(
    { dispose: () => scheduler.dispose() },
    { dispose: () => statusBar.dispose() },
    { dispose: () => treeProvider.dispose() },
    { dispose: () => decorationProvider.dispose() },
    { dispose: () => store.dispose() },
    treeView
  );
}

export function deactivate(): void {
  // disposables 已注册到 context.subscriptions
}

function registerCommands(
  context: vscode.ExtensionContext,
  store: WatchListStore,
  scheduler: Scheduler,
  getConfig: () => ReturnType<typeof readConfig>
): void {
  // ─── Stock 命令 ──────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.add', async () => {
      const picked = await pickStockBySearch();
      if (!picked) return;
      const ok = await store.add(picked.code, picked.name);
      if (!ok) {
        vscode.window.showInformationMessage(`「${picked.name}」已在关注列表`);
        return;
      }
      void scheduler.refreshNow();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.refresh', async () => {
      await scheduler.refreshNow();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.pin', async (arg: any) => {
      const code = extractStockCode(arg);
      if (!code) return;
      await store.togglePin(code);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.unpin', async (arg: any) => {
      const code = extractStockCode(arg);
      if (!code) return;
      await store.togglePin(code);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.remove', async (arg: any) => {
      const code = extractStockCode(arg);
      if (!code) return;
      await store.remove(code);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.toStatusBar', async (arg: any) => {
      const code = extractStockCode(arg);
      if (!code) return;
      const cap = getConfig().statusBarMaxItems;
      const result = await store.addToStatusBar(code, cap);
      if (result === 'over-cap') {
        const action = await vscode.window.showWarningMessage(
          `状态栏已达上限 ${cap}/${cap}`,
          '打开设置',
          '知道了'
        );
        if (action === '打开设置') {
          await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'mygod.stock.statusBarMaxItems'
          );
        }
      } else if (result === 'duplicate') {
        vscode.window.showInformationMessage('该股票已在状态栏');
      } else if (result === 'not-found') {
        vscode.window.showWarningMessage('未找到该股票');
      } else {
        void scheduler.refreshNow();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.removeFromStatusBar', async (arg: any) => {
      const code = extractStockCode(arg);
      if (!code) return;
      await store.removeFromStatusBar(code);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.statusBarItemClicked', async (code: string) => {
      if (!code) return;
      const order = store.getStatusBarOrder();
      const idx = order.indexOf(code);
      if (idx < 0) return;
      const watch = store.find(code);
      const name = watch?.name || code;

      type Pick = vscode.QuickPickItem & { id: 'left' | 'right' | 'remove' };
      const items: Pick[] = [];
      if (idx > 0) items.push({ id: 'left', label: '$(arrow-left) 前移', description: '与左侧邻居交换' });
      if (idx < order.length - 1)
        items.push({ id: 'right', label: '$(arrow-right) 后移', description: '与右侧邻居交换' });
      items.push({ id: 'remove', label: '$(close) 从状态栏移除', description: '保留在关注列表' });

      const picked = await vscode.window.showQuickPick<Pick>(items, {
        title: `「${name}」`,
        placeHolder: '选择操作'
      });
      if (!picked) return;
      if (picked.id === 'left') await store.moveStatusBar(code, 'left');
      else if (picked.id === 'right') await store.moveStatusBar(code, 'right');
      else await store.removeFromStatusBar(code);
    })
  );

  // ─── Group 命令 ──────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.addGroup', async () => {
      const name = await vscode.window.showInputBox({
        title: '添加分组',
        placeHolder: '输入分组名称（最多 20 字符）',
        validateInput: v => validateGroupName(store, v)
      });
      if (!name) return;
      const result = await store.addGroup(name);
      if (!result.ok) {
        vscode.window.showWarningMessage(`添加分组失败：${reasonText(result.reason)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.renameGroup', async (arg: any) => {
      const groupId = extractGroupId(arg);
      if (!groupId) return;
      const group = store.findGroup(groupId);
      if (!group) return;
      if (group.isDefault) {
        vscode.window.showInformationMessage('默认分组不可重命名');
        return;
      }
      const newName = await vscode.window.showInputBox({
        title: '重命名分组',
        value: group.name,
        valueSelection: [0, group.name.length],
        placeHolder: '输入新分组名',
        validateInput: v => validateGroupName(store, v, groupId)
      });
      if (!newName || newName === group.name) return;
      const result = await store.renameGroup(groupId, newName);
      if (!result.ok) {
        vscode.window.showWarningMessage(`重命名失败：${reasonText(result.reason)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mygod.stock.removeGroup', async (arg: any) => {
      const groupId = extractGroupId(arg);
      if (!groupId) return;
      const group = store.findGroup(groupId);
      if (!group) return;
      if (group.isDefault) {
        vscode.window.showInformationMessage('默认分组不可删除');
        return;
      }
      const count = store.getStocksByGroup(groupId).length;
      const msg =
        count > 0
          ? `删除分组「${group.name}」？组内 ${count} 只股票将迁移至默认分组。`
          : `删除分组「${group.name}」？`;
      const choice = await vscode.window.showWarningMessage(msg, { modal: true }, '确定删除');
      if (choice !== '确定删除') return;
      await store.removeGroup(groupId);
    })
  );
}

function extractStockCode(arg: any): string | undefined {
  if (!arg) return undefined;
  if (typeof arg === 'string') return arg;
  // TreeItem-like
  if (typeof arg.id === 'string') {
    const parts = arg.id.split(':');
    if (parts[0] === 's' && parts.length >= 3) return parts[parts.length - 1];
    return arg.id;
  }
  if (typeof arg.code === 'string') return arg.code;
  return undefined;
}

function extractGroupId(arg: any): string | undefined {
  if (!arg) return undefined;
  if (typeof arg === 'string') return arg;
  if (typeof arg.id === 'string') {
    if (arg.id.startsWith('g:')) return arg.id.substring(2);
    return arg.id;
  }
  return undefined;
}

function validateGroupName(
  store: WatchListStore,
  value: string,
  excludeId?: string
): string | undefined {
  const trimmed = (value || '').trim();
  if (!trimmed) return '分组名称不能为空';
  if (trimmed.length > 20) return '分组名称最长 20 字符';
  const dup = store.getGroups().some(g => g.id !== excludeId && g.name === trimmed);
  if (dup) return '分组名称已存在';
  return undefined;
}

function reasonText(reason?: string): string {
  switch (reason) {
    case 'empty':
      return '名称不能为空';
    case 'too-long':
      return '名称过长（最多 20 字符）';
    case 'duplicate':
      return '名称已存在';
    case 'is-default':
      return '默认分组不可修改';
    case 'not-found':
      return '分组不存在';
    default:
      return '未知错误';
  }
}

function buildAllUris(store: WatchListStore): vscode.Uri[] {
  return store.getRawStocks().map(s => vscode.Uri.parse(`mygodstock://stock/${s.code}`));
}

async function pickStockBySearch(): Promise<{ code: string; name: string } | undefined> {
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { code?: string; name?: string }>();
  qp.title = '添加股票';
  qp.placeholder = '输入代码 / 中文名 / 拼音首字母（支持 A 股 / 港股 / 美股）';
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;

  let token = 0;
  let timer: NodeJS.Timeout | undefined;
  qp.onDidChangeValue(value => {
    if (timer) clearTimeout(timer);
    if (!value || value.trim().length === 0) {
      qp.items = [];
      qp.busy = false;
      return;
    }
    qp.busy = true;
    const my = ++token;
    timer = setTimeout(async () => {
      try {
        const results = await search(value);
        if (my !== token) return;
        if (results.length === 0) {
          qp.items = [{ label: '$(info) 无匹配结果', alwaysShow: true }];
        } else {
          qp.items = results.map(r => ({
            label: r.name,
            description: `${r.code} · ${r.market}`,
            detail: r.type,
            code: r.code,
            name: r.name
          }));
        }
      } catch {
        if (my === token) qp.items = [{ label: '$(error) 搜索失败', alwaysShow: true }];
      } finally {
        if (my === token) qp.busy = false;
      }
    }, 250);
  });

  return new Promise(resolve => {
    qp.onDidAccept(() => {
      const sel = qp.selectedItems[0];
      qp.hide();
      if (sel && sel.code && sel.name) resolve({ code: sel.code, name: sel.name });
      else resolve(undefined);
    });
    qp.onDidHide(() => {
      qp.dispose();
      resolve(undefined);
    });
    qp.show();
  });
}
