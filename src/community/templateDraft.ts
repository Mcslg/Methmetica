import type { CommunityNodeTemplate } from './types';
import { cloneInterfaceSchema } from './types';
import { defaultCommunityTemplates } from './catalog';

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || `workflow-${Date.now()}`;

export const cloneTemplate = (template: CommunityNodeTemplate): CommunityNodeTemplate => ({
  ...template,
  interfaceSchema: cloneInterfaceSchema(template.interfaceSchema),
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
    interfaceSchemaText: JSON.stringify({
      inputs: [
        { id: 'input', label: 'input', type: 'input', position: 'left', offset: 42, source: 'static', valueKind: 'value' }
      ],
      outputs: [
        { id: 'result', label: 'result', type: 'output', position: 'right', offset: 42, source: 'static', valueKind: 'value' }
      ]
    }, null, 2),
    builderBlocks: [
      { id: `text-${now + 1}`, kind: 'text', label: '根據這個節點：', content: '補上你想呈現的解釋文字。' },
      { id: `toggle-${now + 2}`, kind: 'toggle', label: '補充說明', content: '在這裡整理節點的補充邏輯與使用情境。' },
    ],
  }, {
    title: metadata?.title || 'New Community Node',
    summary: metadata?.summary || '在這裡設計節點版面、輸入輸出與說明。',
    tags: metadata?.tags || [],
  });
};
