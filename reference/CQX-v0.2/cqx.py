"""CQX v0.2 experimental reference implementation (Python 3.10+, stdlib only).

CQX is a *draft* rich-message text representation. This module implements
strict parsing, AST validation/normalization and canonical serialization.
It deliberately does no network, filesystem resource resolution or sending.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
import re
import sys
from typing import Literal, TypeAlias

VERSION = "0.2"
WS = " \t\r\n"
NAME_PATTERN = r"[A-Za-z][A-Za-z0-9_.-]*"
KEY_PATTERN = r"[A-Za-z_][A-Za-z0-9_.-]*"
NAME_RE = re.compile(NAME_PATTERN)
KEY_RE = re.compile(KEY_PATTERN)
AT_RE = re.compile(r"\[@([A-Za-z0-9_.-]+)\]")
CLOSE_RE = re.compile(r"\[/((?:" + NAME_PATTERN + r"))\]")
SHORT_START_RE = re.compile(r"\[(" + NAME_PATTERN + r")(?=[ \t\r\n/\]])")
RFC3339_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\Z"
)

# Frozen shorthand table for version 0.2.
POSITIONAL = {
    "link": "href", "img": "src", "reply": "id", "face": "id",
    "audio": "src", "video": "src", "file": "src",
    "ref": "id",
}
SHORT_ATOMIC = frozenset({"img", "reply", "face", "audio", "video", "file", "ref"})
SHORT_BLOCK = frozenset({"b", "i", "code", "link", "msg", "forward"})
BUILTIN_ATOMIC = frozenset({"at", "img", "reply", "face", "audio", "video", "file"})
BUILTIN_BLOCK = frozenset({"b", "i", "code", "link"})
REQUIRED_ATTRIBUTE = {"img": "src", "reply": "id", "face": "id",
                      "audio": "src", "video": "src", "file": "src", "link": "href"}


@dataclass(frozen=True)
class Text:
    value: str


@dataclass(frozen=True)
class Element:
    name: str
    attrs: tuple[tuple[str, str], ...] = ()
    children: tuple["Node", ...] = ()
    mode: Literal["void", "block"] = "void"

    def attr(self, key: str) -> str | None:
        return dict(self.attrs).get(key)


Node: TypeAlias = Text | Element
Document: TypeAlias = tuple[Node, ...]


class CQXError(ValueError):
    def __init__(self, code: str, detail: str, source: str, offset: int):
        self.code = code
        self.offset = offset  # Unicode code-point offset, zero-based
        self.line = source.count("\n", 0, offset) + 1
        line_start = source.rfind("\n", 0, offset) + 1
        self.column = offset - line_start + 1
        super().__init__(f"{code}: {detail} at line {self.line}, column {self.column}")


class CQXASTError(ValueError):
    def __init__(self, code: str, detail: str, path: str):
        self.code, self.path = code, path
        super().__init__(f"{code}: {detail} at {path}")


def _check_scalars(value: str) -> bool:
    return isinstance(value, str) and not any(0xD800 <= ord(ch) <= 0xDFFF for ch in value)


def _check_timestamp(value: str) -> bool:
    if not RFC3339_RE.fullmatch(value):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _validate_semantics(node: Element, *, parent: str | None) -> tuple[str, str] | None:
    """Report an error as (code, message), or None.

    Generic extensions are data-only at this layer. Core attributes with known
    meaning are checked, while additional attributes survive round-trips.
    """
    a, n = dict(node.attrs), node.name
    if n in BUILTIN_ATOMIC and node.mode != "void":
        return ("E_SCHEMA", f"{n} must be an atomic element")
    if n in BUILTIN_BLOCK and node.mode != "block":
        return ("E_SCHEMA", f"{n} requires a closing tag")
    if n in REQUIRED_ATTRIBUTE:
        key = REQUIRED_ATTRIBUTE[n]
        if not a.get(key):
            return ("E_SCHEMA", f"{n} requires a nonempty {key} attribute")
    if n == "at":
        if not ((bool(a.get("id")) and "type" not in a) or
                (a.get("type") == "all" and "id" not in a)):
            return ("E_SCHEMA", "at requires exactly one of nonempty id or type=all")
    if n == "msg":
        if parent != "forward":
            return ("E_PARENT", "msg must be a direct child of a forward container")
        if node.mode == "void":
            if not a.get("id") or "user" in a or "name" in a:
                return ("E_SCHEMA", "atomic msg requires id and forbids user/name")
        elif node.mode == "block":
            if not a.get("user") or "id" in a:
                return ("E_SCHEMA", "block msg requires user and forbids id")
        else:
            return ("E_SCHEMA", "invalid msg mode")
        if "time" in a and not _check_timestamp(a["time"]):
            return ("E_SCHEMA", "msg time must be an RFC 3339 timestamp with offset")
    if n == "forward":
        if node.mode == "void":
            if not a.get("id"):
                return ("E_SCHEMA", "atomic forward reference requires nonempty id")
        elif node.mode == "block":
            if "id" in a:
                return ("E_SCHEMA", "block forward must not have an id")
            if not node.children:
                return ("E_SCHEMA", "block forward must contain at least one msg")
            if any(not isinstance(child, Element) or child.name != "msg"
                   for child in node.children):
                return ("E_SCHEMA", "forward children must be msg nodes only")
        else:
            return ("E_SCHEMA", "invalid forward mode")
    return None


def normalize_ast(nodes: Document | list[Node], *, max_depth: int = 64,
                  max_nodes: int = 10_000) -> Document:
    """Validate an external AST, merge text, sort attrs, and drop forward indentation.

    The result is the semantic reference against which canonical roundtrips
    are compared. Malformed trees raise CQXASTError with a path.
    """
    if not isinstance(nodes, (tuple, list)):
        raise CQXASTError("E_AST", "document must be a list or tuple", "document")
    if max_depth < 0 or max_nodes < 0:
        raise ValueError("limits must be nonnegative")
    visited = 0

    def normalized(children: Document | list[Node], parent: str | None,
                   path: str, depth: int) -> Document:
        nonlocal visited
        if depth > max_depth:
            raise CQXASTError("E_LIMIT", "maximum AST depth exceeded", path)
        if not isinstance(children, (tuple, list)):
            raise CQXASTError("E_AST", "children must be a list or tuple", path)
        result: list[Node] = []
        for index, entry in enumerate(children):
            at = f"{path}[{index}]"
            visited += 1
            if visited > max_nodes:
                raise CQXASTError("E_LIMIT", "maximum AST node count exceeded", at)
            if isinstance(entry, Text):
                if not _check_scalars(entry.value):
                    raise CQXASTError("E_UNICODE", "text must contain Unicode scalar values", at)
                if parent == "forward":
                    if any(ch not in WS for ch in entry.value):
                        raise CQXASTError("E_PARENT", "forward only allows indentation text", at)
                    continue
                if not entry.value:
                    continue
                if result and isinstance(result[-1], Text):
                    result[-1] = Text(result[-1].value + entry.value)
                else:
                    result.append(entry)
                continue
            if not isinstance(entry, Element):
                raise CQXASTError("E_AST", "unknown node type", at)
            if not isinstance(entry.name, str) or not NAME_RE.fullmatch(entry.name):
                raise CQXASTError("E_NAME", "invalid element name", at)
            if entry.mode not in ("void", "block"):
                raise CQXASTError("E_AST", "invalid element mode", at)
            if not isinstance(entry.attrs, (tuple, list)):
                raise CQXASTError("E_AST", "attributes must be pairs", at)
            a: dict[str, str] = {}
            for pair in entry.attrs:
                if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                    raise CQXASTError("E_AST", "attribute must be a (name, value) pair", at)
                key, value = pair
                if not isinstance(key, str) or not KEY_RE.fullmatch(key):
                    raise CQXASTError("E_NAME", "invalid attribute name", at)
                if not _check_scalars(value):
                    raise CQXASTError("E_UNICODE", "attribute must be a scalar-value string", at)
                if key in a:
                    raise CQXASTError("E_ATTR_DUP", f"duplicate attribute {key}", at)
                a[key] = value
            if entry.mode == "void" and entry.children:
                raise CQXASTError("E_AST", "atomic element must have no children", at)
            new_children = normalized(entry.children, entry.name,
                                      at + ".children", depth + 1)
            node = Element(entry.name, tuple(sorted(a.items())), new_children, entry.mode)
            error = _validate_semantics(node, parent=parent)
            if error:
                raise CQXASTError(error[0], error[1], at)
            result.append(node)
        return tuple(result)

    return normalized(nodes, None, "document", 0)


def validate_ast(nodes: Document | list[Node]) -> None:
    normalize_ast(nodes)


@dataclass(frozen=True)
class _Token:
    kind: Literal["open", "close", "void"]
    name: str
    attrs: tuple[tuple[str, str], ...]
    start: int
    end: int
    raw: bool = False


class _Parser:
    def __init__(self, source: str, max_depth: int, max_nodes: int):
        self.s, self.i = source, 0
        self.max_depth, self.max_nodes = max_depth, max_nodes
        self.num_nodes = 0

    def error(self, code: str, message: str, offset: int | None = None):
        raise CQXError(code, message, self.s, self.i if offset is None else offset)

    def add_node(self, at: int):
        self.num_nodes += 1
        if self.num_nodes > self.max_nodes:
            self.error("E_LIMIT", "node count exceeds limit", at)

    def parse(self) -> Document:
        nodes = tuple(self._nodes(None, 0))
        # Syntactically parsed values already pass semantics, but validating the
        # normalized public tree also checks our serializer's shared contract.
        return normalize_ast(nodes, max_depth=self.max_depth,
                             max_nodes=self.max_nodes)

    def _nodes(self, expected_close: str | None, depth: int) -> list[Node]:
        if depth > self.max_depth:
            self.error("E_LIMIT", "maximum nesting depth exceeded")
        result: list[Node] = []
        buf: list[str] = []

        def flush():
            if buf:
                self.add_node(self.i)
                result.append(Text("".join(buf)))
                buf.clear()

        while self.i < len(self.s):
            ch = self.s[self.i]
            if ch == "\\" and self.i + 1 < len(self.s) and self.s[self.i + 1] in ("[", "\\"):
                buf.append(self.s[self.i + 1])
                self.i += 2
                continue
            if ch != "[":
                buf.append(ch)
                self.i += 1
                continue
            token = self._tag()
            if token is None:
                buf.append("[")
                self.i += 1
                continue
            flush()
            self.i = token.end
            if token.kind == "close":
                if expected_close is None:
                    self.error("E_CLOSE", f"unexpected closing tag [/{token.name}]", token.start)
                if token.name != expected_close:
                    self.error("E_CLOSE", f"expected [/{expected_close}], got [/{token.name}]", token.start)
                return result
            if token.kind == "void":
                node = Element(token.name, token.attrs, (), "void")
            else:
                if token.raw:
                    children = self._raw_code(token.start)
                else:
                    children = tuple(self._nodes(token.name, depth + 1))
                node = Element(token.name, token.attrs, children, "block")
            if node.name == "forward" and node.mode == "block":
                retained: list[Node] = []
                for child in node.children:
                    if isinstance(child, Text) and all(c in WS for c in child.value):
                        continue
                    retained.append(child)
                node = Element(node.name, node.attrs, tuple(retained), node.mode)
            if node.name == "msg" and expected_close != "forward":
                self.error("E_PARENT", "msg requires forward as direct parent", token.start)
            problem = _validate_semantics(node, parent=expected_close)
            if problem:
                self.error(*problem, token.start)
            self.add_node(token.start)
            result.append(node)
        flush()
        if expected_close is not None:
            self.error("E_CLOSE", f"missing closing tag [/{expected_close}]")
        return result

    def _raw_code(self, start: int) -> Document:
        """Parse [code raw] body. Only \\[/code] escapes the closing delimiter."""
        value: list[str] = []
        while self.i < len(self.s):
            if self.s.startswith(r"\[/code]", self.i):
                value.append("[/code]")
                self.i += len(r"\[/code]")
            elif self.s.startswith("[/code]", self.i):
                self.i += len("[/code]")
                text = "".join(value)
                if text:
                    self.add_node(start)
                    return (Text(text),)
                return ()
            else:
                value.append(self.s[self.i])
                self.i += 1
        self.error("E_RAW_CLOSE", "unclosed [code raw]", start)

    def _tag(self) -> _Token | None:
        source, start = self.s, self.i
        match = AT_RE.match(source, start)
        if match:
            word = match.group(1)
            attrs = (("type", "all"),) if word == "all" else (("id", word),)
            return _Token("void", "at", attrs, start, match.end())
        match = CLOSE_RE.match(source, start)
        if match:
            return _Token("close", match.group(1), (), start, match.end())
        generic = source.startswith("[:", start)
        if generic:
            head_start = start + 2
        else:
            match = SHORT_START_RE.match(source, start)
            if not match or match.group(1) not in SHORT_ATOMIC | SHORT_BLOCK:
                return None
            head_start = start + 1
        end = self._head_end(head_start)
        raw_head = source[head_start:end]
        # Generic syntax owns /] as one token; short atomic tags own only ].
        is_void = generic and raw_head.endswith("/")
        head = raw_head[:-1] if is_void else raw_head
        name_match = NAME_RE.match(head)
        if name_match is None:
            self.error("E_NAME", "missing/invalid element name", start)
        name = name_match.group(0)
        rest = head[name_match.end():]
        if not generic and name in SHORT_BLOCK and rest == "/":
            self.error("E_SHORT_CLOSE", "short container needs an explicit closing tag", start)
        if rest and rest[0] not in WS:
            self.error("E_ATTR", "whitespace required after element name", start)
        if generic:
            attrs = self._attributes(rest, None, start)
            return _Token("void" if is_void else "open", name, attrs, start, end + 1)
        if name not in SHORT_ATOMIC | SHORT_BLOCK:
            self.error("E_NAME", "unknown short tag", start)
        if name == "code" and rest.strip(WS) == "raw":
            return _Token("open", "code", (), start, end + 1, raw=True)
        # Every short form ends at ']' alone. A final slash in a bare value
        # (e.g. a link URL) is data, not a self-closing marker.
        if name in SHORT_BLOCK and rest.strip(WS) == "/":
            self.error("E_SHORT_CLOSE", "short container needs an explicit closing tag", start)
        attrs = self._attributes(rest, POSITIONAL.get(name), start)
        actual = "msg" if name == "ref" else name
        return _Token("void" if name in SHORT_ATOMIC else "open", actual, attrs, start, end + 1)

    def _head_end(self, begin: int) -> int:
        in_string, at = False, begin
        while at < len(self.s):
            ch = self.s[at]
            if in_string and ch == "\\":
                at += 2
                continue
            if ch == '"':
                in_string = not in_string
            elif ch == "]" and not in_string:
                return at
            at += 1
        self.error("E_TAG", "unterminated tag or string", begin - 2)

    def _attributes(self, rest: str, positional_key: str | None, at: int) -> tuple[tuple[str, str], ...]:
        values: dict[str, str] = {}
        pos = 0
        while pos < len(rest):
            while pos < len(rest) and rest[pos] in WS:
                pos += 1
            if pos == len(rest):
                break
            key_match = KEY_RE.match(rest, pos)
            if key_match and key_match.end() < len(rest) and rest[key_match.end()] == "=":
                key = key_match.group(0)
                val, pos = self._value(rest, key_match.end() + 1, at)
            elif positional_key is not None:
                key = positional_key
                val, pos = self._value(rest, pos, at)
            else:
                self.error("E_ATTR", "expected name=value attribute", at)
            if key in values:
                self.error("E_ATTR_DUP", f"duplicate {key} attribute", at)
            values[key] = val
            if pos < len(rest) and rest[pos] not in WS:
                self.error("E_ATTR", "attributes must be separated by ASCII whitespace", at)
        return tuple(sorted(values.items()))

    def _value(self, rest: str, pos: int, at: int) -> tuple[str, int]:
        if pos >= len(rest):
            self.error("E_ATTR", "missing attribute value", at)
        if rest[pos] == '"':
            try:
                value, n = json.JSONDecoder(strict=True).raw_decode(rest[pos:])
            except json.JSONDecodeError:
                self.error("E_ATTR", "invalid JSON quoted string", at)
            if not isinstance(value, str) or not _check_scalars(value):
                self.error("E_UNICODE", "attribute must be a Unicode scalar-value string", at)
            return value, pos + n
        end = pos
        while end < len(rest) and rest[end] not in WS:
            if rest[end] in ('[', ']', '"', '\\'):
                self.error("E_ATTR", "quote attribute containing a special character", at)
            end += 1
        if end == pos:
            self.error("E_ATTR", "empty unquoted attribute value", at)
        return rest[pos:end], end


def parse(source: str, *, max_depth: int = 64, max_nodes: int = 10_000,
          max_chars: int = 1_000_000) -> Document:
    if not isinstance(source, str):
        raise TypeError("CQX input must be str (UTF-8 must be decoded strictly upstream)")
    if len(source) > max_chars:
        raise CQXError("E_LIMIT", "input length exceeds limit", source, 0)
    for pos, ch in enumerate(source):
        if 0xD800 <= ord(ch) <= 0xDFFF:
            raise CQXError("E_UNICODE", "input has an unpaired surrogate", source, pos)
    if max_depth < 0 or max_nodes < 0 or max_chars < 0:
        raise ValueError("limits must be nonnegative")
    return _Parser(source, max_depth, max_nodes).parse()


def escape_text(value: str) -> str:
    if not _check_scalars(value):
        raise ValueError("expected Unicode scalar-value string")
    return value.replace("\\", "\\\\").replace("[", "\\[")


def encode_attr(value: str) -> str:
    if not _check_scalars(value):
        raise ValueError("expected Unicode scalar-value string")
    return json.dumps(value, ensure_ascii=False)


def serialize_canonical(nodes: Document | list[Node]) -> str:
    """Validate+normalize then write canonical CQX v0.2.

    parse(serialize_canonical(U)) == normalize_ast(U) for every valid U.
    """
    normalized = normalize_ast(nodes)

    def emit(node: Node) -> str:
        if isinstance(node, Text):
            return escape_text(node.value)
        attrs = "".join(f" {key}={encode_attr(value)}" for key, value in node.attrs)
        if node.mode == "void":
            return f"[:{node.name}{attrs}/]"
        return f"[:{node.name}{attrs}]" + "".join(emit(n) for n in node.children) + f"[/{node.name}]"
    return "".join(emit(node) for node in normalized)


# Optional convenience alias for the canonical serializer.
serialize = serialize_canonical


def as_json(nodes: Document | list[Node]) -> list[dict]:
    def encode(node: Node) -> dict:
        if isinstance(node, Text):
            return {"type": "text", "text": node.value}
        return {"type": "element", "name": node.name, "attrs": dict(node.attrs),
                "mode": node.mode, "children": [encode(child) for child in node.children]}
    return [encode(node) for node in normalize_ast(nodes)]


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in {"parse", "normalize"}:
        print('Usage: python cqx.py parse "Hello [@123]" | normalize "..."')
        raise SystemExit(2)
    try:
        doc = parse(sys.argv[2])
        if sys.argv[1] == "parse":
            print(json.dumps(as_json(doc), ensure_ascii=False, indent=2))
        else:
            print(serialize(doc))
    except (CQXError, CQXASTError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
