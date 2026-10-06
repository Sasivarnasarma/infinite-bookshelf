// Where this web app finds its API. Leave apiUrl empty to use the server the page came from (/api),
// as Docker and `pnpm start` do. When the web app is hosted elsewhere, set the API's address, e.g.
// 'https://api.example.com'. It wins over VITE_API_URL from the build, so one build can point at
// any API. Kept as a plain script in /public: the Content-Security-Policy forbids inline scripts.
window.IB_CONFIG = { apiUrl: '' }
