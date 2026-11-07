# 参考资料与能力边界

本文为独立草案；DiceScript / SeaDice 名称只用于说明目标兼容能力，不表示由该项目支持、参与或批准。

- SeaDice DiceScript 官方语法指南（2026-11-07 查阅）：https://github.com/sealdice/dicescript/blob/main/docs/GUIDE.md
- SeaDice DiceScript 项目首页 / README（2026-11-07 查阅）：https://github.com/sealdice/dicescript
- DiceScript 官方在线试用页（参考用途）：https://sealdice.github.io/dicescript/

## 资料使用方式

官方指南提供了普通/扩展骰点语法、数组/字典/函数、computed、模板字符串、流程控制、内建函数、序列化与资源预算等基线。`docs/07-dicescript-coverage.md` 将这些能力映射到**拟议**的下一代语言；它不是对 DiceScript 最新实现进行全量自动化验证的结果。

本草案所有新语法、类型和运行语义（如 `:=`、`r"..."`、`Formula.eval`、对象字面量方法、严格 Bool、`{{...}}` 文本执行块）都是设计提案，并非 DiceScript 现有语法。
