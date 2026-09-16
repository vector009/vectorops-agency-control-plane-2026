import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type N8nInstanceRow = {
  id: string;
  base_url: string;
  instance_name: string;
  n8n_api_secret_ref: string | null;
  status: "provisioning" | "active" | "maintenance" | "offline" | "retired";
};

export type N8nWorkflow = {
  id: string;
  name: string;
  active: boolean;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
  tags?: Array<{ id?: string; name?: string }>;
};

export type N8nWorkflowDefinition = {
  name: string;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export type N8nExecution = {
  id: string | number;
  workflowId?: string;
  status?: string;
  finished?: boolean;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  waitTill?: string | null;
  retryOf?: string | null;
};

type PaginatedResponse<T> = { data?: T[]; nextCursor?: string | null };

type N8nClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
};

export class N8nApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "N8nApiError";
  }
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown n8n control error";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function apiRoot(baseUrl: string, allowInsecureHttp: boolean) {
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("n8n base URL must be an HTTP(S) URL without embedded credentials");
  }
  if (parsed.protocol !== "https:" && !allowInsecureHttp) {
    throw new Error("n8n base URL must use HTTPS in production");
  }
  parsed.hash = "";
  parsed.search = "";
  const path = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = path.endsWith("/api/v1") ? path : `${path}/api/v1`;
  return parsed;
}

