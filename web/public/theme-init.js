// Applies the saved colour theme before the page paints, so dark mode never flashes white.
// Kept as a plain script in /public: the Content-Security-Policy forbids inline scripts.
;(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('ib-preferences') || '{}')
    var theme = (saved.state && saved.state.theme) || 'system'
    var dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  } catch {
    /* Storage blocked: fall back to the light theme */
  }
})()
