export type Client = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: "active" | "pending" | "paused" | "churned" | "archived";
  notes?: string | null;
  created_at: string;
  updated_at?: string;
};

export type Subscription = {
  id: string;
  client_id: string;
  service_name: string;
  monthly_amount: number;
  currency: string;
  billing_day: number;
  auto_renew: boolean;
  status: "active" | "paused" | "canceled" | "past_due";
  next_billing_date: string;
  created_at: string;
};

export type Invoice = {
  id: string;
  client_id: string;
  subscription_id?: string | null;
  invoice_number: string;
  invoice_type: "setup" | "recurring" | "adjustment" | "one_time";
  issue_date: string;
  due_date: string;
  period_start?: string | null;
  period_end?: string | null;
  total_amount: number;
  amount_paid: number;
  status: "draft" | "issued" | "due" | "partially_paid" | "paid" | "overdue" | "voided" | "uncollectible";
  description: string;
  created_at: string;
};

export type Payment = {
  id: string;
  client_id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference?: string | null;
  status: "reconciled" | "pending" | "refunded";
  notes?: string | null;
  recorded_by_user_id?: string;
  created_at: string;
};

export type BillingAdjustment = {
  id: string;
  client_id: string;
  subscription_id?: string | null;
  invoice_id?: string | null;
  adjustment_type: "free_days" | "discount_percent" | "fixed_credit" | "manual_waiver";
  amount_delta: number;
  days_delta: number;
  description: string;
  applied: boolean;
  created_at: string;
};

export type Workflow = {
  id: string;
  client_id: string;
  n8n_instance_id: string;
  n8n_workflow_id: string;
  workflow_name: string;
  business_name: string;
  business_job: string;
  description?: string | null;
  status: "active" | "paused" | "error" | "draft";
  client_visible: boolean;
  desired_state: "running" | "paused";
  actual_state: "running" | "paused" | "error";
  sync_status: "synchronized" | "synchronizing" | "drift_detected" | "error";
  last_execution_at?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_error?: string | null;
  created_at: string;
};

export type DiscoveredWorkflow = {
  id: string;
  n8n_instance_id: string;
  n8n_workflow_id: string;
  name_in_n8n: string;
  discovered_at: string;
  mapped_client_id: string | null;
  status: "unmapped" | "mapped" | "ignored";
};

export type AutomationTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  version: string;
  n8n_template_json_ref: string;
  target_industry: string;
};

export type N8nInstance = {
  id: string;
  instance_name: string;
  base_url: string;
  hosting_type: "shared" | "dedicated";
  status: "active" | "degraded" | "offline";
  server_id?: string | null;
  last_verified_at: string;
  last_sync_status: "success" | "warning" | "error";
  connected_clients: number;
  workflow_count: number;
};

export type ProviderBalance = {
  provider: string;
  category: string;
  current_balance: number;
  currency: string;
  alert_threshold: number;
  status: "healthy" | "low_balance" | "critical";
  last_checked_at: string;
};

export type CredentialMeta = {
  id: string;
  service_name: string;
  client_id?: string | null;
  vault_secret_ref: string;
  status: "active" | "expiring_soon" | "expired";
  expires_at?: string | null;
  last_used_at: string;
};

export type Task = {
  id: string;
  client_id?: string | null;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  due_at?: string | null;
  completed_at?: string | null;
  created_at: string;
};

export type SupportTicket = {
  id: string;
  client_id: string;
  ticket_number: string;
  subject: string;
  description: string;
  status: "open" | "in_progress" | "waiting_on_client" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  category: string;
  internal_notes?: string | null;
  created_at: string;
  updated_at?: string;
};

export type CalendarEvent = {
  id: string;
  client_id?: string | null;
  title: string;
  event_type: "invoice_due" | "renewal" | "payment" | "meeting" | "maintenance";
  starts_at: string;
  ends_at: string;
  location?: string | null;
  notes?: string | null;
  created_at: string;
};

export type BusinessEvent = {
  id: string;
  client_id: string;
  workflow_id?: string | null;
  event_type: string;
  event_value?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_user_id: string;
  actor_role: string;
  client_id?: string | null;
  action: string;
  table_name: string;
  record_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type ClientPortalConfig = {
  client_id: string;
  slug: string;
  portal_title: string;
  logo_url?: string | null;
  primary_color: string;
  accent_color: string;
  custom_domain?: string | null;
  enabled_modules: string[];
};

export type AttentionItem = {
  id: string;
  tone: "amber" | "green" | "purple";
  title: string;
  subtitle: string;
  actionLabel?: string;
  targetModule?: string;
};
