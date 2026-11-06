# CQX v0.1 — 轻量富消息文本语言（实验性草案）

CQX（CQ eXtended）是为讨论而设计的实验语法，**并非 OneBot、Satori 或任何平台的官方标准**。目标是在**手写方便、嵌套表达、解析确定性、无损往返**之间取得平衡。

核心思路：**简写是输入层语法糖，`[:name ...]` 是统一规范语法，AST 才是消息的语义模型**。

## 30 秒上手

```text
你好 [@123456]！看看：[img cat.png]
[reply 42] 已处理 [face 14]

[forward]
  [msg user=10001 name="Alice"]早上好！[/msg]
  [msg user=10002 name="Bob"]第一行
第二行[/msg]
  [msg id=987654/]
[/forward]
```

`[@123456]` 代表用户提及；`[@all]` 代表全体提及；`[img cat.png]` 代表图片；`[reply 42]` 代表回复引用；`[forward]` 包含转发节点；`[msg id=987654/]` 引用已有消息（平台是否支持由适配器决定）。

## 1. 语义结构（AST）

文档是消息节点数组，节点只有两类：

- `Text(value)`：原始文本。所有字符（包括前后空格、换行、制表符）都有语义。
- `Element(name, attrs, children, mode)`：结构元素。`name` 是类型名，`attrs` 是字符串键值对，`children` 是节点序列。`mode` 为 `void`（原子元素）或 `block`（容器元素）。区分空容器 `[:x][/x]` 和原子元素 `[:x/]`。

解析器合并相邻文本节点，并移除空文本节点。非 `forward` 容器的所有文本原样保留。所有属性值都是**字符串**：`id=00123` 不会被解释为数字，`active=true` 在语法层面也是字符串，是否需要数值/布尔值由具体元素的 schema 另行验证。

## 2. 通用语法

```text
[:name key=value key2="JSON 字符串"/]        # 原子元素
[:name key=value]内容与子元素[/name]        # 容器元素
```

- 名称：`[A-Za-z][A-Za-z0-9_.-]*`，例如 `at`、`ui.card`、`vendor.poll`。
- 属性名：`[A-Za-z_][A-Za-z0-9_.-]*`。
- 属性格式：`key=value`，可按任意顺序提供，不得重复；等号两边无空格。
- 属性值：不含空白及 `[`、`]`、`"`、`=`、`\` 的简单字符串可不加引号；否则用 **JSON 双引号字符串**，支持 `\"`、`\\`、`\uXXXX` 等。含查询参数的 URL 通常需要引号。
- 自闭合：使用 `/]`。若未自闭合，则必须匹配 `[/name]`。
- 扩展：通用形式 `[:vendor.name ...]` 对未知类型仍可无损解析；能否发送由适配器决定。
- 特别说明：无引号的值如果最后一个字符是 `/`，与 `/]` 的自闭合标记有歧义，请加引号（例如 `src="https://a.test/"`）。

概念性 EBNF（简写规则由封闭的内置表提供）：

```ebnf
document         = { text | element } ;
element          = generic_leaf | generic_block | known_shortform ;
generic_leaf     = "[:", name, { ws, attribute }, "/]" ;
generic_block    = "[:", name, { ws, attribute }, "]",
                   document, "[/", name, "]" ;
attribute        = key, "=", (bare_string | json_string) ;
name             = letter, { letter | digit | "_" | "." | "-" } ;
```

### 简写（封闭表）

| 简写 | 语义上的通用等价形式 |
| --- | --- |
| `[@123]` | `[:at id="123"/]` |
| `[@all]` | `[:at type="all"/]` |
| `[img cat.png]` | `[:img src="cat.png"/]` |
| `[reply 42]` | `[:reply id="42"/]` |
| `[face 14]` | `[:face id="14"/]` |
| `[audio voice.ogg]` | `[:audio src="voice.ogg"/]` |
| `[video clip.mp4]` | `[:video src="clip.mp4"/]` |
| `[file a.pdf name="文档.pdf"]` | `[:file name="文档.pdf" src="a.pdf"/]` |
| `[forward]...[/forward]` | `[:forward]...[/forward]` |
| `[msg user=1]...[/msg]` | `[:msg user="1"]...[/msg]` |
| `[msg id=42/]` | `[:msg id="42"/]` |
| `[b]...[/b]` | `[:b]...[/b]` |
| `[i]...[/i]` | `[:i]...[/i]` |
| `[link href="https://a.test"]点此[/link]` | `[:link href="https://a.test"]点此[/link]` |
| `[code]...[/code]` | `[:code]...[/code]` |

原子简写可省略尾部 `/`；通用形式则不能省略。只对封闭的内置表支持无冒号简写，以避免误把一般的 `[note]` 文本识别为新元素。

## 3. 字面文本与转义

普通文本中的 `&`、`<`、`>` 和 `]` 不需要转义。

- `\[` 表示字面量 `[`，例如 `\[@123]` 被解释为一段文本 `[@123]`，不会触发提及。
- `\\` 表示字面量 `\`。
- 其他反斜杠组合保持原样，例如 `C:\data\work`。
- 没有登记的 `[note]` 被当作普通文本。
- `[:xxx ...]` 与 `[/xxx]` 是保留的标记入口；若要字面显示其标记，请转义左方括号。

输入示例：

```text
普通文本 [note] 不需要转义。
真正 @ 用户：[@123]
字面展示标签：\[@123]
网页 URL 属性：[img "https://example.test/p?q=[1,2]&x=3"]
```

## 4. 结构容器与空白

`forward` 是**结构容器**：只允许 `msg` 子元素。其子元素间的纯排版空白（包括换行、缩进）在解析时忽略；存在非空白普通文本则报错。

`msg` 和其他**混合内容容器**则原样保留其内部文本空白。因而：

```text
[forward]
  [msg user=1]你好[/msg]
  [msg user=2]第一行
