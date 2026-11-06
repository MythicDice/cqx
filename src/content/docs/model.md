---
title: "数据模型与规范化序列化"
description: "Text 与 Element 节点、AST 正规化、等价关系与唯一规范化文本的生成规则。"
---

## 数据模型

解析结果是按顺序排列的节点数组（Document）。CQX 定义两类节点：

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

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | 字符串 | `text` 或 `element` |
| `text` | 字符串 | Text 节点的字符内容 |
| `name` | 字符串 | 元素名称 |
| `attrs` | 字符串到字符串的映射 | 元素属性 |
| `mode` | 字符串 | `void` 或 `block` |
| `children` | 节点数组 | 原子元素为空；容器元素包含子节点 |

`mode` 仅有 `void` 和 `block`。原子节点必须有空的 `children`；容器节点保留 `block` 模式，即使没有子节点。属性名及其字符串值均为 Unicode 标量值序列，名称另须满足[名称规则](../format/)。

例如，以下消息：

```text
你好 [@123]！
```

解析得到：

```json
[
  {"type":"text","text":"你好 "},
  {"type":"element","name":"at","attrs":{"id":"123"},"mode":"void","children":[]},
  {"type":"text","text":"！"}
]
```

## 正规化

定义 `normalizeAST(T)`，依次执行：

1. 校验所有节点的类型、模式、名称、属性、合法 Unicode 和内置元素结构规则。
2. 合并相邻 Text 节点，移除空 Text 节点。
3. 将属性按名称的 ASCII 顺序排列；语义比较时将属性视为映射。
4. 删除 `forward` 容器中的纯结构空白 Text 节点。
5. 校验父子关系：`msg` 的直接父节点必须是 `forward` 容器，`forward` 容器至少有一个 `msg` 子节点。
6. 保留未知扩展元素、元素顺序、属性值及 `void` / `block` 差异。

含非法节点、无效必需属性或非法父子关系的消息树必须被拒绝。外部构造的消息树与文本输入一样，必须接受嵌套深度和节点数量限制。

规范化消息树 `A` 与 `B` 等价，要求：Document 节点顺序一致；Text 字符逐码点相等；Element 名称、模式、属性映射、规范化子节点依次相等。两个文本输入可因简写或 `forward` 结构缩进不同而生成同一个规范化消息树；源文本的字面排版形式不属于消息树保留的信息。

## 规范化序列化

定义 `serializeCanonical(T)`，先执行 `normalizeAST(T)`，再编码成唯一规范文本：

1. 每个元素均输出通用标签 `[:name .../]` 或 `[:name ...]...[/name]`。
2. 属性按 ASCII 名称升序排列，并全部输出为 JSON 双引号字符串，不使用裸值。
3. JSON 字符串使用 `\b`、`\f`、`\n`、`\r`、`\t`、`\"`、`\\` 及需要时的小写 `\u00xx` 转义；其他 Unicode 标量值直接输出，不转义斜线 `/`。
4. Text 内的 `\` 输出 `\\`，`[` 输出 `\[`；其余字符原样输出，包括换行。
5. 相邻节点直接连接，不添加空格或换行；`forward` 的结构排版空白已在正规化阶段移除。
6. 保留原有元素顺序、名称大小写和 `void` / `block` 模式；不执行 Unicode 归一化。

输入：

```text
你好 [@00123]！[img https://example.org/a/?x=1]
```

规范化输出：

```text
你好 [:at id="00123"/]！[:img src="https://example.org/a/?x=1"/]
```

合并转发：

```text
[forward]
  [msg user=1 name=Alice]你好[/msg]
  [ref 42]
[/forward]
```

规范化输出：

```text
[:forward][:msg name="Alice" user="1"]你好[/msg][:msg id="42"/][/forward]
```

对每个合法消息树 `T`，必须满足：

```text
parse(serializeCanonical(T)) == normalizeAST(T)
serializeCanonical(parse(serializeCanonical(T))) == serializeCanonical(T)
```

解析器对合法人类输入得到的消息树应满足同样性质。

## 辅助函数

把任意外部文本插入 CQX 模板时，必须按文字上下文转义：

| 函数 | 规则 |
| --- | --- |
| `escapeText(value)` | `\` 替换为 `\\`，`[` 替换为 `\[` |
| `encodeAttr(value)` | 输出 JSON 双引号字符串 |

```text
escapeText('这里的 [@all] 只是文字')  →  这里的 \[@all] 只是文字
encodeAttr('Alice 的"照片".png')      →  "Alice 的\"照片\".png"
```

优先采用类型化的消息树构造 API；字符串拼接时属性值必须通过 `encodeAttr` 输出。
