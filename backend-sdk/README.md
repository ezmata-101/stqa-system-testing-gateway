# @stqa/backend-sdk

Reference helper for backends that plug into the STQA multi-tenant gateway.
This package intentionally does **not** depend on the gateway's codebase —
it only needs two things the gateway gives every backend:

1. The shared `CONTEXT_SIGNING_SECRET` (an environment variable you set on
   your backend, identical to the gateway's).
2. The `X-STQA-Context` header the gateway attaches to every forwarded
   request.

Any backend, in any language, only needs to replicate this integration:
verify a signed short-lived JWT and read `databaseName` from it. This
package is a convenience for Node.js backends; it is **not required** —
you can implement the same two functions in any stack.

## Install

From another project in this workspace:

```bash
npm install ../backend-sdk
```

Or copy `src/context-verification.js` / `src/database-routing.js` directly —
they have no dependency on anything gateway-internal.

## Usage

```js
const { verifyStqaContext, createTeamDatabaseRouter } = require('@stqa/backend-sdk');

const dbRouter = createTeamDatabaseRouter(process.env.TEAM_DATABASE_ADMIN_URL);

app.use((req, res, next) => {
  try {
    req.stqaContext = verifyStqaContext(
      req.header('X-STQA-Context'),
      process.env.CONTEXT_SIGNING_SECRET,
    );
    req.teamDb = dbRouter.getPool(req.stqaContext.databaseName);
    next();
  } catch (err) {
    res.status(401).json({ error: { code: 'INVALID_CONTEXT', message: err.message } });
  }
});
```

## What this backend must still do itself (spec section 10)

- Only accept traffic from the gateway (network-level allowlisting/private
  network — this SDK does not enforce that).
- Keep its own application authentication (`Authorization` header) working
  exactly as normal; the gateway forwards it untouched and never validates it.
- Expose `GET /_internal/health` returning `{ "status": "healthy", "version": "..." }`.
- Never write to the gateway's logging or control databases.
- Select every query using `req.teamDb` (or equivalent) — never a shared
  database — so team data stays isolated.

## Why a shared secret and not mTLS/OAuth?

Kept intentionally simple for a course lab environment. If you need
stronger backend-to-gateway trust, swap the HMAC secret for RS256 with a
public key the backend can fetch/rotate independently — the payload shape
does not need to change.
