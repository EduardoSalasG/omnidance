# Tasks — fix-ssr-api-url-socket

- [x] 1 `server-api.ts`: `serverApiUrl()` con fallback headers-origin
- [x] 2 11 call sites a request-scope (9 pages + 2 lib públicos)
- [x] 3 `netlify.toml`: redirect proxy `/socket.io/*`
- [x] 4 `tsc` web limpio
- [ ] 5 Release hotfix `v0.8.1` + verificar en prod: `/reclamar/<fake>`
  renderiza `goneTitle` y socket.io handshake 200 vía netlify
