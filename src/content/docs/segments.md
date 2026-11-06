---
title: "内置消息元素"
description: "CQX v0.3 的原子元素、容器元素、原样围栏、必需属性与资源标识符形式。"
---

本节规定 CQX v0.3 登记的元素名称与属性含义。所有内置原子元素均可使用通用自闭合写法；简写的原子元素省略自闭合斜杠。

## 原子元素

| 类型 | 简写 | 必需属性 | 已定义可选属性 | 含义 |
| --- | --- | --- | --- | --- |
| `at` | `[@123]`、`[@all]` | `id` 或 `type=all` | — | 提及用户或全体成员 |
| `img` | `[img cat.png]` | `src` | `alt` | 图片 |
| `reply` | `[reply 42]` | `id` | `platform`、`account`、`channel` | 回复引用 |
| `face` | `[face 14]` | `id` | `set`、`variant` | 平台表情 |
| `audio` | `[audio voice.ogg]` | `src` | — | 音频 |
| `video` | `[video demo.mp4]` | `src` | — | 视频 |
| `file` | `[file report.pdf]` | `src` | `name` | 文件 |

`at` 必须恰好指定非空的 `id` 或 `type="all"`。其他内置原子类型的必需属性必须是非空字符串。元素可以携带扩展属性，解析器必须原样保留。

一些写法如下：

```text
[@123456]
[@all]
[:at id="all"/]
[img "cat photo.png" alt="猫"]
[audio voice.ogg][video demo.mp4]
[file report.pdf name="季度报告.pdf"]
[face 14] [face 14 variant=super]
```

> **注意**
>
> `[@all]` 专指全体成员。要提及 ID 字面值 `all`，必须使用通用写法 `[:at id="all"/]`。

### 回复作用域

`reply` 的 `id` 是字符串；`platform`、`account`、`channel` 可指定引用作用域，省略时引用当前上下文中的消息：

```text
[reply 42]
[reply 42 platform=qq account=bot-1 channel=room-7]
[:reply id="42" platform="qq"/]
```

引用作用域的三个属性均为字符串，解析器不做数值或布尔转换。

### 资源标识符

`img`、`audio`、`video`、`file` 的 `src` 是字符串资源标识符，可采用 URL、相对资源标识或 `cid:` 引用：

```text
[img cat.png]
[img https://example.org/cat.jpg?size=2&format=webp]
[:img src="cid:sha256-example"/]
```

`src` 中的 `=`、`?`、`&` 属于裸值内容，无需引号；内含结构空白或 `[`、`]`、`"`、`\` 时必须使用引号值。`src` 在消息树中保存为字符串。

## 容器元素

| 类型 | 简写 | 必需属性 | 含义 |
| --- | --- | --- | --- |
| `b` | `[b]...[/b]` | — | 加粗样式 |
| `i` | `[i]...[/i]` | — | 斜体样式 |
| `code` | `[code]...[/code]` | — | 原样围栏，见[原样围栏](../code/) |
| `link` | `[link https://a.test]网页[/link]` | `href` | 超链接 |
| `forward` | `[forward]...[/forward]` | 见[合并转发](../forward/) | 合并转发 |
| `msg` | `[msg name=...]...[/msg]` | 见[合并转发](../forward/) | 转发消息节点 |

`b`、`i`、`link` 可以在正文中嵌套使用；`code` 使用原样围栏；`msg` 的直接父元素必须是 `forward` 容器。`link.href` 必须非空：

```text
[b]重要[/b]、[i]强调[/i]、[code]x = 1[/code]
[link https://example.org/?q=cat&page=2]打开网页[/link]
```

`[:code]...[/code]` 按普通 CQX 规则解析，且只能产生 Text 子节点；直接粘贴含 CQX 标记的代码时，使用[原样围栏](../code/)。

## 扩展元素

所有合法名称都可以使用通用写法：

```text
[:acme.card title="选择操作"]
  [:acme.button label="同意" action="yes"/]
  [:acme.button label="拒绝" action="no"/]
[/acme.card]
[:x/]
```

解析器必须保留未知扩展元素的名称、属性、原子或容器模式及子内容。扩展容器内的排版换行保留为文本节点；只有 `forward` 使用特殊空白规则。

> **注意**
>
> 扩展元素的 `action` 等字段只是数据，解析器不得执行脚本、插件动作或外部资源访问。
