# CQX v0.4 规范（草案）

**CQ eXtended — 轻量富消息文本表示法**  
**版本：** `0.4-draft`  
**日期：** 2026-11-10  
**状态：** 实验性规范草案

CQX 使用一段可手写的 Unicode 文本表达普通文字、富消息元素及嵌套消息。常用操作采用简写；复杂结构采用统一的通用标签。解析结果是一棵类型化消息树。

> **设计原则：随手写效果等效，规范表示结构无损。**
>
> 简写优先满足常见书写习惯，并在确定的规则下展开为消息树；规范化序列化保留合法消息树的完整结构。解析语法、消息语义和平台发送各自承担明确职责。

本文使用「**必须**」表示规范性要求，「**应该**」表示建议，「**可以**」表示可选能力。示例中的 CQX 文本是输入源码，`#` 不表示注释。

## 1. 快速开始

普通消息：

```cqx
你好，[@123456]！
[reply 42]看这张图片：[img cat.png]
[face 14] [face 14 variant=super]
[poke 123456]
```

嵌套消息：

```cqx
[forward]
  [msg user=10001 name=Alice]你好！[/msg]
  [msg name=Bob]看看图片：[img cat.png][/msg]
  [ref 987654]
[/forward]
```

通用扩展：

```cqx
[:acme.poll title="午饭吃什么？"]
  [:acme.option id="a" label="披萨"/]
  [:acme.option id="b" label="寿司"/]
[/acme.poll]
```

CQX 源码只有在调用者明确选择 CQX 解析时才被解释为消息标记。普通外部文本直接用 Text 节点承载。

## 2. 消息格式

CQX 文档由连续的**纯文本**和**元素**构成。元素不需要使用分隔符与相邻文本隔开。

### 2.1 原子元素

原子元素没有子内容。内置简写以 `]` 结束：

```cqx
[@123]
[@all]
[img cat.png]
[reply 42]
[face 14]
```

通用原子元素以 `/]` 结束：

```cqx
[:at id="123"/]
[:img src="cat.png"/]
[:acme.sticker id="abc"/]
```

简写中的末尾 `/` 属于参数值：

```cqx
[img https://example.org/gallery/]
```

该图片的 `src` 是 `https://example.org/gallery/`。通用原子元素以 `/]` 结尾，末尾带 `/` 的裸值应使用引号：

```cqx
[:img src="https://example.org/gallery/"/]
```

### 2.2 容器元素

容器元素用开始标签和结束标签包含文本及其他元素：

```cqx
[b]重点[/b]
[i]斜体[/i]
[link https://example.org]网页[/link]
[:acme.card title="提示"]内容[/acme.card]
```

通用形式为：

```text
[:name key=value]子内容[/name]
```

已登记的容器允许省略开头的冒号。结束标签统一写为 `[/name]`。

原子元素 `[:x/]` 与空容器 `[:x][/x]` 是不同的结构，解析与规范化必须保留这一差别。

### 2.3 名称和扩展

元素名称符合 `[A-Za-z][A-Za-z0-9_.-]*`；属性名称符合 `[A-Za-z_][A-Za-z0-9_.-]*`。名称区分大小写，内置元素名均为小写 ASCII。

只有第 4 节列出的元素及专用语法可以使用短标签。未知元素须使用 `[:name ...]` 通用形式。扩展名称推荐带命名空间，例如 `acme.poll`。

解析器必须保留未知通用元素的名称、属性、子内容及原子/容器模式。扩展元素语义由使用方定义。

### 2.4 固定简写表与标签候选

v0.4 的简写表在本语法版本内固定，新增简写需要新的语法版本。扩展元素使用通用标签：

| 类别 | 名称 |
|---|---|
| 原子 | `[@identifier]`、`img`、`reply`、`face`、`audio`、`video`、`file`、`ref`、`poke` |
| 容器 | `b`、`i`、`link`、`forward`、`msg` |
| 原样围栏 | `[code#*]...[/code#*]`、`[raw#*]...[/raw#*]` |

`[poke]` 属于已登记标签候选，必需的 `id` 属性缺失时报告 `E_SCHEMA`；`[poker]` 继续作为普通文本保存。

## 3. 文本、属性与转义

### 3.1 普通正文

