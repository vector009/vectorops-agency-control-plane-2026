export type Client = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: "active" | "pending" | "paused" | "churned" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  client_id: string;
  service_name: string;
  monthly_amount: number;
  currency: string;
  billing_day: number;
  auto_renew: boolean;
  status: "pending" | "active" | "paused" | "cancelled" | "expired";
  start_date: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_date?: string | null;
  created_at: string;
  updated_at?: string;
};

export type Invoice = {
  id: string;
  client_id: string;
  subscription_id: string;
  invoice_number: string;
  invoice_type: "initial" | "renewal" | "adjustment";
  issue_date: string;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  total_amount: number;
  amount_paid: number;
  status: "draft" | "due" | "partially_paid" | "paid" | "overdue" | "void";
  description: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  client_id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  method: string | null;
  reference: string | null;
  status: "received" | "reversed" | "refunded";
  notes: string | null;
  recorded_by_user_id?: string | null;
  created_at: string;
};

export type BillingAdjustment = {
  id: string;
  client_id: string;
  subscription_id: string | null;
  invoice_id: string | null;
  adjustment_type: "free_days" | "discount" | "credit" | "goodwill_extension" | "pause" | "renewal_date_change";
  amount_delta: number;
  days_delta: number;
  description: string | null;
  applied: boolean;
  applied_at?: string | null;
  created_at: string;
};

export type Workflow = {
  id: string;
  client_id: string;
  connection_id?: string;
  n8n_instance_id: string;
  n8n_workflow_id: string;
  workflow_name: string;
  business_name: string | null;
  business_job: string | null;
  description: string | null;
  status: "draft" | "active" | "paused" | "disabled" | "error" | "archived";
  client_visible: boolean;
  desired_state: "unknown" | "running" | "paused" | "disabled";
  actual_state: "unknown" | "running" | "paused" | "disabled";
  sync_status?: "idle" | "pending" | "syncing" | "success" | "error";
  last_execution_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type WorkflowRun = {
  id: string;
  workflow_id: string;
  source_execution_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

export type DiscoveredWorkflow = {
  id: string;
  n8n_instance_id: string;
  n8n_workflow_id: string;
  discovered_name: string | null;
  name_in_n8n?: string;
  first_seen_at: string;
  discovered_at?: string;
  mapped_workflow_id: string | null;
  status: "unmapped" | "mapped" | "ignored";
};

export type AutomationTemplate = {
  id: string;
  template_key: string;
  name: string;
  category: string | null;
  description: string | null;
  n8n_template_ref: string | null;
  default_client_visible: boolean;
  default_config: Record<string, unknown>;
  active: boolean;
  version?: string;
  target_industry?: string;
};

export type N8nInstance = {
  id: string;
  instance_name: string;
  base_url: string;
  hosting_type: "shared" | "dedicated";
  status: "provisioning" | "active" | "maintenance" | "offline" | "retired";
  server_id: string | null;
  last_verified_at: string | null;
  last_sync_status: "idle" | "pending" | "syncing" | "success" | "error" | "stale";
  connected_clients?: number;
  workflow_count?: number;
};

export type ProviderBalance = {
  id: string;
  provider_name: string;
  account_name: string | null;
  currency: string;
  balance: number;
  threshold: number;
  checked_at: string;
  provider?: string;
  category?: string;
  current_balance?: number;
  alert_threshold?: number;
  last_checked_at?: string;
};

export type CredentialMeta = {
  id: string;
  client_id: string | null;
  provider_name: string;
  credential_name: string;
  vault_secret_ref: string | null;
  expires_at: string | null;
  active: boolean;
  service_name?: string;
  status?: "active" | "expired";
  last_used_at?: string;
};

export type Task = {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "blocked" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SupportTicket = {
  id: string;
  client_id: string;
  ticket_number: string;
  subject: string;
  description?: string;
  status: "open" | "pending_client" | "pending_admin" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  category: string | null;
  internal_notes?: string;
  assigned_to_user_id?: string | null;
  messages?: SupportTicketMessage[];
  created_at: string;
  updated_at?: string;
};

export type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  sender_user_id: string | null;
  message: string;
  created_at: string;
};

export type ClientProfile = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClientReport = {
  id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  title: string;
  summary: string | null;
  metrics: Record<string, unknown>;
  insights: unknown[];
  generated_at: string;
};

export type ClientOnboarding = {
  client_id: string;
  identity_complete: boolean;
  portal_complete: boolean;
  commercial_complete: boolean;
  infrastructure_complete: boolean;
  automations_complete: boolean;
  n8n_complete: boolean;
  account_complete: boolean;
  verification_complete: boolean;
  access_sent: boolean;
  notes: string | null;
  completed_at: string | null;
};

export type CalendarEvent = {
  id: string;
  client_id: string | null;
  title: string;
  description?: string | null;
  event_type: "meeting" | "call" | "onboarding" | "renewal" | "internal" | "other";
  status?: "scheduled" | "completed" | "cancelled";
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes?: string | null;
  created_at: string;
};

export type BusinessEvent = {
  id: string;
  client_id: string;
  workflow_id: string | null;
  event_type: string;
  event_value: number | null;
  currency: string | null;
  payload?: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  client_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ClientPortalConfig = {
  id?: string;
  client_id: string;
  slug: string;
  portal_title: string;
  logo_url: string | null;
  favicon_url?: string | null;
  primary_color: string;
  accent_color: string;
  enabled_modules: string[];
  dashboard_config: Record<string, unknown>;
  kpi_config: Array<Record<string, unknown>> | Record<string, unknown>;
  terminology: Record<string, string>;
  client_settings_schema: Record<string, unknown>;
};

export type AttentionItem = {
  id: string;
  tone: "amber" | "green" | "purple";
  title: string;
  subtitle: string;
  actionLabel?: string;
  targetModule?: string;
};
