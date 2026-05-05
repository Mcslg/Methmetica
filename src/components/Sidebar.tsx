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
import {
    getMyWorkflowInteractions,
    getWorkflowEngagement,
    setWorkflowInteraction,
} from '../integrations/supabase/workflowInteractions';
import { getUserRole } from '../integrations/supabase/auth';
import {
    adminApproveWorkflowInSupabase,
    adminDeletePublicWorkflowInSupabase,
    getWorkflowVersionBlueprintFromSupabase,
    listWorkflowVersions,
    requestExtraWorkflowReviewInSupabase,
    reviewWorkflowInSupabase,
    type WorkflowVersionSummary,
} from '../integrations/supabase/workflows';
import type { WorkflowChangeType } from '../community/types';

const getDisplayErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
};

const VERSION_CHANGE_LABELS = {
    edit: '編修',
    feature: '新增',
    fix: '修正',
    hotfix: '緊急修復',
} as const;

const PUBLISH_CHANGE_OPTIONS: Array<{
    value: WorkflowChangeType;
    label: string;
    description: string;
    updatePolicy: 'none' | 'manual' | 'auto';
    warningMessage?: string;
}> = [
    {
        value: 'edit',
        label: '編修',
        description: '只改文字、說明、教學或排版，不推送功能更新。',
        updatePolicy: 'none',
    },
    {
        value: 'feature',
        label: '新增',
        description: '新增能力但不破壞舊用法；使用者之後可手動更新。',
        updatePolicy: 'manual',
    },
    {
        value: 'fix',
        label: '修正',
        description: '修一般 bug，舊版本會顯示有已知問題。',
        updatePolicy: 'manual',
        warningMessage: '這個版本已有修正版，建議手動更新。',
    },
    {
        value: 'hotfix',
        label: '緊急修復',
        description: '安全、錯誤結果或嚴重問題；之後可支援自動更新。',
        updatePolicy: 'auto',
        warningMessage: '這個版本有重要修復，建議盡快更新。',
    },
];

const getPublishChangeOption = (changeType: WorkflowChangeType) => (
    PUBLISH_CHANGE_OPTIONS.find(option => option.value === changeType) ?? PUBLISH_CHANGE_OPTIONS[0]
);

