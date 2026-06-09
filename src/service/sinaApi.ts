import * as https from 'https';
import * as http from 'http';
import * as url from 'url';
import * as iconv from 'iconv-lite';
import { Stock, Market, detectMarket } from '../model/stock';

const QUOTE_URL = 'https://hq.sinajs.cn/list=';
const SUGGEST_URL = 'https://suggest3.sinajs.cn/suggest/key=';
const REFERER = 'https://finance.sina.com.cn';
const TIMEOUT_MS = 5000;
const MAX_SEARCH_RESULTS = 20;

export interface SearchResult {
  code: string;
  name: string;
  type: string;
  market: Market;
}

function fetchBuffer(target: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(target);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        ...parsed,
        method: 'GET',
        headers: {
          Referer: REFERER,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 mygod-stock'
        }
      },
      res => {
        if ((res.statusCode || 0) >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c as Buffer));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

async function httpGetGbk(target: string): Promise<string> {
  let buf: Buffer;
  try {
    buf = await fetchBuffer(target);
  } catch {
    await sleep(500);
    buf = await fetchBuffer(target);
  }
  try {
    return iconv.decode(buf, 'gbk');
  } catch {
    return buf.toString('utf-8');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function batchQuote(codes: string[]): Promise<Map<string, Stock>> {
  const result = new Map<string, Stock>();
  if (codes.length === 0) return result;
  const text = await httpGetGbk(QUOTE_URL + codes.join(','));
  const lines = text.split('\n');
  for (const line of lines) {
    const parsed = parseQuoteLine(line);
    if (parsed) result.set(parsed.code, parsed);
  }
  return result;
}

function parseQuoteLine(line: string): Stock | null {
  const m = /var hq_str_([^=]+)="([^"]*)"/.exec(line.trim());
  if (!m) return null;
  const code = m[1];
  const payload = m[2];
  if (!payload) return null;
  const market = detectMarket(code);
  switch (market) {
    case 'A':
      return parseAStockLine(code, payload);
    case 'HK':
      return parseHKStockLine(code, payload);
    case 'US':
      return parseUSStockLine(code, payload);
    default:
      return null;
  }
}

