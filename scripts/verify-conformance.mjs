/* CQX v0.4 浏览器端解析器一致性自检
 * v0.4 改用 at 简写并增补 poke：核对 v0.2 / v0.3 的适用向量与 v0.4 向量，
 * 检查 parse / serializeCanonical 的往返性质，并确认在线尝试页的示例与错例
 * 都经由真实解析器，错例确实抛出预期诊断码且带有可定位的位置。
 * 运行：pnpm verify
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse, serializeCanonical, normalizeAst } from '../src/scripts/cqx-try/parser.js';
import { EXAMPLES, ERROR_EXAMPLES } from '../src/scripts/cqx-try/examples.js';
import { describeError } from '../src/scripts/cqx-try/diagnostics.js';
import { faceGlyph } from '../src/scripts/cqx-try/render.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readVectors = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const historical = [
  readVectors('reference/CQX-v0.2/conformance.json'),
  readVectors('scripts/conformance-v0.3.json'),
];
const current = readVectors('scripts/conformance-v0.4.json');
// 历史提及语法的预期归属各自版本；v0.4 文件完整覆盖当前提及规则。
const compatible = (kind) => historical.flatMap((version) => version[kind])
  .filter((vector) => !vector.input.includes('[@'));
// 相同输入采用当前版本的预期，保留历史版本中其余适用用例。
const accumulate = (kind) => [...new Map(
  [...compatible(kind), ...current[kind]].map((vector) => [vector.input, vector]),
).values()];
const vectors = { valid: accumulate('valid'), invalid: accumulate('invalid') };
const skipped = historical.reduce((count, version) =>
  count + [...version.valid, ...version.invalid].filter((vector) => vector.input.includes('[@')).length, 0);

let passed = 0;
const failures = [];
const check = (label, fn) => {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const vector of vectors.valid) {
  check(`合法向量 ${JSON.stringify(vector.input)}`, () => {
    const ast = parse(vector.input);
    const canonical = serializeCanonical(ast);
    assert(canonical === vector.canonical,
      `规范化文本不符\n    期望 ${vector.canonical}\n    实际 ${canonical}`);
    // 往返：规范化文本再解析，消息树不变；再序列化，文本不变。
    assert(JSON.stringify(parse(canonical)) === JSON.stringify(normalizeAst(ast)),
      'parse(serialize(T)) 与 normalizeAST(T) 不一致');
    assert(serializeCanonical(parse(canonical)) === canonical,
      'serialize(parse(serialize(T))) 与 serialize(T) 不一致');
  });
}

for (const vector of vectors.invalid) {
  check(`非法向量 ${JSON.stringify(vector.input)}`, () => {
    let code = null;
    try {
      parse(vector.input);
    } catch (error) {
      code = error.code;
    }
    assert(code === vector.code, `诊断码不符，期望 ${vector.code}，实际 ${code ?? '未报错'}`);
  });
}

// 在内存中迁移历史示例的提及写法，参考文件保留原文。
const examples = readFileSync(resolve(root, 'reference/CQX-v0.2/examples.cqx'), 'utf8')
  .replaceAll('[@', '[at ');
check('examples.cqx', () => {
  const ast = parse(examples);
  assert(ast.length > 0, '解析结果为空');
  assert(serializeCanonical(parse(serializeCanonical(ast))) === serializeCanonical(ast),
    '示例文件往返不一致');
});

// 在线尝试页的一键填入示例必须全部可解析且可无损往返。
EXAMPLES.forEach((example, index) => {
  check(`示例 ${index + 1} ${example.label}`, () => {
    const canonical = serializeCanonical(parse(example.code));
    assert(serializeCanonical(parse(canonical)) === canonical, '示例往返不一致');
  });
});

// 错例不得是摆设：逐条交给真实解析器，核对诊断码、源码定位与教学卡片内容。
ERROR_EXAMPLES.forEach((example, index) => {
  check(`错例 ${index + 1} ${example.label}`, () => {
    let error = null;
    try {
      parse(example.code);
    } catch (caught) {
      error = caught;
    }
    assert(error, '未抛出诊断错误');
    assert(error.code === example.expect,
      `诊断码不符，期望 ${example.expect}，实际 ${error.code}`);
    assert(Number.isFinite(error.utf16Offset) &&
      error.utf16Offset >= 0 && error.utf16Offset <= example.code.length,
    '错误缺少合法的源码位置');
    const d = describeError(error, example.code);
    assert(d.title && d.rule && d.suggestions.length, '教学卡片内容为空');
    assert(d.location, '教学卡片缺少源码定位');
  });
});

// face.set 必须真的切换表情，而不是只被解析器原样保留。
check('face.set 切换表情集', () => {
  const sets = ['default', 'qq', 'animal', 'gesture'];
  for (const id of ['0', '14', '29']) {
    const glyphs = sets.map((set) => faceGlyph(id, set));
    assert(glyphs.every((g) => typeof g === 'string' && g.length > 0),
      `编号 ${id} 未解析出表情`);
    assert(new Set(glyphs).size === sets.length, `编号 ${id} 在不同表情集下没有切换`);
  }
  assert(faceGlyph('14', undefined) === faceGlyph('14', 'default'),
    '省略 set 应使用默认表情集');
  assert(faceGlyph('14', 'unlisted') === faceGlyph('14', 'default'),
    '未登记的表情集应回退默认表情集');
  assert(faceGlyph('abc', 'qq') === null, '非数字编号不应伪造表情');
});

check('一键填入示例包含 set 用法', () => {
  assert(EXAMPLES.some((example) => /\[face[^\]]*\bset=/.test(example.code)),
    '示例没有演示 set 参数');
});

console.log(`CQX v0.4 一致性自检：${passed} 项通过，${failures.length} 项失败` +
  `（v0.4 向量 ${current.valid.length + current.invalid.length} 项，` +
  `累计适用向量 ${vectors.valid.length + vectors.invalid.length} 项，历史提及向量跳过 ${skipped} 项）`);
if (failures.length) {
  for (const line of failures) console.error(`  ✗ ${line}`);
  process.exitCode = 1;
}
