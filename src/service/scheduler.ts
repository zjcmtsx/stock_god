import * as vscode from 'vscode';
import { Stock } from '../model/stock';
import { batchQuote } from './sinaApi';
import { WatchListStore } from '../store/watchListStore';

export interface SchedulerOptions {
  treeIntervalSec: number;
  statusIntervalSec: number;
}

export class Scheduler {
  private timer: NodeJS.Timeout | undefined;
  private treeNextDue = 0;
  private statusNextDue = 0;
  private treeVisible = false;
  private cache = new Map<string, Stock>();
  private inFlight = false;

  private readonly _onTreeUpdated = new vscode.EventEmitter<void>();
  readonly onTreeUpdated = this._onTreeUpdated.event;

  private readonly _onStatusUpdated = new vscode.EventEmitter<void>();
  readonly onStatusUpdated = this._onStatusUpdated.event;

  constructor(
    private readonly store: WatchListStore,
    private options: SchedulerOptions
  ) {}

  start(): void {
    if (this.timer) return;
    this.treeNextDue = Date.now();
    this.statusNextDue = Date.now();
    this.timer = setInterval(() => this.tick(), 1000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  setTreeVisible(visible: boolean): void {
    const wasVisible = this.treeVisible;
    this.treeVisible = visible;
    if (!wasVisible && visible) {
      this.treeNextDue = Date.now();
      void this.tick();
    }
  }

  updateOptions(options: SchedulerOptions): void {
    const treeChanged = this.options.treeIntervalSec !== options.treeIntervalSec;
    const statusChanged = this.options.statusIntervalSec !== options.statusIntervalSec;
    this.options = options;
    const now = Date.now();
    if (treeChanged) this.treeNextDue = now;
    if (statusChanged) this.statusNextDue = now;
  }

  getCache(): Map<string, Stock> {
    return this.cache;
  }

  getStock(code: string): Stock | undefined {
    return this.cache.get(code);
  }

  async refreshNow(): Promise<void> {
    const now = Date.now();
    this.treeNextDue = now;
    this.statusNextDue = now;
    await this.tick();
  }

  private isActive(): boolean {
    const watchList = this.store.getRawStocks();
    if (watchList.length === 0) return false;
    const statusOrder = this.store.getStatusBarOrder();
    if (!this.treeVisible && statusOrder.length === 0) return false;
    return true;
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    if (!this.isActive()) return;
    const now = Date.now();
    const watchList = this.store.getRawStocks();
    const statusOrder = this.store.getStatusBarOrder();
    const needTree = this.treeVisible && watchList.length > 0 && now >= this.treeNextDue;
    const needStatus = statusOrder.length > 0 && now >= this.statusNextDue;
    if (!needTree && !needStatus) return;

    const codes = new Set<string>();
    if (needTree) for (const s of watchList) codes.add(s.code);
    if (needStatus) for (const c of statusOrder) codes.add(c);
    if (codes.size === 0) return;

    this.inFlight = true;
    try {
      const result = await batchQuote([...codes]);
      for (const [code, stock] of result) {
        this.cache.set(code, stock);
      }
      for (const code of codes) {
        if (!result.has(code)) {
          const old = this.cache.get(code);
          if (old) this.cache.set(code, { ...old, stale: true });
        }
      }
      if (needTree) {
        this.treeNextDue = Date.now() + this.options.treeIntervalSec * 1000;
        this._onTreeUpdated.fire();
      }
      if (needStatus) {
        this.statusNextDue = Date.now() + this.options.statusIntervalSec * 1000;
        this._onStatusUpdated.fire();
      }
    } catch (err) {
      for (const code of codes) {
        const old = this.cache.get(code);
        if (old) this.cache.set(code, { ...old, stale: true });
      }
      const retryDelay = 2000;
      if (needTree) this.treeNextDue = Date.now() + retryDelay;
      if (needStatus) this.statusNextDue = Date.now() + retryDelay;
      if (needTree) this._onTreeUpdated.fire();
      if (needStatus) this._onStatusUpdated.fire();
    } finally {
      this.inFlight = false;
    }
  }

  dispose(): void {
    this.stop();
    this._onTreeUpdated.dispose();
    this._onStatusUpdated.dispose();
  }
}
