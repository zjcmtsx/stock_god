## ADDED Requirements

### Requirement: 行情数据源接入

系统 SHALL 通过新浪财经 `https://hq.sinajs.cn/list=<codes>` 批量接口获取行情，请求时携带 `Referer: https://finance.sina.com.cn` 头。响应 GBK 文本 SHALL 使用 `iconv-lite` 解码为 UTF-8，按行解析为结构化对象。

#### Scenario: 批量请求多只股票
- **WHEN** 调度器需要刷新 `[sh600000, sz000001, sz301311]`
- **THEN** 系统发起一次 GET 请求 `list=sh600000,sz000001,sz301311`，单次响应解析出 3 个 Stock 对象

#### Scenario: 解析行情字段
- **WHEN** 响应行 `var hq_str_sh600000="浦发银行,7.82,7.80,7.85,7.90,7.78,...,2026-06-09,10:32:50"`
- **THEN** 系统解析出 `name=浦发银行, open=7.82, prevClose=7.80, price=7.85, high=7.90, low=7.78, date=2026-06-09, time=10:32:50`，并据此计算 `change=price-prevClose, changePct=change/prevClose*100`

#### Scenario: 单只股票解析失败不影响其它
- **WHEN** 响应中某行格式异常（如返回空字符串 `var hq_str_xxx=""`）
- **THEN** 该 code 标记为 `unknown`，UI 显示 `--`，其它 code 正常更新

#### Scenario: 网络请求超时
- **WHEN** HTTP 请求超过 5 秒未响应
- **THEN** 系统中止此次请求并重试 1 次（500ms 后），仍失败则保留缓存中上次行情数据

### Requirement: 股票搜索

系统 SHALL 通过 `https://suggest3.sinajs.cn/suggest/key=<keyword>` 提供模糊搜索能力，支持代码、中文名、拼音首字母多种关键字。

#### Scenario: 拼音首字母搜索
- **WHEN** 用户输入 `pfyh`
- **THEN** suggest 返回包含 `浦发银行 sh600000` 的候选

#### Scenario: 仅返回 A 股
- **WHEN** suggest 返回包含港股、美股、基金等多类型结果
- **THEN** 系统过滤出 A 股（沪市 sh + 深市 sz）作为候选展示，其它类型 v1 忽略

### Requirement: GBK 解码与编码鲁棒

系统 SHALL 使用 `iconv-lite` 对响应 buffer 解码为 GBK→UTF-8。如解码失败 SHALL 退回 UTF-8 解码，避免抛出异常阻塞调度器。

#### Scenario: 正常 GBK 响应
- **WHEN** 接口返回 GBK 编码字节
- **THEN** 解码后中文名称（如"浦发银行"）能正确显示

#### Scenario: 异常字节流
- **WHEN** 解码过程抛出异常
- **THEN** 系统捕获异常，退回 UTF-8 解码并记录警告日志，不影响后续轮询
