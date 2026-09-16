import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp, parseSession, serializeSession } from "./index";

describe("signed application sessions", () => {
  it("round-trips a valid signed session", () => {
    const value = serializeSession({
      access_token: "token-test-user",
      user_id: "test-user",
      role: "client",
      client_id: "test-client",
      slug: "test-client",
    });

    expect(parseSession(value)).toMatchObject({ role: "client", client_id: "test-client" });
  });

  it("rejects tampered and legacy unsigned session values", () => {
    const value = serializeSession({ access_token: "token-test-user", user_id: "test-user", role: "client", client_id: "test-client" });
    const [payload, signature] = value.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ access_token: "token-test-user", user_id: "test-user", role: "admin" })).toString("base64url");

    expect(parseSession(`${tamperedPayload}.${signature}`)).toBeNull();
    expect(parseSession(encodeURIComponent(JSON.stringify({ access_token: "token-test-user", role: "admin" })))).toBeNull();
    expect(parseSession(`${payload}.invalid`)).toBeNull();
  });
});

describe("authentication and tenant API boundaries", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer(createApiApp());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("reports readiness without exposing configuration", async () => {
    const response = await fetch(`${origin}/api/health`);
    const body = await response.json() as Record<string, unknown>;
    expect([200, 503]).toContain(response.status);
    expect(Object.keys(body).sort()).toEqual(["database", "ok", "status"]);
    expect(JSON.stringify(body)).not.toMatch(/key|secret|url/i);
  });

  it("authenticates an administrator and rejects unsigned privilege cookies", async () => {
    const login = await fetch(`${origin}/api/auth/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@vectorops.ai", password: process.env.ADMIN_AUTH_PASSWORD || "admin2026" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];

    expect(login.status).toBe(200);
    expect(cookie).toContain("vectorops_session=");
    const current = await fetch(`${origin}/api/auth/me`, { headers: { Cookie: cookie! } });
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({ ok: true, user: { role: "admin" } });

    const unsigned = encodeURIComponent(JSON.stringify({ access_token: "token-usr-admin-01", user_id: "usr-admin-01", role: "admin" }));
    const forged = await fetch(`${origin}/api/auth/me`, { headers: { Cookie: `vectorops_session=${unsigned}` } });
    expect(forged.status).toBe(401);
  });

  it("prevents a client session from reading another tenant portal", async () => {
    const login = await fetch(`${origin}/api/auth/client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sarah@apexdental.com", password: process.env.CLIENT_AUTH_PASSWORD || "client2026!" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const ownPortal = await fetch(`${origin}/api/portal/apex-dental/data`, { headers: { Cookie: cookie! } });
    const otherPortal = await fetch(`${origin}/api/portal/elite-fitness/data`, { headers: { Cookie: cookie! } });

    expect(ownPortal.status).toBe(200);
    expect(otherPortal.status).toBe(403);
  });

  it("keeps client support and profile writes inside the authenticated tenant", async () => {
    const login = await fetch(`${origin}/api/auth/client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sarah@apexdental.com", password: process.env.CLIENT_AUTH_PASSWORD || "client2026!" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const ownData = await fetch(`${origin}/api/portal/apex-dental/data`, { headers: { Cookie: cookie! } }).then((response) => response.json()) as { tickets: Array<{ id: string }> };
    const profile = await fetch(`${origin}/api/portal/apex-dental/profile`, { method: "PATCH", headers: { Cookie: cookie!, "Content-Type": "application/json" }, body: JSON.stringify({ full_name: "Sarah", phone: "+15551234567", role: "admin", client_id: "cli-elite-fitness" }) });
    const ownReply = await fetch(`${origin}/api/portal/apex-dental/tickets/${ownData.tickets[0].id}/messages`, { method: "POST", headers: { Cookie: cookie!, "Content-Type": "application/json" }, body: JSON.stringify({ message: "A safe tenant-scoped reply" }) });
    const crossTenantReply = await fetch(`${origin}/api/portal/elite-fitness/tickets/${ownData.tickets[0].id}/messages`, { method: "POST", headers: { Cookie: cookie!, "Content-Type": "application/json" }, body: JSON.stringify({ message: "Must fail" }) });
    const adminData = await fetch(`${origin}/api/admin/data/clients`, { headers: { Cookie: cookie! } });

    expect(profile.status).toBe(200);
    expect(await profile.json()).not.toMatchObject({ profile: { role: "admin", client_id: "cli-elite-fitness" } });
    expect(ownReply.status).toBe(201);
    expect(crossTenantReply.status).toBe(403);
    expect(adminData.status).toBe(401);
  });

  it("validates password recovery requests without manipulating SQL passwords", async () => {
    const invalid = await fetch(`${origin}/api/auth/recovery/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "not-an-email" }) });
    const unavailable = await fetch(`${origin}/api/auth/recovery/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "person@example.com", mode: "client" }) });
    const invalidLink = await fetch(`${origin}/api/auth/recovery/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_password: "GoodPassword123" }) });
    expect(invalid.status).toBe(400);
    expect(unavailable.status).toBe(503);
    expect(invalidLink.status).toBe(400);
    expect(await invalidLink.json()).toMatchObject({ ok: false });
  });

  it("reports n8n control as unavailable instead of faking production success", async () => {
    const adminLogin = await fetch(`${origin}/api/auth/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@vectorops.ai", password: process.env.ADMIN_AUTH_PASSWORD || "admin2026" }) });
    const adminCookie = adminLogin.headers.get("set-cookie")?.split(";")[0];
    const sync = await fetch(`${origin}/api/admin/n8n/sync`, { method: "POST", headers: { Cookie: adminCookie! } });
    const control = await fetch(`${origin}/api/admin/workflows/wf-acme-1/state`, { method: "PATCH", headers: { Cookie: adminCookie!, "Content-Type": "application/json" }, body: JSON.stringify({ desired_state: "paused" }) });
    expect(sync.status).toBe(503);
    expect(control.status).toBe(503);
    expect(JSON.stringify(await sync.json())).toMatch(/requires configured Supabase/i);
    expect(JSON.stringify(await control.json())).toMatch(/unavailable/i);
  });

  it("rejects cross-origin state-changing requests", async () => {
    const response = await fetch(`${origin}/api/auth/logout`, {
      method: "POST",
      headers: { Origin: "https://attacker.invalid" },
    });
    expect(response.status).toBe(403);
  });

  it("rejects unsigned n8n event ingestion", async () => {
    const response = await fetch(`${origin}/api/integrations/n8n/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "business" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid integration credentials." });
  });
});
