import * as vscode from 'vscode';
import { WatchListStore } from '../store/watchListStore';
import { Scheduler } from '../service/scheduler';
import { Stock, isUpward, isDownward } from '../model/stock';
import { ResolvedConfig, resolveColor } from '../service/configService';
import { buildTooltip } from './stockTreeProvider';

const FLAT_COLOR = '#888888';

export class StatusBarManager {
  private items = new Map<string, vscode.StatusBarItem>();

  constructor(
    private readonly store: WatchListStore,
    private readonly scheduler: Scheduler,
    private config: ResolvedConfig
  ) {}

  refresh(): void {
    const order = this.store.getStatusBarOrder();
    const seen = new Set<string>();
    order.forEach((code, idx) => {
      seen.add(code);
      const priority = (order.length - idx) * 100;
      let item = this.items.get(code);
      if (!item) {
        item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
        this.items.set(code, item);
      } else if ((item as any).priority !== priority) {
        item.dispose();
        item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
        this.items.set(code, item);
      }
      this.applyItem(item, code);
      item.show();
    });
    for (const [code, item] of [...this.items]) {
      if (!seen.has(code)) {
        item.dispose();
        this.items.delete(code);
      }
    }
  }

  updateConfig(config: ResolvedConfig): void {
    this.config = config;
    this.refresh();
  }

  hasAny(): boolean {
    return this.items.size > 0;
  }

  private applyItem(item: vscode.StatusBarItem, code: string): void {
    const stock = this.scheduler.getStock(code);
    const watch = this.store.find(code);
    const name = stock?.name || watch?.name || code;
    item.text = this.formatText(stock, name);
    item.color = this.colorFor(stock);
    item.tooltip = buildTooltip(stock, name);
    item.command = {
      command: 'mygod.stock.statusBarItemClicked',
      title: '股票操作',
      arguments: [code]
    };
  }

  private formatText(stock: Stock | undefined, name: string): string {
    if (!stock || !Number.isFinite(stock.price)) {
      return `「${name}」 -- (--%)`;
    }
    const pct = stock.changePct;
    const sign = pct >= 0 ? '+' : '';
    const stale = stock.stale ? ' ⚠' : '';
    return `「${name}」 ${stock.price.toFixed(2)} (${sign}${pct.toFixed(2)}%)${stale}`;
  }

  private colorFor(stock: Stock | undefined): string | vscode.ThemeColor {
    if (!stock || !Number.isFinite(stock.changePct)) return FLAT_COLOR;
    if (isUpward(stock)) {
      return resolveColor(this.config.statusBar.upColor, 'mygod.stock.upColor');
    }
    if (isDownward(stock)) {
      return resolveColor(this.config.statusBar.downColor, 'mygod.stock.downColor');
    }
    return FLAT_COLOR;
  }

  dispose(): void {
    for (const item of this.items.values()) item.dispose();
    this.items.clear();
  }
}
