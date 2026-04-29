-- Available roles:
-- - user: normal signed-in user.
-- - contributor: can review community workflows/nodes.
-- - expert: can satisfy expert review requirements.
-- - trusted_editor: can publish core workflows and counts as expert reviewer.
-- - admin: can publish CodeNode workflows, manage roles, and one-click approve reviews.

-- Change one user's role. Replace both values before running.
update public.profiles
set role = 'contributor'
where email = 'someone@example.com';

-- Common examples:
-- update public.profiles set role = 'user' where email = 'someone@example.com';
-- update public.profiles set role = 'contributor' where email = 'someone@example.com';
-- update public.profiles set role = 'expert' where email = 'someone@example.com';
-- update public.profiles set role = 'trusted_editor' where email = 'someone@example.com';
-- update public.profiles set role = 'admin' where email = 'you@example.com';

-- Verify role assignments.
select
  email,
  display_name,
  role,
  updated_at
from public.profiles
where email in ('someone@example.com', 'you@example.com')
order by email;
