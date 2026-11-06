---
title: "原样代码"
description: "[code raw] 的字面读取规则、关闭标记转义与规范化输出。"
---

## 形式

直接粘贴代码、协议片段或 CQX 教程时使用原样形式：

```text
[code raw]
print("[@all]")
print("[img cat.png]")
[/code]
```

`[code raw]` 中的正文直接读取为纯文本，直到遇到第一个未转义的 `[/code]`。其中的提及、图片、普通方括号、反斜杠均按字面字符保留，不参与标签识别。

## 字面关闭标记

在原样正文中插入字面关闭标记，使用 `\[/code]`：

```text
[code raw]这里展示 \[/code] 这个关闭标签[/code]
```

解析结果是一个 `code` 容器，正文为 `这里展示 [/code] 这个关闭标签`。原样正文仅把 `\[/code]` 解释为字面 `[/code]`；其他反斜杠均原样保留。

> **注意**
>
> 原样修饰符只适用于简写 `[code raw]`。`[:code raw="true"]` 只是携带额外属性的普通 `code` 容器，内部仍按普通 CQX 语法解析。

## 展开结果

原样形式是输入阶段的语法糖：最终消息树是普通 `code` 容器，子节点为一个 Text 节点；规范化输出会自动把正文中的 `[` 和 `\` 转义。

输入：

```text
[code raw]print("[@all]")[/code]
```

规范化结果：

```text
[:code]print("\[@all]")[/code]
```

规范化序列化使用真实换行字符，原样正文中的换行同样保留。

## 错误示例

| 输入 | 诊断码 |
| --- | --- |
| `[code raw]未关闭` | `E_RAW_CLOSE` |
| `[code raw]x\[/code]y[/code]` | 合法，正文为 `x[/code]y` |
| `[code]固定 \[img cat.png][/code]` | 合法，普通 `code` 容器，正文为字面方括号文本 |
