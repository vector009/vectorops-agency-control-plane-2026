export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: { id: string; company_name: string; contact_name: string | null; email: string | null; phone: string | null; status: "pending" | "active" | "paused" | "churned" | "archived"; notes: string | null; created_by_user_id: string | null; created_at: string; updated_at: string };
        Insert: Partial<Database["public"]["Tables"]["clients"]["Row"]> & { company_name: string };
        Update: Partial<Database["public"]["Tables"]["clients"]["Row"]>;
        Relationships: [];
      };
      automation_templates: {
        Row: { id: string; template_key: string; name: string; category: string | null; description: string | null; n8n_template_ref: string | null; default_client_visible: boolean; default_config: Json; active: boolean; created_at: string; updated_at: string };
        Insert: Partial<Database["public"]["Tables"]["automation_templates"]["Row"]> & { template_key: string; name: string };
        Update: Partial<Database["public"]["Tables"]["automation_templates"]["Row"]>;
        Relationships: [];
      };
      workflows: { Row: { id: string; client_id: string; connection_id: string; n8n_instance_id: string; n8n_workflow_id: string; template_id: string | null; workflow_name: string; business_name: string | null; business_job: string | null; description: string | null; status: string; client_visible: boolean; desired_state: string; actual_state: string; config: Json; last_execution_at: string | null; last_success_at: string | null; last_failure_at: string | null; last_error: string | null; created_at: string; updated_at: string }; Insert: never; Update: never; Relationships: [] };
      n8n_instances: { Row: { id: string; instance_name: string; base_url: string; hosting_type: "shared" | "dedicated"; status: "provisioning" | "active" | "maintenance" | "offline" | "retired"; server_id: string | null; n8n_api_secret_ref: string | null; last_verified_at: string | null; last_sync_at: string | null; last_sync_status: "idle" | "pending" | "syncing" | "success" | "error" | "stale"; last_sync_error: string | null; metadata: Json; created_at: string; updated_at: string }; Insert: never; Update: never; Relationships: [] };
      subscriptions: { Row: { id: string; client_id: string; service_name: string; monthly_amount: number; currency: string; billing_day: number; auto_renew: boolean; status: string; start_date: string | null; current_period_start: string | null; current_period_end: string | null; cancelled_at: string | null; metadata: Json; created_at: string; updated_at: string }; Insert: never; Update: never; Relationships: [] };
      invoices: { Row: { id: string; client_id: string; subscription_id: string; invoice_number: string; invoice_type: string; issue_date: string; due_date: string; period_start: string | null; period_end: string | null; total_amount: number; amount_paid: number; status: string; description: string | null; metadata: Json; created_at: string; updated_at: string }; Insert: never; Update: never; Relationships: [] };
      profiles: { Row: { user_id: string; role: "admin" | "client"; client_id: string | null; full_name: string | null; phone: string | null; created_at: string; updated_at: string }; Insert: never; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};
