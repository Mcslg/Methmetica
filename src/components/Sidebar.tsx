import React, { useRef } from 'react';
import useStore, { createGraphSignature } from '../store/useStore';
import { NodeLibrary } from './NodeLibrary';
import { Icons } from './Icons';
import TitleLogo from '../assets/Title.svg';
import TitleDarkLogo from '../assets/Title_dark.svg';
import { useLanguage } from '../contexts/LanguageContext';
import * as driveService from '../utils/googleDriveService';
import { parseRouteFromLocation, pushRoute } from '../utils/navigation';
import { forkWorkflowToLocalDraft } from '../utils/workflowFork';
import { deleteLocalDraft } from '../utils/localDraftService';
import { setWorkflowInteraction } from '../integrations/supabase/workflowInteractions';
import { getUserRole } from '../integrations/supabase/auth';
import {
    adminApproveWorkflowInSupabase,
    getWorkflowVersionBlueprintFromSupabase,
    listWorkflowVersions,
    requestExtraWorkflowReviewInSupabase,
    reviewWorkflowInSupabase,
    type WorkflowVersionSummary,
} from '../integrations/supabase/workflows';

const getDisplayErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
};

export function Sidebar() {
    const { t, language, setLanguage } = useLanguage();
    const { 
        nodes, edges, setGraph, theme, setTheme, isSidebarOpen, setSidebarOpen, 
        isDeletingHover, isPaletteFloating, setPaletteFloating, setCurrentView,
        user, setUser, driveConnected, activeFileId, setActiveFileId, savedGraphSignature, markCurrentGraphSaved, updateNodeData
    } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [holdProgress, setHoldProgress] = React.useState(0);
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
    const [workflowVersions, setWorkflowVersions] = React.useState<WorkflowVersionSummary[]>([]);
    const [isLoadingVersions, setIsLoadingVersions] = React.useState(false);
    const [versionError, setVersionError] = React.useState<string | null>(null);
    const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isDirty = createGraphSignature(nodes, edges) !== savedGraphSignature;
    const projectRoot = nodes.find(node => node.type === 'projectNode');
    const hasBuilderDraft = Boolean(projectRoot?.data.builderDraft);
    const hasPublishedTemplate = Boolean(projectRoot?.data.hasPublishedTemplate || projectRoot?.data.supabaseWorkflowId);
    const isCurrentUserOwner = Boolean(projectRoot?.data.ownerId && user?.id === projectRoot.data.ownerId);
    const isContributor = Boolean(user && ['contributor', 'expert', 'trusted_editor', 'admin'].includes(user.role));
    const isExpertReviewer = Boolean(user && ['expert', 'trusted_editor', 'admin'].includes(user.role));
    const isAdmin = user?.role === 'admin';
    const reviewStatus = projectRoot?.data.reviewStatus;
    const reviewCount = typeof projectRoot?.data.reviewCount === 'number' ? projectRoot.data.reviewCount : 0;
    const contributorReviewCount = projectRoot?.data.contributorReviewCount ?? reviewCount;
    const expertReviewCount = projectRoot?.data.expertReviewCount ?? 0;
    const requiredContributorReviews = projectRoot?.data.requiredContributorReviews ?? 3;
    const requiredExpertReviews = projectRoot?.data.requiredExpertReviews ?? 0;
    const reviewedByMe = Boolean(projectRoot?.data.reviewedByMe);
    const shouldShowReviewedState = Boolean(isContributor && (reviewedByMe || isCurrentUserOwner));
    const isForkablePublicWorkflow = Boolean(projectRoot?.data.readOnlyPreview && !isCurrentUserOwner);
    const publishTemplateLabel = isForkablePublicWorkflow
        ? 'Fork'
        : hasBuilderDraft
            ? hasPublishedTemplate ? '更新節點' : '發布節點'
            : hasPublishedTemplate ? '更新工作流' : '發布工作流';
    const publishStatus = typeof projectRoot?.data.publishStatus === 'string' ? projectRoot.data.publishStatus : '';
    const publishFailureReason = (() => {
        if (!publishStatus) return '';
        const failurePrefixes = ['發布失敗：', '發布前請先補齊：'];
        const prefix = failurePrefixes.find(item => publishStatus.startsWith(item));
        if (prefix) return publishStatus.slice(prefix.length).trim();
        if (publishStatus.includes('先登入') || publishStatus.includes('只有 trusted_editor')) return publishStatus;
        return '';
    })();
    const hasPublishFailure = Boolean(publishFailureReason);
    const isPublishClean = hasPublishedTemplate && !isDirty && !hasPublishFailure && !isForkablePublicWorkflow;
    const publishButtonClassName = [
        'sidebar-btn',
        'publish',
        isPublishClean ? 'published-clean' : '',
        hasPublishFailure ? 'publish-failed' : '',
    ].filter(Boolean).join(' ');
    const currentRoute = parseRouteFromLocation(window.location);
    const supabaseWorkflowId = typeof projectRoot?.data.supabaseWorkflowId === 'string'
        ? projectRoot.data.supabaseWorkflowId
        : null;
    const canReviewWorkflow = Boolean(
        supabaseWorkflowId &&
        projectRoot &&
        user &&
        isContributor &&
        !isCurrentUserOwner &&
        reviewStatus === 'unreviewed' &&
        (
            isExpertReviewer && requiredExpertReviews > 0
                ? expertReviewCount < requiredExpertReviews
                : contributorReviewCount < requiredContributorReviews
        ) &&
        !reviewedByMe
    );
    const reviewDisabledReason = (() => {
        if (!user) return '請先登入後審核。';
        if (!isContributor) return `目前身份是 ${user.role}，需要 contributor 以上才能審核。`;
        if (isCurrentUserOwner) return '作者不能審核自己的 workflow。';
        if (reviewedByMe) return '你已審核過這個 workflow。';
        if (isExpertReviewer && requiredExpertReviews > 0 && expertReviewCount >= requiredExpertReviews) {
            return 'Expert 審核名額已滿。';
        }
        if (contributorReviewCount >= requiredContributorReviews) {
            return 'Contributor 審核名額已滿。';
        }
        if (!canReviewWorkflow) return '目前不能審核這個 workflow。';
        return '審核這個 workflow';
    })();
    const reviewRequirementLabel = requiredExpertReviews > 0
        ? `貢獻者 ${contributorReviewCount}/${requiredContributorReviews} · 專家 ${expertReviewCount}/${requiredExpertReviews}`
        : `貢獻者 ${contributorReviewCount}/${requiredContributorReviews}`;
    const activeWorkflowVersionId = typeof projectRoot?.data.workflowVersionId === 'string'
        ? projectRoot.data.workflowVersionId
        : null;
    const isEditorRoute = currentRoute.view === 'editor';
    const canDeleteWorkflow =
        (isEditorRoute && currentRoute.source === 'draft' && Boolean(currentRoute.id)) ||
        Boolean(activeFileId);

    const onDragStart = (event: React.DragEvent, nodeType: string, templateId?: string) => {
        const payload = templateId ? JSON.stringify({ type: nodeType, templateId }) : nodeType;
        event.dataTransfer.setData('application/reactflow', payload);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleSave = () => {
        const data = { nodes, edges };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `methmatica_project_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        markCurrentGraphSaved();
    };

    const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = event.target?.result as string;
                const data = JSON.parse(json);
                if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
                    setGraph(data.nodes, data.edges);
                    setActiveFileId(null);
                    pushRoute({ view: 'editor', source: 'new' });
                } else {
                    alert(t('common.invalid_file') || 'Invalid project file format.');
                }
            } catch {
                alert(t('common.parse_error') || 'Failed to parse project file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const startHold = () => {
        setHoldProgress(0);
        holdTimerRef.current = setInterval(() => {
            setHoldProgress(prev => {
                if (prev >= 100) {
                    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
                    setGraph([], []);
                    return 0;
                }
                return prev + 2; // ~1000ms to complete
            });
        }, 20);
    };

    const handleCloudSave = async () => {
        if (!user || !driveConnected) return;
        setIsSyncing(true);
        setSyncStatus('idle');
        try {
            // Find workflow name from the project node
            const projectRoot = nodes.find(n => n.type === 'projectNode');
            const name = projectRoot?.data?.label || 'Untitled Workflow';
            
            const fileId = await driveService.saveWorkflow(name, { nodes, edges }, activeFileId || undefined);
            setActiveFileId(fileId);
            markCurrentGraphSaved();
            
            // Subtle success feedback
            setSyncStatus('success');
            setTimeout(() => setSyncStatus('idle'), 3000);
        } catch (err) {
            console.error("Cloud save failed", err);
            setSyncStatus('error');
            setTimeout(() => setSyncStatus('idle'), 3000);
        } finally {
            setIsSyncing(false);
        }
    };

    const handlePublishTemplate = () => {
        if (isForkablePublicWorkflow) {
            forkWorkflowToLocalDraft({ nodes, edges, user, setGraph, setActiveFileId });
            if (currentRoute.view === 'editor' && currentRoute.source === 'public' && currentRoute.id) {
                void setWorkflowInteraction(currentRoute.id, 'fork', true).catch((error) => {
                    console.warn('[sidebar] failed to record workflow fork:', error);
                });
            }
            return;
        }
        if (!projectRoot) return;
        const eventName = hasBuilderDraft ? 'publish-project-template' : 'publish-project-workflow';
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: { projectNodeId: projectRoot.id },
        }));
    };

    const handleReviewWorkflow = async () => {
        if (!supabaseWorkflowId || !projectRoot || !canReviewWorkflow) return;
        setIsSyncing(true);
        try {
            const result = await reviewWorkflowInSupabase(supabaseWorkflowId);
            updateNodeData(projectRoot.id, {
                reviewStatus: result.reviewStatus,
                reviewCount: result.reviewCount,
                reviewRequired: result.reviewRequired,
                reviewWarning: result.reviewWarning,
                requiredContributorReviews: result.requiredContributorReviews,
                requiredExpertReviews: result.requiredExpertReviews,
                contributorReviewCount: result.contributorReviewCount,
                expertReviewCount: result.expertReviewCount,
                extraContributorReviews: result.extraContributorReviews,
                extraExpertReviews: result.extraExpertReviews,
                reviewedByMe: result.reviewedByMe,
                publishStatus: result.reviewStatus === 'approved'
                    ? '已通過審核，現在標記為 verified。'
                    : `已完成審核，目前 ${result.contributorReviewCount}/${result.requiredContributorReviews} contributor、${result.expertReviewCount}/${result.requiredExpertReviews} expert。`,
            }, { skipGraphEval: true });
            setWorkflowVersions((versions) => versions.map(version => (
                version.id === result.workflowVersionId
                    ? {
                        ...version,
                        reviewStatus: result.reviewStatus,
                        reviewCount: result.reviewCount,
                        reviewRequired: result.reviewRequired,
                        reviewWarning: result.reviewWarning,
                        requiredContributorReviews: result.requiredContributorReviews,
                        requiredExpertReviews: result.requiredExpertReviews,
                        contributorReviewCount: result.contributorReviewCount,
                        expertReviewCount: result.expertReviewCount,
                        extraContributorReviews: result.extraContributorReviews,
                        extraExpertReviews: result.extraExpertReviews,
                    }
                    : version
            )));
        } catch (error) {
            console.error('Failed to review workflow', error);
            alert(getDisplayErrorMessage(error, '審核 workflow 失敗。'));
        } finally {
            setIsSyncing(false);
        }
    };

    const handleRequestExtraReview = async () => {
        if (!supabaseWorkflowId || !projectRoot) return;
        const requestExpert = window.confirm('需要加一位 expert 審核嗎？按取消則加一位 contributor 審核。');
        const reason = window.prompt('補充原因（可留空）：', '需要額外審核確認品質與安全性。') ?? undefined;
        setIsSyncing(true);
        try {
            const result = await requestExtraWorkflowReviewInSupabase(
                supabaseWorkflowId,
                requestExpert ? 0 : 1,
                requestExpert ? 1 : 0,
                reason,
            );
            updateNodeData(projectRoot.id, {
                reviewStatus: result.reviewStatus,
                reviewCount: result.reviewCount,
                reviewRequired: result.reviewRequired,
                reviewWarning: result.reviewWarning,
                requiredContributorReviews: result.requiredContributorReviews,
                requiredExpertReviews: result.requiredExpertReviews,
                contributorReviewCount: result.contributorReviewCount,
                expertReviewCount: result.expertReviewCount,
                extraContributorReviews: result.extraContributorReviews,
                extraExpertReviews: result.extraExpertReviews,
                reviewedByMe: result.reviewedByMe,
                publishStatus: '已提出額外審核需求。',
            }, { skipGraphEval: true });
        } catch (error) {
            console.error('Failed to request extra review', error);
            alert(getDisplayErrorMessage(error, '提出額外審核需求失敗。'));
        } finally {
            setIsSyncing(false);
        }
    };

    const applyWorkflowReviewResult = React.useCallback((result: Awaited<ReturnType<typeof reviewWorkflowInSupabase>>) => {
        if (!projectRoot) return;
        updateNodeData(projectRoot.id, {
            reviewStatus: result.reviewStatus,
            reviewCount: result.reviewCount,
            reviewRequired: result.reviewRequired,
            reviewWarning: result.reviewWarning,
            requiredContributorReviews: result.requiredContributorReviews,
            requiredExpertReviews: result.requiredExpertReviews,
            contributorReviewCount: result.contributorReviewCount,
            expertReviewCount: result.expertReviewCount,
            extraContributorReviews: result.extraContributorReviews,
            extraExpertReviews: result.extraExpertReviews,
            reviewedByMe: result.reviewedByMe,
            publishStatus: result.reviewStatus === 'approved'
                ? '已通過審核，現在標記為 verified。'
                : `已完成審核，目前 ${result.contributorReviewCount}/${result.requiredContributorReviews} contributor、${result.expertReviewCount}/${result.requiredExpertReviews} expert。`,
        }, { skipGraphEval: true });
        setWorkflowVersions((versions) => versions.map(version => (
            version.id === result.workflowVersionId
                ? {
                    ...version,
                    reviewStatus: result.reviewStatus,
                    reviewCount: result.reviewCount,
                    reviewRequired: result.reviewRequired,
                    reviewWarning: result.reviewWarning,
                    requiredContributorReviews: result.requiredContributorReviews,
                    requiredExpertReviews: result.requiredExpertReviews,
                    contributorReviewCount: result.contributorReviewCount,
                    expertReviewCount: result.expertReviewCount,
                    extraContributorReviews: result.extraContributorReviews,
                    extraExpertReviews: result.extraExpertReviews,
                }
                : version
        )));
    }, [projectRoot, updateNodeData]);

    const handleAdminApproveWorkflow = async () => {
        if (!supabaseWorkflowId || !projectRoot || !isAdmin) return;
        setIsSyncing(true);
        try {
            const result = await adminApproveWorkflowInSupabase(supabaseWorkflowId);
            applyWorkflowReviewResult(result);
        } catch (error) {
            console.error('Failed to admin approve workflow', error);
            alert(getDisplayErrorMessage(error, '一鍵通過 workflow 失敗。'));
        } finally {
            setIsSyncing(false);
        }
    };

    React.useEffect(() => {
        if (!supabaseWorkflowId) {
            setWorkflowVersions([]);
            setVersionError(null);
            return;
        }

        let cancelled = false;
        setIsLoadingVersions(true);
        setVersionError(null);

        listWorkflowVersions(supabaseWorkflowId)
            .then((versions) => {
                if (cancelled) return;
                setWorkflowVersions(versions);
            })
            .catch((error) => {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : 'Failed to load workflow versions.';
                setVersionError(message);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingVersions(false);
            });

        return () => {
            cancelled = true;
        };
    }, [supabaseWorkflowId, projectRoot?.data.publishStatus]);

    React.useEffect(() => {
        if (!user || !supabaseWorkflowId || reviewStatus !== 'unreviewed') return;

        let cancelled = false;
        getUserRole(user.id, user.role)
            .then((role) => {
                if (cancelled || role === user.role) return;
                setUser({ ...user, role });
            })
            .catch((error) => {
                console.warn('[sidebar] failed to refresh user role for workflow review:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [reviewStatus, setUser, supabaseWorkflowId, user]);

    const handleOpenVersion = async (version: WorkflowVersionSummary) => {
        setIsSyncing(true);
        try {
            const blueprint = await getWorkflowVersionBlueprintFromSupabase(version.id);
            if (!blueprint) throw new Error(`Workflow version v${version.version} is missing.`);
            setGraph(
                blueprint.nodes.map(node => (
                    node.type === 'projectNode'
                        ? {
                            ...node,
                            data: {
                                ...node.data,
                                workflowSource: 'public' as const,
                                readOnlyPreview: true,
                                supabaseWorkflowId: blueprint.meta?.workflowId ?? version.workflowId,
                                workflowVersionId: blueprint.meta?.workflowVersionId ?? version.id,
                                workflowVersion: blueprint.meta?.workflowVersion ?? version.version,
                                ownerId: blueprint.meta?.ownerId ?? node.data.ownerId,
                                authorName: blueprint.meta?.authorName ?? node.data.authorName,
                                reviewStatus: blueprint.meta?.reviewStatus ?? node.data.reviewStatus,
                                reviewCount: blueprint.meta?.reviewCount ?? node.data.reviewCount,
                                reviewRequired: blueprint.meta?.reviewRequired ?? node.data.reviewRequired,
                                reviewWarning: blueprint.meta?.reviewWarning ?? node.data.reviewWarning,
                                requiredContributorReviews: blueprint.meta?.requiredContributorReviews ?? node.data.requiredContributorReviews,
                                requiredExpertReviews: blueprint.meta?.requiredExpertReviews ?? node.data.requiredExpertReviews,
                                contributorReviewCount: blueprint.meta?.contributorReviewCount ?? node.data.contributorReviewCount,
                                expertReviewCount: blueprint.meta?.expertReviewCount ?? node.data.expertReviewCount,
                                extraContributorReviews: blueprint.meta?.extraContributorReviews ?? node.data.extraContributorReviews,
                                extraExpertReviews: blueprint.meta?.extraExpertReviews ?? node.data.extraExpertReviews,
                                reviewedByMe: blueprint.meta?.reviewedByMe ?? node.data.reviewedByMe,
                                publishStatus: `正在查看歷史版本 v${version.version}。Fork 後才能編輯。`,
                            },
                        }
                        : node
                )),
                blueprint.edges
            );
            setActiveFileId(null);
            pushRoute({ view: 'editor', source: 'version', id: version.id });
        } catch (error) {
            console.error('Failed to open workflow version', error);
            alert(error instanceof Error ? error.message : '開啟歷史版本失敗。');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteCurrentWorkflow = async () => {
        if (isForkablePublicWorkflow || !isEditorRoute) {
            alert('公開工作流不能直接刪除，請先 Fork 成自己的副本。');
            return;
        }

        const workflowName = String(projectRoot?.data.label || 'Untitled Workflow');
        if (!window.confirm(`確定要刪除 workflow「${workflowName}」嗎？這個動作不能復原。`)) return;

        try {
            if (currentRoute.source === 'draft' && currentRoute.id) {
                deleteLocalDraft(currentRoute.id);
            } else if (activeFileId) {
                await driveService.deleteWorkflow(activeFileId);
                setActiveFileId(null);
            } else {
                alert('目前這個 workflow 還沒有可刪除的儲存來源。你可以使用清空畫布。');
                return;
            }

            setCurrentView('home');
            pushRoute({ view: 'home' });
        } catch (err) {
            console.error('Failed to delete workflow', err);
            alert('刪除 workflow 失敗。');
        }
    };

    const handleBackToHome = () => {
        if (isDirty) {
            const shouldLeave = window.confirm(
                t('common.unsaved_warning') || 'You have unsaved changes. Exit to Dashboard?'
            );
            if (!shouldLeave) return;
        }
        setCurrentView('home');
        pushRoute({ view: 'home' });
    };

    const stopHold = () => {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        setHoldProgress(0);
    };

    return (
        <div className={`sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-drawer">
                <div 
                    className="sidebar-header clickable" 
                    onClick={handleBackToHome}
                    title={t('common.goto_home') || "Go to Dashboard"}
                >
                    <img
                        src={theme === 'dark' ? TitleDarkLogo : TitleLogo}
                        alt="methmatica"
                        style={{ height: '64px', width: 'auto', marginTop: '6px' }}
                    />
                    <p style={{ marginTop: '4px' }}>v0.7.1</p>
                </div>

                {!isPaletteFloating && (
                    <div className="sidebar-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ marginBottom: 0 }}>{t('sidebar.title')} <span>(Drag & Drop)</span></label>
                            <button
                                className="icon-btn-small"
                                title="Float Toolkit"
                                onClick={() => setPaletteFloating(true)}
                            >
                                <Icons.ExternalLink style={{ width: 14, height: 14 }} />
                            </button>
                        </div>
                        <NodeLibrary onDragStart={onDragStart} layout="sidebar" />
                    </div>
                )}

                <div className="sidebar-section">
                    <label>{t('sidebar.project')}</label>
                    {user && driveConnected && (
                        <button 
                            className={`sidebar-btn cloud ${syncStatus !== 'idle' ? syncStatus : ''}`} 
                            onClick={handleCloudSave} 
                            disabled={isSyncing}
                        >
                            {isSyncing ? (
                                <div className="spinner-small" />
                            ) : syncStatus === 'success' ? (
                                <Icons.Check />
                            ) : syncStatus === 'error' ? (
                                <Icons.Clear />
                            ) : (
                                <Icons.Languages />
                            )} 
                            {syncStatus === 'success' ? 
                                (t('sidebar.synced') || 'Saved!') : 
                                (activeFileId ? (t('sidebar.update_cloud') || 'Sync to Cloud') : (t('sidebar.save_cloud') || 'Save to Cloud'))
                            }
                        </button>
                    )}
                    <div className="publish-action-row">
                        <button
                            className={publishButtonClassName}
                            onClick={handlePublishTemplate}
                            disabled={!projectRoot && !isForkablePublicWorkflow}
                            title={
                                isForkablePublicWorkflow
                                    ? 'Fork 這個公開工作流成為你的本機副本'
                                    : hasPublishFailure
                                        ? publishFailureReason
                                        : isPublishClean
                                            ? '已發布，且目前沒有新的變更'
                                            : hasBuilderDraft
                                                ? '發布此 workflow 為 community node template'
                                                : '只發布 workflow，不建立 community node template'
                            }
                        >
                            {isPublishClean ? <Icons.Check /> : hasPublishFailure ? <Icons.Clear /> : <Icons.Package />}
                            {publishTemplateLabel}
                        </button>
                    </div>
                    {hasPublishFailure && (
                        <div className="publish-failure-inline" title={publishFailureReason}>
                            {publishFailureReason}
                        </div>
                    )}
                    {supabaseWorkflowId && reviewStatus === 'unreviewed' && (
                        <div className="workflow-review-panel">
                            <div className="workflow-review-status">
                                未審核 <span>{reviewRequirementLabel}</span>
                            </div>
                            {shouldShowReviewedState ? (
                                <button
                                    className="sidebar-btn review"
                                    disabled
                                    title={isCurrentUserOwner ? '自己的 workflow 不需要自審' : '你已審核過這個 workflow'}
                                >
                                    <Icons.Check /> 已審核
                                </button>
                            ) : isContributor && !isCurrentUserOwner && (
                                <button
                                    className="sidebar-btn review"
                                    onClick={handleReviewWorkflow}
                                    disabled={!canReviewWorkflow || isSyncing}
                                    title={reviewDisabledReason}
                                >
                                    <Icons.Check /> 審核
                                </button>
                            )}
                            {isAdmin && (
                                <button
                                    className="sidebar-btn review"
                                    onClick={handleAdminApproveWorkflow}
                                    disabled={isSyncing}
                                    title="Admin 一鍵通過這個 workflow"
                                >
                                    <Icons.Check /> 一鍵通過
                                </button>
                            )}
                            {isContributor && !isCurrentUserOwner && (
                                <button
                                    className="sidebar-btn review"
                                    onClick={handleRequestExtraReview}
                                    disabled={isSyncing}
                                    title="要求更多 contributor 或 expert 審核"
                                >
                                    <Icons.Check /> 額外審核
                                </button>
                            )}
                        </div>
                    )}
                    {supabaseWorkflowId && (
                        <div className="workflow-version-panel">
                            <div className="workflow-version-header">
                                <span>Versions</span>
                                {isLoadingVersions && <small>Loading...</small>}
                            </div>
                            {versionError ? (
                                <div className="workflow-version-error">{versionError}</div>
                            ) : workflowVersions.length === 0 && !isLoadingVersions ? (
                                <div className="workflow-version-empty">還沒有發布版本。</div>
                            ) : (
                                <div className="workflow-version-list">
                                    {workflowVersions.map(version => (
                                        <button
                                            key={version.id}
                                            className={`workflow-version-item ${version.id === activeWorkflowVersionId ? 'active' : ''}`}
                                            onClick={() => handleOpenVersion(version)}
                                            disabled={isSyncing}
                                            title={`Open v${version.version}`}
                                        >
                                            <span>
                                                v{version.version}
                                                {version.isCurrent && <em>current</em>}
                                            </span>
                                            <small>{new Date(version.publishedAt).toLocaleString()}</small>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <button className="sidebar-btn" onClick={handleSave}>
                        <Icons.Save /> {t('sidebar.save_export')}
                    </button>
                    <button className="sidebar-btn" onClick={() => fileInputRef.current?.click()}>
                        <Icons.Load /> {t('sidebar.load_import')}
                    </button>
                    <button
                        className="sidebar-btn danger"
                        onClick={handleDeleteCurrentWorkflow}
                        disabled={!canDeleteWorkflow || isForkablePublicWorkflow}
                        title={
                            isForkablePublicWorkflow
                                ? '公開工作流不能直接刪除，請先 Fork 成自己的副本'
                                : canDeleteWorkflow ? '刪除目前 workflow' : '目前 workflow 還沒有儲存來源'
                        }
                    >
                        <Icons.Clear /> 刪除 workflow
                    </button>
                    <button
                        className="sidebar-btn danger hold-btn"
                        onMouseDown={startHold}
                        onMouseUp={stopHold}
                        onMouseLeave={stopHold}
                        onTouchStart={startHold}
                        onTouchEnd={stopHold}
                    >
                        <div className="hold-progress" style={{ width: `${holdProgress}%` }} />
                        <Icons.Clear />
                        <span>{holdProgress > 0 ? (t('sidebar.hold_to_clear') || 'Hold to Clear') : (t('sidebar.clear_all') || 'Clear All')}</span>
                    </button>
                </div>



                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".json"
                    onChange={handleLoad}
                />

                <div className="sidebar-footer" style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                    <button 
                        className="sidebar-btn icon-only" 
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        title={theme === 'dark' ? t('sidebar.theme_toggle_light') : t('sidebar.theme_toggle_dark')}
                    >
                        {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
                    </button>
                    <button 
                        className="sidebar-btn icon-only" 
                        onClick={() => setLanguage(language === 'en' ? 'zh-TW' : 'en')}
                        title={language === 'en' ? '繁體中文' : 'English'}
                    >
                        <Icons.Languages />
                    </button>
                </div>

                {isDeletingHover && (
                    <div className="delete-overlay">
                        <Icons.Clear />
                        <span>{t('sidebar.drop_to_delete') || 'Drop to Delete'}</span>
                    </div>
                )}
            </div>

            <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(!isSidebarOpen)}>
                {isSidebarOpen ? '‹' : '›'}
            </button>

            <style>{`
                .sidebar-container {
                    position: fixed;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
                }
                .sidebar-container.closed {
                    transform: translateX(-195px);
                }
                .sidebar-drawer {
                    position: relative;
                    width: 160px;
                    height: 100%;
                    background: var(--bg-sidebar);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-right: 1px solid var(--border-node);
                    padding: 24px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 28px;
                    box-shadow: 20px 0 50px rgba(0,0,0,0.15);
                    overflow-y: auto;
                    overflow-x: hidden;
                }
                .sidebar-drawer::-webkit-scrollbar {
                    width: 4px;
                }
                .sidebar-drawer::-webkit-scrollbar-track {
                    background: transparent;
                }
                .sidebar-drawer::-webkit-scrollbar-thumb {
                    background: var(--scroll-thumb);
                    border-radius: 10px;
                }
                .sidebar-drawer::-webkit-scrollbar-thumb:hover {
                    background: var(--accent-bright);
                }
                .sidebar-header {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                }
                .sidebar-header.clickable {
                    cursor: pointer;
                    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s;
                    pointer-events: auto;
                }
                .sidebar-header.clickable:hover {
                    transform: scale(1.05) translateX(4px);
                    opacity: 0.8;
                }
                .sidebar-header.clickable:active {
                    transform: scale(0.95);
                }
                .sidebar-header p {
                    margin: 4px 0 0 0;
                    font-size: 0.75rem;
                    color: var(--text-sub);
                    letter-spacing: 0.02em;
                    font-weight: 500;
                }
                .sidebar-section {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding: 8px 0;
                    border-top: 1px solid var(--border-header);
                }
                .sidebar-section:first-of-type {
                    border-top: none;
                }
                .sidebar-section label span {
                    font-size: 0.6rem;
                    opacity: 0.5;
                    font-weight: 400;
                    margin-left: 4px;
                }
                .sidebar-section label {
                    font-size: 0.72rem;
                    color: var(--text-sub);
                    margin-bottom: 6px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                .icon-btn-small {
                    background: transparent;
                    border: none;
                    color: var(--text-sub);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                .icon-btn-small:hover {
                    color: var(--accent);
                    background: var(--bg-input);
                }
                
                
                .node-library-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                    margin-bottom: 4px;
                }
                
                .library-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 12px 6px;
                    background: var(--bg-input);
                    border: 1px solid var(--border-header);
                    border-radius: 12px;
                    cursor: grab;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                }
                
                .library-item:hover {
                    background: var(--bg-node);
                    border-color: var(--accent);
                    transform: translateY(-2px);
                    box-shadow: var(--node-hover-shadow);
                }
                
                .library-item:active {
                    cursor: grabbing;
                    transform: scale(0.95);
                }
                
                .library-item svg {
                    width: 20px;
                    height: 20px;
                    color: var(--text-main);
                    opacity: 0.8;
                }
                
                .library-item:hover svg {
                    opacity: 1;
                    color: var(--accent);
                }
                
                .library-item span {
                    font-size: 0.68rem;
                    font-weight: 600;
                    color: var(--text-sub);
                    text-align: center;
                }
                
                .library-item:hover span {
                    color: var(--text-main);
                }
                .sidebar-btn {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                    padding: 10px 14px;
                    background: var(--bg-input);
                    border: 1px solid var(--border-node);
                    border-radius: 12px;
                    color: var(--text-main);
                    cursor: pointer;
                    font-size: 0.82rem;
                    font-family: inherit;
                    transition: all 0.2s;
                }
                .sidebar-btn:hover {
                    background: var(--accent);
                    color: #fff;
                    border-color: var(--accent);
                    transform: translateY(-1px);
                }
                .sidebar-btn.danger:hover {
                    background: rgba(248, 113, 113, 0.15);
                    border-color: rgba(248, 113, 113, 0.4);
                    color: #f87171;
                }
                .sidebar-btn.danger.hold-btn {
                    position: relative;
                    overflow: hidden;
                    transition: transform 0.1s;
                }
                .sidebar-btn.danger.hold-btn:active {
                    transform: scale(0.96);
                }
                .hold-progress {
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    background: rgba(239, 68, 68, 0.6);
                    pointer-events: none;
                    transition: width 0.05s linear;
                    z-index: 1;
                }
                .sidebar-btn.danger.hold-btn span, 
                .sidebar-btn.danger.hold-btn svg {
                    position: relative;
                    z-index: 2;
                    pointer-events: none;
                }
                .publish-action-row {
                    position: relative;
                    display: flex;
                    align-items: stretch;
                    gap: 8px;
                    width: 100%;
                }
                .sidebar-btn.publish {
                    flex: 1;
                    min-width: 0;
                }
                .sidebar-btn.publish.published-clean {
                    background: #059669;
                    border-color: #10b981;
                    color: white;
                }
                .sidebar-btn.publish.published-clean:hover:not(:disabled) {
                    background: #047857;
                    border-color: #10b981;
                    color: white;
                }
                .sidebar-btn.publish.publish-failed {
                    background: rgba(248, 113, 113, 0.06);
                    border-color: #ef4444;
                    color: #fca5a5;
                }
                .sidebar-btn.publish.publish-failed:hover:not(:disabled) {
                    background: rgba(248, 113, 113, 0.12);
                    border-color: #f87171;
                    color: #fecaca;
                }
                .publish-failure-inline {
                    margin-top: -2px;
                    padding: 0 2px;
                    color: #f87171;
                    font-size: 0.7rem;
                    line-height: 1.35;
                }
                .workflow-review-panel {
                    display: grid;
                    gap: 8px;
                    padding: 10px;
                    border: 1px solid rgba(245, 158, 11, 0.35);
                    border-radius: 8px;
                    background: rgba(245, 158, 11, 0.08);
                }
                .workflow-review-status {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    color: #fbbf24;
                    font-size: 0.76rem;
                    font-weight: 700;
                }
                .workflow-review-status span {
                    color: var(--text-main);
                    font-variant-numeric: tabular-nums;
                }
                .sidebar-btn.review {
                    justify-content: center;
                    border-color: rgba(16, 185, 129, 0.45);
                    background: rgba(16, 185, 129, 0.12);
                    color: #86efac;
                }
                .sidebar-btn.review:hover:not(:disabled) {
                    background: #059669;
                    border-color: #10b981;
                    color: #fff;
                }
                .workflow-version-panel {
                    display: grid;
                    gap: 8px;
                    padding: 10px;
                    border: 1px solid var(--border-node);
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.03);
                }
                .workflow-version-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-main);
                    font-size: 0.78rem;
                    font-weight: 700;
                }
                .workflow-version-header small,
                .workflow-version-empty,
                .workflow-version-error {
                    color: var(--text-sub);
                    font-size: 0.72rem;
                }
                .workflow-version-error {
                    color: #f87171;
                }
                .workflow-version-list {
                    display: grid;
                    gap: 6px;
                    max-height: 180px;
                    overflow: auto;
                }
                .workflow-version-item {
                    display: grid;
                    gap: 2px;
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--border-node);
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.04);
                    color: var(--text-main);
                    text-align: left;
                    cursor: pointer;
                }
                .workflow-version-item:hover:not(:disabled),
                .workflow-version-item.active {
                    border-color: var(--accent);
                    background: var(--accent-light);
                }
                .workflow-version-item span {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                    font-size: 0.76rem;
                    font-weight: 700;
                }
                .workflow-version-item em {
                    color: var(--accent-bright);
                    font-size: 0.64rem;
                    font-style: normal;
                    font-weight: 700;
                }
                .workflow-version-item small {
                    color: var(--text-sub);
                    font-size: 0.68rem;
                }
                .stat-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.8rem;
                    color: var(--text-sub);
                    padding: 4px 2px;
                }
                .sidebar-toggle-btn {
                    width: 20px;
                    height: 44px;
                    background: var(--bg-sidebar);
                    backdrop-filter: blur(10px);
                    border: 1px solid var(--border-node);
                    border-left: none;
                    border-radius: 0 8px 8px 0;
                    color: var(--text-sub);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1rem;
                    transition: all 0.2s;
                }
                .sidebar-toggle-btn:hover {
                    color: var(--text-main);
                    padding-left: 4px;
                }
                .delete-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(239, 68, 68, 0.25);
                    backdrop-filter: blur(10px);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    font-size: 0.85rem;
                    font-weight: 600;
                    gap: 12px;
                    z-index: 10000;
                    pointer-events: none;
                    animation: fadeIn 0.3s ease;
                }
                .delete-overlay svg {
                    width: 48px;
                    height: 48px;
                    opacity: 0.9;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .sidebar-btn.cloud {
                    background: var(--accent-light);
                    border-color: var(--accent);
                    color: var(--accent-bright);
                    margin-bottom: 4px;
                }
                .sidebar-btn.cloud:hover:not(:disabled) {
                    background: var(--accent);
                    color: #fff;
                }
                .sidebar-btn.cloud.success {
                    background: #059669;
                    border-color: #10b981;
                    color: white;
                }
                .sidebar-btn.cloud.error {
                    background: #dc2626;
                    border-color: #ef4444;
                    color: white;
                }
                .sidebar-btn.icon-only {
                    justify-content: center;
                    width: 44px;
                    height: 44px;
                    padding: 0;
                    flex: 1;
                }
                .spinner-small {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(74, 222, 128, 0.2);
                    border-top-color: var(--accent-bright);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
