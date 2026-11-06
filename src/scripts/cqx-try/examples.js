import { SAMPLE_PNG_DATA_URL } from './sample-image.js';

/* 10 个递进示例。正文只写消息本身，不写讲解、不写规则说明。
 * 每个示例都必须能被严格解析器接受，且规范化文本可无损往返。
 */
export const EXAMPLES = [
  {
    label: '纯文本与转义',
    code: `你好，这是一段普通文本。
文件放在 [note] 目录里，编号 [1,2,3]。
a&b、<hello>、x=y

\\[@123] 和 [@123]
C:\\Users\\Alice
\\\\`,
  },
  {
    label: '提及与表情',
    code: `[@10001] 早上好，记得看一下文档 [face 14]
[@all] 下午三点开会，别迟到～
[face 0] [face 23] [face 29] [face 999]
[:at id="10002"/]`,
  },
  {
    label: '文本样式与链接',
    code: `[b]加粗[/b]、[i]斜体[/i]、[code]行内代码[/code]
[b]粗体里的 [i]斜体[/i][/b]
[link https://example.org/规范]打开规范文档[/link]
[link https://example.org/a?x=1&y=2]下载报表[/link]
[:link href="/"]首页[/link]`,
  },
  {
    label: '回复与引用',
    code: `[@10001] 收到，我马上处理，稍等一下。[face 14]
[reply 42]
[reply 43 platform=qq account=bot-1]
[:forward id="f123"/]`,
  },
  {
    label: '图片：内嵌与 URL',
    code: `[img "${SAMPLE_PNG_DATA_URL}" alt="内嵌图片"]
[img "/cqx-sample.png" alt="站点内图片"]
[img "/cqx-sample-2.png" alt="另一张图片"]
[:img src="/cqx-sample.png" alt="CQX 图标"/]`,
  },
  {
    label: '文件、音频与视频',
    code: `[img "/cqx-sample.png?size=2&format=webp" alt="带 = 与 & 的 URL"]
[img "/cqx-sample-2.png" alt="封面图 2"]
[:file src="report.pdf" name="季度报告.pdf"/]
[audio voice.ogg][video demo.mp4]`,
  },
  {
    label: '合并转发：聊天记录',
    code: `[forward]
  [msg user=10001 name="Alice" time="2026-11-06T09:30:00+08:00"]早上好 [@10002]！[face 14][/msg]
  [msg user=10002 name="Bob"]这张图给你：[img "/cqx-sample.png"][/msg]
  [msg user=10003 name="Cindy"]收到 [b]谢谢[/b]！[/msg]
[/forward]
[@10001] 已读。`,
  },
  {
    label: '引用消息与嵌套转发',
    code: `[forward]
  [msg user=10001 name="Alice"][:forward id="f123"/][/msg]
  [msg user=10002 name="Bob"][:reply id="42"/][/msg]
  [ref 987654]
  [:msg id="987655"/]
[/forward]
[:forward id="f123"/]`,
  },
  {
    label: '原样围栏',
    code: `[code]
print("[@all]")
print("[img cat.png]")
[/code]

[raw]这里的 [@all] 是普通文字[/raw]
[code#]print("[/code]")[/code#]
[code lang=python]print("hello")[/code]`,
  },
  {
    label: '扩展元素',
    code: `[:acme.poll title="午饭吃什么？"]
  [:acme.option id="a" label="披萨"/]
  [:acme.option id="b" label="寿司"/]
[/acme.poll]
[:acme.badge text="v0.3"/]
[:vendor.card title="自定义卡片"]内容[/vendor.card]
[:x b=2 a=1/]`,
  },
];

/* 错例只是普通文本，和正常示例走同一条填入与解析路径。
 * expect 是该文本经严格解析器后应抛出的真实诊断码，由 pnpm verify 逐条核对。
 * 正文同样只写消息内容，不写讲解。
 */
export const ERROR_EXAMPLES = [
  {
    label: '闭合错配',
    expect: 'E_CLOSE',
    code: `[@all] 下午三点开会，别迟到～
[b]记得带资料[/i]
[img "/cqx-sample.png"]`,
  },
  {
    label: '漏写结束',
    expect: 'E_CLOSE',
    code: `[@10001] 收到
[b]请尽快确认
[face 14]`,
  },
  {
    label: '简写自闭',
    expect: 'E_SHORT_CLOSE',
    code: `[b/]加粗文字
[@10001] 看一下`,
  },
  {
    label: '重复属性',
    expect: 'E_ATTR_DUP',
    code: `[img "/cqx-sample.png" src="/cqx-sample-2.png"]`,
  },
  {
    label: '属性缺空格',
    expect: 'E_ATTR',
    code: `[img "/cqx-sample.png"alt="站点内图片"]`,
  },
  {
    label: '缺必需属性',
    expect: 'E_SCHEMA',
    code: `[@10001] 这张图
[img]`,
  },
  {
    label: '引号未闭合',
    expect: 'E_TAG',
    code: `[img "/cqx-sample.png" alt="站点内图片]`,
  },
  {
    label: '原样围栏未闭合',
    expect: 'E_RAW_CLOSE',
    code: `[code#]
print("[/code]")`,
  },
  {
    label: '消息放错位置',
    expect: 'E_PARENT',
    code: `[msg user=10001 name="Alice"]早上好[/msg]`,
  },
  {
    label: '漏写元素名',
    expect: 'E_NAME',
    code: `[: title="卡片"/]`,
  },
];
