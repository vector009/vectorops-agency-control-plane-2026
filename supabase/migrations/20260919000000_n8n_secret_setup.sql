-- Secure n8n credential setup.
-- The API key is accepted only by the trusted Edge API and is never returned.
-- The function is intentionally service-role-only.

create or replace function public.set_n8n_api_secret(
  p_instance_id uuid,
  p_api_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_instance_id is null or p_api_secret is null or btrim(p_api_secret) = '' then
    raise exception 'instance and API secret are required' using errcode = '22023';
  end if;

  select vault.create_secret(
    btrim(p_api_secret),
    'vectorops-n8n-' || p_instance_id::text
  ) into secret_id;

  update public.n8n_instances
     set n8n_api_secret_ref = secret_id,
         status = 'provisioning',
         last_sync_status = 'pending'
   where id = p_instance_id;

  if not found then
    raise exception 'n8n instance not found' using errcode = 'P0002';
  end if;

  return secret_id;
end;
$$;

revoke all on function public.set_n8n_api_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.set_n8n_api_secret(uuid, text) to service_role;
