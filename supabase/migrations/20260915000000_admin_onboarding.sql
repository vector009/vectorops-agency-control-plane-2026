-- Additive functions for the existing VectorOps baseline schema.
-- On an existing project, do not rerun the baseline; apply only this migration.

create or replace function public.admin_onboard_client(
  p_payload jsonb,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
  v_portal public.client_portal_config;
  v_subscription public.subscriptions;
  v_invoice public.invoices;
  v_slug text := lower(trim(p_payload->>'slug'));
  v_amount numeric(14,2) := coalesce((p_payload->>'monthly_amount')::numeric, 0);
  v_billing_day smallint := coalesce((p_payload->>'billing_day')::smallint, 1);
  v_instance_id uuid := nullif(p_payload->>'n8n_instance_id', '')::uuid;
  v_modules text[];
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required';
  end if;

  if coalesce(length(trim(p_payload->>'company_name')), 0) = 0 then
    raise exception 'Company name is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'Client auth user is required';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'Portal slug must be 3-64 lowercase letters, numbers, or hyphens';
  end if;
  if v_amount < 0 then
    raise exception 'Monthly amount cannot be negative';
  end if;
  if v_billing_day not between 1 and 28 then
    raise exception 'Billing day must be between 1 and 28';
  end if;

  if jsonb_typeof(p_payload->'enabled_modules') = 'array' then
    select array_agg(lower(value)) into v_modules
    from jsonb_array_elements_text(p_payload->'enabled_modules');
  end if;
  v_modules := coalesce(v_modules, array['overview', 'automations', 'results', 'billing', 'support', 'profile']);

  insert into public.clients (
    company_name, contact_name, email, phone, notes, status, created_by_user_id
  ) values (
    trim(p_payload->>'company_name'),
    nullif(trim(p_payload->>'contact_name'), ''),
    nullif(lower(trim(p_payload->>'email')), ''),
    nullif(trim(p_payload->>'phone'), ''),
    nullif(trim(p_payload->>'notes'), ''),
    'pending'::public.client_status,
    auth.uid()
  ) returning * into v_client;

  insert into public.client_portal_config (
    client_id, slug, portal_title, logo_url, favicon_url, primary_color, accent_color,
    enabled_modules, dashboard_config, kpi_config, terminology, client_settings_schema
  ) values (
    v_client.id,
    v_slug,
    coalesce(nullif(trim(p_payload->>'portal_title'), ''), v_client.company_name || ' Portal'),
    nullif(trim(p_payload->>'logo_url'), ''),
    nullif(trim(p_payload->>'favicon_url'), ''),
    coalesce(nullif(p_payload->>'primary_color', ''), '#346bf2'),
    coalesce(nullif(p_payload->>'accent_color', ''), '#2aa876'),
    v_modules,
    coalesce(p_payload->'dashboard_config', '{}'::jsonb)
      || jsonb_build_object('selected_templates', coalesce(p_payload->'selected_templates', '[]'::jsonb)),
    coalesce(p_payload->'kpi_config', '[]'::jsonb),
    coalesce(p_payload->'terminology', '{}'::jsonb),
    coalesce(p_payload->'client_settings_schema', '{}'::jsonb)
  ) returning * into v_portal;

  insert into public.profiles (user_id, role, client_id, full_name, phone)
  values (
    p_auth_user_id,
    'client'::public.app_role,
    v_client.id,
    coalesce(nullif(trim(p_payload->>'contact_name'), ''), v_client.company_name),
    nullif(trim(p_payload->>'phone'), '')
  );

  if v_amount > 0 then
    insert into public.subscriptions (
      client_id, service_name, monthly_amount, currency, billing_day, auto_renew,
      status, start_date, current_period_start, current_period_end
    ) values (
      v_client.id,
      coalesce(nullif(trim(p_payload->>'service_name'), ''), 'Agency Automation Retainer'),
      v_amount,
      upper(coalesce(nullif(trim(p_payload->>'currency'), ''), 'INR')),
      v_billing_day,
      coalesce((p_payload->>'auto_renew')::boolean, true),
      'pending'::public.subscription_status,
      current_date,
      current_date,
      (current_date + interval '1 month' - interval '1 day')::date
    ) returning * into v_subscription;

    v_invoice := public.create_initial_invoice(v_subscription.id);
  end if;

  if v_instance_id is not null then
    insert into public.client_connections (client_id, n8n_instance_id, status)
    values (v_client.id, v_instance_id, 'pending'::public.connection_status);
  end if;

  insert into public.client_onboarding (
    client_id, identity_complete, portal_complete, commercial_complete,
    infrastructure_complete, automations_complete, n8n_complete,
    account_complete, verification_complete, access_sent, notes
  ) values (
    v_client.id, true, true, v_subscription.id is not null,
    v_instance_id is not null, false, false,
    true, false, false,
    'Client created. Complete n8n deployment, telemetry verification, and access delivery before activation.'
  );

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'portal', to_jsonb(v_portal),
    'subscription', to_jsonb(v_subscription),
    'invoice', to_jsonb(v_invoice)
  );
end;
$$;

revoke all on function public.admin_onboard_client(jsonb, uuid) from public;
grant execute on function public.admin_onboard_client(jsonb, uuid) to authenticated;

-- Create the ticket and its first client-visible message in one transaction.
create or replace function public.create_client_ticket(
  p_subject text,
  p_message text,
  p_category text default null,
  p_priority public.ticket_priority default 'normal'
)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid := public.get_my_client_id();
  v_ticket public.support_tickets;
begin
  if not public.is_active_client(v_client_id) then
    raise exception 'Active client access required';
  end if;
  if coalesce(length(trim(p_subject)), 0) = 0 then
    raise exception 'Ticket subject cannot be empty';
  end if;
  if coalesce(length(trim(p_message)), 0) = 0 then
    raise exception 'Ticket message cannot be empty';
  end if;

  insert into public.support_tickets (
    client_id, subject, status, priority, category, created_by_user_id
  ) values (
    v_client_id, trim(p_subject), 'open'::public.ticket_status, p_priority,
    nullif(trim(p_category), ''), auth.uid()
  ) returning * into v_ticket;

  perform public.add_client_ticket_message(v_ticket.id, p_message);
  select ticket.* into v_ticket
  from public.support_tickets as ticket
  where ticket.id = v_ticket.id;
  return v_ticket;
end;
$$;

revoke all on function public.create_client_ticket(text, text, text, public.ticket_priority) from public;
grant execute on function public.create_client_ticket(text, text, text, public.ticket_priority) to authenticated;
