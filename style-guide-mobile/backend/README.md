# Backend change for the phone app (SPEC section 7)

The website's `server.js` lives in the web repo (`khemkaran14/styleguideforwomen`). This folder holds
the one change the app needs, ready to apply there. It does not touch the live site until you deploy it.

What changes (the web cookie login keeps working exactly as before):

1. The "attach the signed-in user" middleware reads `Authorization: Bearer <token>` first, then the `sg_session` cookie.
2. Sign-up, login and password-reset return `token` in the JSON **only** when the request has `X-Client: mobile`.
3. Logout deletes the bearer session; account deletion deletes all the member's sessions.
4. `GET /api/health` returns `{ ok: true, version }`.
5. `server.js` exports the app when required (for tests) and listens only when run directly.

Files:

- `server.patch` – unified diff against the web repo's `server.js`
- `server.js` – the patched file in full
- `test/bearer.test.js` – Node test-runner tests (6 tests: health, mobile token, cookie path unchanged, logout, bad tokens, deletion)

Apply and deploy (in the web repo):

```bash
patch -p1 < /path/to/style-guide-mobile/backend/server.patch
```

```bash
mkdir -p test && cp /path/to/style-guide-mobile/backend/test/bearer.test.js test/
```

```bash
node --disable-warning=ExperimentalWarning --test test/bearer.test.js
```

```bash
bash deploy/update.sh
```
