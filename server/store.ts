// VectorOps Local Operational Engine (Memory & Resilience Store)
// Implements the locked VectorOps multi-tenant agency architecture
// Mirrors Supabase tables and provides zero-downtime offline & preview functionality

export interface ProfileRecord {
  user_id: string;
  role: "admin" | "client";
  client_id: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  password: string; // Auth-layer only (Supabase Auth representation)
  role: "admin" | "client";
  client_id: string | null;
  full_name: string;
}

export interface ClientRecord {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: "pending" | "active" | "paused" | "churned" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPortalConfig {
  client_id: string;
  slug: string;
  portal_title: string;
  logo_url: string | null;
  favicon_url?: string | null;
  primary_color: string;
  accent_color: string;
  enabled_modules: string[];
  dashboard_config: Record<string, unknown>;
  kpi_config: Record<string, unknown>;
  terminology: Record<string, string>;
  client_settings_schema: Record<string, unknown>;
}

export interface WorkflowRecord {
  id: string;
  client_id: string;
  n8n_instance_id: string;
  n8n_workflow_id: string;
  workflow_name: string;
  business_name: string;
  business_job: string;
  description: string | null;
  status: "active" | "inactive" | "error";
  client_visible: boolean;
  desired_state: "running" | "paused";
  actual_state: "running" | "paused" | "error";
  sync_status: "synchronized" | "synchronizing" | "error";
  last_execution_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRecord {
  id: string;
  client_id: string;
  subscription_id: string | null;
  invoice_number: string;
  invoice_type: "recurring" | "setup" | "usage" | "custom";
  issue_date: string;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  total_amount: number;
  amount_paid: number;
  status: "open" | "partially_paid" | "paid" | "overdue" | "void";
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  client_id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  status: "recorded" | "reconciled" | "failed";
  notes: string | null;
  recorded_by_user_id?: string;
  created_at: string;
}

export interface BillingAdjustmentRecord {
  id: string;
  client_id: string;
  subscription_id: string | null;
  invoice_id: string | null;
  adjustment_type: "free_days" | "goodwill_extension" | "discount" | "credit" | "pause" | "renewal_date_change";
  amount_delta: number;
  days_delta: number;
  description: string;
  applied: boolean;
  created_at: string;
}

export interface SubscriptionRecord {
  id: string;
  client_id: string;
  service_name: string;
  monthly_amount: number;
  currency: string;
  billing_day: number;
  auto_renew: boolean;
  status: "active" | "paused" | "cancelled" | "past_due";
  start_date: string;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
}

export interface N8nInstanceRecord {
  id: string;
  instance_name: string;
  base_url: string;
  hosting_type: "shared" | "dedicated";
  status: "active" | "provisioning" | "maintenance" | "degraded" | "offline";
  server_id: string | null;
  n8n_api_secret_ref: string;
  last_verified_at: string;
  last_sync_status: "success" | "syncing" | "error" | "idle";
  connected_clients: number;
  workflow_count: number;
  created_at: string;
}

export interface ProviderBalanceRecord {
  id: string;
  provider: string;
  account: string;
  balance: number;
  threshold: number;
  usage: string;
  status: "healthy" | "warning" | "exceeded";
}

export interface CredentialMetadataRecord {
  id: string;
  provider: string;
  label: string;
  status: "valid" | "expiring_soon" | "expired";
  expiry: string;
  vault_secret_ref: string;
}

export interface TaskRecord {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SupportTicketRecord {
  id: string;
  client_id: string;
  ticket_number: string;
  subject: string;
  description: string;
  status: "open" | "in_progress" | "waiting_client" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  category: string;
  internal_notes: string | null;
  messages?: Array<{
    id: string;
    ticket_id: string;
    sender_user_id: string | null;
    message: string;
    internal: boolean;
    created_at: string;
  }>;
  created_at: string;
}

export interface CalendarEventRecord {
  id: string;
  client_id: string | null;
  title: string;
  event_type: "invoice_due" | "renewal" | "payment" | "adjustment" | "task" | "support_followup" | "onboarding" | "meeting";
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface BusinessEventRecord {
  id: string;
  client_id: string;
  event_type: string;
  event_value: number;
  currency: string;
  occurred_at: string;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  actor_user_id: string | null;
  actor_role: "admin" | "client" | "system";
  action: string;
  table_name: string;
  record_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DiscoveredWorkflowRecord {
  id: string;
  n8n_instance_id: string;
  n8n_workflow_id: string;
  workflow_name: string;
  status: "unmapped" | "mapped";
  discovered_at: string;
}

export interface AutomationTemplateRecord {
  id: string;
  template_key: string;
  name: string;
  category: string;
  description: string;
  default_client_visible: boolean;
  active: boolean;
}

// Initial In-Memory Database Seed
class VectorOpsStore {
  clients: ClientRecord[] = [
    {
      id: "cli-acme-dental",
      company_name: "Apex Dental Care",
      contact_name: "Dr. Sarah Jenkins",
      email: "sarah@apexdental.com",
      phone: "+1 (555) 234-5678",
      status: "active",
      notes: "Primary clinic with 4 practitioner chairs. High volume weekend calls.",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-09-12T14:30:00Z",
    },
    {
      id: "cli-elite-fitness",
      company_name: "Elite Fitness Center",
      contact_name: "Mark Reynolds",
      email: "mark@elitefitness.com",
      phone: "+1 (555) 987-6543",
      status: "active",
      notes: "Crossfit & strength gym. Seeking automated membership trial bookings.",
      created_at: "2026-08-15T09:30:00Z",
      updated_at: "2026-09-10T11:20:00Z",
    },
    {
      id: "cli-apex-realty",
      company_name: "Apex Real Estate",
      contact_name: "David Vance",
      email: "david@apexrealty.com",
      phone: "+1 (555) 456-7890",
      status: "pending",
      notes: "Commercial & residential agency. Integrating property inquiry routing.",
      created_at: "2026-09-05T16:00:00Z",
      updated_at: "2026-09-05T16:00:00Z",
    },
  ];

  portalConfigs: Record<string, ClientPortalConfig> = {
    "cli-acme-dental": {
      client_id: "cli-acme-dental",
      slug: "apex-dental",
      portal_title: "Apex Dental Patient Concierge",
      logo_url: null,
      primary_color: "#346bf2",
      accent_color: "#2aa876",
      enabled_modules: ["overview", "automations", "results", "billing", "support"],
      dashboard_config: { industry: "dental", kpi_focus: "patients" },
      kpi_config: { primary: "New Patients", secondary: "Reviews Generated" },
      terminology: { leads: "New Patient Inquiries", conversions: "Treatments Booked" },
      client_settings_schema: { business_hours: "8am - 6pm Mon-Fri" },
    },
    "cli-elite-fitness": {
      client_id: "cli-elite-fitness",
      slug: "elite-fitness",
      portal_title: "Elite Fitness Member Operations",
      logo_url: null,
      primary_color: "#2aa876",
      accent_color: "#e3993d",
      enabled_modules: ["overview", "automations", "results", "billing", "support"],
      dashboard_config: { industry: "fitness", kpi_focus: "memberships" },
      kpi_config: { primary: "Trial Bookings", secondary: "Missed Calls Recovered" },
      terminology: { leads: "Trial Inquiries", conversions: "Memberships Sold" },
      client_settings_schema: { business_hours: "6am - 10pm Daily" },
    },
    "cli-apex-realty": {
      client_id: "cli-apex-realty",
      slug: "apex-realty",
      portal_title: "Apex Realty Inbound Operations",
      logo_url: null,
      primary_color: "#8b68df",
      accent_color: "#346bf2",
      enabled_modules: ["overview", "automations", "results", "billing", "support"],
      dashboard_config: { industry: "real_estate", kpi_focus: "property_leads" },
      kpi_config: { primary: "Property Inquiries", secondary: "Site Tours Booked" },
      terminology: { leads: "Buyer Inquiries", conversions: "Tours Scheduled" },
      client_settings_schema: { business_hours: "9am - 7pm Mon-Sat" },
    },
    "cli-apex-dental": {
      client_id: "cli-acme-dental",
      slug: "apex-dental",
      portal_title: "Apex Dental Patient Concierge",
      logo_url: null,
      primary_color: "#346bf2",
      accent_color: "#2aa876",
      enabled_modules: ["overview", "automations", "results", "billing", "support"],
      dashboard_config: { industry: "dental", kpi_focus: "patients" },
      kpi_config: { primary: "New Patients", secondary: "Reviews Generated" },
      terminology: { leads: "New Patient Inquiries", conversions: "Treatments Booked" },
      client_settings_schema: { business_hours: "8am - 6pm Mon-Fri" },
    },
  };

  // Auth Identity System (representing Supabase Auth & public.profiles)
  authUsers: Map<string, AuthUserRecord> = new Map([
    [
      "admin@vectorops.ai",
      {
        id: "usr-admin-01",
        email: "admin@vectorops.ai",
        password: process.env.ADMIN_AUTH_PASSWORD || "admin2026",
        role: "admin",
        client_id: null,
        full_name: "VectorOps Admin",
      },
    ],
    [
      "vectorops2@gmail.com",
      {
        id: "usr-admin-02",
        email: "vectorops2@gmail.com",
        password: process.env.ADMIN_AUTH_PASSWORD || "admin2026",
        role: "admin",
        client_id: null,
        full_name: "VectorOps Admin",
      },
    ],
    [
      "sarah@apexdental.com",
      {
        id: "usr-sarah-dental",
        email: "sarah@apexdental.com",
        password: process.env.CLIENT_AUTH_PASSWORD || "client2026!",
        role: "client",
        client_id: "cli-acme-dental",
        full_name: "Dr. Sarah Jenkins",
      },
    ],
    [
      "sarah@acmedental.com",
      {
        id: "usr-sarah-dental",
        email: "sarah@acmedental.com",
        password: process.env.CLIENT_AUTH_PASSWORD || "client2026!",
        role: "client",
        client_id: "cli-acme-dental",
        full_name: "Dr. Sarah Jenkins",
      },
    ],
    [
      "mark@elitefitness.com",
      {
        id: "usr-marcus-fitness",
        email: "mark@elitefitness.com",
        password: process.env.CLIENT_AUTH_PASSWORD || "client2026!",
        role: "client",
        client_id: "cli-elite-fitness",
        full_name: "Mark Reynolds",
      },
    ],
    [
      "marcus@elitefitness.com",
      {
        id: "usr-marcus-fitness",
        email: "marcus@elitefitness.com",
        password: process.env.CLIENT_AUTH_PASSWORD || "client2026!",
        role: "client",
        client_id: "cli-elite-fitness",
        full_name: "Marcus Vance",
      },
    ],
    [
      "david@apexrealty.com",
      {
        id: "usr-david-realty",
        email: "david@apexrealty.com",
        password: process.env.CLIENT_AUTH_PASSWORD || "client2026!",
        role: "client",
        client_id: "cli-apex-realty",
        full_name: "David Sterling",
      },
    ],
  ]);

  profiles: ProfileRecord[] = [
    {
      user_id: "usr-admin-01",
      role: "admin",
      client_id: null,
      full_name: "VectorOps Admin",
      phone: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    },
    {
      user_id: "usr-admin-02",
      role: "admin",
      client_id: null,
      full_name: "VectorOps Admin",
      phone: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    },
    {
      user_id: "usr-sarah-dental",
      role: "client",
      client_id: "cli-acme-dental",
      full_name: "Dr. Sarah Jenkins",
      phone: "+1 (555) 234-5678",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-09-12T14:30:00Z",
    },
    {
      user_id: "usr-marcus-fitness",
      role: "client",
      client_id: "cli-elite-fitness",
      full_name: "Marcus Vance",
      phone: "+1 (555) 345-6789",
      created_at: "2026-08-15T09:00:00Z",
      updated_at: "2026-09-10T11:00:00Z",
    },
    {
      user_id: "usr-david-realty",
      role: "client",
      client_id: "cli-apex-realty",
      full_name: "David Sterling",
      phone: "+1 (555) 456-7890",
      created_at: "2026-09-05T16:00:00Z",
      updated_at: "2026-09-05T16:00:00Z",
    },
  ];

  automationTemplates: AutomationTemplateRecord[] = [
    {
      id: "tpl-1",
      template_key: "ai-lead-recovery",
      name: "AI Lead Recovery Engine",
      category: "Inbound Conversion",
      description: "Recovers abandoned inquiries and missed form fills within 90 seconds using conversational AI.",
      default_client_visible: true,
      active: true,
    },
    {
      id: "tpl-2",
      template_key: "review-request-automation",
      name: "Smart Review Request Engine",
      category: "Reputation Management",
      description: "Automated post-appointment review outreach with 5-star Google Review filtering.",
      default_client_visible: true,
      active: true,
    },
    {
      id: "tpl-3",
      template_key: "missed-call-recovery",
      name: "Missed Call AI Voice Responder",
      category: "Lead Capture",
      description: "Instantly sends SMS concierge when calls are missed, routing caller to instant online scheduling.",
      default_client_visible: true,
      active: true,
    },
    {
      id: "tpl-4",
      template_key: "appointment-reminder",
      name: "Two-Way Appointment Reminder Concierge",
      category: "Retention & Shows",
      description: "Reduces no-shows with automated WhatsApp/SMS confirmations, rescheduling, and calendar sync.",
      default_client_visible: true,
      active: true,
    },
    {
      id: "tpl-5",
      template_key: "follow-up-engine",
      name: "14-Day Multi-Channel Follow-up Engine",
      category: "Nurture",
      description: "Continuous automated follow-up sequence across SMS and email until appointment is confirmed.",
      default_client_visible: true,
      active: true,
    },
  ];

  workflows: WorkflowRecord[] = [
    {
      id: "wf-acme-1",
      client_id: "cli-acme-dental",
      n8n_instance_id: "inst-shared-01",
      n8n_workflow_id: "n8n-wf-9102",
      workflow_name: "Acme Dental - AI Patient Recovery",
      business_name: "Patient Lead Recovery",
      business_job: "Captures and engages new dental patient inquiries within 2 minutes.",
      description: "Webhook trigger from dental web form -> OpenAI categorization -> Twilio SMS outreach.",
      status: "active",
      client_visible: true,
      desired_state: "running",
      actual_state: "running",
      sync_status: "synchronized",
      last_execution_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      last_success_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      last_failure_at: null,
      last_error: null,
      created_at: "2026-08-02T11:00:00Z",
      updated_at: "2026-09-14T08:00:00Z",
    },
    {
      id: "wf-acme-2",
      client_id: "cli-acme-dental",
      n8n_instance_id: "inst-shared-01",
      n8n_workflow_id: "n8n-wf-9103",
      workflow_name: "Acme Dental - Google Review Engine",
      business_name: "Post-Treatment Review Automation",
      business_job: "Requests reviews from completed dental patients 3 hours post-treatment.",
      description: "PMS sync trigger -> Sentiment validation -> Google Place review dispatch.",
      status: "active",
      client_visible: true,
      desired_state: "running",
      actual_state: "running",
      sync_status: "synchronized",
      last_execution_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      last_success_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      last_failure_at: null,
      last_error: null,
      created_at: "2026-08-05T14:00:00Z",
      updated_at: "2026-09-12T10:00:00Z",
    },
    {
      id: "wf-elite-1",
      client_id: "cli-elite-fitness",
      n8n_instance_id: "inst-shared-01",
      n8n_workflow_id: "n8n-wf-9201",
      workflow_name: "Elite Fitness - Missed Call Recovery",
      business_name: "After-Hours Caller Booking",
      business_job: "Texts back missed calls with an instant VIP pass booking link.",
      description: "Twilio voice webhook -> Call status check -> Instant SMS delivery.",
      status: "active",
      client_visible: true,
      desired_state: "running",
      actual_state: "running",
      sync_status: "synchronized",
      last_execution_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      last_success_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      last_failure_at: null,
      last_error: null,
      created_at: "2026-08-16T10:00:00Z",
      updated_at: "2026-09-13T12:00:00Z",
    },
  ];

  discoveredWorkflows: DiscoveredWorkflowRecord[] = [
    {
      id: "disc-101",
      n8n_instance_id: "inst-shared-01",
      n8n_workflow_id: "wf-ext-441",
      workflow_name: "Stripe Payment Success Webhook (Acme Dental)",
      status: "unmapped",
      discovered_at: "2026-09-14T18:30:00Z",
    },
    {
      id: "disc-102",
      n8n_instance_id: "inst-shared-02",
      n8n_workflow_id: "wf-ext-512",
      workflow_name: "Instagram DM Lead Ingestion",
      status: "unmapped",
      discovered_at: "2026-09-15T01:10:00Z",
    },
  ];

  subscriptions: SubscriptionRecord[] = [
    {
      id: "sub-acme-1",
      client_id: "cli-acme-dental",
      service_name: "Growth Automation Retainer (Dental AI)",
      monthly_amount: 499,
      currency: "USD",
      billing_day: 1,
      auto_renew: true,
      status: "active",
      start_date: "2026-08-01",
      current_period_start: "2026-09-01",
      current_period_end: "2026-10-01",
      created_at: "2026-08-01T10:00:00Z",
    },
    {
      id: "sub-elite-1",
      client_id: "cli-elite-fitness",
      service_name: "Performance Automation Tier (Gyms)",
      monthly_amount: 799,
      currency: "USD",
      billing_day: 15,
      auto_renew: true,
      status: "active",
      start_date: "2026-08-15",
      current_period_start: "2026-08-15",
      current_period_end: "2026-09-15",
      created_at: "2026-08-15T09:30:00Z",
    },
  ];

  // Specific Locked Test Case from Architecture Section 51:
  // Invoice = $499, Payment = $250, Remaining = $249, Status = partially_paid
  invoices: InvoiceRecord[] = [
    {
      id: "inv-2026-001",
      client_id: "cli-acme-dental",
      subscription_id: "sub-acme-1",
      invoice_number: "INV-2026-001",
      invoice_type: "recurring",
      issue_date: "2026-09-01",
      due_date: "2026-09-20",
      period_start: "2026-09-01",
      period_end: "2026-10-01",
      total_amount: 499,
      amount_paid: 250, // Partial payment already applied!
      status: "partially_paid",
      description: "September Retainer — AI Lead Recovery & Review Automation",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-05T14:00:00Z",
    },
    {
      id: "inv-2026-002",
      client_id: "cli-elite-fitness",
      subscription_id: "sub-elite-1",
      invoice_number: "INV-2026-002",
      invoice_type: "recurring",
      issue_date: "2026-08-15",
      due_date: "2026-08-25",
      period_start: "2026-08-15",
      period_end: "2026-09-15",
      total_amount: 799,
      amount_paid: 799,
      status: "paid",
      description: "August Retainer — High Volume Caller Automation",
      created_at: "2026-08-15T00:00:00Z",
      updated_at: "2026-08-16T12:00:00Z",
    },
    {
      id: "inv-2026-003",
      client_id: "cli-apex-realty",
      subscription_id: null,
      invoice_number: "INV-2026-003",
      invoice_type: "setup",
      issue_date: "2026-09-06",
      due_date: "2026-09-18",
      period_start: null,
      period_end: null,
      total_amount: 350,
      amount_paid: 0,
      status: "open",
      description: "Initial Architecture & Workflow Onboarding Fee",
      created_at: "2026-09-06T10:00:00Z",
      updated_at: "2026-09-06T10:00:00Z",
    },
  ];

  payments: PaymentRecord[] = [
    {
      id: "pay-101",
      client_id: "cli-acme-dental",
      invoice_id: "inv-2026-001",
      amount: 250,
      payment_date: "2026-09-05",
      method: "Credit Card (Stripe)",
      reference: "ch_3Pz98K2eZvKYlo2C",
      status: "reconciled",
      notes: "First installment ($250 of $499) processed upon mutual agreement.",
      created_at: "2026-09-05T14:00:00Z",
    },
    {
      id: "pay-102",
      client_id: "cli-elite-fitness",
      invoice_id: "inv-2026-002",
      amount: 799,
      payment_date: "2026-08-16",
      method: "Bank Transfer (ACH)",
      reference: "ACH-4910283",
      status: "reconciled",
      notes: "Full payment received for August service.",
      created_at: "2026-08-16T12:00:00Z",
    },
  ];

  billingAdjustments: BillingAdjustmentRecord[] = [
    {
      id: "adj-01",
      client_id: "cli-acme-dental",
      subscription_id: "sub-acme-1",
      invoice_id: null,
      adjustment_type: "free_days",
      amount_delta: 0,
      days_delta: 7,
      description: "7 courtesy free days added to offset PMS API maintenance window.",
      applied: true,
      created_at: "2026-08-20T10:00:00Z",
    },
    {
      id: "adj-02",
      client_id: "cli-elite-fitness",
      subscription_id: "sub-elite-1",
      invoice_id: null,
      adjustment_type: "goodwill_extension",
      amount_delta: 0,
      days_delta: 3,
      description: "Goodwill extension during holiday schedule update.",
      applied: true,
      created_at: "2026-09-01T15:30:00Z",
    },
  ];

  n8nInstances: N8nInstanceRecord[] = [
    {
      id: "inst-shared-01",
      instance_name: "Shared Production Cluster 01",
      base_url: "https://n8n-shared-01.vectorops.internal",
      hosting_type: "shared",
      status: "active",
      server_id: "srv-fra-01",
      n8n_api_secret_ref: "vault:secret:n8n-cluster-01",
      last_verified_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      last_sync_status: "success",
      connected_clients: 2,
      workflow_count: 3,
      created_at: "2026-07-01T00:00:00Z",
    },
    {
      id: "inst-shared-02",
      instance_name: "Shared Production Cluster 02",
      base_url: "https://n8n-shared-02.vectorops.internal",
      hosting_type: "shared",
      status: "active",
      server_id: "srv-nyc-01",
      n8n_api_secret_ref: "vault:secret:n8n-cluster-02",
      last_verified_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      last_sync_status: "success",
      connected_clients: 0,
      workflow_count: 0,
      created_at: "2026-08-10T00:00:00Z",
    },
    {
      id: "inst-dedicated-acme",
      instance_name: "Dedicated Enterprise Instance (Acme)",
      base_url: "https://acme-n8n.vectorops.internal",
      hosting_type: "dedicated",
      status: "active",
      server_id: "srv-lon-03",
      n8n_api_secret_ref: "vault:secret:n8n-acme-dedicated",
      last_verified_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      last_sync_status: "success",
      connected_clients: 1,
      workflow_count: 1,
      created_at: "2026-08-25T00:00:00Z",
    },
  ];

  providerBalances: ProviderBalanceRecord[] = [
    {
      id: "pb-1",
      provider: "OpenAI API",
      account: "vectorops-org-prod",
      balance: 142.5,
      threshold: 50.0,
      usage: "$34.20 / mo",
      status: "healthy",
    },
    {
      id: "pb-2",
      provider: "Anthropic API",
      account: "vectorops-claude-prod",
      balance: 98.1,
      threshold: 30.0,
      usage: "$18.50 / mo",
      status: "healthy",
    },
    {
      id: "pb-3",
      provider: "Twilio Voice & SMS",
      account: "AC93b...vectorops",
      balance: 18.4,
      threshold: 25.0,
      usage: "$41.00 / mo",
      status: "warning", // Below threshold! Feeds Attention Engine
    },
    {
      id: "pb-4",
      provider: "Resend Email",
      account: "production-inbound",
      balance: 0,
      threshold: 0,
      usage: "4,210 / 50,000 sent",
      status: "healthy",
    },
  ];

  credentials: CredentialMetadataRecord[] = [
    {
      id: "cred-1",
      provider: "OpenAI Platform",
      label: "Production Org API Key",
      status: "valid",
      expiry: "2027-01-01",
      vault_secret_ref: "vault:secret:openai-prod-key",
    },
    {
      id: "cred-2",
      provider: "Google Workspace",
      label: "Calendar Service Account",
      status: "valid",
      expiry: "2027-06-15",
      vault_secret_ref: "vault:secret:gsuite-sa-token",
    },
    {
      id: "cred-3",
      provider: "Twilio",
      label: "Agency Primary Trunk",
      status: "valid",
      expiry: "2026-12-31",
      vault_secret_ref: "vault:secret:twilio-trunk-auth",
    },
    {
      id: "cred-4",
      provider: "Meta Graph API",
      label: "Instagram & WhatsApp Business API",
      status: "expiring_soon",
      expiry: "2026-09-28", // Expiring soon! Feeds Attention Engine
      vault_secret_ref: "vault:secret:meta-graph-token",
    },
  ];

  tasks: TaskRecord[] = [
    {
      id: "tsk-1",
      client_id: "cli-acme-dental",
      title: "Verify holiday weekend auto-responder routing",
      description: "Ensure appointment scheduler updates practitioner availability for upcoming holiday.",
      status: "in_progress",
      priority: "high",
      due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      completed_at: null,
      created_at: "2026-09-14T09:00:00Z",
    },
    {
      id: "tsk-2",
      client_id: "cli-elite-fitness",
      title: "Generate monthly automation ROI report",
      description: "Compile trial conversions and recovered callers into executive review PDF.",
      status: "todo",
      priority: "medium",
      due_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      completed_at: null,
      created_at: "2026-09-14T11:30:00Z",
    },
    {
      id: "tsk-3",
      client_id: "cli-apex-realty",
      title: "Deploy 14-day lead follow-up template",
      description: "Connect incoming CRM webhook to Apex realty n8n instance.",
      status: "todo",
      priority: "urgent",
      due_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      completed_at: null,
      created_at: "2026-09-14T16:00:00Z",
    },
  ];

  supportTickets: SupportTicketRecord[] = [
    {
      id: "tkt-1",
      client_id: "cli-acme-dental",
      ticket_number: "TIK-1001",
      subject: "Request to modify SMS follow-up delay from 2min to 5min",
      description: "Our front desk would like a slightly longer buffer before the automated text fires so they can answer live if available.",
      status: "open",
      priority: "medium",
      category: "Automation Settings",
      internal_notes: "Checked n8n workflow 'Acme Dental - AI Patient Recovery'. Can update node wait timer easily without downtime.",
      created_at: "2026-09-14T14:10:00Z",
    },
    {
      id: "tkt-2",
      client_id: "cli-elite-fitness",
      ticket_number: "TIK-1002",
      subject: "Add personal trainer calendar sync for VIP trials",
      description: "We hired two new strength trainers and want their schedules integrated into the instant trial booking link.",
      status: "in_progress",
      priority: "high",
      category: "Calendar Integration",
      internal_notes: "Awaiting Google Calendar OAuth consent from client staff.",
      created_at: "2026-09-13T16:45:00Z",
    },
  ];

  calendarEvents: CalendarEventRecord[] = [
    {
      id: "cal-1",
      client_id: "cli-acme-dental",
      title: "Invoice #INV-2026-001 Balance Due ($249.00)",
      event_type: "invoice_due",
      starts_at: "2026-09-20T09:00:00Z",
      ends_at: "2026-09-20T10:00:00Z",
      location: "Stripe Billing Engine",
      notes: "Second installment of monthly retainer due.",
      created_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "cal-2",
      client_id: "cli-elite-fitness",
      title: "Subscription Renewal — Elite Fitness ($799.00)",
      event_type: "renewal",
      starts_at: "2026-09-15T00:00:00Z",
      ends_at: "2026-09-15T01:00:00Z",
      location: "Automated Renewal",
      notes: "Auto-renew active; invoice will issue automatically.",
      created_at: "2026-08-15T00:00:00Z",
    },
    {
      id: "cal-3",
      client_id: "cli-acme-dental",
      title: "Bi-Weekly Strategy & Automation Review",
      event_type: "meeting",
      starts_at: "2026-09-18T14:00:00Z",
      ends_at: "2026-09-18T14:45:00Z",
      location: "Google Meet",
      notes: "Review review generation rate and patient recovery volume.",
      created_at: "2026-09-10T10:00:00Z",
    },
  ];

  businessEvents: BusinessEventRecord[] = [
    {
      id: "be-1",
      client_id: "cli-acme-dental",
      event_type: "lead_captured",
      event_value: 1,
      currency: "USD",
      occurred_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: "be-2",
      client_id: "cli-acme-dental",
      event_type: "appointment_booked",
      event_value: 380, // High-value treatment booked
      currency: "USD",
      occurred_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    },
    {
      id: "be-3",
      client_id: "cli-acme-dental",
      event_type: "review_received",
      event_value: 5,
      currency: "STARS",
      occurred_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    },
    {
      id: "be-4",
      client_id: "cli-elite-fitness",
      event_type: "call_recovered",
      event_value: 1,
      currency: "USD",
      occurred_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ];

  auditLogs: AuditLogRecord[] = [
    {
      id: "aud-01",
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "system.initialized",
      table_name: "system",
      record_id: "vectorops-root",
      metadata: { version: "2026.1", plane: "three-plane" },
      created_at: "2026-08-01T00:00:00Z",
    },
    {
      id: "aud-02",
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "client.created",
      table_name: "clients",
      record_id: "cli-acme-dental",
      metadata: { slug: "acme-dental" },
      created_at: "2026-08-01T10:00:00Z",
    },
    {
      id: "aud-03",
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "payment.recorded",
      table_name: "payments",
      record_id: "pay-101",
      metadata: { invoice: "INV-2026-001", partial_amount: 250, remaining: 249 },
      created_at: "2026-09-05T14:00:00Z",
    },
  ];

  // Helper Methods

  recordPayment(input: {
    client_id: string;
    invoice_id: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    recorded_by_user_id?: string;
  }) {
    const invoice = this.invoices.find((inv) => inv.id === input.invoice_id);
    if (!invoice) throw new Error("Invoice not found.");

    const remaining = Number((invoice.total_amount - invoice.amount_paid).toFixed(2));
    const payAmount = Number(input.amount);

    if (isNaN(payAmount) || payAmount <= 0) {
      throw new Error("Payment amount must be a positive number.");
    }

    // Section 51 rule: Reject overpayment!
    if (payAmount > remaining) {
      throw new Error(`Payment of $${payAmount.toFixed(2)} exceeds remaining balance of $${remaining.toFixed(2)}.`);
    }

    const newAmountPaid = Number((invoice.amount_paid + payAmount).toFixed(2));
    invoice.amount_paid = newAmountPaid;
    invoice.status = newAmountPaid >= invoice.total_amount ? "paid" : "partially_paid";
    invoice.updated_at = new Date().toISOString();

    const payment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      client_id: input.client_id || invoice.client_id,
      invoice_id: invoice.id,
      amount: payAmount,
      payment_date: new Date().toISOString().split("T")[0],
      method: input.method || "Direct Payment",
      reference: input.reference || null,
      status: "reconciled",
      notes: input.notes || null,
      recorded_by_user_id: input.recorded_by_user_id,
      created_at: new Date().toISOString(),
    };
    this.payments.unshift(payment);

    // Audit log
    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor_user_id: input.recorded_by_user_id || "admin-master",
      actor_role: "admin",
      action: "payment.recorded",
      table_name: "payments",
      record_id: payment.id,
      metadata: {
        invoice_number: invoice.invoice_number,
        amount: payAmount,
        new_status: invoice.status,
        remaining: Number((invoice.total_amount - newAmountPaid).toFixed(2)),
      },
      created_at: new Date().toISOString(),
    });

    return { payment, invoice };
  }

