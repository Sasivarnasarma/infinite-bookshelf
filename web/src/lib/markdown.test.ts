import { describe, expect, it } from 'vitest'

import { prepareMarkdown, sectionMarkdown } from './markdown'

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

describe('sectionMarkdown', () => {
  const title = 'Section 2.1: Subnet Design, Routing, and Gateways'

  it('drops a first heading that repeats the section title', () => {
    expect(sectionMarkdown('### Subnet Design, Routing, and Gateways\n\nText.', title, 4)).toBe('Text.')
    expect(sectionMarkdown('## Section 2.1: Subnet design, routing and gateways ##\nText.', title, 4)).toBe('Text.')
  })

  it('drops a heading or bold line that starts with the title', () => {
    expect(sectionMarkdown('### Subnet Design, Routing, and Gateways: A Primer\n\nText.', title, 4)).toBe('Text.')
    expect(sectionMarkdown('**Subnet Design, Routing, and Gateways**\n\nText.', title, 4)).toBe('Text.')
  })

  it('keeps a first heading that is about something else', () => {
    const text = '### Multi-AZ Subnet Topography\n\nText.'
    expect(sectionMarkdown(text, title, 3)).toBe(text)
    // A heading that is only part of the title is a real subheading
    expect(sectionMarkdown('### Subnet Design\n\nText.', title, 3)).toBe('### Subnet Design\n\nText.')
    expect(sectionMarkdown('Subnet Design, Routing, and Gateways matter.', title, 4)).toBe('Subnet Design, Routing, and Gateways matter.')
  })

  it('moves headings down so the biggest is at the given level', () => {
    expect(sectionMarkdown('## A\n\ntext\n\n### B', 'Other', 4)).toBe('#### A\n\ntext\n\n##### B')
    expect(sectionMarkdown('#### A\n\n###### B', 'Other', 4)).toBe('#### A\n\n###### B')
    expect(sectionMarkdown('# A\n\n###### B', 'Other', 4)).toBe('#### A\n\n###### B') // Capped at 6
    expect(sectionMarkdown('#### A', 'Other', 3)).toBe('#### A') // Never moved up
  })

  it('leaves lines in code blocks alone', () => {
    const text = '### Setup\n\n```bash\n# install it\nnpm i\n```\n\n~~~\n## not a heading\n~~~'
    expect(sectionMarkdown(text, 'Other', 4)).toBe('#### Setup\n\n```bash\n# install it\nnpm i\n```\n\n~~~\n## not a heading\n~~~')
  })
})
