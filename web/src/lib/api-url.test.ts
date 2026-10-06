import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiBase, apiUrl } from './api-url'

function configure({ config, build }: { config?: string; build?: string }) {
  vi.stubGlobal('window', { IB_CONFIG: { apiUrl: config ?? '' } })
  vi.stubEnv('VITE_API_URL', build ?? '')
}

describe('apiUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("uses this page's own server by default", () => {
    configure({})
    expect(apiUrl('/api/config')).toBe('/api/config')
  })

  it('uses VITE_API_URL from the build', () => {
    configure({ build: 'https://api.example.com' })
    expect(apiUrl('/api/config')).toBe('https://api.example.com/api/config')
  })

  it('prefers config.js over the build, so one build can point anywhere', () => {
    configure({ config: 'https://other.example.com', build: 'https://api.example.com' })
    expect(apiUrl('/api/config')).toBe('https://other.example.com/api/config')
  })

  it('keeps a path prefix and drops trailing slashes', () => {
    configure({ config: ' https://example.com/bookshelf// ' })
    expect(apiUrl('/api/outline')).toBe('https://example.com/bookshelf/api/outline')
  })

  it('works without config.js loaded', () => {
    vi.stubGlobal('window', {})
    vi.stubEnv('VITE_API_URL', '')
    expect(apiBase()).toBe('')
  })

  it('ignores an address that is not http(s), with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configure({ config: 'api.example.com' })
    expect(apiUrl('/api/config')).toBe('/api/config')
    configure({ config: 'javascript:alert(1)' })
    expect(apiUrl('/api/docs')).toBe('/api/docs')
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
