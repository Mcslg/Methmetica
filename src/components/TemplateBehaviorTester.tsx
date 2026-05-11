import React from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { MathInput } from './MathInput';
import useStore from '../store/useStore';
import type { CommunityNodeTemplate, BuiltWorkflowNode } from '../community/types';
import { getTemplateInterfaceSchema } from '../community/types';
import { getLocalizedText } from '../community/localizedText';
import { useLanguage } from '../contexts/LanguageContext';
import { buildWorkflowNode, runBuiltWorkflowNode } from '../utils/workflowTestRunner';

type TemplateBehaviorTesterProps = {
  projectNodeId: string;
  builderDraft: CommunityNodeTemplate;
  linkedTemplateNodeId?: string;
  onRuntimePlanBuilt?: (runtimePlan: BuiltWorkflowNode) => void;
};

export function TemplateBehaviorTester({
  projectNodeId,
  builderDraft,
  linkedTemplateNodeId,
  onRuntimePlanBuilt,
}: TemplateBehaviorTesterProps) {
  const { language } = useLanguage();
  const linkedTemplateNode = useStore(state => (
    state.nodes.find(node => node.id === linkedTemplateNodeId) ||
    state.nodes.find(node =>
      node.type === 'communityTemplateNode' &&
      node.data?.builderSourceId === projectNodeId &&
      node.data?.autoManagedTemplateNode
    ) ||
    null
  ));
  const activeInterfaceSchema = React.useMemo(
    () => getTemplateInterfaceSchema(builderDraft),
    [builderDraft]
  );
  const [testInputs, setTestInputs] = React.useState<Record<string, string>>({});
  const [testOutputs, setTestOutputs] = React.useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = React.useState('');
  const [testTrace, setTestTrace] = React.useState<string[]>([]);
  const [inputEditor, setInputEditor] = React.useState<{
    handleId: string;
    label: string;
    screenX: number;
    screenY: number;
    value: string;
  } | null>(null);
  const [outputPopover, setOutputPopover] = React.useState<{
    handleId: string;
    label: string;
    screenX: number;
    screenY: number;
  } | null>(null);
  const inputMathRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!inputEditor) return;
    const timer = window.setTimeout(() => {
      inputMathRef.current?.focus();
      inputMathRef.current?.executeCommand?.('showVirtualKeyboard');
    }, 80);
    return () => window.clearTimeout(timer);
  }, [inputEditor]);

  React.useEffect(() => {
    setTestInputs((current) => {
      const next: Record<string, string> = {};
      activeInterfaceSchema.inputs.forEach((port) => {
        next[port.id] = current[port.id] ?? '';
      });
      return next;
    });

    setTestOutputs((current) => {
      const next: Record<string, string> = {};
      activeInterfaceSchema.outputs.forEach((port) => {
        next[port.id] = current[port.id] ?? '';
      });
      return next;
    });
  }, [activeInterfaceSchema]);

  const handleRunBehaviorTest = React.useCallback(async () => {
    const { nodes, edges } = useStore.getState();
    const bridgeNodeId = linkedTemplateNodeId || nodes.find(node =>
      node.type === 'communityTemplateNode' &&
      node.data?.builderSourceId === projectNodeId &&
      node.data?.autoManagedTemplateNode
    )?.id;

    if (!bridgeNodeId) {
      setTestStatus('找不到 template bridge node。請先建立 Builder Root。');
      return;
    }

    setTestStatus('Running test...');
    setTestTrace([]);
    const builtNode = buildWorkflowNode({
      sourceNodes: nodes,
      sourceEdges: edges,
      bridgeNodeId,
      builderNodeId: projectNodeId,
      interfaceSchema: activeInterfaceSchema,
      controlPorts: builderDraft.controlPorts,
      elementBindings: builderDraft.elementBindings,
    });
    onRuntimePlanBuilt?.(builtNode);
    const result = await runBuiltWorkflowNode(builtNode, testInputs);
    setTestOutputs(result.outputs);
    setTestStatus(result.error || 'Test complete.');
    setTestTrace(result.trace);
    if (result.templateViewOverrides) {
      useStore.getState().updateNodeData(bridgeNodeId, {
        templateViewOverrides: result.templateViewOverrides,
      }, { skipGraphEval: true });
    }
  }, [activeInterfaceSchema, linkedTemplateNodeId, onRuntimePlanBuilt, projectNodeId, testInputs]);

  const renderPortButton = (port: typeof activeInterfaceSchema.inputs[number], kind: 'input' | 'output') => {
    const isInput = kind === 'input';
    const label = getLocalizedText(port.labelI18n, language, port.label);

    return (
      <button
        key={port.id}
        type="button"
        className={`template-test-port nodrag ${kind} ${testInputs[port.id] ? 'selected' : ''}`}
        onClick={(event) => {
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
          if (isInput) {
            setInputEditor({
              handleId: port.id,
              label,
              screenX: rect.left + rect.width / 2,
              screenY: rect.bottom + 10,
              value: testInputs[port.id] || '',
            });
            return;
          }

          setOutputPopover({
            handleId: port.id,
            label,
            screenX: rect.right + 14,
            screenY: rect.top + rect.height / 2,
          });
        }}
        title={isInput ? `Set test value for ${label}` : `Show output ${label}`}
      >
        <span className="template-test-port-dot" />
        <span className="template-test-port-label">{label}</span>
      </button>
    );
  };

  return (
    <div style={{
      display: 'grid',
      gap: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <strong style={{ display: 'block', color: 'var(--text-main)' }}>Test Node Behavior</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--text-sub)', fontSize: '0.82rem' }}>
            點左側 input 接口輸入測試值，再執行 workflow runtime。
          </p>
        </div>
        <button
          type="button"
          className="builder-refresh-btn"
          onClick={handleRunBehaviorTest}
        >
          Run Test
        </button>
      </div>
      {testStatus && (
        <div style={{ color: testStatus.includes('找不到') || testStatus.includes('只支援') ? '#fca5a5' : 'var(--text-sub)', fontSize: '0.78rem' }}>
          {testStatus}
        </div>
      )}
      {testTrace.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          alignItems: 'center',
          color: 'var(--text-sub)',
          fontSize: '0.74rem'
        }}>
          <span>Trace:</span>
          {testTrace.map((item, index) => (
            <React.Fragment key={`${item}-${index}`}>
              {index > 0 && <span>→</span>}
              <span style={{
                padding: '2px 7px',
                border: '1px solid rgba(56,189,248,0.24)',
                borderRadius: '999px',
                color: '#93c5fd',
                background: 'rgba(56,189,248,0.08)'
              }}>
                {item}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'minmax(132px, 0.75fr) minmax(190px, 1fr) minmax(132px, 0.75fr)',
        gap: '10px',
        alignItems: 'stretch',
        padding: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px',
        background: 'rgba(0,0,0,0.18)'
      }}>
        <div className="template-test-port-column inputs">
          {activeInterfaceSchema.inputs.length === 0 ? (
            <div style={{ color: 'var(--text-sub)', fontSize: '0.78rem' }}>No external inputs</div>
          ) : activeInterfaceSchema.inputs.map((port) => renderPortButton(port, 'input'))}
        </div>

        <div className="template-test-node-card">
          <Icons.Package size={26} />
          <strong>{builderDraft.title || linkedTemplateNode?.data?.label || 'Community Template'}</strong>
          <span>{builderDraft.summary || 'External node preview'}</span>
        </div>

        <div className="template-test-port-column outputs">
          {activeInterfaceSchema.outputs.length === 0 ? (
            <div style={{ color: 'var(--text-sub)', fontSize: '0.78rem' }}>No external outputs</div>
          ) : activeInterfaceSchema.outputs.map((port) => renderPortButton(port, 'output'))}
        </div>
      </div>

      {inputEditor && createPortal(
        <>
          <div className="manual-input-editor-backdrop" onClick={() => setInputEditor(null)} />
          <div
            className="manual-input-editor nodrag"
            style={{ left: inputEditor.screenX, top: inputEditor.screenY }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="manual-input-editor-head">
              <div>
                <span>Test Input</span>
                <strong>{inputEditor.label}</strong>
              </div>
            </div>
            <MathInput
              name={`template-test-input-${projectNodeId}-${inputEditor.handleId}`}
              ref={inputMathRef}
              value={inputEditor.value}
              className="manual-input-math-field"
              onChange={(value) => {
                setInputEditor((current) => current ? { ...current, value } : current);
                setTestInputs((current) => ({ ...current, [inputEditor.handleId]: value }));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  setInputEditor(null);
                }
              }}
            />
            <div className="manual-input-editor-actions">
              <button
                type="button"
                onClick={() => {
                  setTestInputs((current) => ({ ...current, [inputEditor.handleId]: '' }));
                  setInputEditor(null);
                }}
              >
                Clear
              </button>
              <button type="button" onClick={() => setInputEditor(null)}>
                Done
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {outputPopover && createPortal(
        <>
          <div className="manual-input-editor-backdrop" onClick={() => setOutputPopover(null)} />
          <div
            className="template-test-output-popover nodrag"
            style={{ left: outputPopover.screenX, top: outputPopover.screenY }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="manual-input-editor-head">
              <div>
                <span>Test Output</span>
                <strong>{outputPopover.label}</strong>
              </div>
            </div>
            <pre>{testOutputs[outputPopover.handleId] || 'Run test to preview'}</pre>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
