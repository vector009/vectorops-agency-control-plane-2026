# Supabase Edge deployment

This deployment needs only a static frontend host and the existing Supabase project. Client-owned n8n servers execute workflows; the Supabase Edge Function is the small trusted control/API boundary that keeps service-role and n8n credentials out of browsers.

## 1. Apply the additive database migrations

Do not rerun the baseline or recreate the database. Apply only unapplied files in `supabase/migrations/`, in filename order.

## 2. Configure and deploy the Edge Function

Generate different random values for the webhook and scheduler secrets. Set function secrets in the Supabase dashboard (Edge Functions → Secrets) or with an authenticated Supabase CLI:

```bash
supabase secrets set \
  PUBLIC_APP_URL=https://portal.example.com \
  ALLOWED_ORIGINS=https://portal.example.com \
  N8N_EVENT_INGEST_SECRET=REPLACE_WITH_RANDOM_VALUE \
  N8N_CRON_SECRET=REPLACE_WITH_DIFFERENT_RANDOM_VALUE \
  N8N_EXECUTION_SYNC_LIMIT=50

supabase functions deploy vectorops-api --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied to the function by Supabase. Do not manually expose the service-role value.

The function validates user JWTs itself because the same entry point contains public health and separately authenticated n8n webhook/scheduler routes. Admin authorization also requires a `profiles` row with `role = 'admin'` and `client_id IS NULL`. Client routes derive `client_id` from the verified profile and require the URL portal slug to match it.

## 3. Schedule n8n reconciliation

In Supabase Dashboard → Integrations → Cron, create an HTTP job every minute:

- Method: `POST`
- URL: `https://PROJECT_REF.supabase.co/functions/v1/vectorops-api/api/internal/n8n/sync`
- Header `x-vectorops-cron-secret`: the exact `N8N_CRON_SECRET`
- Header `Content-Type`: `application/json`
- Body: `{}` for all configured instances, or `{"instance_id":"INSTANCE_UUID"}` to keep one job bounded to one instance

The job discovers workflows, records real execution summaries, applies queued desired-state changes, verifies the remote state, and persists success or an explicit error. It runs instances sequentially to bound resource use. As the number of clients grows, configure one staggered job per `instance_id` so an invocation remains within the Edge time limit. If the free-tier execution budget is insufficient, increase the schedule interval; do not run overlapping jobs.

## 4. Store each n8n API key in Vault

Use Supabase SQL Editor for each client-owned n8n instance:

```sql
select vault.create_secret('THE_N8N_API_KEY', 'n8n-client-instance');
```

Copy only the returned UUID into `n8n_instances.n8n_api_secret_ref`. Set `n8n_instances.base_url` to the instance's public HTTPS URL. Never store an API key in the browser, `client_portal_config`, or any `VITE_*` variable.

For push telemetry, configure the client's n8n HTTP Request node to call:

```text
POST https://PROJECT_REF.supabase.co/functions/v1/vectorops-api/api/integrations/n8n/events
X-VectorOps-Ingest-Secret: N8N_EVENT_INGEST_SECRET
Content-Type: application/json
```

The API looks up the mapped workflow and derives its tenant server-side; payloads cannot choose an arbitrary `client_id`. Keep `source_event_key` stable so retrying a delivery remains idempotent through the existing ingestion RPCs.

## 5. Deploy the static frontend

Configure these build-time variables on the frontend host:

```text
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_VECTOROPS_API_URL=https://PROJECT_REF.supabase.co/functions/v1/vectorops-api
```

Build with `pnpm build:client`; publish `dist/public`. `vercel.json` configures Vercel, and `client/public/_redirects` supplies SPA fallback routing for Cloudflare Pages/Netlify-style hosts.

In Supabase Authentication → URL Configuration, set the static origin as Site URL and allow `https://portal.example.com/auth/reset`. Password recovery then uses Supabase PKCE recovery sessions and updates the password through Supabase Auth.

## 6. Production checks

Verify `GET .../api/health`, admin and client login, password recovery, cross-tenant denial, portal data, ticket replies, billing RPCs, workflow discovery/mapping, a real pause/resume confirmation, and a real telemetry event. A missing Vault key, unreachable n8n instance, unsupported template, or failed state confirmation must remain an error; the function never reports a simulated success.
