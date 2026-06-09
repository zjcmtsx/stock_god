import * as vscode from 'vscode';
import { WatchListStore } from '../store/watchListStore';
import { Scheduler } from '../service/scheduler';
import { Stock, isUpward, isDownward } from '../model/stock';
import { ResolvedConfig } from '../service/configService';
import { TreeNode, isGroupNode, isStockNode, nodeKey } from './treeNode';

export class StockTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly store: WatchListStore,
    private readonly scheduler: Scheduler,
    private config: ResolvedConfig
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  updateConfig(config: ResolvedConfig): void {
    this.config = config;
    this.refresh();
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (isGroupNode(node)) return this.buildGroupItem(node.id);
    return this.buildStockItem(node);
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.store.getGroups().map(g => ({ kind: 'group', id: g.id } as TreeNode));
    }
    if (isGroupNode(element)) {
      return this.store
        .getStocksByGroup(element.id)
        .map(s => ({ kind: 'stock', code: s.code, groupId: element.id } as TreeNode));
    }
    return [];
  }

  getParent(node: TreeNode): TreeNode | undefined {
    if (isStockNode(node)) return { kind: 'group', id: node.groupId };
    return undefined;
  }

  // ─── Item builders ─────────────────────────────────

  private buildGroupItem(id: string): vscode.TreeItem {
    const group = this.store.findGroup(id);
    const count = this.store.getStocksByGroup(id).length;
    const label = group ? `${group.name} (${count})` : `(未知分组)`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `g:${id}`;
    item.iconPath = new vscode.ThemeIcon('folder');
    item.contextValue = group?.isDefault ? 'group-default' : 'group-custom';
    return item;
  }

  private buildStockItem(node: { kind: 'stock'; code: string; groupId: string }): vscode.TreeItem {
    const code = node.code;
    const item = this.store.find(code);
    const stock = this.scheduler.getStock(code);
    const name = stock?.name || item?.name || code;
    const pinned = !!item?.pinned;
    const inStatusBar = !!item?.inStatusBar;

    const treeItem = new vscode.TreeItem(this.formatLabel(stock, name));
    treeItem.id = `s:${node.groupId}:${code}`;
    treeItem.description = code;
    treeItem.iconPath = this.iconFor(stock);
    treeItem.tooltip = buildTooltip(stock, name, { pinned, inStatusBar });
    const tags: string[] = ['stock', pinned ? 'stock-pinned' : 'stock-unpinned'];
    if (inStatusBar) tags.push('stock-inStatusBar');
    treeItem.contextValue = tags.join(' ');
    treeItem.resourceUri = vscode.Uri.parse(`mygodstock://stock/${code}`);
    return treeItem;
  }

  private formatLabel(stock: Stock | undefined, name: string): string {
    if (!stock || !Number.isFinite(stock.price)) {
      return `--%   --   ${name}`;
    }
    const pct = stock.changePct;
    const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    const priceStr = stock.price.toFixed(2);
    const stale = stock.stale ? ' ⚠' : '';
    return `${pctStr}   ${priceStr}   ${name}${stale}`;
  }

  private iconFor(stock: Stock | undefined): vscode.ThemeIcon {
    if (!stock || !Number.isFinite(stock.changePct)) {
      return new vscode.ThemeIcon('dash');
    }
    if (isUpward(stock)) {
      return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('mygod.stock.upColor'));
    }
    if (isDownward(stock)) {
      return new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('mygod.stock.downColor'));
    }
    return new vscode.ThemeIcon('dash');
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

export function buildTooltip(
  stock: Stock | undefined,
  name: string,
  flags?: { pinned?: boolean; inStatusBar?: boolean }
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.supportThemeIcons = true;
  if (!stock || !Number.isFinite(stock.price)) {
    md.appendMarkdown(`### 今日行情 ${name}\n\n暂无数据，等待刷新...`);
    return md;
  }
  const pct = stock.changePct;
  const arrow = pct > 0 ? '$(arrow-up)' : pct < 0 ? '$(arrow-down)' : '$(dash)';
  const sign = pct >= 0 ? '+' : '';
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '--');
  const fmtVol = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return '--';
    if (n > 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n > 1e4) return (n / 1e4).toFixed(2) + '万';
    return n.toFixed(0);
  };
  const marketLabel = stock.market ? ` · ${stock.market}` : '';
  md.appendMarkdown(`### 今日行情 ${name} (${stock.code}${marketLabel})\n\n`);
  md.appendMarkdown(`${arrow} **涨跌**：${sign}${fmt(stock.change)}　**百分**：${sign}${fmt(pct)}%\n\n`);
  md.appendMarkdown(`| 字段 | 值 | 字段 | 值 |\n|---|---|---|---|\n`);
  md.appendMarkdown(`| 最高 | ${fmt(stock.high)} | 最低 | ${fmt(stock.low)} |\n`);
  md.appendMarkdown(`| 今开 | ${fmt(stock.open)} | 昨收 | ${fmt(stock.prevClose)} |\n`);
  md.appendMarkdown(`| 成交量 | ${fmtVol(stock.volume)} | 成交额 | ${fmtVol(stock.amount)} |\n\n`);
  if (flags?.pinned || flags?.inStatusBar) {
    const tags: string[] = [];
    if (flags.pinned) tags.push('📌 置顶');
    if (flags.inStatusBar) tags.push('📊 在状态栏');
    md.appendMarkdown(`${tags.join('　')}\n\n`);
  }
  const stale = stock.stale ? ' ⚠ 数据可能过期' : '';
  md.appendMarkdown(`_更新时间：${stock.date} ${stock.time}${stale}_`);
  return md;
}
