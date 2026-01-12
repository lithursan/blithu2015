# Shivam Backend (minimal)

This is a small Express server that proxies common order operations to Supabase.

Setup

1. Copy `.env.example` to `.env` and fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Install dependencies:

```bash
cd server
npm install
```

3. Run server:

```bash
npm run start
# or for development with nodemon
npm run dev
```

Default port: 4000 (change via `PORT` in `.env`).

Endpoints (examples)

- GET /health
- GET /orders
- POST /orders  { payload }  // create order
- POST /orders/:id/save-balances  { chequeBalance, creditBalance, returnAmount, amountPaid, createCollections }
- POST /orders/:id/finalize

Notes

- This is a minimal scaffold for local use. Use `SUPABASE_SERVICE_ROLE_KEY` on the server only. Do NOT commit your service role key to source control.
- You can modify and extend endpoints to support additional business logic (applyTargets, notifications, etc.).
