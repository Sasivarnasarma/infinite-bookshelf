import { describe, expect, it } from 'vitest'

import { prepareMarkdown } from './markdown'

describe('prepareMarkdown', () => {
  it('leaves inline and display maths alone', () => {
    const text = 'Triples ($a, b, c$) such that $a^2 + b^2 = c^2$.\n\n$$\nE = mc^2\n$$'
    expect(prepareMarkdown(text)).toBe(text)
  })

  it('turns \\( \\) and \\[ \\] into dollars', () => {
    expect(prepareMarkdown(String.raw`Inline \(x^2\) here.`)).toBe('Inline $x^2$ here.')
    expect(prepareMarkdown(String.raw`Block \[\int_0^1 f(x)\,dx\] done.`)).toBe('Block \n$$\n\\int_0^1 f(x)\\,dx\n$$\n done.')
  })

  it('escapes dollar signs that are prices, not maths', () => {
    expect(prepareMarkdown('It costs $5 and $10 today.')).toBe('It costs \\$5 and \\$10 today.')
    expect(prepareMarkdown('Range $5-$10 is fine.')).toBe('Range \\$5-\\$10 is fine.')
    expect(prepareMarkdown('Between $5 and $x$ here.')).toBe('Between \\$5 and $x$ here.')
  })

  it("doesn't pair dollars across paragraphs", () => {
    expect(prepareMarkdown('One $open\n\nTwo close$ here.')).toBe('One \\$open\n\nTwo close\\$ here.')
  })

  it('keeps escaped dollars as they are', () => {
    expect(prepareMarkdown('Escaped \\$5 stays.')).toBe('Escaped \\$5 stays.')
  })

  it('never touches code', () => {
    const text = 'Code `$HOME and $PATH` stays.\n\n```bash\necho $HOME $USER\n```\nAfter $y$.'
    expect(prepareMarkdown(text)).toBe(text)
  })

  it('handles prices inside list items', () => {
    expect(prepareMarkdown('- one $x$\n- two costs $3')).toBe('- one $x$\n- two costs \\$3')
  })
})
