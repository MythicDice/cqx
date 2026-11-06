"""CQX v0.1 experimental message text language reference parser (not a standard).

Python 3.10+. All attributes are strings; element mode distinguishes leaf and block.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import re
import sys
from typing import Literal, TypeAlias


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
    def __init__(self, message: str, source: str, position: int):
        self.position = position
        self.line = source.count("\n", 0, position) + 1
        line_start = source.rfind("\n", 0, position) + 1
        self.column = position - line_start + 1
        super().__init__(f"{message} (line {self.line}, column {self.column})")


_NAME = r"[A-Za-z][A-Za-z0-9_.-]*"
_KEY = r"[A-Za-z_][A-Za-z0-9_.-]*"
_NAME_RE = re.compile(_NAME)
_KEY_RE = re.compile(_KEY)
_AT_RE = re.compile(r"\[@([A-Za-z0-9_.-]+)\]")
_CLOSE_RE = re.compile(r"\[/(" + _NAME + r")\]")
_SHORT_START_RE = re.compile(r"\[(" + _NAME + r")(?=[\s/\]])")

# Small, closed shorthand table; new/custom elements MUST use [:name ...].
POSITIONAL = {
    "at": "id",
    "img": "src",
    "reply": "id",
    "face": "id",
    "audio": "src",
    "video": "src",
    "file": "src",
}
SHORT_VOID = frozenset(POSITIONAL)
SHORT_BLOCK = frozenset({"forward", "msg", "b", "i", "link", "code"})
_WS = " \t\r\n"  # CQX structural whitespace, fixed across implementations
BUILTIN_VOID = SHORT_VOID
BUILTIN_BLOCK = SHORT_BLOCK


@dataclass(frozen=True)
class _Token:
    kind: Literal["open", "close", "void"]
    name: str
    attrs: tuple[tuple[str, str], ...]
    end: int
    start: int


class _Parser:
    def __init__(self, source: str, max_depth: int, max_nodes: int):
        self.s = source
        self.i = 0
        self.max_depth = max_depth
        self.max_nodes = max_nodes
        self.num_nodes = 0

    def error(self, message: str, position: int | None = None):
        raise CQXError(message, self.s, self.i if position is None else position)

    def add_node(self):
        self.num_nodes += 1
        if self.num_nodes > self.max_nodes:
            self.error(f"Node count exceeds {self.max_nodes}")

    def parse(self) -> Document:
        return tuple(self._nodes(None, 0))

    def _nodes(self, expected_close: str | None, depth: int) -> list[Node]:
        if depth > self.max_depth:
            self.error(f"Nesting depth exceeds {self.max_depth}")
        result: list[Node] = []
        buf: list[str] = []

        def flush():
            if buf:
                self.add_node()
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
            tok = self._tag()
            if tok is None:
                buf.append("[")
                self.i += 1
                continue
            flush()
            self.i = tok.end
            if tok.kind == "close":
                if expected_close is None:
                    self.error(f"Unexpected closing tag [/{tok.name}]", tok.start)
                if tok.name != expected_close:
                    self.error(f"Expected [/{expected_close}], got [/{tok.name}]", tok.start)
                return result
            if tok.kind == "void":
                elem = Element(tok.name, tok.attrs, (), "void")
            else:
                children = tuple(self._nodes(tok.name, depth + 1))
                elem = Element(tok.name, tok.attrs, children, "block")
            elem = self._validate(elem, tok.start)
            self.add_node()
            result.append(elem)
        flush()
        if expected_close is not None:
            self.error(f"Missing closing tag [/{expected_close}]")
        return result

    def _tag(self) -> _Token | None:
        i = self.i
        s = self.s
        m = _AT_RE.match(s, i)
        if m:
            ident = m.group(1)
            attrs = (("type", "all"),) if ident == "all" else (("id", ident),)
            return _Token("void", "at", attrs, m.end(), i)
        m = _CLOSE_RE.match(s, i)
        if m:
            return _Token("close", m.group(1), (), m.end(), i)
        is_long = s.startswith("[:", i)
        if is_long:
            start_of_head = i + 2
        else:
            m = _SHORT_START_RE.match(s, i)
            if not m or m.group(1) not in (SHORT_VOID | SHORT_BLOCK):
                return None
            start_of_head = i + 1
        end = self._head_end(start_of_head)
        h = s[start_of_head:end].strip(_WS)
        explicit_void = h.endswith("/")
        if explicit_void:
            h = h[:-1].rstrip(_WS)
        m = _NAME_RE.match(h)
        if not m:
            self.error("Missing or invalid element name", i)
        name = m.group(0)
        rest = h[m.end():]
        if rest and rest[0] not in _WS:
            self.error("Whitespace required after element name", i)
        if not is_long and name not in (SHORT_VOID | SHORT_BLOCK):
            self.error("Unsupported short tag (use [:name] for extensions)", i)
        attrs = self._attrs(rest, name, allow_positional=not is_long, at=i)
        if not is_long and name in SHORT_VOID:
            kind: Literal["open", "void"] = "void"
        else:
            kind = "void" if explicit_void else "open"
        return _Token(kind, name, attrs, end + 1, i)

    def _head_end(self, start: int) -> int:
        quoted = False
        i = start
        while i < len(self.s):
            c = self.s[i]
            if quoted and c == "\\":
                i += 2  # Hand escaped chars to JSON decoder later.
                continue
            if c == '"':
                quoted = not quoted
            if c == "]" and not quoted:
                return i
            i += 1
        self.error("Unterminated tag or quoted attribute", start - 1)

    def _attrs(self, rest: str, name: str, allow_positional: bool, at: int) -> tuple[tuple[str, str], ...]:
        values: dict[str, str] = {}
        pos = 0
        positional_used = False
        while pos < len(rest):
            while pos < len(rest) and rest[pos] in _WS:
                pos += 1
            if pos == len(rest):
                break
            if rest[pos] == '"':
                if not allow_positional or name not in POSITIONAL or positional_used:
                    self.error("Unexpected positional value", at)
                value, pos = self._value(rest, pos, at)
                key = POSITIONAL[name]
                positional_used = True
            else:
                start = pos
                while pos < len(rest) and rest[pos] not in _WS and rest[pos] != "=":
                    pos += 1
                word = rest[start:pos]
                if not word:
                    self.error("Expected attribute name or value", at)
                if pos < len(rest) and rest[pos] == "=":
                    if not _KEY_RE.fullmatch(word):
                        self.error(f"Invalid attribute name {word!r}", at)
                    key = word
                    pos += 1
                    value, pos = self._value(rest, pos, at)
                else:
                    if not allow_positional or name not in POSITIONAL or positional_used:
                        self.error(f"Unexpected positional value {word!r}", at)
                    key = POSITIONAL[name]
                    value = word
                    positional_used = True
            if key in values:
                self.error(f"Duplicate attribute {key!r}", at)
            values[key] = value
            if pos < len(rest) and rest[pos] not in _WS:
                self.error("Whitespace required between attributes", at)
        return tuple(sorted(values.items()))

    def _value(self, rest: str, pos: int, at: int) -> tuple[str, int]:
        if pos >= len(rest):
            self.error("Expected attribute value", at)
        if rest[pos] == '"':
            try:
                value, end = json.JSONDecoder().raw_decode(rest[pos:])
            except json.JSONDecodeError:
                self.error("Invalid JSON-quoted attribute", at)
            if not isinstance(value, str):
                self.error("Attribute must be a string", at)
            if any(0xD800 <= ord(c) <= 0xDFFF for c in value):
                self.error("Invalid Unicode surrogate in attribute value", at)
            return value, pos + end
        j = pos
        while j < len(rest) and rest[j] not in _WS:
            if rest[j] in ('[', ']', '"', '=', "\\"):
                self.error("Quote attribute values with special characters", at)
            j += 1
        if j == pos:
            self.error("Expected attribute value", at)
        return rest[pos:j], j

    def _validate(self, elem: Element, at: int) -> Element:
        name = elem.name
        attrs = dict(elem.attrs)
        if name in BUILTIN_VOID:
            if elem.mode != "void":
                self.error(f"{name} is an atomic element; use /]", at)
            required = POSITIONAL[name]
            if name == "at":
                # User mention or all-member mention, exactly one.
                if "type" in attrs:
                    if attrs["type"] != "all" or "id" in attrs:
                        self.error("at requires either id=... or type=all, not both", at)
                elif "id" not in attrs:
                    self.error("at requires either id=... or type=all", at)
            elif required not in attrs:
                self.error(f"{name} requires {required}=...", at)
        if name in BUILTIN_BLOCK and name != "msg" and elem.mode != "block":
            self.error(f"{name} requires an ending tag", at)
        if name == "link" and "href" not in attrs:
            self.error("link requires href=...", at)
        if name == "msg":
            if elem.mode == "void":
                if "id" not in attrs or "user" in attrs:
                    self.error("Self-closed msg must reference an id, without user", at)
            elif "id" in attrs or "user" not in attrs:
                self.error("Block msg requires user=..., and cannot contain id=...", at)
        if name == "forward":
            kept: list[Node] = []
            for child in elem.children:
                if isinstance(child, Text):
                    if any(c not in _WS for c in child.value):
                        self.error("forward may contain only msg nodes (and formatting whitespace)", at)
                elif child.name != "msg":
                    self.error("forward may contain only msg nodes", at)
                else:
                    kept.append(child)
            return Element(name, elem.attrs, tuple(kept), "block")
        return elem


def parse(source: str, *, max_depth: int = 64, max_nodes: int = 10_000,
          max_chars: int = 1_000_000) -> Document:
    """Parse CQX v0.1. Errors include 1-based line and column."""
    if len(source) > max_chars:
        raise CQXError(f"Input length exceeds {max_chars}", source, 0)
    return _Parser(source, max_depth, max_nodes).parse()


def serialize(nodes: Document | list[Node]) -> str:
    """Canonical, unambiguous CQX encoding. Does not pretty-print."""
    def encode(node: Node) -> str:
        if isinstance(node, Text):
            return node.value.replace("\\", "\\\\").replace("[", "\\[")
        if not _NAME_RE.fullmatch(node.name):
            raise ValueError(f"Invalid name: {node.name!r}")
        attrs = "".join(f" {k}={json.dumps(v, ensure_ascii=False)}" for k, v in sorted(node.attrs))
        if node.mode == "void":
            if node.children:
                raise ValueError("Atomic element cannot have children")
            return f"[:{node.name}{attrs}/]"
        return f"[:{node.name}{attrs}]" + "".join(encode(c) for c in node.children) + f"[/{node.name}]"
    return "".join(encode(n) for n in nodes)


def as_json(nodes: Document | list[Node]) -> list[dict]:
    def encode(node: Node) -> dict:
        if isinstance(node, Text):
            return {"type": "text", "text": node.value}
        return {"type": "element", "name": node.name, "attrs": dict(node.attrs),
                "mode": node.mode, "children": [encode(child) for child in node.children]}
    return [encode(n) for n in nodes]


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
    except CQXError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1)
