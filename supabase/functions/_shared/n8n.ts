import type { SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";

type Json = Record<string, unknown>;
type Instance = { id: string; base_url: string; instance_name: string; n8n_api_secret_ref: string | null; status: string };
type Workflow = { id: string; name: string; active: boolean; isArchived?: boolean; createdAt?: string; updatedAt?: string; tags?: Array<{ id?: string; name?: string }> };
type Execution = { id: string | number; workflowId?: string; status?: string; finished?: boolean; mode?: string; startedAt?: string; stoppedAt?: string; waitTill?: string | null; retryOf?: string | null };
type LocalWorkflow = { id: string; client_id: string; connection_id: string; n8n_instance_id: string; n8n_workflow_id: string; client_visible: boolean; config: Json; last_execution_at: string | null; last_success_at: string | null; last_failure_at: string | null; last_error: string | null };

export type WorkflowDefinition = { name: string; nodes: unknown[]; connections: Record<string, unknown>; settings?: Record<string, unknown> };
export type SyncResult = { instanceId: string; ok: boolean; workflowsDiscovered: number; workflowsMapped: number; executionsRecorded: number; controlsApplied: number; error?: string };

export function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown n8n control error").replace(/[\r\n]+/g, " ").slice(0, 500);
}

function n8nRoot(baseUrl: string) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("n8n base URL must be HTTPS and cannot contain credentials");
  }
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/api/v1") ? path : `${path}/api/v1`;
  return url;
}

