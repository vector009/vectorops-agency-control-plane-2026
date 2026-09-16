import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { N8nApiClient } from "./n8n-control";

describe("n8n API client", () => {
  let server: Server;
  let origin: string;
  const requests: Array<{ url: string; method: string; apiKey?: string }> = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      requests.push({ url: request.url || "", method: request.method || "GET", apiKey: request.headers["x-n8n-api-key"]?.toString() });
      response.setHeader("Content-Type", "application/json");
      if (request.url?.startsWith("/api/v1/workflows?")) {
        response.end(JSON.stringify({ data: [{ id: "wf-1", name: "Lead routing", active: true }] }));
        return;
      }
      if (request.url?.startsWith("/api/v1/executions?")) {
        response.end(JSON.stringify({ data: [{ id: "run-1", workflowId: "wf-1", status: "success" }] }));
        return;
      }
      if (request.url === "/api/v1/workflows" && request.method === "POST") {
        response.end(JSON.stringify({ id: "wf-created", name: "Tenant workflow", active: false }));
        return;
      }
      if (request.url === "/api/v1/workflows/wf-1/deactivate" && request.method === "POST") {
        response.end(JSON.stringify({ id: "wf-1", name: "Lead routing", active: false }));
        return;
      }
      if (request.url === "/api/v1/workflows/wf-1") {
        response.end(JSON.stringify({ id: "wf-1", name: "Lead routing", active: false }));
        return;
      }
      response.statusCode = 500;
      response.end(JSON.stringify({ message: "sensitive-upstream-body", apiKey: "must-not-leak" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("requires HTTPS unless explicitly allowed for local development", () => {
    expect(() => new N8nApiClient(origin, "test-key")).toThrow(/HTTPS/);
  });

  it("discovers workflows and reads execution summaries with the API key server-side", async () => {
    const client = new N8nApiClient(origin, "test-key", { allowInsecureHttp: true });
    expect(await client.listWorkflows()).toMatchObject([{ id: "wf-1", active: true }]);
    expect(await client.listExecutions("wf-1", 25)).toMatchObject([{ id: "run-1", status: "success" }]);
    expect(requests.at(-1)?.url).toContain("includeData=false");
    expect(requests.at(-1)?.apiKey).toBe("test-key");
  });

  it("applies and confirms desired workflow state", async () => {
    const client = new N8nApiClient(origin, "test-key", { allowInsecureHttp: true });
    await expect(client.setWorkflowState("wf-1", "paused")).resolves.toMatchObject({ active: false });
    expect(requests.some((request) => request.url.endsWith("/deactivate") && request.method === "POST")).toBe(true);
  });

  it("creates a real inactive workflow from a reviewed template definition", async () => {
    const client = new N8nApiClient(origin, "test-key", { allowInsecureHttp: true });
    await expect(client.createWorkflow({ name: "Tenant workflow", nodes: [], connections: {}, settings: {} })).resolves.toMatchObject({ id: "wf-created", active: false });
    expect(requests.at(-1)).toMatchObject({ url: "/api/v1/workflows", method: "POST", apiKey: "test-key" });
  });

  it("does not expose upstream response bodies or credentials in errors", async () => {
    const client = new N8nApiClient(origin, "test-key", { allowInsecureHttp: true });
    await expect(client.getWorkflow("missing")).rejects.toThrow("HTTP 500");
    await expect(client.getWorkflow("missing")).rejects.not.toThrow(/sensitive-upstream-body|must-not-leak|test-key/);
  });
});
