---
title: "原样围栏"
description: "code 与 raw 的字面读取规则、可变结束围栏、正文展开与规范化输出。"
---

## 形式

直接粘贴代码、协议片段或 CQX 文本时使用原样围栏：

```text
[code]
print("[@all]")
print("[img cat.png]")
[/code]
```

`[code]…[/code]` 之间的字符原样保存，不解析标签，不处理反斜杠转义。解析结果是一个 `code` 容器，子节点只有 Text。

`raw` 使用同一套围栏，只生成正文，不产生元素节点：

```text
[raw]这里的 [@all] 是普通文字[/raw]
```

上例的正文为 `这里的 [@all] 是普通文字`。`raw` 是输入语法，不出现在消息树里。

## 结束围栏

第一个与名称及 `#` 数量完全匹配的结束围栏终止原样区域。开始与结束围栏的 `#` 数量必须相同：

```text
[code#]
print("[/code]")
[/code#]
```

正文还包含 `[/code#]` 时，两边同时改用 `##`：

```text
[code##]
这里有 [/code] 和 [/code#]
[/code##]
```

结束围栏不受反斜杠影响；如有冲突，增加围栏长度即可。围栏允许跨行，首尾换行与缩进不自动移除。

> **注意**
>
> `raw` 围栏不带属性。`code` 围栏可用 `lang` 表示代码语言，其余属性按通用规则保留。`[:raw]` 与 `[:raw/]` 是没有原样语义的通用元素。

## 通用形式

`[:code]…[/code]` 按普通 CQX 规则解析，且只能产生 Text 子节点：

```text
[:code]x = 1[/code]
[:code]\[@all][/code]
```

含元素子节点的 `[:code][@all][/code]` 报 `E_SCHEMA`。

## 展开结果

规范化序列化不输出围栏。`raw` 变为转义正文，`code` 变为通用容器：

输入：

```text
[code]print("[@all]")[/code]
```

规范化结果：

```text
[:code]print("\[@all]")[/code]
```

`[raw][@all][/raw]` 的规范化结果为 `\[@all]`。

## 兼容写法

v0.2 的 `[code raw]…[/code]` 继续可用。它的正文同样按字面读取，用 `\[/code]` 表示字面关闭标记：

```text
[code raw]这里展示 \[/code] 这个关闭标签[/code]
```

## 错误示例

| 输入 | 诊断码 |
| --- | --- |
| `[code]未闭合` | `E_RAW_CLOSE` |
| `[code#]含 [/code] 但没有匹配围栏` | `E_RAW_CLOSE` |
| `[raw x=1]内容[/raw]` | `E_ATTR` |
| `[:code][@all][/code]` | `E_SCHEMA` |
| `[code raw]未关闭` | `E_RAW_CLOSE` |
