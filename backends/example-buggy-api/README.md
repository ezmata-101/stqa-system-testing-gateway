# example-buggy-api

A minimal, standalone demo backend used to exercise the STQA gateway
end-to-end. It is a completely independent Node/Express project — it does
not import anything from the `gateway/` codebase, and the gateway does not
import anything from here. The only coupling is:

1. A shared `CONTEXT_SIGNING_SECRET` environment variable.
2. This backend's own Postgres database template, referenced by name from
   the gateway's `backend_versions.database_template` (spec section 5/12).

Replacing this with a real assignment backend for a new semester requires
**zero gateway code changes** — only a new `backend_versions` row pointing
at a different URL/template (spec section 18/section "Multi-Semester
Model").

## Running standalone (outside Docker Compose)

```bash
cp .env.example .env   # then edit values
npm install
node db/init-template.js   # once, against the template DB (DATABASE_URL env var)
DATABASE_URL=... npm run seed  # optional manual seed, normally invoked by the gateway
npm start
```

## Intentional bugs (for grading/reference — do not share with students)

- `POST /orders` never checks `quantity` against `products.stock`
  (boundary/off-by-one bug).
- `GET /orders/:id` and `DELETE /orders/:id` never verify the order belongs
  to the authenticated user (IDOR / broken access control).
- Each team's seed data varies the boundary stock value and which order ID
  is "vulnerable" via `TEAM_SEED` (spec section 13), so teams see
  equivalent-difficulty but non-identical values.

## Endpoints

| Method | Path                | Auth                          |
|--------|---------------------|--------------------------------|
| GET    | `/_internal/health` | none (gateway/dashboard only) |
| POST   | `/register`         | gateway context only          |
| POST   | `/login`            | gateway context only          |
| GET    | `/products`         | gateway context only          |
| POST   | `/orders`           | gateway context + app `Authorization: Bearer <token>` |
| GET    | `/orders/:id`       | gateway context + app auth    |
| DELETE | `/orders/:id`       | gateway context + app auth    |

All routes except `/_internal/health` require a valid `X-STQA-Context`
header — this backend will refuse direct traffic that didn't come through
the gateway (spec section 10: "must not be publicly accessible").
