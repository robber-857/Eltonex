-- First create this user in Supabase Authentication > Users > Add user.
-- This explicitly grants access to the ELTONEX inbox; ordinary users get no access.
do $$
declare admin_id uuid;
begin
  select id into admin_id from auth.users where lower(email) = 'eltonw482@gmail.com';
  if admin_id is null then raise exception 'Create and confirm eltonw482@gmail.com in Authentication > Users first.'; end if;
  insert into public.eltonex_admins(user_id) values (admin_id) on conflict do nothing;
end;
$$;
select users.id, users.email from public.eltonex_admins admins join auth.users users on users.id = admins.user_id;