class N8nClient {
  private root: URL;
  constructor(baseUrl: string, private key: string) {
    if (!key.trim()) throw new Error("n8n API key is empty");
    this.root = n8nRoot(baseUrl);
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const target = new URL(`${this.root.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, this.root);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(target, {
        ...init,
        signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-N8N-API-KEY": this.key, ...init.headers },
      });
      if (!response.ok) throw new Error(`n8n API request failed with HTTP ${response.status}`);
      if (response.status === 204) return {} as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("n8n API request timed out");
      throw error instanceof Error && error.message.startsWith("n8n API") ? error : new Error("Unable to reach n8n API");
    } finally {
      clearTimeout(timer);
    }
  }

  getWorkflow(id: string) { return this.request<Workflow>(`workflows/${encodeURIComponent(id)}`); }
  async listWorkflows() {
    const rows: Workflow[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ limit: "250" });
      if (cursor) query.set("cursor", cursor);
      const result = await this.request<{ data?: Workflow[]; nextCursor?: string | null }>(`workflows?${query}`);
      rows.push(...(result.data || []));
      cursor = result.nextCursor || null;
      if (!cursor) return rows;
    }
    throw new Error("n8n workflow pagination exceeded the safety limit");
  }
  async listExecutions(workflowId: string, limit: number) {
    const query = new URLSearchParams({ workflowId, limit: String(Math.min(Math.max(limit, 1), 250)), includeData: "false" });
    return (await this.request<{ data?: Execution[] }>(`executions?${query}`)).data || [];
  }
  createWorkflow(definition: WorkflowDefinition) {
    if (!definition.name?.trim() || !Array.isArray(definition.nodes) || !definition.connections || typeof definition.connections !== "object") throw new Error("Template workflow definition is incomplete");
    return this.request<Workflow>("workflows", { method: "POST", body: JSON.stringify({ name: definition.name.trim(), nodes: definition.nodes, connections: definition.connections, settings: definition.settings || {} }) });
  }
  async setState(id: string, state: "running" | "paused") {
    await this.request(`workflows/${encodeURIComponent(id)}/${state === "running" ? "activate" : "deactivate"}`, { method: "POST", body: "{}" });
    const workflow = await this.getWorkflow(id);
    if (workflow.active !== (state === "running")) throw new Error("n8n did not confirm the requested workflow state");
    return workflow;
  }
}

async function must<T>(result: { data: T; error: { message: string } | null }, label: string) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
function duration(execution: Execution) {
  if (!execution.startedAt || !execution.stoppedAt) return null;
  const value = Date.parse(execution.stoppedAt) - Date.parse(execution.startedAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
const succeeds = (status?: string) => ["success", "succeeded", "completed"].includes(String(status || "").toLowerCase());
const fails = (status?: string) => ["error", "failed", "failure", "crashed"].includes(String(status || "").toLowerCase());

export class N8nControlPlane {
  constructor(private service: SupabaseClient, private executionLimit = 50) {
    this.executionLimit = Math.min(Math.max(Number(executionLimit) || 50, 1), 250);
  }
  private async instance(id: string) {
    const result = await this.service.from("n8n_instances").select("id,base_url,instance_name,n8n_api_secret_ref,status").eq("id", id).single();
    if (result.error || !result.data) throw new Error(result.error?.message || "n8n instance not found");
    return result.data as Instance;
  }
  private async api(instance: Instance) {
    const result = await this.service.rpc("get_n8n_api_secret", { p_instance_id: instance.id });
    const secret = await must(result as { data: string; error: { message: string } | null }, "Resolve n8n secret");
    if (!secret) throw new Error("n8n API secret is not configured in Supabase Vault");
    return new N8nClient(instance.base_url, secret);
  }
  async deploy(instanceId: string, definition: WorkflowDefinition) {
    const instance = await this.instance(instanceId);
    return (await this.api(instance)).createWorkflow(definition);
  }
  private async record(workflow: LocalWorkflow, executions: Execution[]) {
    let count = 0;
    for (const item of executions) {
      const source = String(item.id || "");
      if (!source) continue;
      const status = String(item.status || (item.finished ? "completed" : "running"));
      await must(await this.service.rpc("record_workflow_run", {
        p_workflow_id: workflow.id, p_source_execution_id: source, p_started_at: item.startedAt || null,
        p_finished_at: item.stoppedAt || null, p_status: status, p_duration_ms: duration(item),
        p_error_message: fails(status) ? `n8n execution ${source} reported ${status}` : null,
        p_client_visible: workflow.client_visible,
        p_payload: { mode: item.mode || null, retry_of: item.retryOf || null, wait_until: item.waitTill || null },
      }) as { data: unknown; error: { message: string } | null }, "Record workflow execution");
      count++;
    }
    return count;
  }
  private async controls(instance: Instance, api: N8nClient, workflows: Map<string, LocalWorkflow>) {
    const result = await this.service.from("client_automation_controls").select("workflow_id,desired_state,actual_state,sync_status").eq("n8n_instance_id", instance.id).in("sync_status", ["pending", "syncing"]).order("requested_at", { ascending: true });
    if (result.error) throw new Error(`Load automation controls: ${result.error.message}`);
    let count = 0;
    for (const control of result.data || []) {
      const workflow = workflows.get(control.workflow_id);
      if (!workflow || !["running", "paused"].includes(control.desired_state)) {
        await this.service.from("client_automation_controls").update({ sync_status: "error", last_control_error: workflow ? "Unsupported desired workflow state" : "Mapped workflow was not found" }).eq("workflow_id", control.workflow_id);
        continue;
      }
      try {
        const connection = await this.service.from("client_connections").select("status").eq("id", workflow.connection_id).eq("client_id", workflow.client_id).eq("n8n_instance_id", instance.id).single();
        if (connection.error || connection.data?.status !== "connected") throw new Error("Client n8n connection is not connected");
        await must(await this.service.from("client_automation_controls").update({ sync_status: "syncing" }).eq("workflow_id", workflow.id) as never, "Mark control syncing");
        const remote = await api.setState(workflow.n8n_workflow_id, control.desired_state as "running" | "paused");
        const actual = remote.active ? "running" : "paused";
        await must(await this.service.rpc("apply_automation_control_result", { p_workflow_id: workflow.id, p_actual_state: actual, p_success: actual === control.desired_state, p_error: actual === control.desired_state ? null : "n8n returned an unexpected workflow state" }) as { data: unknown; error: { message: string } | null }, "Apply automation control result");
        count++;
      } catch (error) {
        await must(await this.service.rpc("apply_automation_control_result", { p_workflow_id: workflow.id, p_actual_state: control.actual_state || "unknown", p_success: false, p_error: safeError(error) }) as { data: unknown; error: { message: string } | null }, "Record automation control failure");
      }
    }
    return count;
  }
  async syncInstance(instanceId: string): Promise<SyncResult> {
    const summary: SyncResult = { instanceId, ok: false, workflowsDiscovered: 0, workflowsMapped: 0, executionsRecorded: 0, controlsApplied: 0 };
    let instance: Instance | null = null;
    let began = false;
    try {
      instance = await this.instance(instanceId);
      await must(await this.service.rpc("begin_n8n_sync", { p_instance_id: instance.id }) as { data: unknown; error: { message: string } | null }, "Begin n8n sync");
      began = true;
      const api = await this.api(instance);
      const localResult = await this.service.from("workflows").select("id,client_id,connection_id,n8n_instance_id,n8n_workflow_id,client_visible,config,last_execution_at,last_success_at,last_failure_at,last_error").eq("n8n_instance_id", instance.id);
      if (localResult.error) throw new Error(`Load mapped workflows: ${localResult.error.message}`);
      const local = (localResult.data || []) as LocalWorkflow[];
      const byRemote = new Map(local.map((item) => [item.n8n_workflow_id, item]));
      summary.controlsApplied = await this.controls(instance, api, new Map(local.map((item) => [item.id, item])));
      const remote = await api.listWorkflows();
      summary.workflowsDiscovered = remote.length;
      for (const item of remote) {
        await must(await this.service.rpc("upsert_discovered_workflow", { p_instance_id: instance.id, p_n8n_workflow_id: String(item.id), p_discovered_name: item.name || String(item.id), p_n8n_active: item.active === true, p_payload: { created_at: item.createdAt || null, updated_at: item.updatedAt || null, archived: item.isArchived === true, tags: item.tags || [] } }) as { data: unknown; error: { message: string } | null }, "Upsert discovered workflow");
        const workflow = byRemote.get(String(item.id));
        if (!workflow) continue;
        summary.workflowsMapped++;
        const executions = await api.listExecutions(String(item.id), this.executionLimit);
        summary.executionsRecorded += await this.record(workflow, executions);
        const latest = executions[0];
        const successes = executions.filter((execution) => succeeds(execution.status));
        const failures = executions.filter((execution) => fails(execution.status));
        await must(await this.service.rpc("upsert_workflow_snapshot", {
          p_workflow_id: workflow.id, p_name: item.name || String(item.id), p_status: item.isArchived ? "archived" : item.active ? "active" : "paused",
          p_actual_state: item.isArchived ? "disabled" : item.active ? "running" : "paused",
          p_last_execution_at: latest?.stoppedAt || latest?.startedAt || workflow.last_execution_at,
          p_last_success_at: successes[0]?.stoppedAt || successes[0]?.startedAt || workflow.last_success_at,
          p_last_failure_at: failures[0]?.stoppedAt || failures[0]?.startedAt || workflow.last_failure_at,
          p_last_error: failures[0] ? `n8n execution ${failures[0].id} reported ${failures[0].status || "failure"}` : latest && succeeds(latest.status) ? null : workflow.last_error,
          p_config: { ...(workflow.config || {}), telemetry: { source: "n8n-public-api", synced_at: new Date().toISOString(), recent_execution_count: executions.length } },
        }) as { data: unknown; error: { message: string } | null }, "Update workflow telemetry snapshot");
      }
      await must(await this.service.rpc("complete_n8n_sync", { p_instance_id: instance.id, p_success: true, p_error: null }) as { data: unknown; error: { message: string } | null }, "Complete n8n sync");
      const updated = await this.service.from("n8n_instances").update({ status: "active", last_verified_at: new Date().toISOString() }).eq("id", instance.id);
      if (updated.error) throw new Error(`Update n8n instance health: ${updated.error.message}`);
      summary.ok = true;
    } catch (error) {
      summary.error = safeError(error);
      if (instance && began) await this.service.rpc("complete_n8n_sync", { p_instance_id: instance.id, p_success: false, p_error: summary.error });
      if (instance) await this.service.from("n8n_instances").update({ status: "offline" }).eq("id", instance.id);
    }
    return summary;
  }
  async run(instanceId?: string) {
    let ids = instanceId ? [instanceId] : [];
    if (!instanceId) {
      const result = await this.service.from("n8n_instances").select("id").in("status", ["provisioning", "active", "maintenance", "offline"]).not("n8n_api_secret_ref", "is", null);
      if (result.error) throw new Error(`Load n8n instances: ${result.error.message}`);
      ids = (result.data || []).map((item) => item.id);
    }
    const results: SyncResult[] = [];
    // Sequential by design: it bounds outbound concurrency and Edge resource use.
    for (const id of ids) results.push(await this.syncInstance(id));
    return { ok: results.every((item) => item.ok), results };
  }
}
