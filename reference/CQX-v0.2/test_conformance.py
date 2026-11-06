"""Smoke-check the distributable CQX v0.2 JSON conformance vectors."""
from pathlib import Path
import json
import unittest

from cqx import parse, serialize_canonical, CQXError

class TestConformance(unittest.TestCase):
    def test_vectors(self):
        path = Path(__file__).with_name('conformance.json')
        vectors = json.loads(path.read_text('utf-8'))
        self.assertEqual(vectors['version'], '0.2')
        for entry in vectors['valid']:
            with self.subTest(entry=entry['input']):
                ast = parse(entry['input'])
                wire = serialize_canonical(ast)
                self.assertEqual(wire,entry['canonical'])
                self.assertEqual(parse(wire),ast)
        for entry in vectors['invalid']:
            with self.subTest(entry=entry['input']):
                with self.assertRaises(CQXError) as caught:
                    parse(entry['input'])
                self.assertEqual(caught.exception.code, entry['code'])

if __name__ == '__main__':
    unittest.main()
