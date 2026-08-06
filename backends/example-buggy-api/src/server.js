const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { verifyStqaContext, createTeamDatabaseRouter } = require('@stqa/backend-sdk');

const PORT = process.env.PORT || 4000;
const CONTEXT_SIGNING_SECRET = process.env.CONTEXT_SIGNING_SECRET;
const TEAM_DATABASE_ADMIN_URL = process.env.TEAM_DATABASE_ADMIN_URL;
// This backend's OWN application authentication secret. Deliberately
// unrelated to CONTEXT_SIGNING_SECRET — the gateway never sees or
// validates this (spec section 3.2 / 18).
const APP_JWT_SECRET = process.env.APP_JWT_SECRET || 'insecure-demo-app-secret';

if (!CONTEXT_SIGNING_SECRET || !TEAM_DATABASE_ADMIN_URL) {
  console.error('CONTEXT_SIGNING_SECRET and TEAM_DATABASE_ADMIN_URL are required.');
  process.exit(1);
}

const dbRouter = createTeamDatabaseRouter(TEAM_DATABASE_ADMIN_URL);
const app = express();
app.use(express.json());

// Public: no gateway context required, no app auth required.
app.get('/_internal/health', (req, res) => {
  res.json({ status: 'healthy', version: 'example-buggy-api-v1' });
});

// Every other route requires a valid signed gateway context. This is the
// ONLY thing that ties this backend to the gateway; everything else about
// this backend (schema, bugs, routes) could change every semester without
// the gateway knowing or caring (spec sections 3.1, 10).
app.use((req, res, next) => {
  try {
    req.stqaContext = verifyStqaContext(req.header('X-STQA-Context'), CONTEXT_SIGNING_SECRET);
    req.teamDb = dbRouter.getPool(req.stqaContext.databaseName);
    next();
  } catch (err) {
    res.status(401).json({ error: { code: 'INVALID_CONTEXT', message: err.message } });
  }
});

// Optional application authentication (separate from the lab layer).
function requireAppAuth(req, res, next) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token.' } });
  }
  try {
    req.appUser = jwt.verify(token, APP_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } });
  }
}

// --- Public application endpoints ---

app.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'email and password are required.' } });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await req.teamDb.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role`,
      [email, hash],
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered.' } });
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Registration failed.' } });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const result = await req.teamDb.query('SELECT id, email, password_hash, role FROM users WHERE email = $1', [
    email,
  ]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
  }
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, APP_JWT_SECRET, {
    expiresIn: '2h',
  });
  res.json({ data: { token, user: { id: user.id, email: user.email, role: user.role } } });
});

app.get('/products', async (req, res) => {
  const result = await req.teamDb.query('SELECT id, name, price, stock FROM products ORDER BY id');
  res.json({ data: result.rows });
});

// --- Application-authenticated endpoints ---

app.post('/orders', requireAppAuth, async (req, res) => {
  const { productId, quantity } = req.body || {};
  if (!productId || !quantity) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'productId and quantity are required.' } });
  }

  // INTENTIONAL BUG (boundary/off-by-one): stock is never checked against
  // quantity before confirming the order, so students can oversell a
  // product past its seeded boundary stock value.
  const result = await req.teamDb.query(
    `INSERT INTO orders (user_id, product_id, quantity, status) VALUES ($1, $2, $3, 'confirmed') RETURNING id, user_id, product_id, quantity, status`,
    [req.appUser.userId, productId, quantity],
  );
  res.status(201).json({ data: result.rows[0] });
});

app.get('/orders/:id', requireAppAuth, async (req, res) => {
  // INTENTIONAL BUG (IDOR): does not verify that the order belongs to
  // req.appUser.userId, so any authenticated user can read any other
  // user's order by guessing/incrementing the ID.
  const result = await req.teamDb.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found.' } });
  }
  res.json({ data: result.rows[0] });
});

app.delete('/orders/:id', requireAppAuth, async (req, res) => {
  // INTENTIONAL BUG (IDOR / broken access control): same missing ownership
  // check as above, but destructive — matches spec section 20's premise
  // that students will test DELETE endpoints and may damage team data,
  // which the gateway's reset endpoint exists to recover from.
  const result = await req.teamDb.query('DELETE FROM orders WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found.' } });
  }
  res.json({ data: { deleted: true, id: result.rows[0].id } });
});

app.listen(PORT, () => {
  console.log(`example-buggy-api listening on port ${PORT}`);
});
