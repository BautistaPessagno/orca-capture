import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveLanguage, tokenize } from '../editor/code-tokens.mjs'
import { pixelAt, rectangle } from '../editor/redaction.mjs'

test('syntax highlighting preserves all text and classifies multiline comments', () => {
  const code = 'const limit = 42\n/* policy\ncontinued */\nreturn "ready"'
  const tokens = tokenize(code, 'javascript')
  assert.equal(tokens.map((token) => token.text).join(''), code)
  assert.deepEqual(tokens.find((token) => token.kind === 'comment'), {
    text: '/* policy\ncontinued */',
    kind: 'comment'
  })
  assert.equal(tokens.find((token) => token.kind === 'number').text, '42')
  assert.equal(resolveLanguage('entry.TSX', 'auto'), 'javascript')
  assert.equal(resolveLanguage('entry.TSX', 'text'), 'text')
})

test('redaction tracks source pixels at preview scale and clamps to image edges', () => {
  const preview = { left: 100, top: 200, width: 512, height: 256 }
  const pointAt = (x, y) => pixelAt(preview, 2048, 1024, x, y)
  assert.deepEqual(rectangle(pointAt(650, 450), pointAt(132, 190), 'solid'), {
    x: 128, y: 0, width: 1920, height: 1000, kind: 'solid'
  })
})
