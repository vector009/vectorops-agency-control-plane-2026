-- Securely resolves an n8n API key for the server-side control plane.
-- The decrypted value is available only to Supabase's service role and never
-- traverses a browser session.

create or replace function public.get_n8n_api_secret(p_instance_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  resolved_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select secrets.decrypted_secret
    into resolved_secret
    from public.n8n_instances as instances
    join vault.decrypted_secrets as secrets
      on secrets.id = instances.n8n_api_secret_ref
   where instances.id = p_instance_id;

  if resolved_secret is null or btrim(resolved_secret) = '' then
    raise exception 'n8n API secret is not configured';
  end if;

  return resolved_secret;
end;
$$;

revoke all on function public.get_n8n_api_secret(uuid) from public, anon, authenticated;
grant execute on function public.get_n8n_api_secret(uuid) to service_role;
