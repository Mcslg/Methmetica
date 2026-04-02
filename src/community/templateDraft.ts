import type { CommunityNodeTemplate } from './types';
import { defaultCommunityTemplates } from './catalog';

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || `workflow-${Date.now()}`;

export const cloneTemplate = (template: CommunityNodeTemplate): CommunityNodeTemplate => ({
  ...template,
  fields: template.fields.map(field => ({ ...field })),
  inputs: template.inputs.map(handle => ({ ...handle })),
  outputs: template.outputs.map(handle => ({ ...handle })),
  alternativeAlgorithms: [...template.alternativeAlgorithms],
  tutorialSteps: [...template.tutorialSteps],
  relatedWorkflowIds: [...template.relatedWorkflowIds],
  tags: [...template.tags],
  builderBlocks: template.builderBlocks.map(block => ({ ...block })),
});

export const syncDraftWithWorkflowMetadata = (
  draft: CommunityNodeTemplate,
  metadata: { title: string; summary: string; tags: string[] }
): CommunityNodeTemplate => ({
  ...draft,
  title: metadata.title || draft.title,
  summary: metadata.summary || draft.summary,
  tags: metadata.tags.length > 0 ? metadata.tags : draft.tags,
  slug: slugify(metadata.title || draft.title || draft.slug),
});

export const makeInitialDraft = (
  metadata?: { title?: string; summary?: string; tags?: string[] }
): CommunityNodeTemplate => {
  const base = cloneTemplate(defaultCommunityTemplates[0]);
  const now = Date.now();

  return syncDraftWithWorkflowMetadata({
    ...base,
    id: `community-template-${now}`,
    slug: `community-template-${now}`,
    title: metadata?.title || 'New Community Node',
    summary: metadata?.summary || '在這裡設計節點版面、輸入輸出與說明。',
    source: 'community',
    visibility: 'public',
    discovery: 'search-only',
    bestAlgorithm: '描述這個節點被引用時的最佳解法或最佳流程。',
    alternativeAlgorithms: ['替代方法一', '替代方法二'],
    tutorialSteps: ['步驟一', '步驟二'],
    relatedWorkflowIds: [],
    tags: metadata?.tags || [],
    builderBlocks: [
      { id: `input-${now}`, kind: 'input', label: 'input', placeholder: '使用此節點時傳入的值' },
      { id: `text-${now + 1}`, kind: 'text', label: '根據這個節點：', content: '補上你想呈現的解釋文字。' },
      { id: `output-${now + 2}`, kind: 'output', label: 'result', placeholder: '此節點輸出的值' },
    ],
  }, {
    title: metadata?.title || 'New Community Node',
    summary: metadata?.summary || '在這裡設計節點版面、輸入輸出與說明。',
    tags: metadata?.tags || [],
  });
};

