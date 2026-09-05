export type AppRoute =
  | { view: 'home' }
  | { view: 'editor'; source: 'new' | 'drive' | 'public' | 'draft' | 'version'; id?: string };

export type EditorHistorySnapshot = {
  nodes: unknown[];
  edges: unknown[];
  activeFileId: string | null;
};

const APP_ROUTE_STATE_KEY = '__methmaticaRoute';

const isEditorSource = (value: string | null): value is 'new' | 'drive' | 'public' | 'draft' | 'version' =>
  value === 'new' || value === 'drive' || value === 'public' || value === 'draft' || value === 'version';

const normalizeRoute = (route: AppRoute): AppRoute => {
  if (route.view === 'home') {
    return route;
  }

  const source = route.source;
  const id = route.id?.trim();
  if ((source === 'drive' || source === 'public' || source === 'draft' || source === 'version') && !id) {
    return { view: 'editor', source: 'new' };
  }

  return id ? { view: 'editor', source, id } : { view: 'editor', source };
};

const routesEqual = (a: AppRoute, b: AppRoute) => {
  if (a.view !== b.view) return false;
  if (a.view === 'home' && b.view === 'home') return true;
  if (a.view === 'editor' && b.view === 'editor') {
    return a.source === b.source && (a.id ?? '') === (b.id ?? '');
  }
  return false;
};

const buildUrl = (route: AppRoute) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  url.searchParams.delete('source');
  url.searchParams.delete('id');

  if (route.view === 'home') {
    url.searchParams.set('view', 'home');
  } else {
    url.searchParams.set('view', 'editor');
    url.searchParams.set('source', route.source);
    if (route.id) {
      url.searchParams.set('id', route.id);
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

export const parseRouteFromLocation = (locationLike: Location): AppRoute => {
  const params = new URLSearchParams(locationLike.search);
  const view = params.get('view');
  if (view === 'home') {
    return { view: 'home' };
  }

  if (view === 'editor') {
    const sourceParam = params.get('source');
    const source = isEditorSource(sourceParam) ? sourceParam : 'new';
    const id = params.get('id') ?? undefined;
    return normalizeRoute({ view: 'editor', source, id });
  }

  // 容錯解析：舊版 ?subgraph=xxx 或 ?draft=xxx 連結自動對應至 draft 路由
  const subgraphId = params.get('subgraph');
  if (subgraphId) {
    return normalizeRoute({ view: 'editor', source: 'draft', id: subgraphId });
  }

  const draftId = params.get('draft');
  if (draftId) {
    return normalizeRoute({ view: 'editor', source: 'draft', id: draftId });
  }

  // Backward compatibility: no URL route means old editor entry behavior.
  return { view: 'editor', source: 'new' };
};

export const pushRoute = (route: AppRoute) => {
  const normalized = normalizeRoute(route);
  const current = parseRouteFromLocation(window.location);
  if (routesEqual(current, normalized)) return;
  window.history.pushState(
    { ...(window.history.state ?? {}), [APP_ROUTE_STATE_KEY]: true, route: normalized },
    '',
    buildUrl(normalized)
  );
};

export const replaceRoute = (route: AppRoute) => {
  const normalized = normalizeRoute(route);
  const current = parseRouteFromLocation(window.location);
  const currentHasMarker = Boolean(window.history.state?.[APP_ROUTE_STATE_KEY]);
  if (routesEqual(current, normalized) && currentHasMarker) return;
  window.history.replaceState(
    { ...(window.history.state ?? {}), [APP_ROUTE_STATE_KEY]: true, route: normalized },
    '',
    buildUrl(normalized)
  );
};

export const rememberCurrentEditorSnapshot = (snapshot: EditorHistorySnapshot) => {
  const route = parseRouteFromLocation(window.location);
  if (route.view !== 'editor') return;
  window.history.replaceState(
    {
      ...(window.history.state ?? {}),
      [APP_ROUTE_STATE_KEY]: true,
      route,
      editorSnapshot: snapshot,
    },
    '',
    buildUrl(route)
  );
};

export const readEditorSnapshotFromHistory = (state: unknown): EditorHistorySnapshot | null => {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as { editorSnapshot?: EditorHistorySnapshot }).editorSnapshot;
  if (!candidate) return null;
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) return null;
  if (candidate.activeFileId !== null && typeof candidate.activeFileId !== 'string') return null;
  return candidate;
};
