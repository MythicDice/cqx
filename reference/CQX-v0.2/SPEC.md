# CQX v0.2 规范（草案）

**CQ eXtended — 轻量富消息文本表示法**  
**版本：** `0.2-draft`  
**发布日期：** 2026-11-06  
**规范状态：** 实验性草案（独立设计，无历史语法兼容约束）

CQX 使用纯文本同时表示普通文字、富消息段和嵌套消息结构。日常输入使用短标签，程序存储与传输使用规范形式。两种写法具有同一套抽象消息树。

> **设计原则：随手写效果等效，规范表示结构无损。**  
> 对常见消息，简写只要求在相同发送上下文中得到预期的消息效果；规范形式确保消息结构能够确定地往返。解析器只负责文本和结构；消息 ID、资源路径、权限及发送行为由适配器解释。

文中 **必须** 为规范性要求，**应该** 为建议，**可以** 为可选能力。示例中的 `cqx` 代码块表示 CQX 输入，而非某个聊天平台原生命令。

## 目录

1. [消息格式](#1-消息格式)
2. [标签和名称](#2-标签和名称)
3. [属性及位置参数](#3-属性及位置参数)
4. [正文与转义](#4-正文与转义)
5. [内置消息元素](#5-内置消息元素)
6. [合并转发与消息引用](#6-合并转发与消息引用)
7. [原样代码](#7-原样代码)
8. [空白规则](#8-空白规则)
9. [AST 数据模型](#9-ast-数据模型)
10. [规范化序列化](#10-规范化序列化)
11. [严格解析与错误处理](#11-严格解析与错误处理)
12. [版本与兼容性](#12-版本与兼容性)
13. [安全及适配器](#13-安全及适配器)
14. [测试向量](#14-测试向量)
15. [附录：词法与形式文法](#15-附录词法与形式文法)

---

## 1. 消息格式

### 1.1 基本消息

CQX 文档是由纯文本与消息元素组成的 Unicode 字符序列。元素之间可直接连接，无需分隔符。

```cqx
你好，[@123456]！
[reply 98765]这是图片：[img cat.png]
收到啦。[face 14]
```

上例依次包含文本、用户提及、回复引用、图片和平台表情。正文中的换行予以保留。

### 1.2 简写与通用写法

**简写**用于日常输入：

```cqx
[@123]
[@all]
[img cat.png]
[img https://example.org/a/?x=1&y=2]
[reply 42]
```

**通用写法**用于扩展、数据交换和规范化输出：

```cqx
[:at id="123"/]
[:at type="all"/]
[:img src="cat.png"/]
[:reply id="42"/]
[:org.example.poll title="选一个"]内容[/org.example.poll]
```

简写在语法分析阶段展开为通用 AST。**同一 AST 可以有多种可手写的输入形式，但只对应一种规范化文本形式。**

### 1.3 消息效果与结构等效

这里的*效果等效*指：在同一解析版本、适配器上下文和平台能力下，两个合法输入产生同样的规范化消息树，或经适配器明确规定的便利规则产生相同消息效果。

例如：

```cqx
[img cat.png]
[:img src="cat.png"/]
```

二者解析成相同 AST。

资源 `cat.png` 的具体位置由适配器决定；消息语法本身不读取文件。解析器不得依赖运行时上下文猜测标签边界或改变正文字符。

---

## 2. 标签和名称

### 2.1 原子元素

原子元素没有子节点。

```cqx
[:img src="cat.png"/]
```

通用原子元素以 `/]` 结束。

常见原子元素可以使用以 `]` 结束的简写：

```cqx
[img cat.png]
[audio voice.ogg]
[file report.pdf]
```

**原子简写中的尾随 `/` 属于位置参数内容**：

```cqx
[img https://example.org/a/]
```

对应 `src="https://example.org/a/"`。这使常见 URL 和路径能够直接粘贴。

通用原子元素仍使用 `/]` 作为语法终止符。通用写法中的**最后一个裸属性值**若以 `/` 结尾，应使用引号保留该字符：

```cqx
[:img src="https://example.org/a/"/]
```

对比：`[:img src=https://example.org/a/]` 的 `src` 为 `https://example.org/a`，末尾 `/` 作为结束符的一部分。

### 2.2 容器元素

容器元素可以包含文本和其他元素。开始标签和结束标签使用同一个元素名：

```cqx
[b]重点[/b]
[link href=https://example.org]详情[/link]
[:vendor.panel title="信息"]内容[/vendor.panel]
```

通用容器形式：

```text
[:name attr=value]子内容[/name]
```

已登记的容器简写形式：

```text
[name attr=value]子内容[/name]
```

`[:x/]` 为原子元素；`[:x][/x]` 为空容器。这两种 AST 模式不同。短容器起始标签同样只以 `]` 结束，属性裸值末尾的 `/` 属于值，例如 `[link https://example.org/a/]网页[/link]`。容器必须显式写结束标签。

### 2.3 名称

元素名满足：

```regex
[A-Za-z][A-Za-z0-9_.-]*
```

属性名满足：

```regex
[A-Za-z_][A-Za-z0-9_.-]*
```

名称区分大小写。内置元素名全部为小写 ASCII。扩展元素推荐使用带命名空间的通用名称，例如 `org.example.poll`、`acme.card`。

只有本规范登记的简写名称可以省略 `:`。未知元素使用 `[:name ...]` 形式；解析器必须保留其名称、属性、原子/容器模式及子内容。

### 2.4 简写表在版本内固定

CQX v0.2 的简写名称为：

- 原子：`[@identifier]`、`img`、`reply`、`face`、`audio`、`video`、`file`、`ref`。
- 容器：`b`、`i`、`code`、`link`、`forward`、`msg`。
- 特殊原样形式：`[code raw]...[/code]`。

扩展插件不得自行注册新的 v0.2 简写名称。新增简写需要新的语法版本。

---

## 3. 属性及位置参数

### 3.1 属性语法

属性写作 `name=value`，多个属性之间使用结构空白分隔。属性名和 `=`、`=` 和属性值之间不允许空格。属性名在同一元素内必须唯一。

```cqx
[:img src=cat.png alt="一只猫"/]
[file report.pdf name="年度报告.pdf"]
```

属性值在词法层**全部为字符串**。例如 `id=00123` 保存为 `"00123"`，`active=true` 保存为 `"true"`。元素 schema 可以在后续校验阶段解释类型。

### 3.2 裸值

裸值为非空字符串，可包含字母、数字、冒号、斜线、问号、`&`、`=`、`#`、逗号、点号等字符。

裸值不能包含：

- 结构空白：`U+0009`、`U+000A`、`U+000D`、`U+0020`；
- `[`、`]`、双引号 `"`、反斜杠 `\`。

`=` 在**属性值内部**合法，以下输入无需加引号：

```cqx
[img https://example.org/a.png?size=2&format=webp]
[:link href=https://example.org/?q=cat&page=2]猫[/link]
```

结构标签的 `]`、通用原子标签的 `/]` 仍按第 2 节的规则终止标记。

### 3.3 引号值

引号值使用 JSON 双引号字符串规则，包括 `\"`、`\\`、`\n`、`\t`、`\uXXXX` 等转义。

```cqx
[img "cat photo.png"]
[:img src="https://example.org/?q=[cat]"/]
[:file src="cid:abc" name="Alice 的\"照片\".png"/]
```

需要写空字符串时使用 `""`。内置元素的必需标识符或地址不得为空；扩展元素可以使用空字符串属性。

### 3.4 位置参数

下列简写允许省略一个常用属性名：

| 简写 | 位置参数对应属性 | 示例 |
|---|---|---|
| `img` | `src` | `[img cat.png]` |
| `audio` | `src` | `[audio voice.ogg]` |
| `video` | `src` | `[video clip.mp4]` |
| `file` | `src` | `[file report.pdf]` |
| `reply` | `id` | `[reply 42]` |
| `face` | `id` | `[face 14]` |
| `ref` | `id` | `[ref 42]` |
| `link` | `href` | `[link https://example.org]网页[/link]` |

每个简写最多一个位置参数；`link` 是唯一支持位置参数的容器简写。若位置参数与同名的命名属性同时出现，解析器必须报错。

**命名属性优先规则：** 当一个未加引号的 token 从起始位置满足 `合法属性名=` 时，解析为命名属性。其他合法 token 可以是位置参数。

```cqx
[img src=https://example.org/?x=1]   # src 命名属性
[img https://example.org/?x=1]       # src 位置参数
[img "foo=bar"]                      # src 字面值 foo=bar
```

上面的 `#` 后说明文字仅用于文档解释，**CQX 本身没有注释语法**。在实际消息里，行尾的 `# ...` 会成为正文文本。

例如 `[img foo=bar]` 将 `foo=bar` 视为命名属性；该输入缺少 `src`，严格解析器报错。如需资源名 `foo=bar`，写 `[img "foo=bar"]`。

通用写法 `[:name ...]` 只允许命名属性。

### 3.5 结构空白

所有标签识别、属性分隔以及 `forward` 排版空白共用固定集合：

| 字符 | 码点 |
|---|---|
| 水平制表符 HT | U+0009 |
| 换行 LF | U+000A |
| 回车 CR | U+000D |
| 空格 SP | U+0020 |

U+00A0 等其他 Unicode 空白不参与标签起始识别。比如 `[img cat.png]`（中间是 U+00A0）作为普通文本保留。

---

## 4. 正文与转义

### 4.1 普通文字

正文中的 `&`、`<`、`>`、`,`、`=`、`]` 直接保留。没有被识别为标签的方括号文本也原样保留。

```cqx
这是普通文字：[note]、[1,2,3]、a&b、<x>。
```

### 4.2 正文转义

正文只定义两种反斜杠转义：

| 输入 | 解析结果 |
|---|---|
| `\[` | 字面字符 `[` |
| `\\` | 字面字符 `\` |

其他正文反斜杠序列保留原样：

```cqx
真正的提及：[@123]
字面的提及：\[@123]
Windows 路径：C:\Users\Alice
```

规范化序列化器必须对所有正文中的 `\` 和 `[` 执行相应转义，从而确保任意合法纯文本在重解析时继续是纯文本。

### 4.3 标签候选与纯文本边界

解析器按以下优先级识别：

1. 正文转义 `\[`、`\\`；
2. 完整的合法结束标记 `[/name]`；
3. 完整的 `[@identifier]`；
4. 以 `[:` 开始的通用标记；
5. 名称属于第 2.4 节固定简写表且后接结构空白、`]` 或 `/` 的短标签；
6. 其余字符按正文保存。

`identifier` 满足 `[A-Za-z0-9_.-]+`。`[@all]` 专指全体成员；要提及 ID 字面值 `all`，写 `[:at id="all"/]`。

被识别的标签候选若格式或 schema 错误，严格解析器必须报错。例如 `[img]` 是缺失 `src` 的已识别短标签；`[note]` 则是普通文本。

---

## 5. 内置消息元素

### 5.1 原子元素

| 类型 | 简写 | 必需属性 | 已定义可选属性 | 语义 |
|---|---|---|---|---|
| `at` | `[@123]` / `[@all]` | `id` 或 `type=all` | — | 提及用户或全体成员 |
| `img` | `[img cat.png]` | `src` | `alt` | 图片 |
| `reply` | `[reply 42]` | `id` | `platform`、`account`、`channel` | 回复引用 |
| `face` | `[face 14]` | `id` | — | 平台表情 |
| `audio` | `[audio voice.ogg]` | `src` | — | 音频 |
| `video` | `[video demo.mp4]` | `src` | — | 视频 |
| `file` | `[file report.pdf]` | `src` | `name` | 文件 |

`at` 必须恰好指定 `id`（非空）或 `type="all"`。其他内置原子类型的必需属性必须是非空字符串。

元素可以携带扩展属性；解析器必须原样保留。适配器解释已知属性，并在发送前进行平台能力验证。

### 5.2 容器元素

| 类型 | 简写 | 必需属性 | 语义 |
|---|---|---|---|
| `b` | `[b]...[/b]` | — | 加粗样式 |
| `i` | `[i]...[/i]` | — | 斜体样式 |
| `code` | `[code]...[/code]` | — | 代码样式 |
| `link` | `[link https://a.test]网页[/link]` | `href` | 超链接 |
| `forward` | `[forward]...[/forward]` | 见第 6 节 | 合并转发 |
| `msg` | `[msg user=...]...[/msg]` | 见第 6 节 | 转发消息节点 |

其中 `b`、`i`、`code`、`link` 可以在正文中嵌套使用；`msg` 的直接父元素必须是 `forward` 容器。`link.href` 必须非空。

`[code]...[/code]` 中仍会正常解析 CQX 元素；直接粘贴包含 CQX 标记的代码时使用第 7 节的 `[code raw]`。

### 5.3 回复作用域

`reply` 的 `id` 是字符串；`platform`、`account`、`channel` 可指定引用作用域：

```cqx
[reply 42]
[:reply id="42" platform="qq" account="bot-1" channel="room-7"/]
```

省略作用域时，适配器使用当前发送上下文。跨会话引用所需字段由平台适配器检查；无法定位的引用应返回明确的引用解析错误。

### 5.4 资源标识符

`img`、`audio`、`video`、`file` 的 `src` 是字符串资源标识符，可采用 URL、相对资源标识或宿主约定的 `cid:` 引用。

```cqx
[img cat.png]
[img https://example.org/cat.jpg]
[:img src="cid:sha256-example"/]
```

解释相对路径、可访问资源、媒体格式及下载权限的职责属于资源解析器和发送适配器。长期存储可以为消息附加独立资源清单。

---

## 6. 合并转发与消息引用

### 6.1 构造合并转发

`forward` 容器直接包含一个或多个 `msg` 元素：

```cqx
[forward]
  [msg user=10001 name=Alice]你好[/msg]
  [msg user=10002 name=Bob]看看这个：[img cat.png][/msg]
  [ref 987654]
[/forward]
```

直接子节点间的 ASCII 结构空白用于排版，由解析器忽略。`forward` 直接出现其他文本或元素时，严格解析器报错；空的 `forward` 容器也报错。

### 6.2 自定义消息节点

```cqx
[msg user=10001 name=Alice]你好！[img cat.png][/msg]
```

自定义消息节点必须为 `block` 模式，要求 `user` 非空，禁止 `id`。可选属性：

| 属性 | 含义 | 格式 |
|---|---|---|
| `name` | 显示名称 | 字符串 |
| `time` | 消息时间 | RFC 3339 子集：`YYYY-MM-DDThh:mm:ss[.fraction](Z|±hh:mm)`；秒为 00–59 |
| `avatar` | 头像资源引用 | 字符串 |
| `platform` / `account` / `channel` | 来源作用域 | 字符串 |

缺失 `name`、`avatar` 或 `time` 时，适配器按目标平台的能力补全或省略这些元信息。

### 6.3 引用已有消息

**推荐简写：**

```cqx
[ref 987654]
```

它展开为：

```cqx
[:msg id="987654"/]
```

引用节点必须为 `void` 模式，要求非空 `id`，禁止 `user`、`name`。`ref` 只允许作为 `forward` 容器的直接子节点。

`[msg id=42/]` 会把 `42/` 读作 `id` 属性值并继续等待 `[/msg]`；引用已有消息时使用 `[ref 42]` 或 `[:msg id="42"/]`。

### 6.4 引用已有合并转发

`forward` 的原子形式表示平台已有的合并转发记录：

```cqx
[:forward id="f123"/]
```

原子 `forward` 必须有非空 `id`，不得有子节点。容器 `forward` 不得有 `id` 属性，必须包含至少一个 `msg` 节点。引用形式可以具有 `platform`、`account`、`channel` 等上下文属性。

### 6.5 嵌套转发

语法允许 `msg` 的正文再包含 `forward`：

```cqx
[forward]
  [msg user=1]这是一条内嵌转发：[:forward id="f123"/][/msg]
[/forward]
```

某些平台仅支持有限的转发层级。适配器应验证目标平台能力并决定发送或报告不支持。

### 6.6 转发空白

```cqx
[forward]
  [msg user=1]第一行
第二行[/msg]
  [ref 42]
[/forward]
```

上例第一条消息的正文精确为 `第一行\n第二行`。若换行放在 `[msg user=1]` 后方，换行与缩进进入该消息的正文。格式化器应据此排版。

---

## 7. 原样代码

为改善直接粘贴代码、协议片段和 CQX 教程的体验，v0.2 新增：

```text
[code raw]
print("[@all]")
print("[img cat.png]")
[/code]
```

`[code raw]` 中的正文直接读取为纯文本，直到遇到第一个未转义的 `[/code]`。其中的提及、图片、普通方括号、反斜杠均按字面字符保留。

如需在原样正文中插入字面关闭标记，使用 `\[/code]`：

```cqx
[code raw]这里展示 \[/code] 这个关闭标签[/code]
```

其解析结果是一个 `code` 容器，正文为 `这里展示 [/code] 这个关闭标签`。原样正文仅把 `\[/code]` 解释为字面 `[/code]`；其他反斜杠均原样保留。

**原样修饰符只适用于简写 `[code raw]`。** 它是输入阶段的语法糖：最终 AST 是普通 `code` 容器，子节点为一个 Text 节点；规范化输出会自动将正文中的 `[`、`\` 转义。

```cqx
[:code]print("\[@all]")
\[img cat.png][/code]
```

此处的两行代码使用真实换行；规范化序列化也保留真实换行字符。`[:code raw="true"]` 只是携带额外属性的普通 `code` 容器，内部依照正常 CQX 语法解析。

---

## 8. 空白规则

1. 一般正文必须保留全部 Unicode 字符、缩进和换行，包含 `CRLF` 与组合字符；解析器不执行 Unicode 归一化。
2. `forward` **容器**直接包含的纯结构空白节点被删除；其中 ASCII 结构空白定义见第 3.5 节。
3. `msg` 内的正文保留所有字符；不自动 trim、dedent、统一换行。
4. 扩展容器内的所有正文空白保留。扩展 schema 可以拒绝不合适的文本节点，但基础解析器不得擅自删除。

例：

```cqx
[forward]
  [msg user=1]
    第一行
    第二行
  [/msg]
[/forward]
```

`msg` 的正文包含开头与结尾的真实换行，以及每行的四个空格。

---

## 9. AST 数据模型

### 9.1 节点类型

Document 是有序节点数组。节点共有两种：

```json
{"type":"text","text":"你好 "}
```

```json
{
  "type": "element",
  "name": "at",
  "attrs": {"id": "123"},
  "mode": "void",
  "children": []
}
```

`mode` 仅有 `void` 和 `block`。原子节点必须有空的 `children`；容器节点保留 `block` 模式，即使没有子节点。属性名及其字符串值均为 Unicode 标量值序列；名称另须满足第 2.3 节的 ASCII 正则要求。

### 9.2 正规化

定义 `normalizeAST(T)`：

1. 校验所有节点的类型、模式、名称、属性、合法 Unicode 和核心内置 schema。
2. 合并相邻 Text 节点；移除空 Text 节点。
3. 将属性按名称的 ASCII 顺序排列。语义比较时将属性视为映射。
4. 删除 `forward` 容器中的纯结构空白 Text 节点。
5. 校验父子关系：`msg` 的直接父节点必须是 `forward` 容器，`forward` 容器至少有一个 `msg` 子节点。
6. 保留未知扩展元素、元素顺序、属性值及 `void` / `block` 差异。

含非法节点、无效必需属性或非法父子关系的 AST 必须被拒绝。外部构造的 AST 与文本输入一样，必须接受嵌套深度和节点数量限制。

### 9.3 等价关系

规范化 AST `A` 与 `B` 等价，要求：

- Document 节点顺序一致；
- Text 字符逐码点相等；
- Element 名称、模式、属性映射、规范化子节点依次相等。

两个文本输入可因简写或 `forward` 结构缩进不同而生成同一个规范化 AST。源文本的字面排版形式不属于 AST 保留的信息。

---

## 10. 规范化序列化

定义 `serializeCanonical(T)`，首先执行 `normalizeAST(T)`，然后将其编码成唯一规范文本：

1. 每个元素均输出通用标签 `[:name .../]` 或 `[:name ...]...[/name]`。
2. 属性按 ASCII 名称升序排列，并全部输出为 JSON 双引号字符串。
3. JSON 字符串使用 `\b`、`\f`、`\n`、`\r`、`\t`、`\"`、`\\` 及需要时的小写 `\u00xx` 转义。其他 Unicode 标量值直接输出；不转义斜线 `/`。
4. Text 内的 `\` 输出 `\\`，`[` 输出 `\[`；其余字符原样输出。
5. 相邻节点直接连接，不添加空格或换行；`forward` 的结构排版空白已在正规化阶段移除。
6. 保留原有元素顺序和原子/容器模式。

输入：

```cqx
你好 [@00123]！[img https://example.org/a/?x=1]
```

规范化输出：

```cqx
你好 [:at id="00123"/]！[:img src="https://example.org/a/?x=1"/]
```

对每个合法外部 AST `T`，必须满足：

```text
parse(serializeCanonical(T)) == normalizeAST(T)
serializeCanonical(parse(serializeCanonical(T))) == serializeCanonical(T)
```

解析器对合法人类输入得到的 AST 应满足上述同样性质。

---

## 11. 严格解析与错误处理

### 11.1 阶段

严格解析器按以下顺序执行：

1. 检查输入 Unicode 标量值；以字节接收时使用严格 UTF-8 解码。
2. 扫描正文转义和标签候选，使用固定结构空白字符表。
3. 扫描引号及通用 `/]` 结束符，读取属性和位置参数。
4. 匹配容器标签；`[code raw]` 使用第 7 节的专用原样读取规则。
5. 形成 `Text` / `Element` 树，展开 `[@...]` 与 `ref` 等简写。
6. 应用第 9 节的 AST 正规化和语义校验。

严格模式遇到错误必须停止并报告诊断代码及错误位置。错误位置采用**从 0 开始的 Unicode 码点偏移**，可附加行号和列号。

### 11.2 基本诊断代码

| 代码 | 类别 | 示例 |
|---|---|---|
| `E_TAG` | 标签未闭合或不可读取 | `[:x` |
| `E_NAME` | 元素或属性名称不合法 | `[:1x/]` |
| `E_ATTR` | 属性格式或字符串非法 | `[:x a=]` |
| `E_ATTR_DUP` | 重复属性 | `[:x a=1 a=2/]` |
| `E_CLOSE` | 结束标记不匹配 | `[b]x[/i]` |
| `E_SCHEMA` | 内置元素违反结构规则 | `[img]` |
| `E_PARENT` | 元素放置位置不合法 | 根级 `[ref 42]` |
| `E_SHORT_CLOSE` | 没有属性值的容器简写尝试自闭合 | `[b/]` |
| `E_RAW_CLOSE` | 原样代码缺少关闭标记 | `[code raw]...` |
| `E_UNICODE` | Unicode 字符序列非法 | 未配对的代理码位 |
| `E_LIMIT` | 超过实现资源限制 | 超过最大嵌套深度 |

AST 构造 API 应提供相同的语义检查及可定位的节点路径。错误恢复与宽容模式可以作为额外功能；宽容模式输出需标示为恢复结果。

### 11.3 推荐资源预算

参考实现默认采用：输入最多 1,000,000 个 Unicode 码点、64 层容器、10,000 个节点；外部 AST 校验同样限制深度和节点数。宿主可以另设属性长度、资源大小、发送速率和内存预算。

---

## 12. 版本约束与扩展

### 12.1 语法版本

CQX v0.2 的短标签注册表、词法识别和转义规则在本版本内固定。解析器必须标明其实现的 CQX 版本；支持多版本的解析器必须让调用方指定版本或通过协议封装确定版本。

传输层可以使用如下封装：

```json
{"format":"cqx","version":"0.2","content":"你好 [@123]"}
```

独立 `.cqx` 文件可以通过文件元数据或调用参数声明版本。CQX 消息正文不强制书写版本头。

### 12.2 扩展协议

新增元素使用 `[:publisher.name ...]` 通用语法，推荐反向域名或可验证的发布者前缀。插件 schema 在 AST 解析之后执行；插件不得重定义 v0.2 的标签识别、简写、正文转义和规范化规则。

未来如需修改内置简写或词法规则，应发布新的 CQX 语法版本。遵循该约束即可让相同的 v0.2 输入保持相同的解析结果。

---

## 13. 安全及适配器

### 13.1 输入信任边界

宿主接收普通聊天用户输入时，默认按普通文本处理。需要构造富消息时，调用方显式选择 CQX 解析入口。

程序将任意外部文本插入 CQX 模板时，必须按文本上下文使用 `escapeText(value)`；属性值应通过 `encodeAttr(value)` 输出 JSON 双引号形式。优先采用类型化 AST 构造 API。

```python
from cqx import escape_text
cqx_source = '[msg user=1]' + escape_text(untrusted_text) + '[/msg]'
```

`escapeText` 将 `\` 替换成 `\\`、`[` 替换成 `\[`，因此用户输入 `[@all]` 会作为文字保存。

### 13.2 解析与执行隔离

解析只创建数据结构。网络资源读取、文件访问、点击动作、投票响应和插件指令均由适配层执行，并遵守调用者授权与平台安全策略。

适配器发送前应验证全体提及权限、媒体访问、消息引用作用域、嵌套转发能力及资源处理策略。对无法发送的结构返回明确错误，或按调用方明确选定的降级策略处理。

`msg.user`、`msg.name`、`msg.time` 是消息内容中的声明性元数据。展示或归档系统应区分可验证的原始来源与用户构造的转发节点，避免把自定义作者字段当成已核实的身份凭据。

### 13.3 平台映射示例

| CQX 元素 | OneBot 11 映射思路 | Satori 映射思路 |
|---|---|---|
| `at(id)` | `at` 消息段 | `at` 元素 |
| `img(src)` | `image` 消息段 | `img` 元素 |
| `reply(id)` | `reply` 消息段 | `quote` 等引用表示 |
| `forward` 容器 | 合并转发节点数组 | 转发消息容器 |
| `msg` 自定义消息 | 自定义 `node` | `message` + `author` |
| `msg` 原子引用 | 引用 `node` | 已有消息引用 |

适配器负责字段名称、媒体上传和平台行为差异。CQX 自身不定义发送 API。

---

## 14. 测试向量

### 14.1 合法输入与规范化输出

| 输入 | 规范化输出 |
|---|---|
| `你好 [@123]` | `你好 [:at id="123"/]` |
| `[@all]` | `[:at type="all"/]` |
| `[img cat.png]` | `[:img src="cat.png"/]` |
| `[img https://a.test/p/]` | `[:img src="https://a.test/p/"/]` |
| `[img https://a.test/p?x=1]` | `[:img src="https://a.test/p?x=1"/]` |
| `[img "foo=bar"]` | `[:img src="foo=bar"/]` |
| `[file a.pdf name="报告.pdf"]` | `[:file name="报告.pdf" src="a.pdf"/]` |
| `[b]重要[/b]` | `[:b]重要[/b]` |
| `[link https://a.test/x/]网页[/link]` | `[:link href="https://a.test/x/"]网页[/link]` |
| `[:x z=9 a=2/]` | `[:x a="2" z="9"/]` |
| `[:x/]` | `[:x/]` |
| `[:x][/x]` | `[:x][/x]` |
| `[note]` | `\[note]` |
| `\[@123]` | `\[@123]` |

**合并转发：**

```cqx
[forward]
  [msg user=1 name=Alice]你好[/msg]
  [ref 42]
[/forward]
```

规范化：

```cqx
[:forward][:msg name="Alice" user="1"]你好[/msg][:msg id="42"/][/forward]
```

**原样代码：**

```text
[code raw]print("[@all]")[/code]
```

规范化：

```text
[:code]print("\[@all]")[/code]
```

### 14.2 非法输入

| 输入 | 诊断 |
|---|---|
| `[img]` | `E_SCHEMA`：缺少 `src` |
| `[img foo=bar]` | `E_SCHEMA`：命名属性 `foo` 未提供 `src` |
| `[:x a=1 a=2/]` | `E_ATTR_DUP` |
| `[b]你好[/i]` | `E_CLOSE` |
| `[:x]` | `E_CLOSE` |
| `[ref 42]` | `E_PARENT`：仅允许在 `forward` 容器中 |
| `[forward][/forward]` | `E_SCHEMA` |
| `[forward]hello[/forward]` | `E_SCHEMA` |
| `[forward][msg id=42/][/forward]` | `E_CLOSE`：缺少 `[/msg]`（尾随 `/` 被作为属性内容） |
| `[b/]` | `E_SHORT_CLOSE`：容器不能省略结束标签 |
| `[code raw]未关闭` | `E_RAW_CLOSE` |
| `[:img src=""/]` | `E_SCHEMA` |

### 14.3 AST 往返测试

测试实现至少覆盖：

- Unicode 组合字符、emoji、`CRLF`、NUL、孤立代理码位拒绝；
- 普通文本中的 `[@all]`、原始反斜杠、未知 `[note]`；
- URL 中的 `=`、`?`、`&` 和末尾 `/`；
- JSON 引号属性、重复属性、非法名称；
- 未知扩展容器与空容器区别；
- `forward` 缩进、`msg` 正文空白、转发引用与嵌套转发；
- 外部构造的非法 AST 拒绝；
- `parse(serializeCanonical(T)) = normalizeAST(T)` 的属性测试。

---

## 15. 附录：词法与形式文法

以下文法定义主要结构；标签识别优先级、`code raw` 和合法父子约束由第 4、6、7、11 节补充。

```ebnf
Document      = { Text | Element } ;
Element       = GenericVoid | GenericBlock | ShortAtomic | ShortBlock ;
GenericVoid   = "[:", Name, Attributes, "/]" ;
GenericBlock  = "[:", Name, Attributes, "]", Document, "[/", Name, "]" ;
ShortAtomic   = "[", RegisteredAtomic, ShortAttributes, "]" | Mention ;
ShortBlock    = "[", RegisteredBlock, ShortAttributes, "]", Document,
                "[/", RegisteredBlock, "]" ;
Mention       = "[@", Identifier, "]" ;
Attributes    = { WS, NamedAttribute } ;
ShortAttributes = { WS, (NamedAttribute | PositionalValue) } ;
NamedAttribute = Key, "=", Value ;
Value         = BareValue | JSONString ;
Name          = Letter, { Letter | Digit | "_" | "." | "-" } ;
Key           = (Letter | "_"), { Letter | Digit | "_" | "." | "-" } ;
WS            = " " | "\t" | "\r" | "\n" ;
```

**扫描器的额外规则：**

- `JSONString` 使用完整的 JSON 字符串扫描，标签内的 `]` 只在引号外结束标签；
- 裸值读到结构空白或标签边界为止；内部的 `=` 属于值；
- `[:name .../]` 的最后一个 `/` 是原子结束符；所有简写中的 `]` 都是标签结束符，末尾 `/` 可以属于裸值；
- 短标签的 `注册名称` 固定为第 2.4 节；位置参数仅适用于第 3.4 节登记的简写（包括容器 `link`）；`[ref id]` 在 AST 中转为原子 `msg(id)`；
- `[code raw]` 使用专用的原样正文扫描器，直到第一个未转义的 `[/code]`；
- 已识别标签的属性或闭合错误必须报告诊断，普通未知方括号按文本处理。

扩展 schema 只能检查通用 AST，不得修改 v0.2 的词法含义。

---

## 参考资料

- [OneBot 11：CQ 码字符串格式](https://github.com/botuniverse/onebot-11/blob/master/message/string.md)
- [OneBot 11：消息段数组](https://github.com/botuniverse/onebot-11/blob/master/message/array.md)
- [Koishi：标准消息元素](https://koishi.chat/zh-CN/api/message/elements)
- [Satori：消息格式](https://satori.js.org/en-US/protocol/message.html)

以上资料为设计背景。本文中的 CQX 规则由本草案独立定义。
