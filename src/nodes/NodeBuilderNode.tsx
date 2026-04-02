import useStore from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';
import { CommunityNodeMaker, buildTemplateFromBlocks } from '../components/CommunityNodeMaker';
import { defaultCommunityTemplates } from '../community/catalog';
import type { CommunityNodeTemplate } from '../community/types';

const cloneTemplate = (template: CommunityNodeTemplate): CommunityNodeTemplate => ({
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

const makeInitialDraft = (): CommunityNodeTemplate => {
  const base = cloneTemplate(defaultCommunityTemplates[0]);
  return {
    ...base,
    id: `community-template-${Date.now()}`,
    slug: `community-template-${Date.now()}`,
    title: 'New Community Node',
    summary: '在這裡設計節點版面、輸入輸出與說明。',
    source: 'community',
    visibility: 'public',
    discovery: 'search-only',
    bestAlgorithm: '描述這個節點被引用時的最佳解法或最佳流程。',
    alternativeAlgorithms: ['替代方法一', '替代方法二'],
    tutorialSteps: ['步驟一', '步驟二'],
    relatedWorkflowIds: [],
    builderBlocks: [
      { id: `input-${Date.now()}`, kind: 'input', label: 'input', placeholder: '使用此節點時傳入的值' },
      { id: `text-${Date.now() + 1}`, kind: 'text', label: '根據這個節點：', content: '補上你想呈現的解釋文字。' },
      { id: `output-${Date.now() + 2}`, kind: 'output', label: 'result', placeholder: '此節點輸出的值' },
    ],
  };
};

export function NodeBuilderNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const updateNodeData = useStore(state => state.updateNodeData);
  const upsertCommunityTemplate = useStore(state => state.upsertCommunityTemplate);
  const builderDraft = (data.builderDraft as CommunityNodeTemplate | undefined) || makeInitialDraft();
  const publishStatus = data.publishStatus || '發布後只會出現在右鍵搜尋，不會進入側邊 library。';

  const handleDraftChange = (draft: CommunityNodeTemplate) => {
    updateNodeData(id, {
      ...data,
      builderDraft: draft,
      label: draft.title || data.label || 'Node Builder',
    });
  };

  const handlePublish = (draft: CommunityNodeTemplate) => {
    const packaged = buildTemplateFromBlocks({
      ...draft,
      slug: draft.slug || draft.id,
      version: draft.version || '1.0.0',
      discovery: 'search-only',
    });
    upsertCommunityTemplate(packaged);
    updateNodeData(id, {
      ...data,
      builderDraft: packaged,
      publishStatus: `已發布 "${packaged.title}"，可透過右鍵搜尋找到。`,
      label: packaged.title || 'Node Builder',
    });
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Package />}
      defaultLabel="Node Builder"
      minWidth={900}
      minHeight={620}
      className="node-builder-node"
      contentStyle={{ padding: 0 }}
    >
      <div className="node-builder-shell">
        <CommunityNodeMaker
          draft={builderDraft}
          onChange={handleDraftChange}
          onPublish={handlePublish}
          publishLabel="Publish to search catalog"
          status={publishStatus}
        />
      </div>

      <style>{`
        .node-builder-shell {
          padding: 14px;
          background: linear-gradient(180deg, rgba(96, 165, 250, 0.05), transparent 35%);
        }
      `}</style>
    </NodeFrame>
  );
}

