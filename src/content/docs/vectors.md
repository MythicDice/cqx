---
title: "测试向量与协议映射"
description: "合法输入的规范化结果、非法输入的诊断代码、简化文法与协议字段映射。"
---

## 合法输入

以下各行的输入与规范化结果分别构成一项测试。表中输入均为单行文本：

| 输入 | 规范化结果 |
| --- | --- |
| `普通文本` | `普通文本` |
| `\[@all]` | `\[:at type="all"/]` |
| `C:\Users\Alice` | `C:\\Users\\Alice` |
| `你好 [@123]！` | `你好 [:at id="123"/]！` |
| `[@all]` | `[:at type="all"/]` |
| `[@000123]` | `[:at id="000123"/]` |
| `[img cat.png]` | `[:img src="cat.png"/]` |
| `[img https://a.test/p/]` | `[:img src="https://a.test/p/"/]` |
| `[img "foo=bar"]` | `[:img src="foo=bar"/]` |
| `[file a.pdf name="报告.pdf"]` | `[:file name="报告.pdf" src="a.pdf"/]` |
| `[link https://a.test/a/]网页[/link]` | `[:link href="https://a.test/a/"]网页[/link]` |
| `[reply 00123]` | `[:reply id="00123"/]` |
| `[b]重要[/b]` | `[:b]重要[/b]` |
| `[:x b=2 a=1/]` | `[:x a="1" b="2"/]` |
| `[:x][/x]` | `[:x][/x]` |
| `[:forward id="f123"/]` | `[:forward id="f123"/]` |
| `[code raw]print("[@all]")[/code]` | `[:code]print("\[@all]")[/code]` |
| `[forward][msg user=1 name=Alice]你好[/msg][ref 42][/forward]` | `[:forward][:msg name="Alice" user="1"]你好[/msg][:msg id="42"/][/forward]` |
| `[note]` | `\[note]` |
| `[/note]` | `\[/note]` |
| `[raw][@all][/raw]` | `\[@all]` |
| `[code][@all][/code]` | `[:code]\[@all][/code]` |
| `[code#]文本含有 [/code] 标签[/code#]` | `[:code]文本含有 \[/code] 标签[/code]` |
| `[raw#]这里还包含 [/raw] 字样[/raw#]` | `这里还包含 \[/raw] 字样` |
| `[code##]这里有 [/code] 和 [/code#][/code##]` | `[:code]这里有 \[/code] 和 \[/code#][/code]` |
| `[code lang=python]print(1)[/code]` | `[:code lang="python"]print(1)[/code]` |
| `前缀[raw][@all][/raw]后缀` | `前缀\[@all]后缀` |
| `[:raw/]` | `[:raw/]` |
| `[:code]纯文本[/code]` | `[:code]纯文本[/code]` |
| `[forward][msg name=Alice]你好[/msg][/forward]` | `[:forward][:msg name="Alice"]你好[/msg][/forward]` |
| `[/note] 与 [note]` | `\[/note] 与 \[note]` |
| `[:note]内容[/note]` | `[:note]内容[/note]` |

每项测试还须满足[规范化序列化的往返性质](../model/)：对规范化结果再次解析，所得消息树与首次解析相同。

多行输入同样构成测试：

```text
[forward]
  [msg name=Alice]你好[/msg]
  [ref 42]
[/forward]
```

规范化结果：

```text
[:forward][:msg name="Alice"]你好[/msg][:msg id="42"/][/forward]
```

## 非法输入

