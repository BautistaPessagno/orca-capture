const keywords = {
  javascript: 'as async await break case catch class const continue debugger declare default delete do else export extends finally for from function if implements import in instanceof interface let new null of private protected public readonly return satisfies static super switch this throw true false try type typeof undefined var void while yield',
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
  shell: 'case do done elif else esac export fi for function if in local readonly return select then until while',
  json: 'false null true'
}

const syntax = {
  javascript: /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(?<string>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|(?<number>\b(?:0x[\da-f]+|\d+(?:\.\d+)?)(?:e[+-]?\d+)?\b)|(?<word>[\w$]+)/gi,
  python: /(?<comment>#[^\n]*)|(?<string>"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(?<number>\b\d+(?:\.\d+)?\b)|(?<word>\w+)/g,
  shell: /(?<comment>(?<!\S)#[^\n]*)|(?<string>"(?:\\.|[^"\\\n])*"|'[^'\n]*')|(?<number>\b\d+\b)|(?<word>\w+)/g,
  json: /(?<string>"(?:\\.|[^"\\\n])*")|(?<number>-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(?<word>\w+)/gi
}

export function resolveLanguage(filename, selection) {
  if (selection !== 'auto') return selection
  const suffix = filename.trim().split('.').at(-1).toLowerCase()
  if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'].includes(suffix)) return 'javascript'
  if (['py', 'pyi'].includes(suffix)) return 'python'
  if (['sh', 'bash', 'zsh'].includes(suffix)) return 'shell'
  if (suffix === 'json') return 'json'
  return 'text'
}

export function tokenize(code, language) {
  const matcher = syntax[language]
  if (!matcher) return [{ text: code, kind: 'text' }]
  const reserved = new Set(keywords[language].split(' '))
  const tokens = []
  let position = 0
  for (const match of code.matchAll(matcher)) {
    if (match.index > position) tokens.push({ text: code.slice(position, match.index), kind: 'text' })
    const kind = Object.keys(match.groups).find((group) => match.groups[group] !== undefined)
    tokens.push({
      text: match[0],
      kind: kind === 'word' ? (reserved.has(match[0]) ? 'keyword' : 'text') : kind
    })
    position = match.index + match[0].length
  }
  if (position < code.length) tokens.push({ text: code.slice(position), kind: 'text' })
  return tokens
}