export function Sidebar() {
    const { t, language, setLanguage } = useLanguage();
    const { 
        nodes, edges, setGraph, theme, setTheme, isSidebarOpen, setSidebarOpen, 
        isDeletingHover, isPaletteFloating, setPaletteFloating, setCurrentView,
        user, setUser, driveConnected, activeFileId, setActiveFileId, savedGraphSignature, markCurrentGraphSaved, updateNodeData
    } = useStore();
    const [holdProgress, setHoldProgress] = React.useState(0);
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
    const [workflowVersions, setWorkflowVersions] = React.useState<WorkflowVersionSummary[]>([]);
    const [isLoadingVersions, setIsLoadingVersions] = React.useState(false);
    const [versionError, setVersionError] = React.useState<string | null>(null);
    const [versionHoverCard, setVersionHoverCard] = React.useState<{
        x: number;
        y: number;
        warningMessage?: string | null;
        updateSummary?: string | null;
    } | null>(null);
    const [publishDialogOpen, setPublishDialogOpen] = React.useState(false);
    const [publishChangeType, setPublishChangeType] = React.useState<WorkflowChangeType>('feature');
    const [publishUpdateSummary, setPublishUpdateSummary] = React.useState('');
    const [publicWorkflowLike, setPublicWorkflowLike] = React.useState({ liked: false, likeCount: 0, isPending: false });
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
    const canLikePublicWorkflow = Boolean(supabaseWorkflowId && projectRoot?.data.readOnlyPreview);
    const isEditorRoute = currentRoute.view === 'editor';
    const isSupabasePublicWorkflow = Boolean(
        supabaseWorkflowId &&
        (
            projectRoot?.data.readOnlyPreview ||
            projectRoot?.data.workflowSource === 'public' ||
            projectRoot?.data.visibility === 'public' ||
            projectRoot?.data.visibility === 'core' ||
            (isEditorRoute && (currentRoute.source === 'public' || currentRoute.source === 'version'))
        )
    );
    const canAdminDeleteSupabaseWorkflow = Boolean(isAdmin && isSupabasePublicWorkflow && supabaseWorkflowId);
    const canDeleteWorkflow =
        canAdminDeleteSupabaseWorkflow ||
        (isEditorRoute && currentRoute.source === 'draft' && Boolean(currentRoute.id)) ||
        Boolean(activeFileId);
    const selectedPublishChange = getPublishChangeOption(publishChangeType);

    const onDragStart = (event: React.DragEvent, nodeType: string, templateId?: string) => {
        const payload = templateId ? JSON.stringify({ type: nodeType, templateId }) : nodeType;
        event.dataTransfer.setData('application/reactflow', payload);
        event.dataTransfer.effectAllowed = 'move';
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

    const dispatchPublishEvent = (detail?: {
        changeType?: WorkflowChangeType;
        updatePolicy?: 'none' | 'manual' | 'auto';
        updateSummary?: string;
        warningMessage?: string;
    }) => {
        if (!projectRoot) return;
        const eventName = hasBuilderDraft ? 'publish-project-template' : 'publish-project-workflow';
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: {
                projectNodeId: projectRoot.id,
                ...detail,
            },
        }));
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
        if (hasPublishedTemplate) {
            setPublishChangeType((projectRoot.data.changeType as WorkflowChangeType | undefined) ?? 'feature');
            setPublishUpdateSummary(typeof projectRoot.data.updateSummary === 'string' ? projectRoot.data.updateSummary : '');
            setPublishDialogOpen(true);
            return;
        }
        dispatchPublishEvent();
    };

    const handleConfirmPublishUpdate = () => {
        const option = getPublishChangeOption(publishChangeType);
        dispatchPublishEvent({
            changeType: option.value,
            updatePolicy: option.updatePolicy,
            updateSummary: publishUpdateSummary.trim() || undefined,
            warningMessage: option.warningMessage,
        });
        setPublishDialogOpen(false);
    };

    const publishUpdateDialog = publishDialogOpen ? (
        <div className="publish-update-dialog-popover" role="presentation">
            <div className="publish-update-dialog" role="dialog" aria-modal="false" aria-label="更新發布設定">
                <div className="publish-update-dialog-header">
                    <div>
                        <strong>{hasBuilderDraft ? '更新節點' : '更新工作流'}</strong>
                        <p>選擇這次更新的性質，並補一段給審核者與使用者看的說明。</p>
                    </div>
                    <button
                        type="button"
                        className="publish-update-close"
                        onClick={() => setPublishDialogOpen(false)}
                        aria-label="關閉"
                    >
                        <Icons.Clear size={14} />
                    </button>
                </div>
                <div className="publish-change-options">
                    {PUBLISH_CHANGE_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            className={`publish-change-option ${publishChangeType === option.value ? 'active' : ''}`}
                            onClick={() => setPublishChangeType(option.value)}
                        >
                            <span>{option.label}</span>
                            <small>{option.description}</small>
                        </button>
                    ))}
                </div>
                <label className="publish-update-summary">
                    <span>更新說明</span>
                    <textarea
                        value={publishUpdateSummary}
                        onChange={(event) => setPublishUpdateSummary(event.target.value)}
                        placeholder="例如：修正輸出在空輸入時的錯誤，並保留原本的輸入/輸出介面。"
                    />
                </label>
                <div className="publish-update-policy-note">
                    更新政策：{selectedPublishChange.updatePolicy === 'none' ? '不推送更新' : selectedPublishChange.updatePolicy === 'auto' ? '可自動更新' : '手動更新'}
                    {selectedPublishChange.warningMessage ? ` · 舊版本會顯示警告` : ''}
                </div>
                <div className="publish-update-actions">
                    <button type="button" className="sidebar-btn" onClick={() => setPublishDialogOpen(false)}>
                        取消
                    </button>
                    <button type="button" className="sidebar-btn publish" onClick={handleConfirmPublishUpdate} disabled={isSyncing}>
                        <Icons.Package /> 確認更新
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    React.useEffect(() => {
        if (!supabaseWorkflowId || !projectRoot?.data.readOnlyPreview) {
            setPublicWorkflowLike({ liked: false, likeCount: 0, isPending: false });
            return;
        }

        let cancelled = false;
        Promise.all([
            getWorkflowEngagement([supabaseWorkflowId]),
            user ? getMyWorkflowInteractions([supabaseWorkflowId]) : Promise.resolve(new Map()),
        ])
            .then(([engagement, mine]) => {
                if (cancelled) return;
                setPublicWorkflowLike({
                    liked: mine.get(supabaseWorkflowId)?.liked ?? false,
                    likeCount: engagement.get(supabaseWorkflowId)?.likeCount ?? 0,
                    isPending: false,
                });
            })
            .catch((error) => {
                if (!cancelled) console.warn('[sidebar] failed to load public workflow like state:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [projectRoot?.data.readOnlyPreview, supabaseWorkflowId, user]);

    const handleTogglePublicWorkflowLike = async () => {
        if (!supabaseWorkflowId || publicWorkflowLike.isPending) return;
        if (!user) {
            alert('先登入才能按讚。');
            return;
        }

        const nextLiked = !publicWorkflowLike.liked;
        setPublicWorkflowLike(current => ({
            liked: nextLiked,
            likeCount: nextLiked ? current.likeCount + 1 : Math.max(0, current.likeCount - 1),
            isPending: true,
        }));

        try {
            await setWorkflowInteraction(supabaseWorkflowId, 'like', nextLiked);
        } catch (error) {
            console.error('[sidebar] failed to toggle workflow like:', error);
            setPublicWorkflowLike(current => ({
                liked: !nextLiked,
                likeCount: nextLiked ? Math.max(0, current.likeCount - 1) : current.likeCount + 1,
                isPending: false,
            }));
            alert('更新 Like 失敗。');
            return;
        }

        setPublicWorkflowLike(current => ({ ...current, isPending: false }));
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
        if (!user || !supabaseWorkflowId) return;

        let cancelled = false;
        getUserRole(user.id, user.role)
            .then((role) => {
                if (cancelled || role === user.role) return;
                setUser({ ...user, role });
            })
            .catch((error) => {
                console.warn('[sidebar] failed to refresh user role for public workflow actions:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [setUser, supabaseWorkflowId, user]);

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
        if (isSupabasePublicWorkflow && !canAdminDeleteSupabaseWorkflow) {
            alert('公開 workflow 只有 admin 可以直接刪除。');
            return;
        }

        const workflowName = String(projectRoot?.data.label || 'Untitled Workflow');
        const confirmMessage = canAdminDeleteSupabaseWorkflow
            ? `Admin 確定要刪除公開 workflow「${workflowName}」嗎？這會從社群列表移除，且不能復原。`
            : `確定要刪除 workflow「${workflowName}」嗎？這個動作不能復原。`;
        if (!window.confirm(confirmMessage)) return;

        try {
            if (canAdminDeleteSupabaseWorkflow && supabaseWorkflowId) {
                await adminDeletePublicWorkflowInSupabase(supabaseWorkflowId);
                window.dispatchEvent(new CustomEvent('methmetica:public-workflows-changed', {
                    detail: { workflowId: supabaseWorkflowId, action: 'deleted' },
                }));
            } else if (isEditorRoute && currentRoute.source === 'draft' && currentRoute.id) {
                deleteLocalDraft(currentRoute.id);
            } else if (activeFileId) {
                await driveService.deleteWorkflow(activeFileId);
                setActiveFileId(null);
            } else {
                alert('目前這個 workflow 還沒有可刪除的儲存來源。你可以使用清空畫布。');
                return;
            }

            setGraph([], []);
            setActiveFileId(null);
            setCurrentView('home');
            pushRoute({ view: 'home' });
            if (canAdminDeleteSupabaseWorkflow) {
                alert(`已刪除公開 workflow「${workflowName}」。`);
            }
        } catch (err) {
            console.error('Failed to delete workflow', err);
            alert(getDisplayErrorMessage(err, '刪除 workflow 失敗。'));
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
                    {canLikePublicWorkflow && (
                        <button
                            className={`sidebar-btn like ${publicWorkflowLike.liked ? 'active' : ''}`}
                            onClick={handleTogglePublicWorkflowLike}
                            disabled={publicWorkflowLike.isPending}
                            title={publicWorkflowLike.liked ? '取消讚' : 'Like 這個公開 workflow'}
                        >
                            <Icons.Heart /> {publicWorkflowLike.liked ? 'Liked' : 'Like'} · {publicWorkflowLike.likeCount}
                        </button>
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
                                    {workflowVersions.map(version => {
                                        const hasHoverDetails = Boolean(version.warningMessage);
                                        return (
                                            <button
                                                key={version.id}
                                                className={`workflow-version-item ${version.id === activeWorkflowVersionId ? 'active' : ''} ${version.warningMessage ? 'has-warning' : ''}`}
                                            onClick={() => handleOpenVersion(version)}
                                            disabled={isSyncing}
                                            title={version.warningMessage || version.updateSummary || `Open v${version.version}`}
                                            onMouseEnter={(event) => {
                                                if (!hasHoverDetails) return;
                                                const rect = event.currentTarget.getBoundingClientRect();
                                                setVersionHoverCard({
                                                    x: rect.right + 14,
                                                    y: rect.top + rect.height / 2,
                                                    warningMessage: version.warningMessage,
                                                    updateSummary: version.updateSummary,
                                                });
                                            }}
                                            onMouseLeave={() => setVersionHoverCard(null)}
                                            onFocus={(event) => {
                                                if (!hasHoverDetails) return;
                                                const rect = event.currentTarget.getBoundingClientRect();
                                                setVersionHoverCard({
                                                    x: rect.right + 14,
                                                    y: rect.top + rect.height / 2,
                                                    warningMessage: version.warningMessage,
                                                    updateSummary: version.updateSummary,
                                                });
                                            }}
                                            onBlur={() => setVersionHoverCard(null)}
                                        >
                                            <span className="workflow-version-row">
                                                <strong>v{version.version}</strong>
                                                    {version.isCurrent && <em>current</em>}
                                                    {version.changeType && (
                                                        <em>{VERSION_CHANGE_LABELS[version.changeType] ?? version.changeType}</em>
                                                )}
                                                <small>{new Date(version.publishedAt).toLocaleDateString()}</small>
                                            </span>
                                        </button>
                                    );
                                })}
                                </div>
                            )}
                        </div>
                    )}
                    <button
                        className="sidebar-btn danger"
                        onClick={handleDeleteCurrentWorkflow}
                        disabled={!canDeleteWorkflow}
                        title={
                            canAdminDeleteSupabaseWorkflow
                                ? 'Admin 刪除這個公開 workflow'
                                : isSupabasePublicWorkflow
                                    ? '公開 workflow 只有 admin 可以直接刪除'
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

            {versionHoverCard && (
                <div
                    className="workflow-version-floating-card"
                    style={{
                        left: versionHoverCard.x,
                        top: versionHoverCard.y,
                    }}
                >
                    {versionHoverCard.warningMessage && (
                        <span className="workflow-version-hover-warning">
                            警告：{versionHoverCard.warningMessage}
                        </span>
                    )}
                    {versionHoverCard.updateSummary && (
                        <span>{versionHoverCard.updateSummary}</span>
                    )}
                </div>
            )}

            {publishUpdateDialog}

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
                .library-item .library-review-badge {
                    color: #fbbf24;
                    border: 1px solid rgba(251, 191, 36, 0.35);
                    border-radius: 6px;
                    padding: 2px 5px;
                    background: rgba(251, 191, 36, 0.08);
                    font-size: 0.58rem;
                    line-height: 1;
                }
                .library-item:hover .library-review-badge {
                    color: #fbbf24;
                }
                .library-item .library-review-badge.update.feature {
                    color: #93c5fd;
                    border-color: rgba(96, 165, 250, 0.35);
                    background: rgba(96, 165, 250, 0.08);
                }
                .library-item .library-review-badge.update.fix {
                    color: #fbbf24;
                }
                .library-item .library-review-badge.update.hotfix {
                    color: #fecaca;
                    border-color: rgba(248, 113, 113, 0.4);
                    background: rgba(248, 113, 113, 0.1);
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
                .sidebar-btn.like {
                    justify-content: center;
                    border-color: rgba(248, 113, 113, 0.28);
                    background: rgba(248, 113, 113, 0.08);
                    color: #fca5a5;
                }
                .sidebar-btn.like.active {
                    border-color: rgba(248, 113, 113, 0.55);
                    background: rgba(248, 113, 113, 0.16);
                    color: #fecaca;
                }
                .sidebar-btn.like:hover:not(:disabled) {
                    border-color: #f87171;
                    background: rgba(248, 113, 113, 0.18);
                    color: #fff;
                }
                .publish-failure-inline {
                    margin-top: -2px;
                    padding: 0 2px;
                    color: #f87171;
                    font-size: 0.7rem;
                    line-height: 1.35;
                }
                .publish-update-dialog-popover {
                    position: fixed;
                    left: 210px;
                    top: 96px;
                    z-index: 10001;
                    width: min(460px, calc(100vw - 230px));
                    pointer-events: none;
                }
                .publish-update-dialog {
                    width: 100%;
                    display: grid;
                    gap: 14px;
                    padding: 18px;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 14px;
                    background: var(--bg-sidebar);
                    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
                    pointer-events: auto;
                }
                .publish-update-dialog-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 14px;
                }
                .publish-update-dialog-header strong {
                    color: var(--text-main);
                    font-size: 0.98rem;
                }
                .publish-update-dialog-header p,
                .publish-update-policy-note {
                    margin: 4px 0 0;
                    color: var(--text-sub);
                    font-size: 0.74rem;
                    line-height: 1.45;
                }
                .publish-update-close {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    border: 1px solid var(--border-node);
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.04);
                    color: var(--text-sub);
                    cursor: pointer;
                }
                .publish-change-options {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                }
                .publish-change-option {
                    display: grid;
                    gap: 4px;
                    padding: 10px;
                    border: 1px solid var(--border-node);
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.04);
                    color: var(--text-main);
                    text-align: left;
                    cursor: pointer;
                }
                .publish-change-option.active {
                    border-color: var(--accent);
                    background: var(--accent-light);
                }
                .publish-change-option span {
                    font-size: 0.78rem;
                    font-weight: 800;
                }
                .publish-change-option small {
                    color: var(--text-sub);
                    font-size: 0.68rem;
                    line-height: 1.35;
                }
                .publish-update-summary {
                    display: grid;
                    gap: 7px;
                    color: var(--text-main);
                    font-size: 0.74rem;
                    font-weight: 700;
                }
                .publish-update-summary textarea {
                    min-height: 92px;
                    resize: vertical;
                    border: 1px solid var(--border-node);
                    border-radius: 10px;
                    padding: 10px;
                    background: rgba(0, 0, 0, 0.18);
                    color: var(--text-main);
                    font: inherit;
                    font-weight: 500;
                    outline: none;
                }
                .publish-update-summary textarea:focus {
                    border-color: var(--accent);
                }
                .publish-update-actions {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                }
                @media (max-width: 760px) {
                    .publish-update-dialog-popover {
                        left: 16px;
                        right: 16px;
                        top: 76px;
                        width: auto;
                    }
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
                    overflow: visible;
                }
                .workflow-version-item {
                    position: relative;
                    display: block;
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
                .workflow-version-item.has-warning {
                    border-color: rgba(245, 158, 11, 0.38);
                    background: rgba(245, 158, 11, 0.08);
                }
                .workflow-version-row {
                    display: flex;
                    align-items: center;
                    min-width: 0;
                    gap: 6px;
                    font-size: 0.76rem;
                    font-weight: 700;
                }
                .workflow-version-row strong {
                    color: var(--text-main);
                    font-size: 0.76rem;
                    font-weight: 800;
                }
                .workflow-version-item em {
                    color: var(--accent-bright);
                    font-size: 0.64rem;
                    font-style: normal;
                    font-weight: 700;
                }
                .workflow-version-row small {
                    margin-left: auto;
                    color: var(--text-sub);
                    font-size: 0.64rem;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .workflow-version-floating-card {
                    position: fixed;
                    z-index: 10002;
                    width: 240px;
                    transform: translateY(-50%);
                    display: grid;
                    gap: 6px;
                    padding: 10px 11px;
                    border: 1px solid rgba(148, 163, 184, 0.24);
                    border-radius: 10px;
                    background: rgba(15, 23, 42, 0.96);
                    color: var(--text-main);
                    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.36);
                    backdrop-filter: blur(12px);
                    pointer-events: none;
                    white-space: normal;
                    font-size: 0.68rem;
                    font-weight: 600;
                    line-height: 1.45;
                }
                .workflow-version-hover-warning {
                    color: #fbbf24;
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
