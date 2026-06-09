import * as vscode from 'vscode';
import { Scheduler } from '../service/scheduler';
import { WatchListStore } from '../store/watchListStore';
import { isUpward, isDownward } from '../model/stock';

export class StockDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly store: WatchListStore
  ) {}

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== 'mygodstock') return undefined;
    const code = uri.path.replace(/^\/+/, '').replace(/^stock\//, '');
    const stock = this.scheduler.getStock(code);
    const watch = this.store.find(code);

    let color: vscode.ThemeColor | undefined;
    if (stock) {
      if (isUpward(stock)) color = new vscode.ThemeColor('mygod.stock.upColor');
      else if (isDownward(stock)) color = new vscode.ThemeColor('mygod.stock.downColor');
    }

    let badge: string | undefined;
    let tooltip: string | undefined;
    if (watch?.inStatusBar) {
      badge = 'S';
      tooltip = '已添加至状态栏';
    } else if (watch?.pinned) {
      badge = 'P';
      tooltip = '已置顶';
    }

    if (!color && !badge) return undefined;
    return new vscode.FileDecoration(badge, tooltip, color);
  }

  refresh(uris?: vscode.Uri[]): void {
    this._onDidChange.fire(uris);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
