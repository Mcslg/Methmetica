import type { Edge } from '@xyflow/react';
import type { AppNode } from '../store/useStore';

const DRAFT_INDEX_KEY = 'methmatica.localDrafts.index.v1';
const DRAFT_KEY_PREFIX = 'methmatica.localDraft.';
const PUBLIC_EDIT_KEY_PREFIX = 'methmatica.publicWorkflowEdit.';

export type LocalDraftSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type LocalDraftDoc = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: AppNode[];
  edges: Edge[];
};

type PublicWorkflowEditDoc = {
  workflowId: string;
  ownerId: string;
  updatedAt: string;
  nodes: AppNode[];
  edges: Edge[];
};

const readIndex = (): LocalDraftSummary[] => {
  try {
    const raw = window.localStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalDraftSummary =>
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.createdAt === 'string' &&
        typeof item.updatedAt === 'string'
    );
  } catch {
    return [];
  }
};

const writeIndex = (index: LocalDraftSummary[]) => {
  window.localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
};

const keyOf = (id: string) => `${DRAFT_KEY_PREFIX}${id}`;
const publicEditKeyOf = (workflowId: string, ownerId: string) =>
  `${PUBLIC_EDIT_KEY_PREFIX}${ownerId}.${workflowId}`;

const getDraftTitle = (nodes: AppNode[]) => {
  const root = nodes.find(node => node.type === 'projectNode');
  const raw = String(root?.data?.label ?? '').trim();
  return raw || 'Untitled Draft';
};

const nowIso = () => new Date().toISOString();

export const createLocalDraft = (initial?: { nodes: AppNode[]; edges: Edge[] }) => {
  const id = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = nowIso();
  const nodes = initial?.nodes ?? [];
  const edges = initial?.edges ?? [];
  const doc: LocalDraftDoc = {
    id,
    title: getDraftTitle(nodes),
    createdAt,
    updatedAt: createdAt,
    nodes,
    edges,
  };
  window.localStorage.setItem(keyOf(id), JSON.stringify(doc));
  const index = readIndex();
  writeIndex([{ id, title: doc.title, createdAt, updatedAt: createdAt }, ...index]);
  return id;
};

export const saveLocalDraft = (id: string, payload: { nodes: AppNode[]; edges: Edge[] }) => {
  const existing = loadLocalDraft(id);
  const createdAt = existing?.createdAt ?? nowIso();
  const updatedAt = nowIso();
  const title = getDraftTitle(payload.nodes);
  const doc: LocalDraftDoc = {
    id,
    title,
    createdAt,
    updatedAt,
    nodes: payload.nodes,
    edges: payload.edges,
  };
  window.localStorage.setItem(keyOf(id), JSON.stringify(doc));

  const index = readIndex();
  const next = index.filter(item => item.id !== id);
  writeIndex([{ id, title, createdAt, updatedAt }, ...next]);
};

export const loadLocalDraft = (id: string): LocalDraftDoc | null => {
  try {
    const raw = window.localStorage.getItem(keyOf(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraftDoc;
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const deleteLocalDraft = (id: string) => {
  window.localStorage.removeItem(keyOf(id));
  writeIndex(readIndex().filter(item => item.id !== id));
};

export const listLocalDrafts = () =>
  readIndex()
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .filter(item => loadLocalDraft(item.id) !== null);

export const savePublicWorkflowEdit = (
  workflowId: string,
  ownerId: string,
  payload: { nodes: AppNode[]; edges: Edge[] },
) => {
  const doc: PublicWorkflowEditDoc = {
    workflowId,
    ownerId,
    updatedAt: nowIso(),
    nodes: payload.nodes,
    edges: payload.edges,
  };
  window.localStorage.setItem(publicEditKeyOf(workflowId, ownerId), JSON.stringify(doc));
};

export const loadPublicWorkflowEdit = (workflowId: string, ownerId: string): PublicWorkflowEditDoc | null => {
  try {
    const raw = window.localStorage.getItem(publicEditKeyOf(workflowId, ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicWorkflowEditDoc;
    if (
      !parsed ||
      parsed.workflowId !== workflowId ||
      parsed.ownerId !== ownerId ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearPublicWorkflowEdit = (workflowId: string, ownerId: string) => {
  window.localStorage.removeItem(publicEditKeyOf(workflowId, ownerId));
};
