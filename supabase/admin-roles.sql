-- Promote a user to trusted editor
update public.profiles
set role = 'trusted_editor'
where email = 'someone@example.com';

-- Promote a user to admin
update public.profiles
set role = 'admin'
where email = 'you@example.com';

-- Revert a user back to normal user
update public.profiles
set role = 'user'
where email = 'someone@example.com';