| 输入 | 诊断码 |
| --- | --- |
| `[img]` | `E_SCHEMA` |
| `[img foo=bar]` | `E_SCHEMA` |
| `[:x a=1 a=2/]` | `E_ATTR_DUP` |
| `[b]你好[/i]` | `E_CLOSE` |
| `[:x]` | `E_CLOSE` |
| `[ref 42]` | `E_PARENT` |
| `[forward][/forward]` | `E_SCHEMA` |
| `[forward]hello[/forward]` | `E_SCHEMA` |
| `[forward][msg id=42/][/forward]` | `E_CLOSE` |
| `[b/]` | `E_SHORT_CLOSE` |
| `[code raw]未关闭` | `E_RAW_CLOSE` |
| `[:img src=""/]` | `E_SCHEMA` |
| `[link https://a.test href=https://b.test]x[/link]` | `E_ATTR_DUP` |
| `[code]未闭合` | `E_RAW_CLOSE` |
| `[code#]含 [/code] 但没有匹配围栏` | `E_RAW_CLOSE` |
| `[code##]x[/code#]` | `E_RAW_CLOSE` |
| `[raw x=1]内容[/raw]` | `E_ATTR` |
| `[:code][@all][/code]` | `E_SCHEMA` |
| `[msg name=Alice]你好[/msg]` | `E_PARENT` |
| `[forward][msg]缺属性[/msg][/forward]` | `E_SCHEMA` |

## 简化文法

以下 EBNF 描述主要结构。标签识别优先级、原样围栏和父子约束由[标签候选](../format/)、[原样围栏](../code/)与[合并转发](../forward/)补充。

```text
Document        = { Text | Element | RawInput } ;
Element         = GenericVoid | GenericBlock | ShortVoid | ShortBlock | Mention ;
GenericVoid     = "[:", Name, Attributes, "/]" ;
GenericBlock    = "[:", Name, Attributes, "]", Document, "[/", Name, "]" ;
ShortVoid       = "[", KnownVoid, ShortAttributes, "]" ;
ShortBlock      = "[", KnownBlock, ShortAttributes, "]", Document,
                  "[/", KnownBlock, "]" ;
Mention         = "[@", Identifier, "]" ;
RawInput        = CodeFence | RawFence ;
CodeFence       = "[code", Hashes, Attributes, "]", RawBody,
                  "[/code", Hashes, "]" ;
RawFence        = "[raw", Hashes, "]", RawBody, "[/raw", Hashes, "]" ;
Attributes      = { WS, NamedAttribute } ;
ShortAttributes = { WS, ( PositionalValue | NamedAttribute ) } ;
NamedAttribute  = Key, "=", Value ;
Value           = BareValue | JSONString ;
Hashes          = { "#" } ;
WS              = " " | "\t" | "\r" | "\n" ;
```

`KnownVoid` 为 `img`、`audio`、`video`、`file`、`reply`、`face`、`ref`；`KnownBlock` 为 `b`、`i`、`link`、`forward`、`msg`。`code`、`raw` 由原样围栏处理。`ref` 展开为原子 `msg`，`@` 展开为原子 `at`。`RawBody` 是首次匹配结束围栏之前的全部原始字符。

**扫描器的额外规则：**

- `JSONString` 使用完整的 JSON 字符串扫描，标签内的 `]` 只在引号外结束标签。
- 裸值读到结构空白或标签边界为止，内部的 `=` 属于值。
- `[:name .../]` 的最后一个 `/` 是原子结束符；所有简写中的 `]` 都是标签结束符，末尾 `/` 可以属于裸值。
- 位置参数仅适用于[固定简写表](../format/)登记的简写；`[ref id]` 在消息树中转为原子 `msg(id)`。
- 原样围栏读取到第一个名称与 `#` 数量完全匹配的结束围栏，内部不执行标签扫描。
- `[:code]` 按普通规则解析，且只能产生 Text 子节点；未知名称的 `[/name]` 按正文保存。
- `[code raw]` 继续可用，沿用 v0.2 的原样正文扫描器，直到第一个未转义的 `[/code]`。
- 已识别标签的属性或闭合错误必须报告诊断。

## 协议字段映射

下表给出 CQX 元素与常见消息协议的字段对应关系：

| CQX 元素 | OneBot 11 | Satori |
| --- | --- | --- |
| `at(id)` | `at` 消息段 | `at` 元素 |
| `img(src)` | `image` 消息段 | `img` 元素 |
| `reply(id)` | `reply` 消息段 | `quote` 引用表示 |
| `forward` 容器 | 合并转发节点数组 | 转发消息容器 |
| `msg` 自定义消息 | 自定义 `node` | `message` + `author` |
| `msg` 原子引用 | 引用 `node` | 已有消息引用 |