function durationMs(execution: N8nExecution) {
  if (!execution.startedAt || !execution.stoppedAt) return null;
  const duration = Date.parse(execution.stoppedAt) - Date.parse(execution.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function isSuccessful(status?: string) {
  return ["success", "succeeded", "completed"].includes(String(status || "").toLowerCase());
}

function isFailed(status?: string) {
  return ["error", "failed", "failure", "crashed"].includes(String(status || "").toLowerCase());
}

export class N8nApiClient {
  private readonly root: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, private readonly apiKey: string, options: N8nClientOptions = {}) {
    if (!apiKey.trim()) throw new Error("n8n API key is empty");
    this.root = apiRoot(baseUrl, options.allowInsecureHttp === true);
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = options.timeoutMs || 15_000;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const target = new URL(`${this.root.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, this.root);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(target, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-N8N-API-KEY": this.apiKey,
          ...init.headers,
        },
      });
      if (!response.ok) {
        throw new N8nApiError(`n8n API request failed with HTTP ${response.status}`, response.status);
      }
      if (response.status === 204) return {} as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof N8nApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new N8nApiError("n8n API request timed out");
      throw new N8nApiError("Unable to reach n8n API");
    } finally {
      clearTimeout(timeout);
    }
  }

  async getWorkflow(workflowId: string) {
    return this.request<N8nWorkflow>(`workflows/${encodeURIComponent(workflowId)}`);
  }

  async listWorkflows(maxPages = 20) {
    const workflows: N8nWorkflow[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const query = new URLSearchParams({ limit: "250" });
      if (cursor) query.set("cursor", cursor);
      const result = await this.request<PaginatedResponse<N8nWorkflow>>(`workflows?${query}`);
      workflows.push(...(result.data || []));
      cursor = result.nextCursor || null;
      if (!cursor) return workflows;
    }
    throw new N8nApiError("n8n workflow pagination exceeded the configured safety limit");
  }

  async listExecutions(workflowId: string, limit = 50) {
    const query = new URLSearchParams({
      workflowId,
      limit: String(Math.min(Math.max(limit, 1), 250)),
      includeData: "false",
    });
    const result = await this.request<PaginatedResponse<N8nExecution>>(`executions?${query}`);
    return result.data || [];
  }

  async createWorkflow(definition: N8nWorkflowDefinition) {
    if (!definition.name?.trim() || !Array.isArray(definition.nodes) || !definition.connections || typeof definition.connections !== "object") {
      throw new Error("Template workflow definition is incomplete");
    }
    return this.request<N8nWorkflow>("workflows", {
      method: "POST",
      body: JSON.stringify({
        name: definition.name.trim(),
        nodes: definition.nodes,
        connections: definition.connections,
        settings: definition.settings || {},
      }),
    });
  }

  async setWorkflowState(workflowId: string, desiredState: "running" | "paused") {
    const action = desiredState === "running" ? "activate" : "deactivate";
    await this.request<N8nWorkflow>(`workflows/${encodeURIComponent(workflowId)}/${action}`, { method: "POST", body: "{}" });
    const confirmed = await this.getWorkflow(workflowId);
    const expectedActive = desiredState === "running";
    if (confirmed.active !== expectedActive) {
      throw new N8nApiError(`n8n did not confirm workflow ${desiredState === "running" ? "activation" : "deactivation"}`);
    }
    return confirmed;
  }
}

type MappedWorkflow = {
  id: string;
  client_id: string;
  connection_id: string;
  n8n_instance_id: string;
  n8n_workflow_id: string;
  client_visible: boolean;
  config: JsonRecord;
  last_execution_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
};

type SyncResult = {
  instanceId: string;
  ok: boolean;
  workflowsDiscovered: number;
  workflowsMapped: number;
  executionsRecorded: number;
  controlsApplied: number;
  error?: string;
};

export type ControlPlaneOptions = {
  fetchImpl?: typeof fetch;
  allowInsecureHttp?: boolean;
  executionLimit?: number;
  secretResolver?: (instanceId: string) => Promise<string>;
};

async function requireRpc<T>(result: { data: T; error: { message: string } | null }, operation: string) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

export class N8nControlPlane {
  private running = false;
  private readonly executionLimit: number;

  constructor(private readonly service: SupabaseClient, private readonly options: ControlPlaneOptions = {}) {
    const requestedLimit = Number.isFinite(options.executionLimit) ? Number(options.executionLimit) : 50;
    this.executionLimit = Math.min(Math.max(requestedLimit, 1), 250);
  }

  private async resolveSecret(instanceId: string) {
    if (this.options.secretResolver) return this.options.secretResolver(instanceId);
    const result = await this.service.rpc("get_n8n_api_secret", { p_instance_id: instanceId });
    const secret = await requireRpc(result as { data: string; error: { message: string } | null }, "Resolve n8n secret");
    if (!secret) throw new Error("n8n API secret is not configured in Supabase Vault");
    return secret;
  }

  private client(instance: N8nInstanceRow, secret: string) {
    return new N8nApiClient(instance.base_url, secret, {
      fetchImpl: this.options.fetchImpl,
      allowInsecureHttp: this.options.allowInsecureHttp === true,
    });
  }

  async deployWorkflow(instanceId: string, definition: N8nWorkflowDefinition) {
    const instance = await this.loadInstance(instanceId);
    const secret = await this.resolveSecret(instance.id);
    return this.client(instance, secret).createWorkflow(definition);
  }

  private async loadInstance(instanceId: string) {
    const result = await this.service.from("n8n_instances")
      .select("id,base_url,instance_name,n8n_api_secret_ref,status")
      .eq("id", instanceId)
      .single();
    if (result.error || !result.data) throw new Error(result.error?.message || "n8n instance not found");
    return result.data as N8nInstanceRow;
  }

  private async recordExecutions(workflow: MappedWorkflow, executions: N8nExecution[]) {
    let recorded = 0;
    for (const execution of executions) {
      const sourceId = String(execution.id || "");
      if (!sourceId) continue;
      const status = String(execution.status || (execution.finished ? "completed" : "running"));
      const result = await this.service.rpc("record_workflow_run", {
        p_workflow_id: workflow.id,
        p_source_execution_id: sourceId,
        p_started_at: execution.startedAt || null,
        p_finished_at: execution.stoppedAt || null,
        p_status: status,
        p_duration_ms: durationMs(execution),
        p_error_message: isFailed(status) ? `n8n execution ${sourceId} reported ${status}` : null,
        p_client_visible: workflow.client_visible,
        p_payload: {
          mode: execution.mode || null,
          retry_of: execution.retryOf || null,
          wait_until: execution.waitTill || null,
        },
      });
      await requireRpc(result as { data: unknown; error: { message: string } | null }, "Record workflow execution");
      recorded += 1;
    }
    return recorded;
  }

  private async reconcileControls(instance: N8nInstanceRow, api: N8nApiClient, workflows: Map<string, MappedWorkflow>) {
    const controlsResult = await this.service.from("client_automation_controls")
      .select("workflow_id,desired_state,actual_state,sync_status")
      .eq("n8n_instance_id", instance.id)
      .in("sync_status", ["pending", "syncing"])
      .order("requested_at", { ascending: true });
    if (controlsResult.error) throw new Error(`Load automation controls: ${controlsResult.error.message}`);

    let applied = 0;
    for (const control of controlsResult.data || []) {
      const workflow = workflows.get(control.workflow_id);
      if (!workflow || !["running", "paused"].includes(control.desired_state)) {
        const update = await this.service.from("client_automation_controls").update({
          sync_status: "error",
          last_control_error: workflow ? "Unsupported desired workflow state" : "Mapped workflow was not found",
        }).eq("workflow_id", control.workflow_id);
        if (update.error) throw new Error(`Record invalid automation control: ${update.error.message}`);
        continue;
      }
      const connection = await this.service.from("client_connections")
        .select("status")
        .eq("id", workflow.connection_id)
        .eq("client_id", workflow.client_id)
        .eq("n8n_instance_id", instance.id)
        .single();
      try {
        if (connection.error || connection.data?.status !== "connected") {
          throw new Error("Client n8n connection is not connected");
        }
        const syncing = await this.service.from("client_automation_controls").update({ sync_status: "syncing" }).eq("workflow_id", workflow.id);
        if (syncing.error) throw new Error(`Mark automation control syncing: ${syncing.error.message}`);
        const remote = await api.setWorkflowState(workflow.n8n_workflow_id, control.desired_state as "running" | "paused");
        const actualState = remote.active ? "running" : "paused";
        const result = await this.service.rpc("apply_automation_control_result", {
          p_workflow_id: workflow.id,
          p_actual_state: actualState,
          p_success: actualState === control.desired_state,
          p_error: actualState === control.desired_state ? null : "n8n returned an unexpected workflow state",
        });
        await requireRpc(result as { data: unknown; error: { message: string } | null }, "Apply automation control result");
        applied += 1;
      } catch (error) {
        const result = await this.service.rpc("apply_automation_control_result", {
          p_workflow_id: workflow.id,
          p_actual_state: control.actual_state || "unknown",
          p_success: false,
          p_error: safeError(error),
        });
        await requireRpc(result as { data: unknown; error: { message: string } | null }, "Record automation control failure");
      }
    }
    return applied;
  }

  async syncInstance(instanceId: string): Promise<SyncResult> {
    const summary: SyncResult = {
      instanceId,
      ok: false,
      workflowsDiscovered: 0,
      workflowsMapped: 0,
      executionsRecorded: 0,
      controlsApplied: 0,
    };
    let instance: N8nInstanceRow | null = null;
    let syncBegan = false;
    try {
      instance = await this.loadInstance(instanceId);
      await requireRpc(await this.service.rpc("begin_n8n_sync", { p_instance_id: instance.id }) as { data: unknown; error: { message: string } | null }, "Begin n8n sync");
      syncBegan = true;
      const secret = await this.resolveSecret(instance.id);
      const api = this.client(instance, secret);
      const mappedResult = await this.service.from("workflows")
        .select("id,client_id,connection_id,n8n_instance_id,n8n_workflow_id,client_visible,config,last_execution_at,last_success_at,last_failure_at,last_error")
        .eq("n8n_instance_id", instance.id);
      if (mappedResult.error) throw new Error(`Load mapped workflows: ${mappedResult.error.message}`);
      const mapped = (mappedResult.data || []) as MappedWorkflow[];
      const mappedByRemoteId = new Map(mapped.map((workflow) => [workflow.n8n_workflow_id, workflow]));
      const mappedById = new Map(mapped.map((workflow) => [workflow.id, workflow]));

      summary.controlsApplied = await this.reconcileControls(instance, api, mappedById);
      const remoteWorkflows = await api.listWorkflows();
      summary.workflowsDiscovered = remoteWorkflows.length;

      for (const remote of remoteWorkflows) {
        const discovery = await this.service.rpc("upsert_discovered_workflow", {
          p_instance_id: instance.id,
          p_n8n_workflow_id: String(remote.id),
          p_discovered_name: remote.name || String(remote.id),
          p_n8n_active: remote.active === true,
          p_payload: {
            created_at: remote.createdAt || null,
            updated_at: remote.updatedAt || null,
            archived: remote.isArchived === true,
            tags: (remote.tags || []).map((tag) => ({ id: tag.id, name: tag.name })),
          },
        });
        await requireRpc(discovery as { data: unknown; error: { message: string } | null }, "Upsert discovered workflow");

        const local = mappedByRemoteId.get(String(remote.id));
        if (!local) continue;
        summary.workflowsMapped += 1;
        const executions = await api.listExecutions(String(remote.id), this.executionLimit);
        summary.executionsRecorded += await this.recordExecutions(local, executions);
        const successes = executions.filter((execution) => isSuccessful(execution.status));
        const failures = executions.filter((execution) => isFailed(execution.status));
        const latest = executions[0];
        const actualState = remote.isArchived ? "disabled" : remote.active ? "running" : "paused";
        const workflowStatus = remote.isArchived ? "archived" : remote.active ? "active" : "paused";
        const snapshot = await this.service.rpc("upsert_workflow_snapshot", {
          p_workflow_id: local.id,
          p_name: remote.name || String(remote.id),
          p_status: workflowStatus,
          p_actual_state: actualState,
          p_last_execution_at: latest?.stoppedAt || latest?.startedAt || local.last_execution_at,
          p_last_success_at: successes[0]?.stoppedAt || successes[0]?.startedAt || local.last_success_at,
          p_last_failure_at: failures[0]?.stoppedAt || failures[0]?.startedAt || local.last_failure_at,
          p_last_error: failures[0]
            ? `n8n execution ${failures[0].id} reported ${failures[0].status || "failure"}`
            : latest && isSuccessful(latest.status) ? null : local.last_error,
          p_config: {
            ...(local.config || {}),
            telemetry: {
              source: "n8n-public-api",
              synced_at: new Date().toISOString(),
              recent_execution_count: executions.length,
            },
          },
        });
        await requireRpc(snapshot as { data: unknown; error: { message: string } | null }, "Update workflow telemetry snapshot");
      }

      await requireRpc(await this.service.rpc("complete_n8n_sync", { p_instance_id: instance.id, p_success: true, p_error: null }) as { data: unknown; error: { message: string } | null }, "Complete n8n sync");
      const activated = await this.service.from("n8n_instances").update({ status: "active", last_verified_at: new Date().toISOString() }).eq("id", instance.id);
      if (activated.error) throw new Error(`Update n8n instance health: ${activated.error.message}`);
      summary.ok = true;
      return summary;
    } catch (error) {
      summary.error = safeError(error);
      if (instance && syncBegan) {
        const completed = await this.service.rpc("complete_n8n_sync", { p_instance_id: instance.id, p_success: false, p_error: summary.error });
        if (completed.error) console.error("Unable to record failed n8n sync", completed.error.message);
      }
      if (instance) {
        const offline = await this.service.from("n8n_instances").update({ status: "offline" }).eq("id", instance.id);
        if (offline.error) console.error("Unable to update n8n instance status", offline.error.message);
      }
      return summary;
    }
  }

  async runCycle(instanceId?: string) {
    if (this.running) return { ok: true, skipped: true, reason: "A synchronization cycle is already running", results: [] as SyncResult[] };
    this.running = true;
    try {
      let instanceIds: string[];
      if (instanceId) {
        instanceIds = [instanceId];
      } else {
        const result = await this.service.from("n8n_instances")
          .select("id")
          .in("status", ["provisioning", "active", "maintenance", "offline"])
          .not("n8n_api_secret_ref", "is", null);
        if (result.error) throw new Error(`Load n8n instances: ${result.error.message}`);
        instanceIds = (result.data || []).map((row) => row.id);
      }
      const results: SyncResult[] = [];
      for (const id of instanceIds) results.push(await this.syncInstance(id));
      return { ok: results.every((result) => result.ok), skipped: false, results };
    } finally {
      this.running = false;
    }
  }
}

export function startN8nControlScheduler(controlPlane: N8nControlPlane, intervalMs: number) {
  const safeInterval = Number.isFinite(intervalMs) ? Math.max(intervalMs, 15_000) : 60_000;
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      const result = await controlPlane.runCycle();
      const failures = result.results.filter((item) => !item.ok).length;
      console.log(`n8n sync complete: ${result.results.length} instance(s), ${failures} failure(s)`);
    } catch (error) {
      console.error("n8n synchronization cycle failed", safeError(error));
    }
  };
  const initial = setTimeout(run, 2_000);
  const interval = setInterval(run, safeInterval);
  return () => {
    stopped = true;
    clearTimeout(initial);
    clearInterval(interval);
  };
}
