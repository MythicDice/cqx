---
title: "合并转发与消息引用"
description: "forward 容器、自定义 msg 节点、ref 引用、原子转发引用与转发空白规则。"
---

## 构造合并转发

`forward` 容器直接包含一个或多个 `msg` 元素：

```text
[forward]
  [msg user=10001 name=Alice]你好，[at 10002]！[/msg]
  [msg user=10002 name=Bob]看看这个：[img cat.png][/msg]
  [ref 987654]
[/forward]
```

直接子节点之间的结构空白用于排版，解析后删除。`forward` 直接出现其他文本或元素时，严格解析器必须报错；空的 `forward` 容器同样报错。

## 自定义消息节点

自定义消息节点必须为容器模式，要求 `user` 或 `name` 至少一个，禁止 `id`：

```text
[msg user=10001 name="Alice" time="2026-11-06T09:30:00+08:00"]你好！[img cat.png][/msg]
```

| 属性 | 必需 | 格式 |
| --- | --- | --- |
| `user` | 与 `name` 二选一 | 非空字符串 |
| `name` | 与 `user` 二选一 | 字符串，显示名称 |
| `time` | 否 | RFC 3339 子集：`YYYY-MM-DDThh:mm:ss[.fraction](Z\|±hh:mm)`，秒为 00–59 |
| `avatar` | 否 | 字符串，头像资源引用 |
| `platform`、`account`、`channel` | 否 | 字符串，来源作用域 |

`user`、`name`、`time` 是消息内容中的声明性元数据。

## 引用已有消息

`ref` 是引用已有消息的简写，展开为原子 `msg` 节点：

```text
[ref 987654]
[:msg id="987654"/]
```

引用节点必须为原子模式，要求非空 `id`，禁止 `user` 和 `name`，并且只允许作为 `forward` 容器的直接子节点。

> **注意**
>
> `[msg id=42/]` 会把 `42/` 读作 `id` 属性值，并继续等待 `[/msg]`。引用已有消息时应写 `[ref 42]` 或 `[:msg id="42"/]`。

## 引用已有合并转发

`forward` 的原子形式表示已有合并转发记录：

```text
[:forward id="f123"/]
```

原子 `forward` 必须有非空 `id`，不得有子节点；可以携带 `platform`、`account`、`channel` 等上下文属性。容器 `forward` 不得有 `id` 属性，必须包含至少一个 `msg` 节点。

## 嵌套转发

`msg` 的正文可以再包含 `forward`：

```text
[forward]
  [msg user=1]这是一条内嵌转发：[:forward id="f123"/][/msg]
[/forward]
```

语法对嵌套层数不加额外限制，容器深度受[解析资源预算](../parsing/)约束。

## 转发空白

`forward` 直接子节点之间的结构空白被删除，`msg` 内的空白全部保留：

```text
[forward]
  [msg user=1]第一行
第二行[/msg]
  [ref 42]
[/forward]
```

上例第一条消息的正文精确为 `第一行\n第二行`。若换行放在 `[msg user=1]` 后方，换行与缩进进入该消息的正文。

## 错误示例

| 输入 | 诊断码 |
| --- | --- |
| `[forward][/forward]` | `E_SCHEMA` |
| `[forward]hello[/forward]` | `E_SCHEMA` |
| `[forward][msg id=42/][/forward]` | `E_CLOSE` |
| `[ref 42]`（不在 `forward` 内） | `E_PARENT` |
| `[:msg user=1 name=Alice/]` | `E_SCHEMA` |
| `[:forward/]` | `E_SCHEMA` |
| `[forward][msg]缺属性[/msg][/forward]` | `E_SCHEMA` |
