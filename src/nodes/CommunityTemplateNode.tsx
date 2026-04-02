import useStore from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';
import { getCommunityTemplateById, getCommunityWorkflowBlueprint } from '../community/catalog';
import { getWorkflowBlueprintFromSupabase } from '../integrations/supabase/workflows';

const openCommunityWorkflow = async (workflowId: string) => {
  const blueprint =
    (await getWorkflowBlueprintFromSupabase(workflowId)) ??
    getCommunityWorkflowBlueprint(workflowId);
  if (!blueprint) return false;

  const store = useStore.getState();
  store.setGraph(blueprint.nodes as any, blueprint.edges as any);
  store.setActiveFileId(null);
  store.setCurrentView('editor');
  return true;
};

export function CommunityTemplateNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const updateNodeData = useStore(state => state.updateNodeData);
  const template = useStore(state => state.communityTemplates.find(item => item.id === data.templateId)) || getCommunityTemplateById(data.templateId || '');
  const fieldValues = data.templateFields || {};

  if (!template) {
    return (
      <div className="community-template-missing">
        <div className="node-header">
          <span><Icons.Package />Unknown Template</span>
        </div>
        <div className="node-content">
          <p style={{ margin: 0, color: 'var(--text-sub)' }}>Template not found.</p>
        </div>
      </div>
    );
  }

  const setFieldValue = (fieldId: string, value: string) => {
    updateNodeData(id, {
      ...data,
      templateFields: {
        ...fieldValues,
        [fieldId]: value,
      },
    });
  };

  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      icon={<Icons.Package />}
      defaultLabel={template.title}
      minWidth={template.size.width}
      minHeight={template.size.height}
      className={`community-template-node template-${template.source}`}
      headerExtras={
        <button
          className="exec-button"
          onClick={(e) => {
            e.stopPropagation();
            const firstWorkflow = template.relatedWorkflowIds[0];
            if (firstWorkflow) openCommunityWorkflow(firstWorkflow);
          }}
        >
          Open
        </button>
      }
      customHandleDescriptions={{
        'h-in': 'Community input',
        'h-out': 'Community output',
      }}
    >
      <div className="community-template-body">
        <div className="community-template-summary">{template.summary}</div>

        <div className="community-template-pill-row">
          <span className="community-template-pill" style={{ borderColor: template.accent, color: template.accent }}>{template.category}</span>
          <span className="community-template-pill">{template.visibility}</span>
          <span className="community-template-pill">v{template.version}</span>
        </div>

        <div className="community-template-section">
          <strong>最優算法</strong>
          <p>{template.bestAlgorithm}</p>
        </div>

        {template.alternativeAlgorithms.length > 0 && (
          <div className="community-template-section">
            <strong>替代方法</strong>
            <ul>
              {template.alternativeAlgorithms.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        {template.fields.length > 0 && (
          <div className="community-template-fields">
            {template.builderBlocks.map(block => {
              const mappedField = template.fields.find(field => field.id === block.id);
              const value = fieldValues[block.id] ?? mappedField?.defaultValue ?? block.content ?? '';
              if (block.kind === 'input' || block.kind === 'output') {
                return (
                  <div key={block.id} className="community-template-port">
                    <span className="community-template-port-kind">{block.kind}</span>
                    <strong>{block.label}</strong>
                    <small>{block.placeholder || 'Reusable handle'}</small>
                  </div>
                );
              }

              return (
                <label key={block.id} className="community-template-field">
                  <span>{block.label}</span>
                  {block.kind === 'toggle' || block.kind === 'text' ? (
                    <textarea
                      value={value}
                      placeholder={mappedField?.placeholder || block.placeholder}
                      onChange={(e) => setFieldValue(block.id, e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      placeholder={mappedField?.placeholder || block.placeholder}
                      onChange={(e) => setFieldValue(block.id, e.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>
        )}

        <div className="community-template-links">
          {template.relatedWorkflowIds.map(workflowId => (
            <button
              key={workflowId}
              className="sidebar-btn"
              onClick={(e) => {
                e.stopPropagation();
                openCommunityWorkflow(workflowId);
              }}
            >
              <Icons.ExternalLink /> {workflowId}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .community-template-body {
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .community-template-summary {
          color: var(--text-main);
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .community-template-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .community-template-pill {
          border: 1px solid var(--border-node);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-sub);
        }
        .community-template-section strong {
          display: block;
          margin-bottom: 4px;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent-bright);
        }
        .community-template-section p,
        .community-template-section ul {
          margin: 0;
          color: var(--text-main);
          font-size: 0.84rem;
          line-height: 1.45;
        }
        .community-template-section ul {
          padding-left: 18px;
        }
        .community-template-fields {
          display: grid;
          gap: 10px;
        }
        .community-template-field {
          display: grid;
          gap: 4px;
          font-size: 0.72rem;
          color: var(--text-sub);
        }
        .community-template-port {
          display: grid;
          gap: 3px;
          padding: 10px;
          border: 1px dashed var(--border-node);
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
        }
        .community-template-port-kind {
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--accent-bright);
        }
        .community-template-port strong {
          color: var(--text-main);
        }
        .community-template-port small {
          color: var(--text-sub);
        }
        .community-template-field input,
        .community-template-field textarea,
        .community-template-field select {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-node);
          border-radius: 10px;
          color: var(--text-main);
          padding: 8px 10px;
          font: inherit;
          outline: none;
        }
        .community-template-field textarea {
          min-height: 72px;
          resize: vertical;
        }
        .community-template-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
      `}</style>
    </NodeFrame>
  );
}