第二行[/msg]
[/forward]
```

第二条消息恰好是 `第一行\n第二行`。如果写成 `[msg user=2]\n  第一行...`，开头的换行与两个空格也属于消息正文。这条规则避免了依赖难以预测的 trim 行为。

### `msg` 两种模式

- `[msg id=987654/]`：引用已有消息，原子形式；不能同时声明 `user`。
- `[msg user=10001 name="Alice"]内容[/msg]`：构造带作者的消息，容器形式；不允许同时声明 `id`。

`forward` 可以出现在 `msg` 内作为嵌套消息树，**但目标平台是否实际接受嵌套转发属于适配器能力问题**。

## 5. 无损与规范化

`serialize` 将所有元素输出为通用形式：

- 总是使用 `[:name .../]` / `[:name ...][/name]`；
- 属性名按字典序排序；属性值总是 JSON 双引号字符串；
- 字面文本中的 `\` 和 `[` 总是转义；
- 不主动添加消息文本空白或排版缩进；
- 属性不会自行被推断为数字或布尔值。

对**解析器输出的规范化 AST** 保证：

```text
parse(serialize(ast)) == ast
serialize(parse(serialize(ast))) == serialize(ast)
```

区别：手写输入的空格选项、属性顺序、是否用了简写不是语义 AST 的一部分，因此不承诺还原输入的原始写法。

## 6. 用例

### 图片+提及+回复

```text
[reply 903][@123] 这张图是不是你要找的？[img "https://a.test/cat.png?size=large&v=2"]
```

### 合并转发（包含作者和已存在消息）

```text
[forward]
  [msg user=10001 name="Alice"]你好！[face 14][/msg]
  [msg user=10002 name="Bob"]这是一张猫图：[img cat.png][/msg]
  [msg id=987654/]
[/forward]
```

### 多媒体与自定义节点

```text
发几个文件：[file report.pdf name="年度报告.pdf"] [audio voice.ogg]
[:vendor.card title="今日菜单"]
  [:vendor.button label="查看" action="open_menu"/]
[/vendor.card]
```

### 逐字保留多行消息

```text
[msg user=10001]第一行
  第二行有两个空格缩进
第三行[/msg]
```

### 类型为字符串，不丢前导零

```text
[:vendor.user id=00123 count=02 active=true/]
```

解析后属性分别为 `"00123"`、`"02"`、`"true"`。只有在经过此消息类型的 schema 校验后，才能将特定字段显式转换为其他类型。

## 7. 与平台的边界

CQX 是**内容表示语言**，不是发消息的网络协议，也不代表所有目标平台都有同样的消息能力。适配器需要将 CQX AST 映射到 Satori/OneBot/平台 SDK 的消息模型。

- 支持合并转发的平台可映射 `forward` 和 `msg`；不支持的平台可报错或降级显示（调用方明确指定降级策略）。
- 媒体的 `src` 可以是 URL 或由宿主定义的附件引用（如 `cid:...`），解析文本本身**不会读取文件或自动发起网络请求**。
- 未知扩展节点可无损往返，但默认**不得执行** `action` 之类的字段；它们只是一段数据。
- 对来自普通聊天用户的消息，应使用纯文本入口；**只有显式启用 CQX 解析时才把方括号解析为元素**，否则会引发意外提及和其他语义注入。
- 实际部署需在 AST 之后做 schema 验证、URL/附件策略校验、适配器能力检测、最大深度/节点数/文本长度限制。

## 8. 原型与运行方法

该目录包含：

- `cqx.py`：Python 3.10+ 解析器、规范化序列化器与 JSON AST 输出；
- `test_cqx.py`：回环、嵌套转发、转义、未知扩展、非法语法及限制测试；
- `examples.cqx`：可读的示例文本（多条消息以注释分区，仅供阅读；不要一次当作一条 CQX 消息解析）。

执行：

```bash
python -m unittest -v
python cqx.py parse '你好 [@123]！'
python cqx.py normalize '[img cat.png]'
```

预期规范化输出：`[:img src="cat.png"/]`。

### 原型范围

这是一个**可运行的语法研究原型**，不是生产级库。目前未实现：平台适配器、错误恢复模式、原始源码位置保留、流式增量解析、复杂插件 schema 及自动降级策略。测试只证明覆盖的行为符合此草案，不意味着语言已经充分成熟或获得社区共识。

## 9. 暂不加入的功能（刻意避免复杂化）

- 自动推断数字、布尔或 JSON 对象：先保持所有属性为字符串，避免 `id=00123` 被改成 `123`。
- 同一语法里定义宏、变量、脚本执行：避免消息内容和程序执行混合。
- 基于换行/缩进猜测消息内容：空白必须具有稳定语义。
- 任意 `[tag]` 自动被识别为新元素：扩展只使用 `[:...]`，以免大量普通文本误解析。
- 自动从消息内容检测是否是 CQX：由调用方显式指定格式。
