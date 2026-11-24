import { resolveLanguage, tokenize } from './code-tokens.mjs'

const fonts = {
  mono: '17px ui-monospace, Menlo, Consolas, monospace',
  prose: '20px system-ui, sans-serif',
  title: '650 23px system-ui, sans-serif',
  label: '650 15px system-ui, sans-serif'
}
const palettes = {
  dark: {
    gradient: ['#263768', '#3b2c57'], card: '#151b2c', rule: '#303b57',
    text: '#f1f3fb', muted: '#a5b2cd', you: '#263855', agent: '#202a3f',
    comment: '#a0adcc', string: '#b4e6ba', number: '#ffd2a3', keyword: '#cbb8ff'
  },
  light: {
    gradient: ['#dbe7ff', '#ebdff5'], card: '#fcfcff', rule: '#dbe1ee',
    text: '#1c2843', muted: '#546687', you: '#e6eeff', agent: '#eef1f8',
    comment: '#526586', string: '#1b6548', number: '#865110', keyword: '#6333a6'
  }
}
const margin = 52
const inset = 32
const headerHeight = 72
const maxHeight = 7000

function box(context, color, x, y, width, height, radius) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.fillStyle = color
  context.fill()
}

function wrapTokens(context, tokens, width) {
  const lines = [[]]
  let currentWidth = 0
  let sourceLine = 0
  const sourceLines = [sourceLine]
  const nextLine = () => {
    lines.push([])
    sourceLines.push(sourceLine)
    currentWidth = 0
    if (lines.length > 340) throw new Error('This excerpt is too tall. Export fewer lines at a time.')
  }
  for (const token of tokens) {
    for (const piece of token.text.match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
      if (piece === '\n') {
        sourceLine += 1
        nextLine()
        continue
      }
      const segmentWidth = context.measureText(piece).width
      if (currentWidth && currentWidth + segmentWidth > width) nextLine()
      if (segmentWidth <= width) {
        lines.at(-1).push({ text: piece, kind: token.kind, width: segmentWidth })
        currentWidth += segmentWidth
        continue
      }

      for (const character of piece) {
        const characterWidth = context.measureText(character).width
        if (currentWidth && currentWidth + characterWidth > width) nextLine()
        lines.at(-1).push({ text: character, kind: token.kind, width: characterWidth })
        currentWidth += characterWidth
      }
    }
  }
  return { lines, sourceLines }
}

function drawLine(context, line, x, y, palette) {
  for (const token of line) {
    context.fillStyle = palette[token.kind] ?? palette.text
    context.fillText(token.text, x, y)
    x += token.width
  }
}

function start(context, palette, width, height, title) {
  if (height > maxHeight) throw new Error('This excerpt is too tall. Export it in smaller parts.')
  context.canvas.width = width
  context.canvas.height = height
  context.textBaseline = 'alphabetic'
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, palette.gradient[0])
  gradient.addColorStop(1, palette.gradient[1])
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  box(context, palette.card, margin, margin, width - 2 * margin, height - 2 * margin, 20)
  context.font = fonts.title
  context.fillStyle = palette.text
  if (context.measureText(title).width > width - 2 * (margin + inset)) {
    const maxWidth = width - 2 * (margin + inset) - context.measureText('…').width
    while (context.measureText(title).width > maxWidth) title = title.slice(0, -1)
    title += '…'
  }
  context.fillText(title, margin + inset, margin + 44)
  context.fillStyle = palette.rule
  context.fillRect(margin, margin + headerHeight, width - 2 * margin, 1)
}

export function renderCode(canvas, { code, filename, language, numbered, firstLine, theme }) {
  const context = canvas.getContext('2d')
  const palette = palettes[theme]
  const source = code.replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
  const width = 960
  const rowHeight = 26
  const lastNumber = firstLine + source.split('\n').length - 1
  context.font = fonts.mono
  const gutter = numbered ? context.measureText(String(lastNumber)).width + 22 : 0
  const coloring = tokenize(source, resolveLanguage(filename, language))
  const { lines, sourceLines } = wrapTokens(context, coloring, width - 2 * (margin + inset) - gutter)
  start(context, palette, width, 2 * margin + headerHeight + 2 * inset + lines.length * rowHeight,
    filename.trim() || 'Code snippet')
  context.font = fonts.mono
  lines.forEach((line, index) => {
    const y = margin + headerHeight + inset + 18 + index * rowHeight
    if (numbered && sourceLines[index] !== sourceLines[index - 1]) {
      context.fillStyle = palette.muted
      context.fillText(String(firstLine + sourceLines[index]), margin + inset, y)
    }
    drawLine(context, line, margin + inset + gutter, y, palette)
  })
}

export function renderConversation(canvas, { title, messages, theme }) {
  const context = canvas.getContext('2d')
  const palette = palettes[theme]
  const width = 960
  const rowHeight = 30
  const bubbleWidth = width - 2 * (margin + inset)
  context.font = fonts.prose
  const bubbles = messages.map(({ speaker, text }) => {
    const { lines } = wrapTokens(context, [
      { text: text.replace(/\r\n?/g, '\n').replace(/\t/g, '  '), kind: 'text' }
    ], bubbleWidth - 48)
    return { speaker, lines, height: 63 + lines.length * rowHeight }
  })
  const bodyHeight = bubbles.reduce((total, bubble) => total + bubble.height + 16, 0) - 16
  start(context, palette, width, 2 * margin + headerHeight + 2 * inset + bodyHeight,
    title.trim() || 'Agent conversation')

  let y = margin + headerHeight + inset
  const x = margin + inset
  for (const bubble of bubbles) {
    box(context, bubble.speaker === 'You' ? palette.you : palette.agent,
      x, y, bubbleWidth, bubble.height, 12)
    context.font = fonts.label
    context.fillStyle = palette.muted
    context.fillText(bubble.speaker, x + 24, y + 32)
    context.font = fonts.prose
    bubble.lines.forEach((line, index) => drawLine(context, line, x + 24, y + 59 + index * rowHeight, palette))
    y += bubble.height + 16
  }
}
