# STQA Gateway: How to Use This Repository

This repository contains a working example of the STQA multi-tenant gateway, a demo buggy backend, and the supporting Docker/Postgres setup used to test student-facing API vulnerabilities.

This guide covers:

- how to start the gateway and demo backend locally
- how to provision an offering and generate student credentials
- how to send requests through the gateway
- how to create a backend that can be tested through this gateway

## 1. Prerequisites

Make sure you have:

- Docker Desktop or Docker Engine
- Node.js and npm
- a terminal with access to the repository

## 2. Start the platform locally

From the repository root:

```bash
docker compose -f deployments/docker-compose.yml up -d
```

This brings up:

- PostgreSQL for the control/logging databases
- Redis
- the gateway
- the example buggy backend

You can check that the gateway is responding with:

```bash
curl http://localhost:3000/health
```

## 3. Provision an offering and generate lab credentials

The gateway includes a provisioning CLI that creates teams, databases, and one lab key per student.

From the gateway folder:

```bash
cd gateway
npm install
npm run provision -- --offering-code stqa-oj --roster ./example_students.csv --out ./credentials.csv
```

This produces a CSV file with student IDs, names, emails, team codes, and raw lab keys.

> Keep the generated credentials secure. The gateway stores only hashes of the keys, so the raw values are only available once during provisioning.

## 4. Use the gateway with a student credential

The gateway expects the lab key in the `X-STQA-Key` header. A typical request looks like this:

```bash
key=$(awk -F'"' 'NR==2 {print $10}' credentials.csv)
curl -s -i -H "X-STQA-Key: $key" http://localhost:3000/api/stqa-oj/health
```

The gateway will:

- identify the student and team from the key
- build a signed internal context
- forward the request to the configured backend
- return the backend response with request metadata

## 5. Example: call the demo backend through the gateway

The example backend exposes routes such as:

- `POST /register`
- `POST /login`
- `GET /products`
- `POST /orders`
- `GET /orders/:id`
- `DELETE /orders/:id`

Example:

```bash
curl -s -i \
  -H "X-STQA-Key: $key" \
  http://localhost:3000/api/stqa-oj/products
```

## 6. How to create a backend for this gateway

A backend that plugs into this gateway needs to do two things:

1. verify the signed gateway context
2. select the correct team-specific database for that request

### 6.1 Required backend behavior

Your backend should:

- expose `GET /_internal/health` and return a JSON response such as:

```json
{ "status": "healthy", "version": "my-backend-v1" }
```

- read the `X-STQA-Context` header from the gateway
- verify it with the shared `CONTEXT_SIGNING_SECRET`
- read `databaseName` from the verified context
- use that database for all team-scoped queries
- keep its own application authentication separate from the gateway authentication layer
- never write to the gateway control or logging databases

### 6.2 Minimal Node.js example

This repository already includes a helper SDK for Node.js backends:

```js
const express = require('express');
const { verifyStqaContext, createTeamDatabaseRouter } = require('@stqa/backend-sdk');

const app = express();
const dbRouter = createTeamDatabaseRouter(process.env.TEAM_DATABASE_ADMIN_URL);

app.use(express.json());

app.get('/_internal/health', (req, res) => {
  res.json({ status: 'healthy', version: 'my-backend-v1' });
});

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

app.get('/products', async (req, res) => {
  const result = await req.teamDb.query('SELECT id, name, price FROM products ORDER BY id');
  res.json({ data: result.rows });
});

app.listen(process.env.PORT || 4000);
```

### 6.3 Required environment variables

Your backend should receive at least these environment variables:

```bash
CONTEXT_SIGNING_SECRET=dev-context-signing-secret-change-me
TEAM_DATABASE_ADMIN_URL=postgres://stqa:stqa@postgres:5432/postgres
PORT=4000
```

If your backend uses its own app-level auth, also define a separate secret such as:

```bash
APP_JWT_SECRET=dev-app-jwt-secret-change-me
```

### 6.4 Backend integration notes

- The gateway forwards the request to your backend without changing your app routes.
- The gateway path prefix is removed before forwarding, so a request to `/api/stqa-oj/products` becomes a request to `/products` on the backend.
- You should treat the gateway as the trust boundary for student identity and team routing.
- Your backend should not assume a single shared database. Every request must use the team-specific database selected from the signed context.

## 7. Troubleshooting

If requests fail:

- verify that Docker services are running
- ensure the gateway and backend share the same `CONTEXT_SIGNING_SECRET`
- confirm the offering code in the request matches the one used during provisioning
- check that the backend is reachable from the gateway network
- inspect the gateway and backend logs for authentication or database errors

## 8. Suggested next steps

- inspect the demo backend in [backends/example-buggy-api/src/server.js](backends/example-buggy-api/src/server.js)
- review the SDK helper in [backend-sdk/README.md](backend-sdk/README.md)
- adapt the example backend to your own API design and intentionally introduce bugs for student testing
