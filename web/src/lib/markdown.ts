/**
 * Tidies model-written Markdown before it's shown or exported, so the reader and the PDF agree:
 *
 * - Maths: `\( … \)` becomes `$ … $` and `\[ … \]` becomes `$$ … $$`, the forms remark-math
 *   (and the PDF renderer) understand.
 * - Dollar signs that aren't maths (prices like "$5 and $10") are escaped. A `$` opens inline
 *   maths only when a non-space follows it and the next `$` has a non-space before it and no
 *   digit after it (Pandoc's rule).
 *
 * Code (fenced blocks and inline `code`) is never touched.
 */

/** Splits text into code and prose pieces; code pieces are returned unchanged. */
function splitCode(text: string): { code: boolean; text: string }[] {
  const pieces: { code: boolean; text: string }[] = []
  // Fenced blocks (``` or ~~~, to the matching fence or the end), then inline code spans
  const pattern = /(^|\n)( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\3[`~]*[ \t]*(?=\n|$)|$)|(`+)(?!`)[\s\S]*?[^`]\4(?!`)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    let start = match.index
    // Keep the newline before a fence with the prose
    if (match[1]) start += match[1].length
    if (start > last) pieces.push({ code: false, text: text.slice(last, start) })
    pieces.push({ code: true, text: text.slice(start, match.index + match[0].length) })
    last = match.index + match[0].length
  }
  if (last < text.length) pieces.push({ code: false, text: text.slice(last) })
  return pieces
}

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c)
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const blankLineAt = (text: string, i: number) => text[i] === '\n' && /^[ \t]*(\n|$)/.test(text.slice(i + 1, i + 40))

/** Escapes each `$` that can't open or close inline maths. `$$` (display maths) is left alone. */
function escapeStrayDollars(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '\\') {
      out += text.slice(i, i + 2)
      i += 2
      continue
    }
    if (c !== '$') {
      out += c
      i++
      continue
    }
    if (text[i + 1] === '$') {
      // Display maths: copy through to the closing $$ (or the rest of the text)
      const end = text.indexOf('$$', i + 2)
      const stop = end < 0 ? text.length : end + 2
      out += text.slice(i, stop)
      i = stop
      continue
    }
    // Inline maths needs a closing $ before the paragraph ends
    let j = i + 1
    while (j < text.length && text[j] !== '$' && !blankLineAt(text, j)) {
      if (text[j] === '\\') j++
      j++
    }
    const closes = text[j] === '$' && text[j + 1] !== '$' && j > i + 1 && !isSpace(text[i + 1]) && !isSpace(text[j - 1]) && !isDigit(text[j + 1])
    if (closes) {
      out += text.slice(i, j + 1)
      i = j + 1
    } else {
      out += '\\$'
      i++
    }
  }
  return out
}

function normaliseMath(prose: string): string {
  return escapeStrayDollars(
    prose
      // \[ … \] on their own: display maths, on separate lines so it renders as a block
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => `\n$$\n${tex.trim()}\n$$\n`)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => `$${tex.trim()}$`),
  )
}

export function prepareMarkdown(text: string): string {
  if (!text.includes('$') && !text.includes('\\(') && !text.includes('\\[')) return text
  return splitCode(text)
    .map((p) => (p.code ? p.text : normaliseMath(p.text)))
    .join('')
}

// ---- Sections ----------------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const ATX_HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/

/** Comparable text of a title: lower case, no "Section 2.1:" prefix, no punctuation. */
function titleWords(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\s*(?:chapter|section|part)\s+[\d.]+\s*[:.\-–—]?\s*/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Drops a first line that only restates the section's title: a heading or a bold line that
 * matches it, or starts with it ("Private Traffic and Connectivity: VPC Peering…"). Models do
 * this even when told not to, and the reader and exports already show the title.
 */
function dropRepeatedTitle(text: string, title: string): string {
  const match = /^\s*(?:#{1,6}[ \t]+(.+?)[ \t#]*|\*\*(.+?)\*\*:?|__(.+?)__:?)[ \t]*(?:\n|$)/.exec(text)
  if (!match) return text
  const line = titleWords(match[1] ?? match[2] ?? match[3])
  const wanted = titleWords(title)
  if (!wanted || (line !== wanted && !line.startsWith(`${wanted} `))) return text
  return text.slice(match[0].length).replace(/^\s*\n/, '')
}

/**
 * Moves the text's headings down so the biggest one is at `level` (never up, never past 6).
 * Lines in fenced code blocks, such as `# comments`, are left alone.
 */
function shiftHeadings(text: string, level: number): string {
  const lines = text.split('\n')
  const headings: number[] = []
  let fence: string | null = null
  lines.forEach((line, i) => {
    const marker = FENCE.exec(line)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null
    } else if (marker) fence = marker
    else if (ATX_HEADING.test(line)) headings.push(i)
  })
  if (!headings.length) return text
  const top = Math.min(...headings.map((i) => ATX_HEADING.exec(lines[i])![2].length))
  const shift = level - top
  if (shift <= 0) return text
  for (const i of headings) {
    lines[i] = lines[i].replace(ATX_HEADING, (_, indent: string, hashes: string) => indent + '#'.repeat(Math.min(6, hashes.length + shift)))
  }
  return lines.join('\n')
}

/**
 * A section's text as it's shown and exported: without a first line that repeats the section's
 * title, and with its own headings starting at `level`, one below the section's heading.
 */
export function sectionMarkdown(text: string, title: string, level: number): string {
  return shiftHeadings(dropRepeatedTitle(text, title), level)
}
