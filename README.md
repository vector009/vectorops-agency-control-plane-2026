# VectorOps Agency Control Plane

Production-oriented React, Supabase, and n8n agency operations software. Production can use a static frontend plus the included Supabase Edge API; the existing Express runtime remains available for local development or a persistent-host deployment. Privileged Supabase credentials and n8n secrets never enter the browser.

## Local development

Requirements: Node 20.19+ and pnpm 10.34.5.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Without Supabase environment variables, development uses the in-memory demonstration dataset. Production refuses to start in demo mode.

## Supabase setup

### Existing VectorOps database

The supplied baseline and admin-profile PDFs describe the existing live database. Do **not** rerun the baseline, delete tables, or recreate the Supabase project.

1. Take a Supabase database backup or create a point-in-time recovery checkpoint.
2. Apply only the unapplied files in `supabase/migrations/`, in filename order. The included migration creates or replaces functions and does not delete or rewrite existing tenant data.
3. Keep the existing Supabase Auth administrator and profile. Run the admin-profile SQL only if the administrator profile is missing or its role is incorrect.
4. Copy `.env.example` values into the deployment environment and provide all required secrets. Use a cryptographically random `SESSION_SECRET` of at least 32 characters.

### New installation

For a genuinely new Supabase project, apply the supplied baseline first, apply every repository migration, create the first Auth administrator, and then run the supplied admin-profile upsert with that Auth UUID.

The onboarding migration creates tenant records, portal configuration, profile, subscription, invoice, connection, and onboarding state in one transaction. Client passwords are sent to Supabase Auth and are never included in database payloads.

## Recommended frontend and backend connection

For the lowest-operations deployment, host the Vite output on any static host and deploy `supabase/functions/vectorops-api`. The browser uses Supabase Auth and sends its short-lived JWT to the Edge API. The function revalidates the user, role, tenant, and portal slug before each protected operation.

```text
Browser → static host → Supabase Auth
                     └→ Supabase Edge API → existing database/RPCs
                                          └→ authorized client n8n API
```

Follow `docs/SUPABASE_EDGE_DEPLOYMENT.md` for exact secrets, Auth redirects, n8n Vault setup, scheduling, and static-host variables. Never prefix a service-role or n8n secret with `VITE_`.

The persistent Express option still uses `pnpm build && pnpm start` and the server variables in `.env.example`; it is not required when the static + Edge architecture is configured.

After deployment, `GET /api/health` must return `{"ok":true,"status":"ready","database":"connected"}`. Then sign in as the existing administrator and test one non-production tenant through onboarding, portal customization, invoicing, workflow mapping, and client login before inviting real clients.

Admin pages use server-authorized access across tenants. Client pages use the signed-in Supabase identity and database RLS to return only that profile's `client_id`. Both interfaces write through the same API and database audit trail. n8n pause/resume actions remain desired-state requests until the server-side control plane confirms the actual state. The admin automation view refreshes every 20 seconds and client portals every 15 seconds without exposing a Supabase or n8n secret to the browser.

## n8n live integration

The Edge API includes the same control-plane operations. A Supabase Cron HTTP job invokes reconciliation; no Render/Railway Node machine is required. Client-owned n8n servers still execute the workflows.

1. Apply `supabase/migrations/20260915010000_n8n_control_plane.sql` and then `supabase/migrations/20260919000000_n8n_secret_setup.sql` after the existing migration.
2. Create the n8n instance record with its HTTPS `base_url` through the existing infrastructure/onboarding flow.
3. In the VectorOps admin console open **Infrastructure**, select the instance, paste its n8n API key, and choose **Connect and sync n8n**. The key is sent to the trusted Edge API, stored in Supabase Vault, and discarded from the browser after submission. The UI reports success only after the real n8n API has responded and workflow telemetry has been persisted.
4. Give the n8n API key only the workflow read/list/activate and execution read/list permissions needed by this service. Never put it in a public table, GitHub, Cloudflare variable, or browser variable.
5. Configure the Supabase Cron call described in `docs/SUPABASE_EDGE_DEPLOYMENT.md`. The admin **Sync n8n Now** action is also available for an immediate pull.
6. For instant business outcomes, configure an n8n HTTP Request node to POST to the Edge event route with `X-VectorOps-Ingest-Secret`. Store that separate value in n8n Credentials, not inside a workflow export.

Example business event body:

```json
{
  "kind": "business",
  "instance_id": "INSTANCE_UUID",
  "n8n_workflow_id": "N8N_WORKFLOW_ID",
  "source_execution_id": "{{$execution.id}}",
  "source_event_key": "{{$execution.id}}:qualified-lead",
  "event_type": "qualified_lead",
  "event_value": 1,
  "occurred_at": "{{$now}}",
  "payload": {}
}
```

The server derives the tenant from the mapped workflow, so an n8n payload cannot select another client. `source_event_key` makes retries idempotent. Periodic API pulls provide execution health; signed push events provide near-real-time business metrics.

For immediate execution health, send the same envelope with `"kind":"automation"`, `"event_type":"execution_finished"`, `"status":"success"`, `"success":true`, and `"duration_ms":1234`. Include `started_at` and `finished_at` when available. The portal receives the stored run on its next 15-second refresh.

## Validation and production

```bash
pnpm check
pnpm test
pnpm build
pnpm start
```

The production server requires Supabase configuration, a signing secret, the Vault migration, and n8n credentials for live automation control. The UI does not simulate successful production control operations.