function safeFloat(s: string | undefined): number {
  if (!s) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function buildStock(partial: Partial<Stock> & { code: string; name: string; market: Market }): Stock | null {
  const price = partial.price ?? NaN;
  const prevClose = partial.prevClose ?? NaN;
  if (!Number.isFinite(price) || !Number.isFinite(prevClose)) return null;
  const change = Number.isFinite(partial.change as number)
    ? (partial.change as number)
    : price - prevClose;
  const changePct = Number.isFinite(partial.changePct as number)
    ? (partial.changePct as number)
    : prevClose > 0
      ? (change / prevClose) * 100
      : 0;
  return {
    code: partial.code,
    name: partial.name,
    market: partial.market,
    price,
    prevClose,
    open: partial.open ?? NaN,
    high: partial.high ?? NaN,
    low: partial.low ?? NaN,
    change,
    changePct,
    volume: partial.volume ?? 0,
    amount: partial.amount ?? 0,
    date: partial.date ?? '',
    time: partial.time ?? '',
    updatedAt: Date.now()
  };
}

/**
 * A 股: var hq_str_sh600000="名称,今开,昨收,现价,最高,最低,买一,卖一,成交量,成交额,
 *                            买1量,买1价,...,买5量,买5价,卖1量,卖1价,...,卖5量,卖5价,
 *                            日期,时间,..."
 * 32+ 字段
 */
function parseAStockLine(code: string, payload: string): Stock | null {
  const parts = payload.split(',');
  if (parts.length < 32) return null;
  return buildStock({
    code,
    name: parts[0],
    market: 'A',
    open: safeFloat(parts[1]),
    prevClose: safeFloat(parts[2]),
    price: safeFloat(parts[3]),
    high: safeFloat(parts[4]),
    low: safeFloat(parts[5]),
    volume: safeFloat(parts[8]) || 0,
    amount: safeFloat(parts[9]) || 0,
    date: parts[30] || '',
    time: parts[31] || ''
  });
}

/**
 * 港股: var hq_str_hk00700="TENCENT,腾讯控股,今开,昨收,最高,最低,现价,涨跌额,涨跌幅,
 *                           ...,成交量,成交额,...,日期,时间";
 * 字段索引（实测）：
 *   [0] 英文名
 *   [1] 中文名
 *   [2] 今开
 *   [3] 昨收
 *   [4] 最高
 *   [5] 最低
 *   [6] 现价
 *   [7] 涨跌额
 *   [8] 涨跌幅
 *   [9..] ... 成交量/成交额/...
 *   倒数第二位: 日期
 *   倒数第一位: 时间
 */
function parseHKStockLine(code: string, payload: string): Stock | null {
  const parts = payload.split(',');
  if (parts.length < 12) return null;
  const cnName = parts[1] || parts[0];
  const open = safeFloat(parts[2]);
  const prevClose = safeFloat(parts[3]);
  const high = safeFloat(parts[4]);
  const low = safeFloat(parts[5]);
  const price = safeFloat(parts[6]);
  const change = safeFloat(parts[7]);
  const changePct = safeFloat(parts[8]);
  // 成交量/成交额位置不固定，尝试取后段中较大的两个数
  const volIdx = parts.findIndex((_, i) => i >= 9);
  const volume = volIdx >= 0 ? safeFloat(parts[volIdx]) || 0 : 0;
  const amount = volIdx >= 0 ? safeFloat(parts[volIdx + 1]) || 0 : 0;
  const date = parts[parts.length - 2] || '';
  const time = parts[parts.length - 1] || '';
  return buildStock({
    code,
    name: cnName,
    market: 'HK',
    price,
    prevClose,
    open,
    high,
    low,
    change: Number.isFinite(change) ? change : undefined as any,
    changePct: Number.isFinite(changePct) ? changePct : undefined as any,
    volume,
    amount,
    date,
    time
  });
}

/**
 * 美股: var hq_str_gb_aapl="名称,现价,涨跌幅,时间,涨跌额,今开,最高,最低,52周高,52周低,
 *                           成交量,...,昨收,...";
 * 字段索引（实测，gb_ 前缀）：
 *   [0] 名称
 *   [1] 现价
 *   [2] 涨跌幅 (%)
 *   [3] 时间 (yyyy-mm-dd hh:mm:ss)
 *   [4] 涨跌额
 *   [5] 今开
 *   [6] 最高
 *   [7] 最低
 *   [10] 成交量
 *   [26] 昨收
 */
function parseUSStockLine(code: string, payload: string): Stock | null {
  const parts = payload.split(',');
  if (parts.length < 12) return null;
  const name = parts[0];
  const price = safeFloat(parts[1]);
  const changePct = safeFloat(parts[2]);
  const datetime = parts[3] || '';
  const change = safeFloat(parts[4]);
  const open = safeFloat(parts[5]);
  const high = safeFloat(parts[6]);
  const low = safeFloat(parts[7]);
  const volume = safeFloat(parts[10]) || 0;
  const prevClose = parts.length > 26 ? safeFloat(parts[26]) : NaN;
  // 拆分日期/时间
  const dt = datetime.split(' ');
  const date = dt[0] || '';
  const time = dt[1] || '';
  return buildStock({
    code,
    name,
    market: 'US',
    price,
    prevClose: Number.isFinite(prevClose) ? prevClose : price - change,
    open,
    high,
    low,
    change: Number.isFinite(change) ? change : undefined as any,
    changePct: Number.isFinite(changePct) ? changePct : undefined as any,
    volume,
    amount: 0,
    date,
    time
  });
}

// ─── 搜索 ──────────────────────────────────────────

const MARKET_PRIORITY: Record<Market, number> = { A: 0, HK: 1, US: 2, OTHER: 3 };

function classifyMarket(code: string, type: string): Market {
  const m = detectMarket(code);
  if (m !== 'OTHER') return m;
  // 部分 type 提示：'us' 类
  if (/^(us|gb_|osr|usr_)/i.test(type)) return 'US';
  if (/^hk/i.test(type)) return 'HK';
  return 'OTHER';
}

export async function search(keyword: string): Promise<SearchResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  let text: string;
  try {
    text = await httpGetGbk(SUGGEST_URL + encodeURIComponent(trimmed));
  } catch {
    return [];
  }
  const m = /var suggestvalue="([^"]*)"/.exec(text);
  if (!m || !m[1]) return [];
  const items = m[1].split(';');
  const results: SearchResult[] = [];
  for (const raw of items) {
    const parts = raw.split(',');
    if (parts.length < 4) continue;
    const name = parts[0];
    const type = parts[1];
    const symbol = parts[2]; // 形如 sh600000 / rt_hk00700 / gb_aapl / rt_usr_xxx
    const rawCode = parts[3]; // 港股/美股可能为 00700 / aapl 等无前缀形式
    const code = normalizeCode(symbol, rawCode, type);
    if (!code || !name) continue;
    results.push({ code, name, type, market: classifyMarket(code, type) });
  }
  results.sort((a, b) => MARKET_PRIORITY[a.market] - MARKET_PRIORITY[b.market]);
  return results.slice(0, MAX_SEARCH_RESULTS);
}

function normalizeCode(symbol: string, rawCode: string, type: string): string {
  // 优先用 symbol 去掉 rt_ 前缀
  const s = (symbol || '').replace(/^rt_/, '').toLowerCase();
  if (/^(sh|sz)\d{6}$/.test(s)) return s;
  if (/^hk\d{5}$/.test(s)) return s;
  if (/^(gb_|usr_)/.test(s)) return s;
  // symbol 不规范，按 type 兜底为 rawCode 补前缀
  const code = (rawCode || '').toLowerCase();
  const t = (type || '').toLowerCase();
  if (/hk/.test(t) && /^\d{5}$/.test(code)) return 'hk' + code;
  if (/(^|_)us|^gb_|^usr_|^osr/.test(t)) {
    return code.startsWith('gb_') ? code : 'gb_' + code;
  }
  if (/(sh|sz)/.test(t) && /^\d{6}$/.test(code)) {
    return (t.includes('sh') ? 'sh' : 'sz') + code;
  }
  return code;
}
