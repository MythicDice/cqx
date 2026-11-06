# CQX v0.2：规范与 Python 参考实现

CQX（CQ eXtended）是一种用于纯文本构造富消息和嵌套消息树的实验性格式。

> 随手写效果等效，规范表示结构无损。

## 文件

- `SPEC.md`：CQX v0.2 规范草案，含简写注册表、属性规则、AST、转发、规范化、错误处理和完整示例。
- `cqx.py`：Python 3.10+ 标准库参考解析器、AST 校验器、规范化器和序列化器。
- `test_cqx.py`：边界行为与往返属性测试。
- `conformance.json`：独立有效/无效输入测试向量。
- `examples.cqx`：用于直观阅读的 CQX 示例。

## 运行

```bash
python cqx.py parse '你好 [@123]！'
python cqx.py normalize '[img https://example.org/a/?q=1]'
python -m unittest -v
python -m unittest -v test_conformance.py
```

## Python API

```python
from cqx import parse, serialize_canonical, normalize_ast, escape_text, encode_attr

ast = parse('你好 [@123]！')
canonical = serialize_canonical(ast)  # '你好 [:at id="123"/]！'
assert parse(canonical) == ast

# 动态正文必须按文字上下文转义。
untrusted = '这里的 [@all] 只是文字'
source = '[b]' + escape_text(untrusted) + '[/b]'
assert parse(source)[0].children[0].value == untrusted
```

## 本草案的边界

- CQX 文本负责表示结构；资源下载、消息发送和权限验证由宿主适配器执行。
- 自定义合并转发节点的用户、名称和时间是声明性元数据；发送平台决定其可信标识方式。
- `code raw` 是手写输入糖；规范化后表现为 `code` 元素及纯文本子节点。
- 参考解析器提供严格模式，暂不实现语法错误恢复、插件 schema 注册、资源解析或具体平台适配。
- v0.2 是独立设计草案，无历史语法兼容负担。

详见 `SPEC.md`。
