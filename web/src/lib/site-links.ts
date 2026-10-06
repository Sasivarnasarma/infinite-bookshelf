/**
 * Link previews (Open Graph, X) and the canonical link need absolute URLs, but the site's address
 * isn't known when the page is written. index.html uses root-relative paths, and these are made
 * absolute: from VITE_SITE_URL when building (see vite.config.ts), or by the API from the address
 * the page was requested on (`_absolute_links` in api/.../server/app.py, which matches the same tags).
 */
const RELATIVE_LINKS = /(<meta\s+property="og:(?:url|image)"\s+content="|<meta\s+name="twitter:image"\s+content="|<link\s+rel="canonical"\s+href=")\//g

/** `html` with the preview and canonical links made absolute on `site` (e.g. https://books.example.com). */
export function absoluteSiteLinks(html: string, site: string): string {
  const origin = site.trim().replace(/\/+$/, '')
  return origin ? html.replace(RELATIVE_LINKS, `$1${origin}/`) : html
}
