import type { CommunityNodeTemplate } from './types';
import { cloneInterfaceSchema } from './types';
import { defaultCommunityTemplates } from './catalog';
import { ensureLocalizedText } from './localizedText';

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || `workflow-${Date.now()}`;

export const cloneTemplate = (template: CommunityNodeTemplate): CommunityNodeTemplate => ({
  ...template,
  titleI18n: template.titleI18n ? { ...template.titleI18n } : undefined,
  summaryI18n: template.summaryI18n ? { ...template.summaryI18n } : undefined,
  interfaceSchema: cloneInterfaceSchema(template.interfaceSchema),
  runtimePlan: template.runtimePlan ? JSON.parse(JSON.stringify(template.runtimePlan)) : undefined,
  fields: template.fields.map(field => ({
    ...field,
    labelI18n: field.labelI18n ? { ...field.labelI18n } : undefined,
    placeholderI18n: field.placeholderI18n ? { ...field.placeholderI18n } : undefined,
    defaultValueI18n: field.defaultValueI18n ? { ...field.defaultValueI18n } : undefined,
    helpI18n: field.helpI18n ? { ...field.helpI18n } : undefined,
  })),
  inputs: template.inputs.map(handle => ({
    ...handle,
    labelI18n: handle.labelI18n ? { ...handle.labelI18n } : undefined,
  })),
  outputs: template.outputs.map(handle => ({
    ...handle,
    labelI18n: handle.labelI18n ? { ...handle.labelI18n } : undefined,
  })),
  alternativeAlgorithms: [...template.alternativeAlgorithms],
  tutorialSteps: [...template.tutorialSteps],
  relatedWorkflowIds: [...template.relatedWorkflowIds],
  tags: [...template.tags],
  builderBlocks: template.builderBlocks.map(block => ({
    ...block,
    labelI18n: block.labelI18n ? { ...block.labelI18n } : undefined,
    contentI18n: block.contentI18n ? { ...block.contentI18n } : undefined,
    placeholderI18n: block.placeholderI18n ? { ...block.placeholderI18n } : undefined,
  })),
});

export const syncDraftWithWorkflowMetadata = (
  draft: CommunityNodeTemplate,
  metadata: { title: string; summary: string; tags: string[] }
): CommunityNodeTemplate => ({
  ...draft,
  title: metadata.title || draft.title,
  titleI18n: ensureLocalizedText(metadata.title || draft.title, 'zh-TW', draft.titleI18n),
  summary: metadata.summary || draft.summary,
  summaryI18n: ensureLocalizedText(metadata.summary || draft.summary, 'zh-TW', draft.summaryI18n),
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
    titleI18n: {
      'zh-TW': metadata?.title || 'New Community Node',
      en: 'New Community Node',
    },
    summary: metadata?.summary || '在這裡設計節點版面、輸入輸出與說明。',
    summaryI18n: {
      'zh-TW': metadata?.summary || '在這裡設計節點版面、輸入輸出與說明。',
      en: 'Design this node layout, inputs, outputs, and explanations here.',
    },
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
      {
        id: `text-${now + 1}`,
        kind: 'text',
        label: '根據這個節點：',
        labelI18n: { 'zh-TW': '根據這個節點：', en: 'Based on this node:' },
        content: '補上你想呈現的解釋文字。',
        contentI18n: { 'zh-TW': '補上你想呈現的解釋文字。', en: 'Add the explanation you want to show.' },
      },
      {
        id: `toggle-${now + 2}`,
        kind: 'toggle',
        label: '補充說明',
        labelI18n: { 'zh-TW': '補充說明', en: 'Additional notes' },
        content: '在這裡整理節點的補充邏輯與使用情境。',
        contentI18n: { 'zh-TW': '在這裡整理節點的補充邏輯與使用情境。', en: 'Organize extra logic and usage context here.' },
      },
    ],
  }, {
    title: metadata?.title || 'New Community Node',
    summary: metadata?.summary || '在這裡設計節點版面、輸入輸出與說明。',
    tags: metadata?.tags || [],
  });
};
