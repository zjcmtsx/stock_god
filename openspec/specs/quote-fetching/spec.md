# quote-fetching Specification

## Purpose
TBD - created by archiving change bootstrap-stock-watcher. Update Purpose after archive.
## Requirements
### Requirement: 行情数据源接入

系统 SHALL 通过新浪财经 `https://hq.sinajs.cn/list=<codes>` 批量接口获取行情，请求时携带 `Referer: https://finance.sina.com.cn` 头。响应 GBK 文本 SHALL 使用 `iconv-lite` 解码为 UTF-8。每行 SHALL 按 code 前缀分发到对应 parser：A 股（`sh|sz`）、港股（`hk`）、美股（`gb_|usr_`）。各 parser 适配到统一 `Stock` 接口（共享字段：`name/price/prevClose/open/high/low/change/changePct/volume/amount/date/time`）。未知前缀 SHALL 返回 null 不阻塞批量。

#### Scenario: 批量请求多市场股票
- **WHEN** 调度器需要刷新 `[sh600000, hk00700, gb_aapl]`
- **THEN** 系统发起一次 GET 请求 `list=sh600000,hk00700,gb_aapl`，单次响应解析出 3 个 Stock 对象，对应 A/HK/US 各一

#### Scenario: 解析 A 股字段
- **WHEN** 响应行 `var hq_str_sh600000="浦发银行,7.82,7.80,7.85,7.90,7.78,...,2026-06-09,10:32:50"`
- **THEN** 系统解析出 `name=浦发银行, open=7.82, prevClose=7.80, price=7.85, high=7.90, low=7.78, date=2026-06-09, time=10:32:50`，并据此计算 `change=price-prevClose, changePct=change/prevClose*100`

#### Scenario: 解析港股字段
- **WHEN** 响应行 `var hq_str_hk00700="TENCENT,腾讯控股,395.000,398.200,396.400,400.000,394.200,...,2026/06/09,10:32:50,...";`
- **THEN** 系统解析出港股字段（中文名优先）：`name=腾讯控股, open=395.000, prevClose=398.200, price=396.400, high=400.000, low=394.200, date=2026/06/09, time=10:32:50`，并据此计算涨跌

#### Scenario: 解析美股字段
- **WHEN** 响应行 `var hq_str_gb_aapl="Apple Inc.,189.50,1.20,...,...,188.00,190.00,187.50,...,...,...,...,188.30,...";`
- **THEN** 系统解析出 `name=Apple Inc., price=189.50, changePct=1.20, open=188.00, high=190.00, low=187.50, prevClose=188.30`，change 由 price-prevClose 计算

#### Scenario: 单只股票解析失败不影响其它
- **WHEN** 响应中某行格式异常或 code 前缀未知
- **THEN** 该 code 标记为 `unknown`，UI 显示 `--`，其它 code 正常更新

#### Scenario: 网络请求超时
- **WHEN** HTTP 请求超过 5 秒未响应
- **THEN** 系统中止此次请求并重试 1 次（500ms 后），仍失败则保留缓存中上次行情数据

### Requirement: 股票搜索

系统 SHALL 通过 `https://suggest3.sinajs.cn/suggest/key=<keyword>` 提供模糊搜索能力，支持代码、中文名、拼音首字母多种关键字。返回结果 SHALL 包含全市场（A/HK/US/ETF/指数等）候选项，并为每条候选标注 `market` 字段（`A` | `HK` | `US` | `OTHER`）。结果按市场优先级排序：A > HK > US > OTHER，最多保留 20 条。

#### Scenario: 拼音首字母搜索 A 股
- **WHEN** 用户输入 `pfyh`
- **THEN** suggest 返回包含 `浦发银行 sh600000 market=A` 的候选

#### Scenario: 港股代码搜索
- **WHEN** 用户输入 `00700`
- **THEN** suggest 返回包含 `腾讯控股 hk00700 market=HK` 的候选

#### Scenario: 美股关键字搜索
- **WHEN** 用户输入 `aapl`
- **THEN** suggest 返回包含 `Apple Inc gb_aapl market=US`（或 usr_aapl）的候选

#### Scenario: 多市场混合排序
- **WHEN** 关键字同时命中 A 股、港股、美股
- **THEN** A 股结果优先展示在 QuickPick 顶部，港股次之，美股末尾

#### Scenario: 候选数量上限
- **WHEN** suggest 返回超过 20 条结果
- **THEN** 系统截断仅取前 20 条（按市场优先级保留）

### Requirement: GBK 解码与编码鲁棒

系统 SHALL 使用 `iconv-lite` 对响应 buffer 解码为 GBK→UTF-8。如解码失败 SHALL 退回 UTF-8 解码，避免抛出异常阻塞调度器。

#### Scenario: 正常 GBK 响应
- **WHEN** 接口返回 GBK 编码字节
- **THEN** 解码后中文名称（如"浦发银行"）能正确显示

#### Scenario: 异常字节流
- **WHEN** 解码过程抛出异常
- **THEN** 系统捕获异常，退回 UTF-8 解码并记录警告日志，不影响后续轮询

