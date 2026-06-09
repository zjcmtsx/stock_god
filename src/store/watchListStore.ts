import * as vscode from 'vscode';
import {
  WatchListState,
  WatchListItem,
  Group,
  DEFAULT_WATCH_LIST_STATE,
  DEFAULT_GROUP_ID,
  makeDefaultGroup,
  generateGroupId,
  sortByPinnedThenInsertion
} from '../model/stock';

const STATE_KEY = 'mygod.stock.watchList';
const NAME_MAX_LEN = 20;

export interface AddGroupResult {
  ok: boolean;
  reason?: 'empty' | 'too-long' | 'duplicate';
  group?: Group;
}

export interface RenameGroupResult {
  ok: boolean;
  reason?: 'not-found' | 'is-default' | 'empty' | 'too-long' | 'duplicate';
}

export class WatchListStore {
  private state: WatchListState;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly memento: vscode.Memento) {
    this.state = this.loadAndMigrate();
  }

  private loadAndMigrate(): WatchListState {
    const raw = this.memento.get<any>(STATE_KEY);
    try {
      return migrate(raw);
    } catch (err) {
      void vscode.window.showWarningMessage('分组数据初始化失败，已重置');
      return cloneDefault();
    }
  }

  private async persist(): Promise<void> {
    await this.memento.update(STATE_KEY, this.state);
    this._onDidChange.fire();
  }

  // ─── Stock 查询 ──────────────────────────────────

  getRawStocks(): WatchListItem[] {
    return [...this.state.stocks];
  }

  getStatusBarOrder(): string[] {
    return [...this.state.statusBarOrder];
  }

  has(code: string): boolean {
    return this.state.stocks.some(s => s.code === code);
  }

  find(code: string): WatchListItem | undefined {
    return this.state.stocks.find(s => s.code === code);
  }

  // ─── Group ──────────────────────────────────────

  getGroups(): Group[] {
    return [...this.state.groups].sort((a, b) => a.order - b.order);
  }

  findGroup(id: string): Group | undefined {
    return this.state.groups.find(g => g.id === id);
  }

  getStocksByGroup(groupId: string): WatchListItem[] {
    return sortByPinnedThenInsertion(this.state.stocks.filter(s => s.groupId === groupId));
  }

  async addGroup(name: string): Promise<AddGroupResult> {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    if (trimmed.length > NAME_MAX_LEN) return { ok: false, reason: 'too-long' };
    if (this.state.groups.some(g => g.name === trimmed)) return { ok: false, reason: 'duplicate' };
    const maxOrder = this.state.groups.reduce((m, g) => Math.max(m, g.order), 0);
    const group: Group = {
      id: generateGroupId(),
      name: trimmed,
      isDefault: false,
      order: maxOrder + 1
    };
    this.state.groups.push(group);
    await this.persist();
    return { ok: true, group };
  }

  async renameGroup(id: string, name: string): Promise<RenameGroupResult> {
    const group = this.findGroup(id);
    if (!group) return { ok: false, reason: 'not-found' };
    if (group.isDefault) return { ok: false, reason: 'is-default' };
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    if (trimmed.length > NAME_MAX_LEN) return { ok: false, reason: 'too-long' };
    if (this.state.groups.some(g => g.id !== id && g.name === trimmed)) {
      return { ok: false, reason: 'duplicate' };
    }
    group.name = trimmed;
    await this.persist();
    return { ok: true };
  }

  async removeGroup(id: string): Promise<{ ok: boolean; reason?: 'not-found' | 'is-default' }> {
    const group = this.findGroup(id);
    if (!group) return { ok: false, reason: 'not-found' };
    if (group.isDefault) return { ok: false, reason: 'is-default' };
    for (const s of this.state.stocks) {
      if (s.groupId === id) s.groupId = DEFAULT_GROUP_ID;
    }
    this.state.groups = this.state.groups.filter(g => g.id !== id);
    await this.persist();
    return { ok: true };
  }

  async reorderGroups(srcId: string, targetOrder: number): Promise<void> {
    const sorted = this.getGroups();
    const src = sorted.find(g => g.id === srcId);
    if (!src) return;
    const others = sorted.filter(g => g.id !== srcId);
    const targetIdx = others.findIndex(g => g.order >= targetOrder);
    const insertIdx = targetIdx < 0 ? others.length : targetIdx;
    others.splice(insertIdx, 0, src);
    others.forEach((g, idx) => (g.order = idx));
    await this.persist();
  }

  // ─── Stock 变更 ──────────────────────────────────

  async add(code: string, name: string, groupId: string = DEFAULT_GROUP_ID): Promise<boolean> {
    if (this.has(code)) return false;
    if (!this.findGroup(groupId)) groupId = DEFAULT_GROUP_ID;
    this.state.stocks.push({ code, name, pinned: false, inStatusBar: false, groupId });
    await this.persist();
    return true;
  }

  async remove(code: string): Promise<void> {
    this.state.stocks = this.state.stocks.filter(s => s.code !== code);
    this.state.statusBarOrder = this.state.statusBarOrder.filter(c => c !== code);
    await this.persist();
  }

  async togglePin(code: string): Promise<void> {
    const it = this.find(code);
    if (!it) return;
    it.pinned = !it.pinned;
    await this.persist();
  }

  /**
   * 跨/同组移动股票。
   * codes 多选保持相对顺序；
   * insertBeforeCode = undefined 表示插入到目标分组末尾，
   * 否则插入到该 code 当前位置（即"在它前面"）。
   */
  async moveStocks(
    codes: string[],
    targetGroupId: string,
    insertBeforeCode?: string
  ): Promise<void> {
    if (!this.findGroup(targetGroupId)) return;
    const codeSet = new Set(codes);
    if (codeSet.size === 0) return;
    if (insertBeforeCode && codeSet.has(insertBeforeCode)) return;

    const moving = codes
      .map(c => this.state.stocks.find(s => s.code === c))
      .filter((s): s is WatchListItem => !!s);
    if (moving.length === 0) return;

    const remaining = this.state.stocks.filter(s => !codeSet.has(s.code));

    let insertIdx = remaining.length;
    if (insertBeforeCode) {
      const idx = remaining.findIndex(s => s.code === insertBeforeCode);
      if (idx >= 0) insertIdx = idx;
    } else {
      // 插入到目标分组末尾：找到该分组最后一项之后
      const lastIdx = lastIndexOf(remaining, s => s.groupId === targetGroupId);
      insertIdx = lastIdx >= 0 ? lastIdx + 1 : remaining.length;
    }

    for (const m of moving) {
      const movedToOtherGroup = m.groupId !== targetGroupId;
      m.groupId = targetGroupId;
      if (movedToOtherGroup) m.pinned = false;
    }
    if (insertBeforeCode) {
      const target = this.state.stocks.find(s => s.code === insertBeforeCode);
      if (target) {
        const wasInTargetGroup = moving.every(m => m.groupId === target.groupId);
        if (wasInTargetGroup && !target.pinned) {
          for (const m of moving) m.pinned = false;
        }
      }
    }

    remaining.splice(insertIdx, 0, ...moving);
    this.state.stocks = remaining;
    await this.persist();
  }

  // ─── 状态栏 ──────────────────────────────────────

  async addToStatusBar(code: string, maxItems: number): Promise<'ok' | 'duplicate' | 'over-cap' | 'not-found'> {
    const it = this.find(code);
    if (!it) return 'not-found';
    if (it.inStatusBar) return 'duplicate';
    if (this.state.statusBarOrder.length >= maxItems) return 'over-cap';
    it.inStatusBar = true;
    this.state.statusBarOrder.push(code);
    await this.persist();
    return 'ok';
  }

  async removeFromStatusBar(code: string): Promise<void> {
    const it = this.find(code);
    if (it) it.inStatusBar = false;
    this.state.statusBarOrder = this.state.statusBarOrder.filter(c => c !== code);
    await this.persist();
  }

  async moveStatusBar(code: string, direction: 'left' | 'right'): Promise<void> {
    const idx = this.state.statusBarOrder.indexOf(code);
    if (idx < 0) return;
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= this.state.statusBarOrder.length) return;
    const arr = this.state.statusBarOrder;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    await this.persist();
  }

  /** 拖拽重排 statusBarOrder。多选保持相对顺序；insertBeforeCode 为 undefined 时插入到末尾。 */
  async reorderStatusBar(codes: string[], insertBeforeCode?: string): Promise<void> {
    const order = this.state.statusBarOrder;
    const codeSet = new Set(codes);
    if (insertBeforeCode && codeSet.has(insertBeforeCode)) return;
    const moving = codes.filter(c => order.includes(c));
    if (moving.length === 0) return;
    const remaining = order.filter(c => !codeSet.has(c));
    let idx = remaining.length;
    if (insertBeforeCode) {
      const i = remaining.indexOf(insertBeforeCode);
      if (i >= 0) idx = i;
    }
    remaining.splice(idx, 0, ...moving);
    this.state.statusBarOrder = remaining;
    await this.persist();
  }

  async applyMaxItemsCap(maxItems: number): Promise<string[]> {
    if (this.state.statusBarOrder.length <= maxItems) return [];
    const removed = this.state.statusBarOrder.slice(maxItems);
    this.state.statusBarOrder = this.state.statusBarOrder.slice(0, maxItems);
    for (const code of removed) {
      const it = this.find(code);
      if (it) it.inStatusBar = false;
    }
    await this.persist();
    return removed;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

function lastIndexOf<T>(arr: T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}

function cloneDefault(): WatchListState {
  return {
    version: 2,
    groups: [makeDefaultGroup()],
    stocks: [],
    statusBarOrder: []
  };
}

function migrate(raw: any): WatchListState {
  if (!raw || typeof raw !== 'object') return cloneDefault();

  // v1
  if (raw.version === 1 && Array.isArray(raw.stocks)) {
    const stocks: WatchListItem[] = raw.stocks.map((s: any) => ({
      code: fixLegacyCode(String(s.code)),
      name: String(s.name ?? ''),
      pinned: !!s.pinned,
      inStatusBar: !!s.inStatusBar,
      groupId: DEFAULT_GROUP_ID
    }));
    return {
      version: 2,
      groups: [makeDefaultGroup()],
      stocks,
      statusBarOrder: Array.isArray(raw.statusBarOrder)
        ? raw.statusBarOrder.map((c: any) => fixLegacyCode(String(c)))
        : []
    };
  }

  // v2
  if (raw.version === 2 && Array.isArray(raw.groups) && Array.isArray(raw.stocks)) {
    const hasDefault = raw.groups.some((g: any) => g?.isDefault === true || g?.id === DEFAULT_GROUP_ID);
    const groups: Group[] = raw.groups.map((g: any) => ({
      id: String(g.id),
      name: String(g.name ?? ''),
      isDefault: !!g.isDefault,
      order: typeof g.order === 'number' ? g.order : 0
    }));
    if (!hasDefault) groups.unshift(makeDefaultGroup());
    const validIds = new Set(groups.map(g => g.id));
    const stocks: WatchListItem[] = raw.stocks.map((s: any) => ({
      code: fixLegacyCode(String(s.code)),
      name: String(s.name ?? ''),
      pinned: !!s.pinned,
      inStatusBar: !!s.inStatusBar,
      groupId: validIds.has(String(s.groupId)) ? String(s.groupId) : DEFAULT_GROUP_ID
    }));
    return {
      version: 2,
      groups,
      stocks,
      statusBarOrder: Array.isArray(raw.statusBarOrder)
        ? raw.statusBarOrder.map((c: any) => fixLegacyCode(String(c)))
        : []
    };
  }

  return cloneDefault();
}

/**
 * 兼容旧数据：早期 search 返回的 code 可能丢失市场前缀。
 *  - 5 位纯数字 → 港股，加 `hk`
 *  - 1~5 位纯字母 → 美股，加 `gb_`
 * 已带前缀的不动。
 */
function fixLegacyCode(code: string): string {
  const c = (code || '').toLowerCase().trim();
  if (/^(sh|sz)\d{6}$/.test(c)) return c;
  if (/^hk\d{5}$/.test(c)) return c;
  if (/^(gb_|usr_)/.test(c)) return c;
  if (/^\d{5}$/.test(c)) return 'hk' + c;
  if (/^[a-z]{1,5}$/.test(c)) return 'gb_' + c;
  return c;
}
