import React from 'react';
import { type NodeProps } from '@xyflow/react';
import useStore, { type AppNode } from '../store/useStore';
import { NodeFrame } from '../components/NodeFrame';
import { Icons } from '../components/Icons';
import { getCommunityTemplateById } from '../community/catalog';
import { getTemplateHandles, type CommunityNodeTemplate, type TemplateBuilderBlock } from '../community/types';
import { applyBlockViewOverrides } from '../community/templateView';
import { useLanguage } from '../contexts/LanguageContext';
import { getLocalizedText } from '../community/localizedText';
import {
  getWorkflowVersionBlueprintFromSupabase,
  listWorkflowVersions,
  type WorkflowVersionSummary,
} from '../integrations/supabase/workflows';

const openCommunityWorkflow = (workflowId: string, workflowVersionId?: string | null) => {
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'editor');
  url.searchParams.set('source', workflowVersionId ? 'version' : 'public');
  url.searchParams.set('id', workflowVersionId || workflowId);
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
};

const compactUpdateText = (text?: string | null, maxLength = 42) => {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
};

export const CommunityTemplateNode = React.memo(function CommunityTemplateNode({ id, data, selected }: NodeProps<AppNode>) {
  const { language } = useLanguage();
  const updateNodeData = useStore(state => state.updateNodeData);
  const [isVersionPanelOpen, setVersionPanelOpen] = React.useState(false);
  const [versionRows, setVersionRows] = React.useState<WorkflowVersionSummary[]>([]);
  const [isLoadingVersions, setLoadingVersions] = React.useState(false);
  const [hasLoadedVersions, setHasLoadedVersions] = React.useState(false);
  const [versionError, setVersionError] = React.useState<string | null>(null);
  const [changingVersionId, setChangingVersionId] = React.useState<string | null>(null);
  const isReadOnlyPreview = Boolean(data.readOnlyPreview);
  const templateFromStore = useStore(
    state => state.communityTemplates.find((item: CommunityNodeTemplate) => item.id === data.templateId) ?? null
  );
  const catalogTemplate =
    templateFromStore ??
    getCommunityTemplateById(data.templateId || '') as CommunityNodeTemplate | undefined;
  const draftTemplate = data.templateDraft as CommunityNodeTemplate | undefined;
  const template =
    draftTemplate ??
    catalogTemplate;
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

  const referencedVersionId = typeof data.sourceWorkflowVersionId === 'string'
    ? data.sourceWorkflowVersionId
    : draftTemplate?.sourceWorkflowVersionId ?? template.sourceWorkflowVersionId;
  const latestSupersedingVersion = React.useMemo(() => {
    if (!referencedVersionId) return undefined;

    let cursor = referencedVersionId;
    let latest: WorkflowVersionSummary | undefined;
    const visited = new Set<string>();

    while (!visited.has(cursor)) {
      visited.add(cursor);
      const next = versionRows
        .filter(version =>
          version.supersedesVersionId === cursor &&
          ['feature', 'fix', 'hotfix'].includes(version.changeType ?? '')
        )
        .sort((a, b) => b.version - a.version)[0];
      if (!next) break;
      latest = next;
      cursor = next.id;
    }

    return latest;
  }, [referencedVersionId, versionRows]);
  const latestVersionId = latestSupersedingVersion?.id ??
    (hasLoadedVersions
      ? referencedVersionId
      : catalogTemplate?.latestWorkflowVersionId ??
      data.latestWorkflowVersionId ??
      template.latestWorkflowVersionId ??
      catalogTemplate?.sourceWorkflowVersionId ??
      template.sourceWorkflowVersionId);
  const hasVersionUpdate = Boolean(referencedVersionId && latestVersionId && referencedVersionId !== latestVersionId);
  const updateSeverity = hasVersionUpdate
    ? latestSupersedingVersion?.changeType === 'hotfix' || latestSupersedingVersion?.changeType === 'fix' || latestSupersedingVersion?.changeType === 'feature'
      ? latestSupersedingVersion.changeType
      : catalogTemplate?.updateSeverity ?? catalogTemplate?.changeType ?? data.updateSeverity ?? template.updateSeverity
    : data.updateSeverity ?? template.updateSeverity;
  const updateMessage = hasVersionUpdate
    ? latestSupersedingVersion?.warningMessage ??
    catalogTemplate?.updateMessage ??
    data.updateMessage ??
    (updateSeverity === 'hotfix'
      ? '這個節點有重要修復，建議盡快更新。'
      : updateSeverity === 'fix'
        ? '這個節點已有修正版，建議手動更新。'
        : '這個節點已有新版，可手動更新。')
    : data.updateMessage ?? template.updateMessage;
  const updateLabel = updateSeverity === 'hotfix' ? '重要修復' : updateSeverity === 'fix' ? '有修正版' : '有新版';
  const updateSummaryText = compactUpdateText(latestSupersedingVersion?.updateSummary ?? catalogTemplate?.updateSummary ?? data.updateSummary ?? template.updateSummary);
  const warningMessage = updateSummaryText ? `${updateLabel}：${updateSummaryText}` : updateMessage;
  const ignoredUpdateVersionId = typeof data.ignoredCommunityUpdateVersionId === 'string'
    ? data.ignoredCommunityUpdateVersionId
    : null;
  const shouldShowUpdateWarning = Boolean(hasVersionUpdate && latestVersionId && ignoredUpdateVersionId !== latestVersionId);
  const currentWorkflowVersion = versionRows.find(version => version.id === referencedVersionId)?.version;
  const currentVersionLabel = currentWorkflowVersion
    ? `v${currentWorkflowVersion}`
    : referencedVersionId
      ? `ver ${referencedVersionId.slice(0, 6)}`
      : '版本';
  const latestWorkflowVersionNumber = latestSupersedingVersion?.version ?? catalogTemplate?.latestWorkflowVersion;
  const versionButtonLabel = hasVersionUpdate && latestWorkflowVersionNumber
    ? `${currentVersionLabel} → v${latestWorkflowVersionNumber}`
    : currentVersionLabel;
  const versionStateLabel = hasVersionUpdate
    ? ignoredUpdateVersionId === latestVersionId
      ? '已忽略此版本更新'
      : updateLabel
    : '目前已是最新版本';
  const sourceWorkflowId =
    data.sourceWorkflowId ??
    catalogTemplate?.sourceWorkflowId ??
    template.sourceWorkflowId ??
    template.relatedWorkflowIds[0];

  const patchNodeToTemplate = (nextTemplate: CommunityNodeTemplate, nextSourceVersionId?: string) => {
    const existingFields = data.templateFields ?? {};
    const nextFields = Object.fromEntries(
      nextTemplate.fields.map(field => [
        field.id,
        existingFields[field.id] ?? field.defaultValue ?? '',
      ])
    );

    updateNodeData(id, {
      label: getLocalizedText(nextTemplate.titleI18n, language, nextTemplate.title),
      templateId: nextTemplate.id,
      templateDraft: nextTemplate,
      templateFields: nextFields,
      templateViewOverrides: undefined,
      templateSummary: nextTemplate.summary,
      templateBestAlgorithm: nextTemplate.bestAlgorithm,
      templateAlternatives: nextTemplate.alternativeAlgorithms,
      templateRelatedWorkflowIds: nextTemplate.relatedWorkflowIds,
      sourceWorkflowId: nextTemplate.sourceWorkflowId,
      sourceWorkflowVersionId: nextSourceVersionId ?? nextTemplate.sourceWorkflowVersionId,
      sourceWorkflowSlug: nextTemplate.sourceWorkflowSlug,
      updateAvailable: false,
      updateSeverity: undefined,
      updateMessage: undefined,
      latestWorkflowVersionId: undefined,
      latestWorkflowVersion: undefined,
      ignoredCommunityUpdateVersionId: undefined,
      outputs: {},
      value: '',
      error: undefined,
      status: 'Template updated. Re-running...',
      handles: getTemplateHandles(nextTemplate).map(handle => ({
        id: handle.id,
        type: handle.type,
        position: handle.position,
        offset: handle.offset,
        label: handle.label,
      })),
    }, { skipGraphEval: true });

    useStore.setState((state) => ({
      nodes: state.nodes.map(node => (
        node.id === id
          ? {
            ...node,
            width: nextTemplate.size.width,
            height: nextTemplate.size.height,
            style: {
              ...node.style,
              width: nextTemplate.size.width,
              height: nextTemplate.size.height,
            },
          }
          : node
      )),
    }));

    window.setTimeout(() => {
      useStore.getState().executeNode(id);
    }, 0);
  };

  const loadVersions = async () => {
    if (!sourceWorkflowId) {
      setVersionError('這個節點沒有來源 workflow，暫時不能切換版本。');
      return;
    }

    setLoadingVersions(true);
    setVersionError(null);
    try {
      const rows = await listWorkflowVersions(sourceWorkflowId);
      setVersionRows(rows);
      setHasLoadedVersions(true);
    } catch (error) {
      console.error('[community node] failed to load versions:', error);
      setVersionError(error instanceof Error ? error.message : '載入版本失敗。');
    } finally {
      setLoadingVersions(false);
    }
  };

  React.useEffect(() => {
    if (!sourceWorkflowId || hasLoadedVersions || isLoadingVersions) return;
    void loadVersions();
  }, [sourceWorkflowId, hasLoadedVersions, isLoadingVersions]);

  const handleIgnoreUpdate = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!latestVersionId) return;
    updateNodeData(id, { ignoredCommunityUpdateVersionId: latestVersionId }, { skipGraphEval: true });
  };

  const handleShowVersionInfo = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const nextOpen = !isVersionPanelOpen;
    setVersionPanelOpen(nextOpen);
    if (nextOpen && versionRows.length === 0 && !isLoadingVersions) {
      void loadVersions();
    }
  };

  const applyWorkflowVersionToNode = async (workflowVersionId: string) => {
    setChangingVersionId(workflowVersionId);
    setVersionError(null);
    try {
      const blueprint = await getWorkflowVersionBlueprintFromSupabase(workflowVersionId);
      const projectNode = blueprint?.nodes.find(node => node.type === 'projectNode');
      const nextTemplate = projectNode?.data.builderDraft as CommunityNodeTemplate | undefined;
      if (!nextTemplate) {
        throw new Error('這個版本沒有可用的 node template 資料。');
      }
      const workflowId = blueprint?.meta?.workflowId;
      const resolvedWorkflowVersionId = blueprint?.meta?.workflowVersionId ?? workflowVersionId;
      const nextSnapshot: CommunityNodeTemplate = {
        ...nextTemplate,
        sourceWorkflowId: workflowId ?? nextTemplate.sourceWorkflowId,
        sourceWorkflowVersionId: resolvedWorkflowVersionId,
        sourceWorkflowSlug: blueprint?.card.slug ?? nextTemplate.sourceWorkflowSlug,
        publishKind: 'node',
        changeType: blueprint?.meta?.changeType ?? nextTemplate.changeType,
        updatePolicy: blueprint?.meta?.updatePolicy ?? nextTemplate.updatePolicy,
        updateSummary: blueprint?.meta?.updateSummary ?? nextTemplate.updateSummary,
        warningMessage: blueprint?.meta?.warningMessage ?? nextTemplate.warningMessage,
        supersedesVersionId: blueprint?.meta?.supersedesVersionId ?? nextTemplate.supersedesVersionId,
        relatedWorkflowIds: Array.from(new Set([...(nextTemplate.relatedWorkflowIds || []), workflowId].filter(Boolean) as string[])),
      };

      patchNodeToTemplate(nextSnapshot, resolvedWorkflowVersionId);
      setVersionRows(rows => rows.map(row => (
        row.id === resolvedWorkflowVersionId
          ? { ...row, updateAvailable: false, warningMessage: null, updateMessage: undefined }
          : row
      )));
      setVersionPanelOpen(false);
    } catch (error) {
      console.error('[community node] failed to change version:', error);
      setVersionError(error instanceof Error ? error.message : '更改版本失敗。');
    } finally {
      setChangingVersionId(null);
    }
  };

  const handleApplyUpdate = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (latestVersionId) {
      await applyWorkflowVersionToNode(latestVersionId);
      return;
    }
    if (catalogTemplate) {
      patchNodeToTemplate(catalogTemplate, catalogTemplate.sourceWorkflowVersionId);
    }
  };

  const handleChangeVersion = async (event: React.MouseEvent<HTMLButtonElement>, version: WorkflowVersionSummary) => {
    event.stopPropagation();
    await applyWorkflowVersionToNode(version.id);
  };

  return (
    <div className="community-template-node-shell">
      {shouldShowUpdateWarning && (
        <div className={`community-template-update-banner ${updateSeverity === 'hotfix' ? 'hotfix' : updateSeverity === 'fix' ? 'fix' : 'feature'}`}>
          <div className="community-template-update-copy">
            <strong>{updateLabel}</strong>
            <span title={updateSummaryText || updateMessage}>{warningMessage}</span>
          </div>
          <div className="community-template-update-actions">
            <button type="button" onClick={handleApplyUpdate} disabled={!latestVersionId && !catalogTemplate || Boolean(changingVersionId)}>
              {changingVersionId ? '更新中' : '更新'}
            </button>
            <button type="button" onClick={handleIgnoreUpdate}>
              忽略
            </button>
          </div>
        </div>
      )}
      {isVersionPanelOpen && (
        <div className="community-template-version-panel nodrag" onClick={(event) => event.stopPropagation()}>
          <div className="community-template-version-panel-header">
            <div>
              <strong>近期版本</strong>
              <span>{versionStateLabel}</span>
            </div>
            <button type="button" onClick={() => setVersionPanelOpen(false)} aria-label="關閉版本面板">
              ×
            </button>
          </div>
          <div className="community-template-version-current">
            目前節點：{currentVersionLabel}
            {referencedVersionId ? <small>{referencedVersionId.slice(0, 8)}</small> : null}
          </div>
          {isLoadingVersions ? (
            <div className="community-template-version-empty">載入版本中...</div>
          ) : versionError ? (
            <div className="community-template-version-error">{versionError}</div>
          ) : versionRows.length === 0 ? (
            <div className="community-template-version-empty">沒有可切換的版本。</div>
          ) : (
            <div className="community-template-version-list">
              {versionRows.slice(0, 6).map(version => {
                const isCurrentVersion = version.id === referencedVersionId;
                const versionSummary = compactUpdateText(version.updateSummary, 86);
                return (
                  <div key={version.id} className={`community-template-version-row ${isCurrentVersion ? 'active' : ''}`}>
                    <div>
                      <div className="community-template-version-meta">
                        <strong>v{version.version}</strong>
                        <span>{version.changeType === 'hotfix' ? '緊急修復' : version.changeType === 'fix' ? '修正' : version.changeType === 'feature' ? '新增' : '編修'}</span>
                        <small>{new Date(version.publishedAt).toLocaleDateString()}</small>
                      </div>
                      {versionSummary && (
                        <p title={version.updateSummary || undefined}>{versionSummary}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => handleChangeVersion(event, version)}
                      disabled={isCurrentVersion || changingVersionId === version.id}
                    >
                      {isCurrentVersion ? '使用中' : changingVersionId === version.id ? '更改中' : '更改版本'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <NodeFrame
        id={id}
        data={data}
        selected={selected}
        icon={<Icons.Package />}
        defaultLabel={getLocalizedText(template.titleI18n, language, template.title)}
        minWidth={template.size.width}
        minHeight={120}
        className={`community-template-node template-${template.source}`}
        headerExtras={
          <>
            <button
              className={`exec-button community-template-version-btn ${hasVersionUpdate ? 'has-update' : ''} ${ignoredUpdateVersionId === latestVersionId ? 'ignored' : ''}`}
              onClick={handleShowVersionInfo}
              title={versionStateLabel}
              aria-label={`Community node version: ${versionButtonLabel}`}
            >
              {versionButtonLabel}
            </button>
            <button
              className="exec-button"
              onClick={(e) => {
                e.stopPropagation();
                const firstWorkflow = template.relatedWorkflowIds[0];
                const workflowId = data.sourceWorkflowId ?? template.sourceWorkflowId ?? firstWorkflow;
                if (workflowId) openCommunityWorkflow(workflowId, referencedVersionId);
              }}
              title={referencedVersionId ? 'Open this node version' : 'Open latest workflow'}
            >
              Open
            </button>
          </>
        }
        customHandleDescriptions={{
          'h-in': 'Community input',
          'h-out': 'Community output',
        }}
      >
        <div className="community-template-body">
          {template.builderBlocks.length > 0 && (
            <div className="community-template-fields">
              {template.builderBlocks.map((sourceBlock: TemplateBuilderBlock) => {
                const block = applyBlockViewOverrides(sourceBlock, data.templateViewOverrides);
                if (block.kind === 'input' || block.kind === 'output') {
                  return null;
                }

                if (block.kind === 'text') {
                  return (
                    <p key={block.id} className="community-template-text-block">
                      {getLocalizedText(block.contentI18n, language, block.content || '') || '尚未填入內容。'}
                    </p>
                  );
                }

                if (block.kind === 'math') {
                  return (
                    <div key={block.id} className="community-template-static-block math">
                      <span className="community-template-static-label">
                        {getLocalizedText(block.labelI18n, language, block.label)}
                      </span>
                      <code>{getLocalizedText(block.contentI18n, language, block.content || '') || '尚未填入公式。'}</code>
                    </div>
                  );
                }

                return (
                  <details key={block.id} className="community-template-toggle" open={!isReadOnlyPreview}>
                    <summary>{getLocalizedText(block.labelI18n, language, block.label)}</summary>
                    <p>
                      {getLocalizedText(block.contentI18n, language, block.content || '') ||
                        getLocalizedText(block.placeholderI18n, language, block.placeholder || '') ||
                        '尚未填入切換內容。'}
                    </p>
                  </details>
                );
              })}
            </div>
          )}
        </div>

        <style>{`
        .community-template-node-shell {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .community-template-body {
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .community-template-fields {
          display: grid;
          gap: 10px;
        }
        .community-template-update-banner {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(100% + 8px);
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 9px 8px 10px;
          border: 1px solid rgba(96, 165, 250, 0.38);
          border-radius: 10px;
          background: rgba(96, 165, 250, 0.09);
          backdrop-filter: blur(10px);
          color: #bfdbfe;
          font-size: 0.74rem;
          line-height: 1.4;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.26);
        }
        .community-template-update-banner.fix {
          border-color: rgba(245, 158, 11, 0.42);
          background: rgba(245, 158, 11, 0.1);
          color: #fcd34d;
        }
        .community-template-update-banner.hotfix {
          border-color: rgba(248, 113, 113, 0.48);
          background: rgba(248, 113, 113, 0.12);
          color: #fecaca;
        }
        .community-template-update-banner strong {
          color: inherit;
        }
        .community-template-update-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }
        .community-template-update-copy span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .community-template-update-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        .community-template-update-actions button {
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          color: inherit;
          padding: 4px 8px;
          font-size: 0.68rem;
          font-weight: 700;
          cursor: pointer;
        }
        .community-template-update-actions button:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.16);
        }
        .community-template-update-actions button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .community-template-version-panel {
          position: absolute;
          top: 34px;
          right: -8px;
          z-index: 30;
          width: 250px;
          display: grid;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.96);
          color: var(--text-main);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(14px);
        }
        .community-template-version-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .community-template-version-panel-header div {
          display: grid;
          gap: 2px;
        }
        .community-template-version-panel-header strong {
          font-size: 0.82rem;
        }
        .community-template-version-panel-header span,
        .community-template-version-current,
        .community-template-version-empty,
        .community-template-version-error {
          color: var(--text-sub);
          font-size: 0.7rem;
          line-height: 1.4;
        }
        .community-template-version-panel-header button {
          border: 0;
          background: transparent;
          color: var(--text-sub);
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 0 2px;
        }
        .community-template-version-current {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 7px 8px;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.05);
        }
        .community-template-version-current small {
          font-family: 'IBM Plex Mono', 'SFMono-Regular', monospace;
          opacity: 0.72;
        }
        .community-template-version-error {
          color: #fecaca;
        }
        .community-template-version-list {
          display: grid;
          gap: 7px;
          max-height: 240px;
          overflow: auto;
        }
        .community-template-version-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.035);
        }
        .community-template-version-row.active {
          border-color: rgba(34, 197, 94, 0.36);
          background: rgba(34, 197, 94, 0.08);
        }
        .community-template-version-row div {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .community-template-version-meta {
          display: flex !important;
          align-items: center;
          gap: 6px !important;
        }
        .community-template-version-meta strong {
          font-size: 0.78rem;
        }
        .community-template-version-meta span,
        .community-template-version-meta small {
          color: var(--text-sub);
          font-size: 0.64rem;
        }
        .community-template-version-row p {
          margin: 0;
          color: var(--text-sub);
          font-size: 0.66rem;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .community-template-version-row button {
          flex: 0 0 auto;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          padding: 5px 8px;
          font-size: 0.66rem;
          font-weight: 700;
          cursor: pointer;
        }
        .community-template-version-row button:hover:not(:disabled) {
          border-color: rgba(96, 165, 250, 0.5);
          background: rgba(96, 165, 250, 0.16);
        }
        .community-template-version-row button:disabled {
          opacity: 0.52;
          cursor: not-allowed;
        }
        .community-template-version-btn {
          max-width: 82px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .community-template-version-btn.has-update {
          border-color: rgba(245, 158, 11, 0.45);
          background: rgba(245, 158, 11, 0.12);
          color: #fcd34d;
        }
        .community-template-version-btn.has-update.ignored {
          border-color: rgba(148, 163, 184, 0.35);
          background: rgba(148, 163, 184, 0.1);
          color: #cbd5e1;
        }
        .community-template-text-block {
          margin: 0;
          color: var(--text-main);
          line-height: 1.6;
        }
        .community-template-static-block,
        .community-template-toggle {
          display: grid;
          gap: 6px;
          padding: 10px;
          border: 1px solid var(--border-node);
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
        }
        .community-template-static-block p,
        .community-template-toggle p {
          margin: 0;
          color: var(--text-main);
          line-height: 1.5;
        }
        .community-template-static-label {
          font-size: 0.72rem;
          color: var(--text-sub);
        }
        .community-template-static-block.math code {
          font-family: 'IBM Plex Mono', 'SFMono-Regular', monospace;
          font-size: 0.85rem;
          color: var(--text-main);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .community-template-toggle summary {
          cursor: pointer;
          color: var(--text-main);
          font-weight: 600;
        }
        `}</style>
      </NodeFrame>
    </div>
  );
});
