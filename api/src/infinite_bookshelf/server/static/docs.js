// API docs page: theme, header controls, and Swagger UI.
// Kept as a file, not inline: the Content-Security-Policy forbids inline scripts.
;(function () {
  var root = document.documentElement
  var media = window.matchMedia('(prefers-color-scheme: dark)')
  var THEMES = ['system', 'light', 'dark']
  // Shared with the web app (same origin), so the docs follow the theme picked there
  var STORE = 'ib-preferences'

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || '{}') || {}
    } catch (e) {
      return {}
    }
  }

  function savedTheme() {
    var state = readStore().state
    var theme = state && state.theme
    return THEMES.indexOf(theme) >= 0 ? theme : 'system'
  }

  function saveTheme(theme) {
    try {
      var store = readStore()
      store.state = Object.assign({}, store.state, { theme: theme })
      if (store.version === undefined) store.version = 1
      localStorage.setItem(STORE, JSON.stringify(store))
    } catch (e) {
      /* Storage blocked: the choice lasts until the page is closed */
    }
  }

  function apply(theme) {
    var dark = theme === 'dark' || (theme === 'system' && media.matches)
    // `dark-mode` switches on Swagger UI's own dark styles; docs.css builds on them
    root.classList.toggle('dark-mode', dark)
    root.dataset.theme = theme
    var button = document.getElementById('ib-theme')
    if (button) {
      var label = 'Theme: ' + theme + ' (click to change)'
      button.setAttribute('aria-label', label)
      button.title = label
    }
  }

  var current = savedTheme()
  apply(current) // Before first paint, so dark mode never flashes white

  media.addEventListener('change', function () {
    apply(current)
  })
  window.addEventListener('storage', function (event) {
    if (event.key === STORE) apply((current = savedTheme()))
  })

  window.addEventListener('DOMContentLoaded', function () {
    apply(current)

    document.getElementById('ib-theme').addEventListener('click', function () {
      current = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]
      saveTheme(current)
      apply(current)
    })

    var baseUrl = window.location.origin + '/api'
    document.getElementById('ib-base-url').textContent = baseUrl
    var copy = document.getElementById('ib-copy')
    copy.addEventListener('click', function () {
      if (!navigator.clipboard) return
      navigator.clipboard.writeText(baseUrl).then(function () {
        copy.classList.add('is-copied')
        setTimeout(function () {
          copy.classList.remove('is-copied')
        }, 1400)
      })
    })

    var mount = document.getElementById('swagger-ui')
    window.ui = SwaggerUIBundle({
      url: mount.dataset.openapi,
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayOperationId: false,
      displayRequestDuration: true,
      defaultModelsExpandDepth: 0,
      defaultModelExpandDepth: 2,
      defaultModelRendering: 'example',
      docExpansion: 'list',
      filter: true,
      showExtensions: false,
      tryItOutEnabled: false,
      persistAuthorization: false,
      requestSnippetsEnabled: true,
      requestSnippets: {
        generators: {
          curl_bash: { title: 'cURL (bash)', syntax: 'bash' },
          curl_powershell: { title: 'cURL (PowerShell)', syntax: 'powershell' },
          curl_cmd: { title: 'cURL (CMD)', syntax: 'bash' },
        },
        defaultExpanded: false,
      },
      syntaxHighlight: { activated: true, theme: 'monokai' },
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    })
  })
})()