在普通正文中，`&`、`<`、`>`、`]`、逗号和等号均按原样保存。未被识别为 CQX 标签的方括号内容也按原样保存，例如 `[note]` 和 `[1,2,3]`。

正文只使用两种反斜杠转义：

| 源码 | 解析出的字符 |
|---|---|
| `\[` | `[` |
| `\\` | `\` |

其他反斜杠序列按原样保存；没有任何针对 Windows 路径、正则表达式或 LaTeX 的特殊规则。

```cqx
真正的提及：[@123]
字面提及：\[@123]
字面反斜杠：\\
普通路径文字：C:\Users\Alice
```

注意：连续反斜杠仍按上述两种转义从左至右识别。规范化序列化器会自动编码正文中的 `\` 和 `[`。

### 3.2 属性

属性格式为 `key=value`。多个属性用结构空白隔开，同一标签中的属性名称必须唯一。属性值在 AST 中一律为**字符串**，因此 `id=00123` 保留前导零。

**裸值**不能包含结构空白、`[`、`]`、`"`、`\`；可包含 `= / : ? & #` 等字符。因此 URL 查询参数可直接写入：

```cqx
[img https://example.org/image?a=1&b=2]
[:img src=https://example.org/image?a=1&b=2/]
```

**引号值**使用 JSON 双引号字符串语法，包括 `\"`、`\\`、`\n`、`\t`、`\uXXXX` 等。包含空格、方括号、反斜杠或其他特殊字符的属性值应加引号：

```cqx
[img "cat photo.png"]
[:img src="https://example.org/a?[1]"/]
[:file src="C:\\Users\\Alice\\report.pdf" name="年度报告.pdf"/]
```

内置元素的必需 ID 和资源标识符不能为空；扩展属性可以是空字符串。

### 3.3 位置参数

以下短标签允许用第一个参数代替一个常见属性：

| 短标签 | 位置参数写入的属性 |
|---|---|
| `img`、`audio`、`video`、`file` | `src` |
| `reply`、`face`、`ref`、`poke` | `id` |
| `link` | `href` |

示例：

```cqx
[img cat.png]                  
[reply 42]
[face 14 variant=super]
[link https://a.test]打开网页[/link]
```

位置参数至多一个，必须出现在其他属性之前。若第一个未加引号的 token 以合法属性名和 `=` 起始，优先识别为**命名属性**：

```cqx
[img src=cat.png]       
[img https://a.test/?x=1]
[img "foo=bar"]
```

因此 `[img foo=bar]` 会被解析为具有 `foo` 属性、却缺少 `src` 的 `img`，并报告错误。通用标签只允许命名属性。位置参数和同名的命名属性不能同时出现。

### 3.4 结构空白

标签中的分隔空白仅包括 `SP`（U+0020）、`TAB`（U+0009）、`LF`（U+000A）、`CR`（U+000D）。其他 Unicode 空白不作为标签或属性分隔符。正文空白默认精确保留；`forward` 直接子节点之间的排版空白遵守第 5 节规则。

## 4. 内置元素

### 4.1 原子元素

| 名称 | 常见写法 | 必需属性 | 可选标准属性 | 含义 |
|---|---|---|---|---|
| `at` | `[@123]`、`[@all]` | `id` 或 `type="all"` | — | 提及用户或全体 |
| `img` | `[img cat.png]` | `src` | `alt` | 图片 |
| `audio` | `[audio a.ogg]` | `src` | — | 音频 |
| `video` | `[video a.mp4]` | `src` | — | 视频 |
| `file` | `[file a.pdf]` | `src` | `name` | 文件 |
| `reply` | `[reply 42]` | `id` | — | 回复引用 |
| `face` | `[face 14]` | `id` | `set`、`variant` | 平台原生表情 |
| `poke` | `[poke 123456]` | `id` | `variant` | 请求在当前会话中戳一戳用户 |

`at` 必须恰好包含非空 `id` 或 `type="all"`。提及 ID 字面值 `all` 的用户时，写 `[:at id="all"/]`。

`face` 通过当前平台的表情集解释。`variant` 用于特殊表情形式，例如超级表情；`set` 可显式指定表情集。普通 Unicode emoji 直接写入正文：

```cqx
😀 [face 14] [face 14 variant=super]
[:face id="14" set="qq" variant="super"/]
```

`reply.id`、`face.id` 和媒体 `src` 在**当前消息上下文**中解释。平台、账号、会话以及相对资源地址的定位信息由调用方统一提供。元素无需重复携带这些字段。

#### 戳一戳动作与降级

`poke` 是动作元素（ACTION），请求宿主在当前会话中戳一戳 `id` 指定的用户。`id` 必须是非空字符串。可选属性 `variant` 是平台定义的戳一戳样式，写出时必须是非空字符串，解析器将其保留为字符串：

```cqx
[poke 123456]
[poke 123456 variant=heart]
[:poke id="123456"/]
[b][poke 123456][/b]
[forward][msg name=Alice][poke 123456][/msg][/forward]
```

`poke` 的可见消息内容为空。解析器仅构建数据，动作由宿主执行。它可以位于根级及 `b`、`i`、`link`、`msg` 的正文中，容器原有的结构约束继续适用。

宿主支持戳一戳时执行对应操作，平台能力缺失时按自身规则转换为文本或丢弃；宿主仅在支持指定样式时应用 `variant`，其余情况忽略该属性。

### 4.2 容器元素

| 名称 | 常见写法 | 语义 |
|---|---|---|
| `b` | `[b]内容[/b]` | 加粗 |
| `i` | `[i]内容[/i]` | 斜体 |
| `link` | `[link https://a.test]文字[/link]` | 链接，要求 `href` |
| `code` | `[code]代码[/code]` | 代码，子节点只能是 Text |
| `forward` | `[forward]...[/forward]` | 合并转发 |
| `msg` | `[msg name=Alice]...[/msg]` | 转发中的消息节点 |

`b`、`i`、`link` 的正文按一般 CQX 规则解析。`code` 的短标签使用第 6 节的原样围栏；它的通用形式 `[:code]...[/code]` 按普通 CQX 文本规则解析，且只能产生 Text 子节点。

内置元素允许额外的语法合法属性，解析器完整保留；额外属性的实际意义由适配器解释。

## 5. 合并转发

### 5.1 构造转发

`forward` 容器直接包含一个或多个 `msg` 节点；`[ref ID]` 是引用形式的简写：

```cqx
[forward]
  [msg user=10001 name=Alice]你好！[/msg]
  [msg name=Bob]看看这个：[img cat.png][/msg]
  [ref 42]
[/forward]
```

`msg` 的容器形式包含自定义内容，要求 `user`、`name` 至少出现一个。可选的 `time`、`avatar` 是消息元数据，其值保留为字符串。

`[ref 42]` 展开为原子节点 `[:msg id="42"/]`。引用形式必须有非空 `id`，不能包含子节点。原子 `msg` 的 `user`、`name` 与容器 `msg` 的 `id` 属性不允许混用。

`msg` 只能作为 `forward` 的直接子节点。`forward` 的直接子节点之间可以出现仅由结构空白组成的 Text；解析时忽略这些排版空白。出现其他直接文本或元素、或者没有任何 `msg` 节点时，严格解析报错。

`msg` 的正文空白精确保留，允许包含任何合法富消息元素，包括嵌套 `forward`。

### 5.2 引用已有转发

引用已经存在的合并转发，使用原子形式：

```cqx
[:forward id="f123"/]
```

原子 `forward` 必须有非空 `id`。容器 `forward` 不得有 `id`，并必须遵守 5.1 的结构要求。

### 5.3 空白例子

```cqx
[forward]
  [msg name=Alice]第一行
第二行[/msg]
  [ref 42]
[/forward]
```

第一条自定义消息的正文恰好为 `第一行\n第二行`。若在 `[msg ...]` 后另起一行，那段换行与缩进也属于其正文。

## 6. 原样内容

`code` 和 `raw` 共用**原样围栏**规则。围栏里的字符原样保存，不解析标签、不处理反斜杠转义。

### 6.1 原样代码

```cqx
[code]
print("[@all]")
print("[img cat.png]")
[/code]
```

`[code]...[/code]` 生成一个 `code` 容器，子节点为原样 Text。可通过 `lang` 属性表示代码语言，例如 `[code lang=python]...[/code]`。

### 6.2 可变结束围栏

正文中包含 `[/code]` 时，在开始与结束标记上添加相同数量的 `#`：

```cqx
[code#]
print("[/code]")
[/code#]
```

如果正文还包含 `[/code#]`，使用 `##`：

```cqx
[code##]
这里有 [/code] 和 [/code#]
[/code##]
```

规则只有一条：**第一个与名称及 `#` 数量完全匹配的结束围栏终止原样区域**。结束围栏不受反斜杠影响；如有冲突，增加围栏长度即可。围栏允许跨行，不自动移除首尾换行或缩进。

### 6.3 原样纯文本

`raw` 使用同一围栏语法，但只生成 Text，不增加代码样式：

```cqx
[raw]这里的 [@all] 是普通文字[/raw]
[raw#]这里还包含 [/raw] 字样[/raw#]
```

`raw` 是输入语法，不是 AST 元素。`[:raw]` 与 `[:raw/]` 保留且无效。`raw` 围栏不带属性；`code` 围栏仅定义 `lang` 属性，其余属性按扩展属性规则保留。

规范化序列化不会输出围栏：`raw` 变成普通转义正文，`code` 变成通用容器 `[:code]...[/code]`。例如：

```cqx
[code]print("[@all]")[/code]
```

规范化为：

```cqx
[:code]print("\[@all]")[/code]
```

## 7. AST 与规范化序列化

### 7.1 数据模型

文档（Document）是一个有序节点数组，只有两种节点：

```json
{"type":"text","text":"你好 "}
```

```json
{
  "type":"element",
  "name":"img",
  "attrs":{"src":"cat.png"},
  "mode":"void",
  "children":[]
}
```

元素 `mode` 取 `void`（原子）或 `block`（容器）；容器即使没有子节点，也保持 `block`。所有属性值为字符串，`children` 始终为数组，`void` 节点的 `children` 为空。

### 7.2 合法 AST 与规范化

`normalizeAST(T)` 必须完成以下操作：

1. 检查节点类型、合法名称、属性键、属性值、模式、Unicode 字符以及内置元素结构。
2. 合并相邻 Text 节点，移除空 Text 节点。
3. 忽略 `forward` 直接子节点中的纯结构空白 Text；其他所有正文字符保留。
4. 保留扩展元素、额外属性、节点顺序、容器/原子模式，以及未改变的文本字符序列。

不合法的 AST 必须报告错误，不能悄悄修改成另一种消息结构。

### 7.3 规范化文本

`serializeCanonical(T)` 先对 T 进行校验及规范化，随后：

- 元素使用通用 `[:name .../]` 或 `[:name ...]...[/name]`。
- 属性名按 ASCII 升序排列，属性值全部使用 JSON 双引号字符串，标签中不插入多余空白。
- 普通 Text 中的每个 `\` 编码为 `\\`，每个 `[` 编码为 `\[`；其他合法字符原样保留。
- `raw` 围栏在 AST 中已消失；`code` 生成具有 Text 子节点的普通 `code` 容器。

例如：

```cqx
[forward]
  [msg name=Alice]你好 [@2][/msg]
  [ref 42]
[/forward]
```

规范化为：

```cqx
[:forward][:msg name="Alice"]你好 [:at id="2"/][/msg][:msg id="42"/][/forward]
```

对于所有合法消息树 `T`，实现必须满足：

```text
parseCQX(serializeCanonical(T)) == normalizeAST(T)
```

相等指树结构、文本字符、属性映射与 `mode` 一致。简写、引号选择和输入排版不参与比较。

## 8. 严格解析

### 8.1 扫描顺序

普通正文从左向右扫描，按以下顺序确定字符含义：

1. `\[`、`\\` 两种正文转义。
2. 当前容器合法的关闭标签 `[/name]`。
3. 提及简写 `[@identifier]`（`identifier` 符合 `[A-Za-z0-9_.-]+`）。
4. 通用标签 `[:name .../]`、`[:name ...]`。
5. 已登记的短元素标签和专用原样围栏。
6. 其他输入作为 Text。

短元素名称后必须紧跟 `]` 或结构空白。原样围栏允许在名称后紧接一个或多个 `#`，再接 `]` 或结构空白。未知 `[note]`、`[/note]` 可以作为普通文字出现。

被确定为有效标签候选的输入，如果缺少属性、存在重复属性、标签未闭合或违反内置结构，严格解析器必须报错。已打开容器遇到与栈顶不匹配的已登记结束标签，必须报错。通用标签的 `[:` 前缀保留给 CQX 语法。

`code` 和 `raw` 的短围栏优先读取直到完全匹配的结束围栏，其内部不执行上述扫描步骤。

### 8.2 字符集合与错误

源码是 Unicode 标量值序列；字节输入使用严格 UTF-8 解码。正文和属性值允许常规 Unicode 字符、TAB、LF 和 CR；U+0000–U+001F 中的其他控制字符无效。不执行 Unicode 归一化。

解析错误应该报告原因和源码位置。实现可以自行设置输入长度、节点数量和递归深度上限。编辑器可以提供宽容诊断，但协议接收端应使用严格解析结果。

## 9. 使用边界与展示

CQX 的输入来源在本规范的威胁模型中是**可信的源码构造方**。调用 `parseCQX` 表示有意启用富消息解释。来自普通聊天、网页或其他外部来源的字符串，按 Text 数据交给消息构造器；若需要把这些字符串嵌入 CQX 源码，使用符合第 3.1 节的文本编码函数。

解析器构建 AST。消息引用、表情集、媒体 `src`、权限与发送操作由宿主适配器使用统一的当前消息上下文处理。本规范不定义网络访问、文件访问或平台通知策略。

`serializeCanonical` 面向存储、传输与一致性测试；面向人的显示由独立渲染器负责。例如 `[:at id="123"/]` 可以在界面上显示为 `@Alice`，图片可显示为实际媒体或其 `alt` 文本。

### 9.1 戳一戳协议映射

OneBot 11 系宿主通过 `send_poke`、`group_poke`、`friend_poke` API 调用投递 `poke`，按实现支持情况与会话类型选择接口。NapCat 与 LLOneBot 的戳一戳消息段投递可靠性有限，适配器应使用这些动作接口。QQ 官方接口的戳一戳能力缺失，宿主按自身规则转换为文本或丢弃。

## 10. 一致性测试向量

### 10.1 有效输入与规范化结果

| 输入 | 规范化结果 |
|---|---|
| `你好 [@123]` | `你好 [:at id="123"/]` |
| `[@all]` | `[:at type="all"/]` |
| `\[@all]` | `\[@all]` |
| `\\` | `\\` |
| `[note]` | `\[note]` |
| `[/note]` | `\[/note]` |
| `[img cat.png]` | `[:img src="cat.png"/]` |
| `[img https://a.test/p/]` | `[:img src="https://a.test/p/"/]` |
| `[img https://a.test/?x=1]` | `[:img src="https://a.test/?x=1"/]` |
| `[img "foo=bar"]` | `[:img src="foo=bar"/]` |
| `[reply 42]` | `[:reply id="42"/]` |
| `[face 14 variant=super]` | `[:face id="14" variant="super"/]` |
| `[poke 123]` | `[:poke id="123"/]` |
| `[poke 123 variant=heart]` | `[:poke id="123" variant="heart"/]` |
| `[:poke id="123"/]` | `[:poke id="123"/]` |
| `[b][poke 123][/b]` | `[:b][:poke id="123"/][/b]` |
| `[forward][msg name=Alice][poke 123][/msg][/forward]` | `[:forward][:msg name="Alice"][:poke id="123"/][/msg][/forward]` |
| `[poke "123"]` | `[:poke id="123"/]` |
| `[i][poke 123][/i]` | `[:i][:poke id="123"/][/i]` |
| `[link https://a.test][poke 123][/link]` | `[:link href="https://a.test"][:poke id="123"/][/link]` |
| `[b]重点[/b]` | `[:b]重点[/b]` |
| `[:x/]` | `[:x/]` |
| `[:x][/x]` | `[:x][/x]` |
| `[raw][@all][/raw]` | `\[@all]` |
| `[code][@all][/code]` | `[:code]\[@all][/code]` |

**合并转发：**

```cqx
[forward]
  [msg name=Alice]你好[/msg]
  [ref 42]
[/forward]
```

规范化结果：

```cqx
[:forward][:msg name="Alice"]你好[/msg][:msg id="42"/][/forward]
```

**具有字面关闭标签的代码：**

```cqx
[code#]文本含有 [/code] 标签[/code#]
```

规范化结果：

```cqx
[:code]文本含有 \[/code] 标签[/code]
```

### 10.2 错误输入

| 输入 | 原因 |
|---|---|
| `[img]` | 缺少 `src` |
| `[img foo=bar]` | `foo` 被识别成命名属性，`src` 缺失 |
| `[:x a=1 a=2/]` | 重复属性 |
| `[b]文字[/i]` | 不匹配的结束标签 |
| `[:x]文字` | 容器未闭合 |
| `[forward][/forward]` | 空转发 |
| `[forward]hello[/forward]` | 转发直接包含正文 |
| `[ref 42]` | 引用节点位于转发外部 |
| `[msg name=Alice]你好[/msg]` | 消息节点位于转发外部 |
| `[code]未闭合` | 原样围栏未闭合 |
| `[:code][@all][/code]` | `code` 含有非 Text 子节点 |
| `[:img src=""/]` | 必需属性为空 |

动作元素的错误诊断：

| 输入 | 诊断码 |
|---|---|
| `[poke]` | `E_SCHEMA` |
| `[poke id=123 456]` | `E_ATTR_DUP` |
| `[:poke/]` | `E_SCHEMA` |
| `[:poke id=""/]` | `E_SCHEMA` |
| `[poke 123 variant=""]` | `E_SCHEMA` |
| `[:poke id="123"][/poke]` | `E_SCHEMA` |

`[poke id=123 456]` 的命名属性和位置参数共同写入 `id`，按重复属性报告 `E_ATTR_DUP`。

独立实现应对全部向量核对 AST 与规范化结果，并验证随机合法 AST 的往返一致性。

## 附录 A：形式文法摘要

下列 EBNF 是核心结构摘要。标签边界、候选识别、转义及 schema 的规范性细节以第 2–8 节为准。

```ebnf
Document       = { Text | Element | RawInput } ;
Element        = GenericVoid | GenericBlock | ShortVoid | ShortBlock | Mention ;
GenericVoid    = "[:", Name, Attributes, "/]" ;
GenericBlock   = "[:", Name, Attributes, "]", Document, "[/", Name, "]" ;
ShortVoid      = "[", KnownVoid, ShortAttributes, "]" ;
ShortBlock     = "[", KnownBlock, ShortAttributes, "]", Document, "[/", KnownBlock, "]" ;
Mention        = "[@", Identifier, "]" ;
RawInput       = CodeFence | RawFence ;
CodeFence      = "[code", Hashes, Attributes, "]", RawBody, "[/code", Hashes, "]" ;
RawFence       = "[raw", Hashes, "]", RawBody, "[/raw", Hashes, "]" ;
Attributes     = { WS, NamedAttribute } ;
ShortAttributes = { WS, (PositionalValue | NamedAttribute) } ;
NamedAttribute = Key, "=", Value ;
Value          = BareValue | JSONString ;
Hashes         = { "#" } ;
WS             = " " | "\t" | "\r" | "\n" ;
```

`KnownVoid` 为 `img`、`audio`、`video`、`file`、`reply`、`face`、`ref`、`poke`；`KnownBlock` 为 `b`、`i`、`link`、`forward`、`msg`。`code`、`raw` 由原样围栏处理。`ref` 展开为原子 `msg`，`@` 展开为原子 `at`。`JSONString` 使用 JSON 字符串规则。`RawBody` 表示首次匹配结束围栏之前的全部原始字符。

## 附录 B：设计取舍

- **随手写优先：** URL 与普通路径可作为位置参数直接输入；少量容易歧义的情况通过引号消除。
- **递归结构：** 同一套标签与 AST 表示普通富文本、消息节点和转发树。
- **统一转义：** 普通正文使用 `\[`、`\\`；引号属性使用 JSON 转义；原样围栏内部不转义。
- **共同上下文：** 消息、表情和媒体引用采用统一的消息上下文；平台差异留给适配器。
- **精简边界：** CQX 只定义可信源码的解析、合法消息树与规范化表示；没有历史兼容或平台执行策略。
