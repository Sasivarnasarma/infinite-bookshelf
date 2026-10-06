import { describe, expect, it } from 'vitest'

import page from '../../index.html?raw'
import { absoluteSiteLinks } from './site-links'

describe('absoluteSiteLinks', () => {
  it("makes index.html's preview and canonical links absolute", () => {
    const html = absoluteSiteLinks(page, 'https://books.example.com/')
    expect(html).toContain('<meta property="og:image" content="https://books.example.com/og-image.png" />')
    expect(html).toContain('<meta name="twitter:image" content="https://books.example.com/og-image.png" />')
    expect(html).toContain('<meta property="og:url" content="https://books.example.com/" />')
    expect(html).toContain('<link rel="canonical" href="https://books.example.com/"')
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg" />') // Other links stay relative
  })

  it('leaves the page alone without a site address', () => {
    expect(absoluteSiteLinks(page, '')).toBe(page)
  })

  it('keeps a path prefix', () => {
    expect(absoluteSiteLinks(page, 'https://example.com/bookshelf')).toContain('content="https://example.com/bookshelf/og-image.png"')
  })
})
