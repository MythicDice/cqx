/* 实时检查的唯一入口。
 * 编辑器、状态栏、预览、解析树与规范化面板都读取同一次真实解析的结果，
 * 界面上不预置任何错误状态，也不针对某段示例文本特判。
 */
import { parse } from './parser.js';

let cached = { src: null, result: null };

export function checkSource(src) {
  if (cached.src === src && cached.result) return cached.result;
  let result;
  try {
    result = { ok: true, doc: parse(src), error: null };
  } catch (error) {
    result = { ok: false, doc: null, error };
  }
  cached = { src, result };
  return result;
}