  recordBillingAdjustment(input: {
    client_id: string;
    subscription_id?: string;
    invoice_id?: string;
    adjustment_type: BillingAdjustmentRecord["adjustment_type"];
    amount_delta?: number;
    days_delta?: number;
    description: string;
    applied?: boolean;
    created_by_user_id?: string;
  }) {
    const adj: BillingAdjustmentRecord = {
      id: `adj-${Date.now()}`,
      client_id: input.client_id,
      subscription_id: input.subscription_id || null,
      invoice_id: input.invoice_id || null,
      adjustment_type: input.adjustment_type,
      amount_delta: Number(input.amount_delta || 0),
      days_delta: Number(input.days_delta || 0),
      description: input.description,
      applied: input.applied !== false,
      created_at: new Date().toISOString(),
    };
    this.billingAdjustments.unshift(adj);

    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor_user_id: input.created_by_user_id || "admin-master",
      actor_role: "admin",
      action: "billing_adjustment.created",
      table_name: "billing_adjustments",
      record_id: adj.id,
      metadata: { type: adj.adjustment_type, description: adj.description },
      created_at: new Date().toISOString(),
    });

    return adj;
  }

  updateWorkflowState(workflowId: string, desired: "running" | "paused") {
    const wf = this.workflows.find((w) => w.id === workflowId);
    if (!wf) throw new Error("Workflow not found.");

    wf.desired_state = desired;
    wf.sync_status = "error";
    wf.last_error = "Live n8n control is unavailable in the local demonstration store.";
    wf.updated_at = new Date().toISOString();

    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "workflow.state_changed",
      table_name: "workflows",
      record_id: wf.id,
      metadata: { desired_state: desired },
      created_at: new Date().toISOString(),
    });

