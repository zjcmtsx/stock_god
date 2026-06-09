export type Market = 'A' | 'HK' | 'US' | 'OTHER';

export interface Stock {
  code: string;
  name: string;
  market?: Market;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
  amount: number;
  date: string;
  time: string;
  updatedAt: number;
  stale?: boolean;
}

export interface Group {
  id: string;
  name: string;
  isDefault: boolean;
  order: number;
}

export const DEFAULT_GROUP_ID = 'default';
export const DEFAULT_GROUP_NAME = '默认分组';

export function makeDefaultGroup(): Group {
  return {
    id: DEFAULT_GROUP_ID,
    name: DEFAULT_GROUP_NAME,
    isDefault: true,
    order: 0
  };
}

export function generateGroupId(): string {
  return 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export interface WatchListItem {
  code: string;
  name: string;
  pinned: boolean;
  inStatusBar: boolean;
  groupId: string;
}

export interface WatchListState {
  version: 2;
  groups: Group[];
  stocks: WatchListItem[];
  statusBarOrder: string[];
}

export const DEFAULT_WATCH_LIST_STATE: WatchListState = {
  version: 2,
  groups: [makeDefaultGroup()],
  stocks: [],
  statusBarOrder: []
};

export function placeholderStock(code: string, name: string): Stock {
  return {
    code,
    name,
    price: NaN,
    prevClose: NaN,
    open: NaN,
    high: NaN,
    low: NaN,
    change: NaN,
    changePct: NaN,
    volume: 0,
    amount: 0,
    date: '',
    time: '',
    updatedAt: 0
  };
}

export function isUpward(s: Stock): boolean {
  return Number.isFinite(s.changePct) && s.changePct > 0;
}

export function isDownward(s: Stock): boolean {
  return Number.isFinite(s.changePct) && s.changePct < 0;
}

export function detectMarket(code: string): Market {
  if (/^(sh|sz)\d{6}$/.test(code)) return 'A';
  if (/^hk\d{5}$/.test(code)) return 'HK';
  if (/^(gb_|usr_)/.test(code)) return 'US';
  return 'OTHER';
}

/** 在分组内排序：置顶在前（按数组中出现顺序），其后为非置顶（按数组中出现顺序）。 */
export function sortByPinnedThenInsertion(items: WatchListItem[]): WatchListItem[] {
  const pinned: WatchListItem[] = [];
  const others: WatchListItem[] = [];
  for (const it of items) {
    if (it.pinned) pinned.push(it);
    else others.push(it);
  }
  return [...pinned, ...others];
}
