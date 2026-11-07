# 语义检查案例（未来一致性测试的输入意图）

**这些测试尚未执行，也没有配套解释器。** 对随机结果只测试不变量、样本数、引用身份，不硬编码随机数字。

## 声明和作用域

```text
x := 1
x = 2
x                 # 预期 Int(2)
```

```text
x := 1
if true { y := 3; x = 2 }
y                 # 预期 N001 未声明名称
```

```text
x := 1
x = "1"           # 预期 T001 类型不兼容
```

## 布尔、空值与表达式

```text
0 ?? 2            # Int(0)
null ?? 2         # Int(2)
false || true     # Bool(true)
if 1 { 7 }        # T002
if false { 7 }    # Unit
```

## 骰点引用与过程

```text
r := d6
r + r             # 只抽样 1 次；结果 total = r.total * 2
```

```text
a := d6
b := d6
a + b             # 抽样 2 次
```

```text
r := 3d6kh2
r.faces.len()     # Int(3)，无论哪些骰被丢弃
r.dice.count(x => x.kept) # Int(2)
```

```text
3d6kh9           # D001：保留骰数量超过骰数
```

## Formula 显式求值

```text
f := formula(ctx => d6 + ctx.n)
o := { n: 2, f: f }
o.f               # Formula，读取不抽样
o.f.eval(o)       # 抽样 1 次，得到 Roll
o.f.eval(o)       # 再抽样 1 次
```

## 对象与方法

```text
o := { HP: 8, heal(n) { self.HP = self.HP + n; self.HP } }
f := o.heal
f(2)
o.HP              # Int(10)，提取方法仍绑定 o
```

## 文本嵌入

```text
{{ null }}        # 插入空串
{{ "" }}          # 插入空串
{{ 0 }}           # 插入 "0"
{{ false }}       # 插入 "false"
{{ 3d0 }}         # 报 D001，不得静默插空串
```

## 列表

```text
[1..3]          # [1, 2, 3]
[5..3]          # [5, 4, 3]
[1,2,3][1:3]    # [2, 3]
[3,8,10,5,9].count(x => x >= 8) # Int(3)
```

## 语法解析

```text
obj := { a: 1, b(x) { x + 1 } }
obj.b(2)           # Int(3)
```

```text
obj := { a: 1 b: 2 }  # S002，缺成员逗号
```

```text
b2 := 12
b2                   # Int(12)；不作 CoC 骰点
r"b2"                # Roll；按 CoC 奖励骰规则抽样
```
