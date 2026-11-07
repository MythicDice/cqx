# 05 · 内建对象与函数（v0.1 草案）

这里给出供脚本作者使用的**最小常用函数表**，不是 JavaScript 标准库的复制。所有方法拥有明确形参数量，运行时类型错误应可诊断。非随机纯函数不消耗骰点随机源。

## 数值与转换

| 函数 | 说明 |
|---|---|
| `abs(x)` | 绝对值；Int/Float/Roll 合法，Roll 保留轨迹 |
| `floor(x)`、`ceil(x)` | 数值取整，返回 Int |
| `round(x)` | 四舍五入，恰好半值远离 0，返回 Int |
| `min(a,b,...)` / `max(a,b,...)` | 比较数值，返回对应参数的值；若为 Roll 保留 Roll |
| `Int(x)`、`Float(x)` | 数值/字符串转换，支持 Roll 转纯数值 |
| `String(x)` | 转为**普通**文本数据，不等同于调试源码；对对象使用文本表示 |
| `Bool(x)` | 显式真值转换 |
| `repr(x)` | 稳定可供排查的调试表示（不保证可作源码重新加载） |
| `bitXor(a,b)` | Int 按位异或 |
| `typeOf(x)` | 返回规范化类型名字符串 |

`/` 返回 Float，除 0 报错；`%` 是 Int 余数；`Int(Float)` 朝零截断；整数溢出和无穷大报错。

## List 方法

| 方法 | 效果 |
|---|---|
| `a.len()` / `a.length` | 返回列表长度 Int |
| `a.sum()` | 数值求和；含 Roll 时保留计算轨迹 |
| `a.kh(n=1)`、`a.kl(n=1)` | 选择最高/最低 n 项后按值求和，不改变列表 |
| `a.shuffle()` | 返回随机重排的新列表，不修改 a |
| `a.rand()` | 随机选一项，不修改列表 |
| `a.randSize(n)` | 不放回随机取 n 项，不修改列表 |
| `a.push(x)` | 追加一项，修改 a，返回 a |
| `a.pop()`、`a.shift()` | 移除末尾/首项，返回移除值 |
| `a.map(f)` | 返回逐项映射后的新列表 |
| `a.filter(f)` | `f` 必须返回 Bool；返回筛选后的新列表 |
| `a.count(f)` | `f` 必须返回 Bool；返回符合条件的项数 Int |

`kh/kl` 可处理 `Int`/`Float`/`Roll` 项；排序比较使用数值（Roll 为 `.total`），相等时以原始索引稳定决胜。`n` 必须在 `[1, a.len()]`；空列表的 `sum()` 为 Int(0)，空列表的 `rand/pop/shift` 报错。

对于 Roll：`r.faces` 是 List<Int>，所以 `r.faces.count(x => x >= 8)` 是合法的骰池面值计数；如果要表达“仅保留的骰面”，应使用 `r.dice.filter(x => x.kept).map(x => x.effective)`。

## Object 方法

| 方法 | 效果 |
|---|---|
| `o.len()` | 自有键数量 Int |
| `o.has(key)` | Bool；只查对象自身字段 |
| `o.get(key, default=null)` | 若存在返回实际值，否则返回 default |
| `o.keys()` | 按插入顺序返回键列表 |
| `o.values()` | 按插入顺序返回值列表；不自动求值 Formula |
| `o.items()` | 按插入顺序返回 `[key, value]` 组成的列表 |

所有键必须为 String，必要时 `String(number)`；不会自动将 12 与 "12" 视为同一个键。用户若自己定义了 `keys` 等同名字段，将遮蔽对象内建方法；可用 `Object.keys(o)` 等等价静态函数访问内建方法（`Object` 是内建值，不是关键字）。

## Roll 与 Formula

| 入口 | 说明 |
|---|---|
| `roll(text: String)` | 按规则骰文法解析、计算，返回 Roll |
| `r.total`, `.faces`, `.dice`, `.trace`, `.detail` | Roll 结果和过程 |
| `formula(fn)` | 创建可序列化的 Formula，捕获受约束的环境 |
| `f.eval(ctx)` | 显式求值，缺失上下文属性报错 |
| `f.bind(obj)` | 返回带默认上下文的新 Formula |

## 可选命名的规则骰对象

`coc.bonus(n)`、`coc.penalty(n)`、`fate.roll()`、`wod.roll(count, again: ..., target: ...)` 用于常见规则；DX 需要在 v0.1 中冻结参数映射后才有规范化的对象函数签名，当前通过 `r"..."` 和 `roll(String)` 完整覆盖其旧文法能力。自定义规则也经由此统一入口。

## 不属于本语言的内建内容

没有 `print`、`say`、`console`，没有 HTTP、文件、线程、异步 Promise、DOM、JS `eval`、任意正则驱动的顶层语法修改。输出文本通过宿主执行块结果插入；需要复杂插件用宿主 JS。
