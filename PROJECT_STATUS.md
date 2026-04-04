# Project Status

## Product Direction
- The app is evolving from a plain workflow editor into a math workflow community.
- A workflow can be published as a reusable node.
- Public workflows live in Supabase.
- Private workflows still live in Google Drive.
- `projectNode` is the builder root for workflow metadata and publishing.

## Current State
- Supabase Google auth is connected and refresh-safe.
- Auth restore no longer depends on `profiles` DB reads.
- Public workflows can be published to the `workflows` table in Supabase.
- Public workflow cards on the dashboard load from Supabase.
- Community templates remain search-only and do not appear in the sidebar library.
- Google Drive private workflow flow is still active for save/load.
- The Supabase health panel is dev-only.

## Important Auth Decisions
- Session restore should be fast and should not call `profiles` on every refresh.
- `AppUser` is built from Supabase session metadata.
- Role lookup is lazy and only done when needed, currently for `core` workflow publishing.
- `profiles.role` is still the source of truth for elevated permissions.

## Important Workflow Decisions
- `projectNode` shares workflow name/description/tags with the published node.
- Publishing a workflow to Supabase stores the graph in `workflow_json`.
- `visibility` currently supports `private`, `public`, and `core`.
- `core` publishing is restricted to `trusted_editor` and `admin`.

## Dirty Tracking
- Returning to home now uses real dirty tracking instead of a naive `activeFileId` check.
- The store keeps a `savedGraphSignature`.
- Loading a graph, clearing a graph, exporting, Drive save, and Supabase publish all refresh the saved baseline.

## Key Files
- `src/integrations/supabase/auth.ts`
- `src/integrations/supabase/workflows.ts`
- `src/integrations/supabase/utils.ts`
- `src/components/AuthBootstrap.tsx`
- `src/components/Dashboard.tsx`
- `src/components/Sidebar.tsx`
- `src/nodes/ProjectNode.tsx`
- `src/store/useStore.ts`
- `supabase/profiles.sql`
- `supabase/workflows.sql`

## Known Gaps
- Template preview is still embedded in the builder UI, not yet a first-class workflow node.
- There is no dedicated "My published workflows" management area yet.
- Core workflow moderation/editor tooling is not built yet.
- Public workflow detail pages and richer SEO pages are not built yet.
