import unittest
from cqx import CQXError, Element, Text, parse, serialize, as_json


class CQXTests(unittest.TestCase):
    def roundtrip(self, original):
        parsed = parse(original)
        encoded = serialize(parsed)
        self.assertEqual(parse(encoded), parsed)
        self.assertEqual(serialize(parse(encoded)), encoded)
        return parsed

    def test_text_and_mentions(self):
        nodes = self.roundtrip('你好 [@123]！ [note] 保持原样。')
        self.assertEqual(nodes[1], Element('at', (('id', '123'),)))
        self.assertEqual(nodes[-1], Text('！ [note] 保持原样。'))

    def test_escaping(self):
        nodes = self.roundtrip(r'字面量 \[@123] 与 C:\data\work 和 \\')
        self.assertEqual(nodes, (Text('字面量 [@123] 与 C:\\data\\work 和 \\'),))

    def test_shorthand_canonical_equivalence(self):
        self.assertEqual(parse('[img "cat.png"]'), parse('[:img src="cat.png"/]'))
        self.assertEqual(parse('[reply 42]'), parse('[:reply id="42"/]'))
        self.assertEqual(parse('[@all]'), parse('[:at type="all"/]'))

    def test_inline_media_and_unicode(self):
        self.roundtrip('图片[img "https://a.test/img?q=[1,2]&x=3" alt="a \\"quote\\"?"]!')

    def test_forward(self):
        s = '''[forward]
  [msg user=10001 name="Alice"]你好 [@20002]，[img cat.png][/msg]
  [msg id=987654/]
[/forward]'''
        doc = self.roundtrip(s)
        self.assertEqual(len(doc), 1)
        forward = doc[0]
        self.assertEqual(forward.name, 'forward')
        self.assertEqual(len(forward.children), 2)
        self.assertEqual(forward.children[1].mode, 'void')
        self.assertNotIn('\n', serialize(doc))

    def test_custom_nested_elements(self):
        self.roundtrip('[:acme.card title="表单"][:acme.button label="确定" action="submit"/][/acme.card]')

    def test_empty_block_vs_void(self):
        a = self.roundtrip('[:x][/x]')
        b = self.roundtrip('[:x/]')
        self.assertNotEqual(a, b)

    def test_block_preserves_whitespace(self):
        a = self.roundtrip('[msg user=1]\n  第一行\n  第二行\n[/msg]')
        self.assertEqual(a[0].children[0].value, '\n  第一行\n  第二行\n')

    def test_unknown_brackets_literal(self):
        self.assertEqual(parse('a [note] b'), (Text('a [note] b'),))

    def test_typed_values_are_strings(self):
        node = self.roundtrip('[:acme.data amount=3.14 active=true/]')[0]
        self.assertEqual(dict(node.attrs), {'active': 'true', 'amount': '3.14'})

    def test_invalid(self):
        cases = [
            '[msg user=1]hi[/forward]',
            '[:forward][msg user=1]A[/msg]garbage[/forward]',
            '[forward][img cat.png][/forward]',
            '[:unknown]',
            '[img]',
            '[msg user=1/]',
            '[msg id=1]x[/msg]',
            '[:x k=1 k=2/]',
            '[:foo s="unterminated/]',
        ]
        for text in cases:
            with self.subTest(text=text), self.assertRaises(CQXError):
                parse(text)


    def test_at_exclusive_forms(self):
        self.assertEqual(parse('[@all]'), parse('[:at type="all"/]'))
        for bad in ('[:at id="123" type="all"/]', '[:at type="everyone"/]', '[:at/]'):
            with self.subTest(bad=bad), self.assertRaises(CQXError):
                parse(bad)

    def test_forward_ascii_whitespace_rule(self):
        doc = parse('[forward]\r\n \t[msg user=1]x[/msg]\n[/forward]')
        self.assertEqual(len(doc[0].children), 1)
        with self.assertRaises(CQXError):
            parse('[forward]　[msg user=1]x[/msg][/forward]')

    def test_invalid_unicode_scalar_attribute(self):
        with self.assertRaises(CQXError):
            parse(r'[:x v="\ud800"/]')

    def test_json_quotes_and_delimiters(self):
        src = r'[:vendor.file src="https://site.test/p?x=[1]&y=2" title="a \"quoted\" word"/]'
        node = self.roundtrip(src)[0]
        self.assertEqual(node.attr('src'), 'https://site.test/p?x=[1]&y=2')
        self.assertIn('quoted', node.attr('title'))

    def test_randomized_roundtrips(self):
        import random
        rng = random.Random(20261106)
        chars = 'abcXYZ012 []\\@:/&=\n\t中🥭'
        for _ in range(250):
            nodes = []
            for _ in range(rng.randint(1, 5)):
                if rng.random() < 0.5:
                    nodes.append(Text(''.join(rng.choices(chars, k=rng.randint(0, 22)))))
                else:
                    attrs = (('url', ''.join(rng.choices(chars, k=9))),)
                    if rng.random() < 0.5:
                        nodes.append(Element('vendor.item', attrs, (), 'void'))
                    else:
                        nodes.append(Element('vendor.item', attrs,
                                             (Text(''.join(rng.choices(chars, k=10))),), 'block'))
            try:
                parsed = parse(serialize(nodes))
            except CQXError as error:
                self.fail(str(error))
            self.assertEqual(parse(serialize(parsed)), parsed)

    def test_limits(self):
        with self.assertRaises(CQXError):
            parse('[:x][:y]hi[/y][/x]', max_depth=1)
        with self.assertRaises(CQXError):
            parse('hello [@1]', max_nodes=1)


if __name__ == '__main__':
    unittest.main()
