# Next Steps

## Highest Priority
1. Turn template preview into a real node inside the workflow canvas.
2. Add a "My Workflows" / "Published Workflows" management view.
3. Improve public workflow open/edit/update flow after publish.

## Product / UX
1. Refine builder UX for input/output placement and preview.
2. Decide whether node interfaces should visually stay attached to nodes while remaining separately configurable.
3. Add clearer saved / unsaved indicators in the editor UI.

## Community / Roles
1. Add admin or reviewer tools for managing `core` workflows.
2. Add a simple way to inspect and edit user roles.
3. Define how canonical/core workflows should be merged or versioned.
4. Let the public node searchable in the node palette, and functionable.

## Data / Platform
1. Consider splitting workflow metadata from graph JSON later if querying needs grow.
2. Add better workflow update metadata such as last published time and author display info.
3. Decide long-term coexistence strategy for Supabase public data and Drive private data.

## Nice to Have
1. Add better share pages / SEO pages for public workflows.
2. Add a public workflow detail page outside the editor.
3. Add fork/remix support.

## Debug Notes
- If auth feels broken after refresh, first inspect `src/integrations/supabase/auth.ts`.
- If publishing or public list loading breaks, inspect `src/integrations/supabase/workflows.ts`.
- Dev-only Supabase diagnostics live in `Dashboard.tsx`.