    return wf;
  }

  onboardClient(payload: {
    company_name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    notes?: string;
    slug: string;
    portal_title?: string;
    primary_color?: string;
    enabled_modules?: string[];
    service_name?: string;
    monthly_amount?: number;
    currency?: string;
    billing_day?: number;
    auto_renew?: boolean;
    infrastructure_type?: "shared" | "dedicated";
    n8n_instance_id?: string;
    selected_templates?: string[];
    client_password?: string;
  }) {
    const clientId = `cli-${Date.now()}`;
    const slug = payload.slug.trim().toLowerCase();

    // Verify slug uniqueness
    if (Object.values(this.portalConfigs).some((p) => p.slug === slug)) {
      throw new Error(`Portal slug '${slug}' is already in use.`);
    }

    const client: ClientRecord = {
      id: clientId,
      company_name: payload.company_name.trim(),
      contact_name: payload.contact_name?.trim() || null,
      email: payload.email?.trim() || null,
      phone: payload.phone?.trim() || null,
      status: "active",
      notes: payload.notes?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.clients.unshift(client);

    const portal: ClientPortalConfig = {
      client_id: clientId,
      slug,
      portal_title: payload.portal_title?.trim() || `${payload.company_name} Portal`,
      logo_url: null,
      primary_color: payload.primary_color || "#346bf2",
      accent_color: "#2aa876",
      enabled_modules: (payload.enabled_modules || ["overview", "automations", "results", "billing", "support"]).map((module) => module.toLowerCase()),
      dashboard_config: { custom_welcome: true },
      kpi_config: { primary: "Leads Recovered", secondary: "Revenue Influenced" },
      terminology: { leads: "Leads", conversions: "Conversions" },
      client_settings_schema: {},
    };
    this.portalConfigs[clientId] = portal;

    if (payload.client_password && payload.email) {
      const cleanEmail = payload.email.trim().toLowerCase();
      const authUserId = `usr-${Date.now()}`;
      // Auth service identity provisioning (password is NEVER stored in application tables)
      this.authUsers.set(cleanEmail, {
        id: authUserId,
        email: cleanEmail,
        password: payload.client_password,
        role: "client",
        client_id: clientId,
        full_name: payload.contact_name?.trim() || payload.company_name.trim(),
      });
      this.profiles.push({
        user_id: authUserId,
        role: "client",
        client_id: clientId,
        full_name: payload.contact_name?.trim() || payload.company_name.trim(),
        phone: payload.phone?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Provision subscription if commercial details provided
    if (payload.monthly_amount && Number(payload.monthly_amount) > 0) {
      const sub: SubscriptionRecord = {
        id: `sub-${Date.now()}`,
        client_id: clientId,
        service_name: payload.service_name || "Agency Automation Retainer",
        monthly_amount: Number(payload.monthly_amount),
        currency: payload.currency || "USD",
        billing_day: Number(payload.billing_day || 1),
        auto_renew: payload.auto_renew !== false,
        status: "active",
        start_date: new Date().toISOString().split("T")[0],
        current_period_start: new Date().toISOString().split("T")[0],
        current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split("T")[0],
        created_at: new Date().toISOString(),
      };
      this.subscriptions.unshift(sub);

      // Create initial invoice
      const inv: InvoiceRecord = {
        id: `inv-${Date.now()}`,
        client_id: clientId,
        subscription_id: sub.id,
        invoice_number: `INV-${new Date().getFullYear()}-${String(this.invoices.length + 1).padStart(3, "0")}`,
        invoice_type: "recurring",
        issue_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split("T")[0],
        period_start: sub.current_period_start,
        period_end: sub.current_period_end,
        total_amount: sub.monthly_amount,
        amount_paid: 0,
        status: "open",
        description: `First Billing Cycle — ${sub.service_name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.invoices.unshift(inv);
    }

    // Deploy selected templates
    const instanceId = payload.n8n_instance_id || "inst-shared-01";
    if (payload.selected_templates && payload.selected_templates.length > 0) {
      for (const tplKey of payload.selected_templates) {
        const tpl = this.automationTemplates.find((t) => t.template_key === tplKey);
        if (tpl) {
          const wf: WorkflowRecord = {
            id: `wf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            client_id: clientId,
            n8n_instance_id: instanceId,
            n8n_workflow_id: `n8n-wf-${Math.floor(1000 + Math.random() * 9000)}`,
            workflow_name: `${payload.company_name} - ${tpl.name}`,
            business_name: tpl.name,
            business_job: tpl.description,
            description: `Deployed from template: ${tpl.template_key}`,
            status: "active",
            client_visible: true,
            desired_state: "running",
            actual_state: "running",
            sync_status: "synchronized",
            last_execution_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            last_failure_at: null,
            last_error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          this.workflows.unshift(wf);
        }
      }
    }

    // Audit log
    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "client.onboarded",
      table_name: "clients",
      record_id: clientId,
      metadata: { slug, company: payload.company_name },
      created_at: new Date().toISOString(),
    });

    return { client, portal };
  }

  safeChurnClient(clientId: string) {
    const client = this.clients.find((c) => c.id === clientId);
    if (!client) throw new Error("Client not found.");

    client.status = "churned";
    client.updated_at = new Date().toISOString();

    // Disconnect active automations
    this.workflows
      .filter((w) => w.client_id === clientId)
      .forEach((w) => {
        w.desired_state = "paused";
        w.actual_state = "paused";
        w.sync_status = "synchronized";
        w.status = "inactive";
      });

    // Cancel active auto-renewal on subscriptions
    this.subscriptions
      .filter((s) => s.client_id === clientId)
      .forEach((s) => {
        s.auto_renew = false;
        s.status = "cancelled";
      });

    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "client.churned",
      table_name: "clients",
      record_id: clientId,
      metadata: { company_name: client.company_name, safe_churn: true, data_preserved: true },
      created_at: new Date().toISOString(),
    });

    return client;
  }

  reactivateClient(clientId: string) {
    const client = this.clients.find((c) => c.id === clientId);
    if (!client) throw new Error("Client not found.");

    client.status = "active";
    client.updated_at = new Date().toISOString();

    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "client.reactivated",
      table_name: "clients",
      record_id: clientId,
      metadata: { company_name: client.company_name },
      created_at: new Date().toISOString(),
    });

    return client;
  }

  mapDiscoveredWorkflow(input: {
    discovered_id: string;
    client_id: string;
    business_name: string;
    business_job: string;
  }) {
    const disc = this.discoveredWorkflows.find((d) => d.id === input.discovered_id);
    if (!disc) throw new Error("Discovered workflow not found.");

    const client = this.clients.find((c) => c.id === input.client_id);
    if (!client) throw new Error("Client not found.");

    disc.status = "mapped";

    const wf: WorkflowRecord = {
      id: `wf-${Date.now()}`,
      client_id: input.client_id,
      n8n_instance_id: disc.n8n_instance_id,
      n8n_workflow_id: disc.n8n_workflow_id,
      workflow_name: disc.workflow_name,
      business_name: input.business_name || disc.workflow_name,
      business_job: input.business_job || "Custom assigned business automation",
      description: "Mapped explicitly from n8n discovery",
      status: "active",
      client_visible: true,
      desired_state: "running",
      actual_state: "running",
      sync_status: "synchronized",
      last_execution_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_failure_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workflows.unshift(wf);

    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actor_user_id: "admin-master",
      actor_role: "admin",
      action: "workflow.mapped",
      table_name: "workflows",
      record_id: wf.id,
      metadata: { discovered_id: disc.id, client_name: client.company_name },
      created_at: new Date().toISOString(),
    });

    return wf;
  }

  getAttentionItems() {
    const items: Array<{
      id: string;
      what: string;
      why: string;
      severity: "urgent" | "high" | "medium" | "low";
      client_id: string | null;
      client_name: string | null;
      module: string;
      action_label: string;
    }> = [];

    // 1. Partial/overdue payments
    const overdueOrPartial = this.invoices.filter((i) => i.status === "partially_paid" || i.status === "overdue" || i.status === "open");
    for (const inv of overdueOrPartial) {
      const client = this.clients.find((c) => c.id === inv.client_id);
      const remaining = inv.total_amount - inv.amount_paid;
      if (inv.status === "partially_paid") {
        items.push({
          id: `att-inv-${inv.id}`,
          what: `Partial balance outstanding for ${client?.company_name || "Client"}`,
          why: `Invoice ${inv.invoice_number} has $${remaining.toFixed(2)} remaining of $${inv.total_amount.toFixed(2)}. Due ${inv.due_date}.`,
          severity: "medium",
          client_id: inv.client_id,
          client_name: client?.company_name || null,
          module: "Money",
          action_label: "Review in Money",
        });
      }
    }

    // 2. Approaching renewals
    const approachingRenewals = this.subscriptions.filter((s) => s.status === "active" && s.auto_renew);
    for (const sub of approachingRenewals) {
      const client = this.clients.find((c) => c.id === sub.client_id);
      items.push({
        id: `att-sub-${sub.id}`,
        what: `Subscription renewal approaching for ${client?.company_name || "Client"}`,
        why: `Scheduled for auto-renewal on day ${sub.billing_day} ($${sub.monthly_amount}/mo).`,
        severity: "low",
        client_id: sub.client_id,
        client_name: client?.company_name || null,
        module: "Money",
        action_label: "View Subscription",
      });
    }

    // 3. Provider balances low
    const lowBalances = this.providerBalances.filter((b) => b.balance < b.threshold && b.status === "warning");
    for (const bal of lowBalances) {
      items.push({
        id: `att-bal-${bal.id}`,
        what: `${bal.provider} balance below safety threshold`,
        why: `Current balance is $${bal.balance.toFixed(2)}, below the $${bal.threshold.toFixed(2)} operational minimum.`,
        severity: "high",
        client_id: null,
        client_name: "Agency Infrastructure",
        module: "Infrastructure",
        action_label: "Top Up Provider",
      });
    }

    // 4. Expiring credentials
    const expiringCreds = this.credentials.filter((c) => c.status === "expiring_soon");
    for (const cred of expiringCreds) {
      items.push({
        id: `att-cred-${cred.id}`,
        what: `${cred.provider} credential expires soon`,
        why: `Token (${cred.label}) expires on ${cred.expiry}. Rotate before automations stall.`,
        severity: "high",
        client_id: null,
        client_name: "Agency Infrastructure",
        module: "Infrastructure",
        action_label: "Rotate Credential",
      });
    }

    // 5. Open support tickets
    const openTickets = this.supportTickets.filter((t) => t.status === "open" || t.status === "in_progress");
    for (const tkt of openTickets) {
      const client = this.clients.find((c) => c.id === tkt.client_id);
      items.push({
        id: `att-tkt-${tkt.id}`,
        what: `Support ticket waiting: ${tkt.ticket_number}`,
        why: `${tkt.subject} (${tkt.priority} priority) submitted by ${client?.company_name || "Client"}.`,
        severity: tkt.priority === "urgent" || tkt.priority === "high" ? "high" : "medium",
        client_id: tkt.client_id,
        client_name: client?.company_name || null,
        module: "Support",
        action_label: "Respond to Ticket",
      });
    }

    return items;
  }

  getOverviewData() {
    const activeClients = this.clients.filter((c) => c.status === "active").length;
    const mrr = this.subscriptions
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + Number(s.monthly_amount || 0), 0);

    const collectedRevenue = this.payments
      .filter((p) => p.status === "reconciled")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const outstandingRevenue = this.invoices
      .filter((i) => i.status !== "paid" && i.status !== "void")
      .reduce((sum, i) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.amount_paid || 0)), 0);

    const overdueRevenue = this.invoices
      .filter((i) => i.status === "overdue")
      .reduce((sum, i) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.amount_paid || 0)), 0);

    const upcomingRenewals = this.subscriptions.filter((s) => s.status === "active").length;
    const openTickets = this.supportTickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
    const workflowFailures = this.workflows.filter((w) => w.actual_state === "error" || w.status === "error").length;
    const infrastructureIssues = this.n8nInstances.filter((i) => i.status === "degraded" || i.status === "offline").length;

    return {
      kpis: {
        activeClients,
        mrr,
        collectedRevenue,
        outstandingRevenue,
        overdueRevenue,
        upcomingRenewals,
        openTickets,
        workflowFailures,
        infrastructureIssues,
      },
      attentionItems: this.getAttentionItems(),
      clients: this.clients,
      workflows: this.workflows,
      invoices: this.invoices,
      n8nInstances: this.n8nInstances,
      providerBalances: this.providerBalances,
      credentials: this.credentials,
      tasks: this.tasks,
      supportTickets: this.supportTickets,
      calendarEvents: this.calendarEvents,
      activityFeed: this.businessEvents,
      auditLogs: this.auditLogs,
    };
  }
}

export const store = new VectorOpsStore();
