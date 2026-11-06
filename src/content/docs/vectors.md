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

每项测试还须满足[规范化序列化的往返性质](../model/)：对规范化结果再次解析，所得消息树与首次解析相同。

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

## 简化文法

以下 EBNF 描述主要结构。标签识别优先级、`code raw` 和父子约束由[标签候选](../format/)、[原样代码](../code/)与[合并转发](../forward/)补充。

```text
Document        = { Text | Element } ;
Element         = GenericVoid | GenericBlock | ShortAtomic | ShortBlock ;
GenericVoid     = "[:", Name, Attributes, "/]" ;
GenericBlock    = "[:", Name, Attributes, "]", Document, "[/", Name, "]" ;
ShortAtomic     = "[", RegisteredAtomic, ShortAttributes, "]" | Mention ;
ShortBlock      = "[", RegisteredBlock, ShortAttributes, "]", Document,
                  "[/", RegisteredBlock, "]" ;
Mention         = "[@", Identifier, "]" ;
Attributes      = { WS, NamedAttribute } ;
ShortAttributes = { WS, ( NamedAttribute | PositionalValue ) } ;
NamedAttribute  = Key, "=", Value ;
Value           = BareValue | JSONString ;
Name            = Letter, { Letter | Digit | "_" | "." | "-" } ;
Key             = ( Letter | "_" ), { Letter | Digit | "_" | "." | "-" } ;
WS              = " " | "\t" | "\r" | "\n" ;
```

`JSONString` 使用完整的 JSON 字符串扫描；标签内的 `]` 只在引号外结束标签。裸值读到结构空白或标签边界为止，内部的 `=` 属于值。`[ref id]` 在消息树中转为原子 `msg(id)`。

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
