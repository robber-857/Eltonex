-- Run once in this project's SQL Editor, or apply with `supabase db push`.
begin;
create table public.eltonex_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.eltonex_enquiries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 100),
  email text not null check (length(email) between 3 and 254),
  services text[] not null default '{}',
  message text not null check (length(message) between 10 and 5000),
  timing text not null default '',
  status text not null default 'new' check (status in ('new','contacted','closed')),
  notes text not null default '' check (length(notes) <= 5000),
  notification text not null default 'pending' check (notification in ('pending','sending','sent','failed')),
  mail_lease uuid,
  mail_lease_until timestamptz,
  search_text text generated always as (lower(name || ' ' || email || ' ' || message)) stored
);
create index eltonex_enquiries_created on public.eltonex_enquiries(created_at desc, id desc);
create table public.eltonex_sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create table public.eltonex_limits (
  key text primary key, count integer not null, expires_at timestamptz not null
);
-- No anonymous/authenticated client can read or mutate customer data directly.
-- Only the function's server-side service credential may access these tables.
alter table public.eltonex_admins enable row level security;
alter table public.eltonex_enquiries enable row level security;
alter table public.eltonex_sessions enable row level security;
alter table public.eltonex_limits enable row level security;
revoke all on public.eltonex_admins, public.eltonex_enquiries, public.eltonex_sessions, public.eltonex_limits from public, anon, authenticated;
grant all on public.eltonex_admins, public.eltonex_enquiries, public.eltonex_sessions, public.eltonex_limits to service_role;

create function public.eltonex_rate_limit(bucket text, maximum integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_count integer;
begin
  delete from public.eltonex_limits where expires_at < now();
  delete from public.eltonex_sessions where expires_at < now();
  insert into public.eltonex_limits as existing (key,count,expires_at)
  values (bucket,1,now() + interval '15 minutes')
  on conflict (key) do update set count = existing.count + 1
  returning count into current_count;
  return current_count <= maximum;
end;
$$;

create function public.eltonex_save_enquiry(input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.eltonex_enquiries; inserted_id uuid;
begin
  insert into public.eltonex_enquiries(request_id,payload_hash,name,email,services,message,timing)
  values ((input->>'requestId')::uuid,input->>'hash',input->>'name',input->>'email',
    array(select jsonb_array_elements_text(input->'services')),input->>'message',input->>'timing')
  on conflict (request_id) do nothing returning id into inserted_id;
  select * into item from public.eltonex_enquiries where request_id = (input->>'requestId')::uuid;
  if item.payload_hash <> input->>'hash' then return jsonb_build_object('conflict',true); end if;
  return jsonb_build_object('id',item.id,'created',inserted_id is not null);
end;
$$;

create function public.eltonex_claim_notification(enquiry_id uuid, lease_id uuid)
returns setof public.eltonex_enquiries language sql security invoker set search_path = '' as $$
  update public.eltonex_enquiries set notification = 'sending', mail_lease = lease_id,
    mail_lease_until = now() + interval '2 minutes'
  where id = enquiry_id and (notification in ('pending','failed') or
    (notification = 'sending' and mail_lease_until < now()))
  returning *;
$$;

revoke all on function public.eltonex_rate_limit(text,integer), public.eltonex_save_enquiry(jsonb), public.eltonex_claim_notification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.eltonex_rate_limit(text,integer), public.eltonex_save_enquiry(jsonb), public.eltonex_claim_notification(uuid,uuid) to service_role;
commit;
