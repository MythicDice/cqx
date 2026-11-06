"""CQX v0.2 conformance smoke tests and reference implementation regression tests."""
import random
import unittest

from cqx import (
    Text, Element, CQXError, CQXASTError, WS,
    parse, serialize, normalize_ast, escape_text, encode_attr, as_json,
)


class CQX02Tests(unittest.TestCase):
    def assert_equivalent(self, shorthand, canonical):
        self.assertEqual(parse(shorthand), parse(canonical))
        self.assertEqual(serialize(parse(shorthand)), canonical)

    def assert_invalid(self, source, code=None):
        with self.assertRaises(CQXError) as captured:
            parse(source)
        if code is not None:
            self.assertEqual(captured.exception.code, code)

    def assert_ast_invalid(self, nodes, code=None):
        with self.assertRaises(CQXASTError) as captured:
            serialize(nodes)
        if code is not None:
            self.assertEqual(captured.exception.code, code)

    def test_mention(self):
        self.assert_equivalent('你好 [@00123]！', '你好 [:at id="00123"/]！')
        self.assert_equivalent('[@all]', '[:at type="all"/]')
        self.assert_equivalent('[:at id="all"/]', '[:at id="all"/]')

    def test_short_media(self):
        self.assert_equivalent('[img cat.png]', '[:img src="cat.png"/]')
        self.assert_equivalent('[audio clip.ogg]', '[:audio src="clip.ogg"/]')
        self.assert_equivalent('[video clip.mp4]', '[:video src="clip.mp4"/]')
        self.assert_equivalent('[file file.pdf]', '[:file src="file.pdf"/]')
        self.assert_equivalent('[face 14]', '[:face id="14"/]')
        self.assert_equivalent('[reply 42]', '[:reply id="42"/]')

    def test_url_query_equals(self):
        u = 'https://example.org/a.png?x=1&y=2'
        self.assert_equivalent('[img ' + u + ']', '[:img src="' + u + '"/]')
        self.assert_equivalent('[img src=' + u + ']', '[:img src="' + u + '"/]')
        self.assert_equivalent('[link href=' + u + ']看图[/link]', '[:link href="' + u + '"]看图[/link]')

    def test_url_trailing_slash_shorthand(self):
        self.assert_equivalent('[img https://example.org/a/]', '[:img src="https://example.org/a/"/]')
        self.assert_equivalent('[img cat.png/]', '[:img src="cat.png/"/]')

    def test_trailing_slash_generic_quote(self):
        # Universal /] is unambiguous in the grammar; quoted spelling preserves URL slash.
        self.assert_equivalent('[:img src="https://example.org/a/"/]',
                               '[:img src="https://example.org/a/"/]')
        self.assert_equivalent('[:img src=https://example.org/a/]',
                               '[:img src="https://example.org/a"/]')

    def test_path_and_quoted_url(self):
        self.assert_equivalent('[img "cat photo.png"]', '[:img src="cat photo.png"/]')
        self.assert_equivalent('[img "https://x.test/?q=[1]&a=2"]',
                               '[:img src="https://x.test/?q=[1]&a=2"/]')

    def test_attr_priority(self):
        self.assert_equivalent('[img "foo=bar"]', '[:img src="foo=bar"/]')
        self.assert_equivalent('[img a/b=c]', '[:img src="a/b=c"/]')
        self.assert_invalid('[img foo=bar]', 'E_SCHEMA')
        self.assert_invalid('[img src=foo src=bar]', 'E_ATTR_DUP')

    def test_link_positional_url(self):
        self.assert_equivalent('[link https://example.org/?x=1&y=2]网页[/link]',
                               '[:link href="https://example.org/?x=1&y=2"]网页[/link]')
        self.assert_equivalent('[link "https://example.org/a b"]网页[/link]',
                               '[:link href="https://example.org/a b"]网页[/link]')
        self.assert_invalid('[link https://x href=https://y]网页[/link]', 'E_ATTR_DUP')
        self.assert_equivalent('[link https://example.org/a/]网页[/link]',
                               '[:link href="https://example.org/a/"]网页[/link]')

    def test_forward_bodies(self):
        s = '[forward]\n  [msg user=1 name="Alice"]你好[/msg]\n  [ref 42]\n[/forward]'
        want = '[:forward][:msg name="Alice" user="1"]你好[/msg][:msg id="42"/][/forward]'
        self.assert_equivalent(s, want)
        self.assertEqual(len(parse(s)), 1)
        self.assertEqual(len(parse(s)[0].children), 2)

    def test_forward_exact_body_whitespace(self):
        raw = '[forward]\n  [msg user=1]\n  你好\n  [/msg]\n[/forward]'
        node = parse(raw)[0].children[0]
        self.assertEqual(node.children, (Text('\n  你好\n  '),))
        self.assertTrue(serialize(parse(raw)).startswith('[:forward][:msg'))

    def test_forward_whitespace_policy(self):
        self.assert_equivalent('[forward] \t\r\n[msg user=1]x[/msg] \n[/forward]',
                               '[:forward][:msg user="1"]x[/msg][/forward]')
        self.assert_invalid('[forward]\u00a0[msg user=1]x[/msg][/forward]', 'E_SCHEMA')
        self.assert_invalid('[forward]hello[msg user=1]x[/msg][/forward]', 'E_SCHEMA')
        self.assert_invalid('[forward][img x][/forward]', 'E_SCHEMA')
        self.assert_invalid('[forward][/forward]', 'E_SCHEMA')

    def test_ref_only_inside_forward(self):
        self.assert_invalid('[ref 42]', 'E_PARENT')
        self.assert_invalid('[:msg id="42"/]', 'E_PARENT')
        self.assert_invalid('[msg user=1]x[/msg]', 'E_PARENT')
        self.assert_invalid('[b][msg user=1]x[/msg][/b]', 'E_PARENT')
        self.assert_invalid('[forward][msg user=1][msg user=2]x[/msg][/msg][/forward]', 'E_PARENT')

    def test_forward_reference(self):
        self.assert_equivalent('[:forward id="f1"/]', '[:forward id="f1"/]')
        self.assert_invalid('[:forward/]', 'E_SCHEMA')
        self.assert_invalid('[:forward id="f1"]x[/forward]', 'E_SCHEMA')

    def test_msg_short_selfclose_is_error(self):
        self.assert_invalid('[forward][msg id=42/][/forward]', 'E_CLOSE')
        self.assert_invalid('[b/]x[/b]', 'E_SHORT_CLOSE')

    def test_code_raw_paste(self):
        code = '[code raw]print("[@all]")\n[img cat.png][/code]'
        target = '[:code]print("\\[@all]")\n\\[img cat.png][/code]'
        self.assert_equivalent(code, target)
        self.assertEqual(parse(code)[0].children[0].value, 'print("[@all]")\n[img cat.png]')

    def test_raw_code_escaped_delimiter(self):
        raw = r'[code raw]literal \[/code] here[/code]'
        self.assertEqual(parse(raw)[0].children[0].value, 'literal [/code] here')
        self.assert_invalid('[code raw]missing close', 'E_RAW_CLOSE')

    def test_code_normal_parses_rich_nodes(self):
        self.assertEqual(parse('[code][@123][/code]')[0].children[0].name, 'at')

    def test_custom_extension_roundtrips(self):
        src = '[:a.poll title="菜单"]\n  [:a.option id=a/]\n[/a.poll]'
        norm = serialize(parse(src))
        self.assertEqual(parse(norm), parse(src))
        self.assertIn('\n  ', norm)

    def test_empty_block_distinguished(self):
        self.assertNotEqual(parse('[:x/]'), parse('[:x][/x]'))
        self.assertEqual(serialize(parse('[:x][/x]')), '[:x][/x]')

    def test_non_ascii_space_not_tag(self):
        self.assertEqual(parse('[img\u00a0cat.png]'), (Text('[img\u00a0cat.png]'),))

    def test_literal_plain_text(self):
        self.assertEqual(parse('[note] [1,2,3] a&b <hi>'), (Text('[note] [1,2,3] a&b <hi>'),))
        self.assertEqual(parse(r'\[@123]'), (Text('[@123]'),))
        self.assertEqual(parse(r'C:\Users\Alice'), (Text(r'C:\Users\Alice'),))
        self.assert_equivalent(r'\[@123]', r'\[@123]')
        self.assertEqual(serialize(parse('[note]')), r'\[note]')

    def test_schema_errors(self):
        for s in ('[img]', '[:img/]', '[:at/]', '[:at id=""/]',
                  '[:at id="1" type="all"/]', '[:at type="other"/]',
                  '[:b/]', '[:link]x[/link]', '[:reply id=""/]',
                  '[forward][msg user=1/][/forward]',
                  '[forward][:msg id="1" name="A"/][/forward]',
                  '[forward][msg user=1 id=2]x[/msg][/forward]'):
            with self.subTest(s=s):
                self.assert_invalid(s)

    def test_parser_errors(self):
        for s in ('[:foo]', '[:/]', '[:x a=1 a=2/]', '[:x a=hello"/]',
                  '[:x a="unterminated/]', '[:x a="\\uD800"/]',
                  '[/x]', '[b]x[/i]', '[b]x', '[img src=]',
                  '[:x a="foo"bar/]', '[forward][msg user=1]x[/msg]'):
            with self.subTest(s=s):
                self.assert_invalid(s)

    def test_msg_timestamp(self):
        self.assert_equivalent('[forward][msg user=1 time=2026-11-06T09:00:00Z]hi[/msg][/forward]',
                               '[:forward][:msg time="2026-11-06T09:00:00Z" user="1"]hi[/msg][/forward]')
        self.assert_invalid('[forward][msg user=1 time=2026-99-42T99:99:99Z]hi[/msg][/forward]', 'E_SCHEMA')

    def test_scope_attrs_are_strings(self):
        result = parse('[:reply id="00042" platform="qq" channel="003" account="botA"/]')
        self.assertEqual(result[0].attr('id'), '00042')
        self.assertEqual(result[0].attr('channel'), '003')

    def test_double_quotes(self):
        self.assert_equivalent(r'[:x z="\"hi\"" a="\\"/]', r'[:x a="\\" z="\"hi\""/]')

    def test_ast_merge_text(self):
        unnormalized = (Text('a'), Text(''), Text('b'))
        self.assertEqual(normalize_ast(unnormalized), (Text('ab'),))
        self.assertEqual(serialize(unnormalized), 'ab')

    def test_ast_missing_required(self):
        self.assert_ast_invalid((Element('img'),), 'E_SCHEMA')
        self.assert_ast_invalid((Element('forward', mode='block'),), 'E_SCHEMA')
        self.assert_ast_invalid((Element('msg', attrs=(("user", "1"),), mode='block'),), 'E_PARENT')

    def test_ast_duplicates(self):
        self.assert_ast_invalid((Element('x', attrs=(('a', '1'), ('a', '2'))),), 'E_ATTR_DUP')
        self.assert_ast_invalid((Element('x', attrs=(('bad key', '1'),)),), 'E_NAME')

    def test_ast_illegal_children(self):
        self.assert_ast_invalid((Element('x', children=(Text('bad'),), mode='void'),), 'E_AST')
        self.assert_ast_invalid((Element('forward', children=(Text('a'), Element('msg',
            attrs=(("user", "1"),), mode='block')), mode='block'),), 'E_PARENT')

    def test_external_ast_limits(self):
        very_deep = Text('tail')
        for _ in range(70):
            very_deep = Element('custom', children=(very_deep,), mode='block')
        self.assert_ast_invalid((very_deep,), 'E_LIMIT')
        self.assert_ast_invalid(tuple(Text(str(i)) for i in range(10_001)), 'E_LIMIT')

    def test_surrogates(self):
        self.assert_invalid('abc\ud800', 'E_UNICODE')
        self.assert_invalid('[:x v="\\ud800"/]', 'E_UNICODE')
        self.assert_ast_invalid((Text('\ud800'),), 'E_UNICODE')
        self.assert_ast_invalid((Element('x', attrs=(('a', '\ud800'),)),), 'E_UNICODE')

    def test_quote_helpers(self):
        user = 'Hello [@all] C:\\Downloads'
        self.assertEqual(parse(escape_text(user)), (Text(user),))
        self.assertEqual(encode_attr('a]b"c'), '"a]b\\"c"')

    def test_unknown_extensions_not_short_tags(self):
        self.assertEqual(parse('[acme.poll]'), (Text('[acme.poll]'),))
        self.assertEqual(parse('[:acme.poll/]')[0].name, 'acme.poll')

    def test_limits_and_offset(self):

        with self.assertRaises(CQXError) as captured:
            parse('[:x][:x][:x][/x][/x][/x]', max_depth=1)
        self.assertEqual(captured.exception.code, 'E_LIMIT')
        with self.assertRaises(CQXError) as captured:
            parse('[img]', max_nodes=1)
        self.assertEqual(captured.exception.offset, 0)
        with self.assertRaises(CQXError):
            parse('ab', max_chars=1)

    def test_fixed_random_plain_text_roundtrips(self):
        pool = list('abc[]/@=\\ \n\t中文😺') + ['\u00a0']
        random.seed(20261106)
        for _ in range(700):
            s = ''.join(random.choices(pool, k=random.randrange(0, 40)))
            try:
                tree = parse(s)
            except CQXError:
                continue
            encoded = serialize(tree)
            self.assertEqual(parse(encoded), tree)
            self.assertEqual(serialize(parse(encoded)), encoded)

    def test_fixed_random_valid_ast_roundtrips(self):
        random.seed(20261106)
        alphabet = list('abXY_@[]/\\=? &\n中文🙂')
        def make_node(depth=0):
            if depth >= 3 or random.randrange(3) == 0:
                return Text(''.join(random.choices(alphabet, k=random.randrange(9))))
            name = random.choice(('x', 'vendor.card', 'b', 'img'))
            if name == 'img':
                return Element('img', (('src', ''.join(random.choices(alphabet, k=5))),))
            children = tuple(make_node(depth+1) for _ in range(random.randrange(4)))
            if name == 'b':
                return Element('b', (), children, 'block')
            return Element(name, (('z', '3'), ('a', '2')), children, 'block')
        for _ in range(600):
            tree = (make_node(), make_node())
            normalized = normalize_ast(tree)
            wire = serialize(tree)
            self.assertEqual(parse(wire), normalized)
            self.assertEqual(serialize(parse(wire)), wire)


if __name__ == '__main__':
    unittest.main(verbosity=2)
