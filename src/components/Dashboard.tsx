import { useState, useEffect, useMemo, useCallback } from 'react';
import { type Edge } from '@xyflow/react';
import useStore, { type AppNode, type WorkflowListItem } from '../store/useStore';
import { Icons } from './Icons';
import { useLanguage } from '../contexts/LanguageContext';
import * as driveService from '../utils/googleDriveService';
import LogoIcon from '../assets/icon.svg';
import { getCommunityWorkflowBlueprint, publicCommunityWorkflows } from '../community/catalog';
import type { CommunityWorkflowCard, ReviewMetadata } from '../community/types';
import { isSupabaseConfigured } from '../integrations/supabase/client';
import { signInWithGoogle, signOutSupabase } from '../integrations/supabase/auth';
import {
  getWorkflowBlueprintFromSupabase,
  listPublicWorkflows,
} from '../integrations/supabase/workflows';
import { recordWorkflowView, setWorkflowInteraction, type WorkflowInteractionKind } from '../integrations/supabase/workflowInteractions';
import { listPublicNodeTemplates } from '../integrations/supabase/nodeTemplates';
import { pushRoute } from '../utils/navigation';
import {
  createLocalDraft,
  listLocalDrafts,
  loadLocalDraft,
  type LocalDraftSummary,
} from '../utils/localDraftService';

type DashboardTab = 'community' | 'private' | 'contributor';
type CommunityListMode = 'all' | 'likes' | 'bookmarks';
type CommunitySortMode = 'recent' | 'popular';

const annotatePublicWorkflowNodes = (
  nodes: AppNode[],
  meta?: {
    workflowId?: string;
    workflowVersionId?: string;
    workflowVersion?: number;
    ownerId?: string;
    authorName?: string;
  } & ReviewMetadata,
) => nodes.map(node => (
  node.type === 'projectNode'
    ? {
        ...node,
        data: {
          ...node.data,
          workflowSource: 'public' as const,
          readOnlyPreview: true,
          supabaseWorkflowId: meta?.workflowId ?? node.data.supabaseWorkflowId,
          workflowVersionId: meta?.workflowVersionId ?? node.data.workflowVersionId,
          workflowVersion: meta?.workflowVersion ?? node.data.workflowVersion,
          ownerId: meta?.ownerId ?? node.data.ownerId,
          authorName: meta?.authorName ?? node.data.authorName,
          reviewStatus: meta?.reviewStatus ?? node.data.reviewStatus,
          reviewCount: meta?.reviewCount ?? node.data.reviewCount,
          reviewRequired: meta?.reviewRequired ?? node.data.reviewRequired,
          reviewWarning: meta?.reviewWarning ?? node.data.reviewWarning,
          requiredContributorReviews: meta?.requiredContributorReviews ?? node.data.requiredContributorReviews,
          requiredExpertReviews: meta?.requiredExpertReviews ?? node.data.requiredExpertReviews,
          contributorReviewCount: meta?.contributorReviewCount ?? node.data.contributorReviewCount,
          expertReviewCount: meta?.expertReviewCount ?? node.data.expertReviewCount,
          extraContributorReviews: meta?.extraContributorReviews ?? node.data.extraContributorReviews,
          extraExpertReviews: meta?.extraExpertReviews ?? node.data.extraExpertReviews,
          reviewedByMe: meta?.reviewedByMe ?? node.data.reviewedByMe,
        },
      }
    : node
));

export function Dashboard() {
  const { t } = useLanguage();
  const {
    setCurrentView,
    setTheme,
    theme,
    setGraph,
    user,
    authStatus,
    driveConnected,
    setDriveConnected,
    workflowList,
    setWorkflowList,
    isLoadingWorkflows,
    setLoadingWorkflows,
    setActiveFileId,
    setCommunityTemplates,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<DashboardTab>('private');
  const [communityListMode, setCommunityListMode] = useState<CommunityListMode>('all');
  const [communitySortMode, setCommunitySortMode] = useState<CommunitySortMode>('recent');
  const [publicWorkflows, setPublicWorkflows] = useState<CommunityWorkflowCard[]>(publicCommunityWorkflows);
  const [localDrafts, setLocalDrafts] = useState<LocalDraftSummary[]>([]);
  const [isLoadingPublicWorkflows, setIsLoadingPublicWorkflows] = useState(false);
  const [publicWorkflowError, setPublicWorkflowError] = useState<string | null>(null);
  const [pendingInteractions, setPendingInteractions] = useState<Record<string, boolean>>({});
  const canUseContributorArea = Boolean(user && ['contributor', 'expert', 'trusted_editor', 'admin'].includes(user.role));

  useEffect(() => {
    if (!user) {
      setDriveConnected(false);
      setWorkflowList([]);
    }
  }, [setDriveConnected, setWorkflowList, user]);

  const refreshDriveUserInfo = useCallback(async (token: string) => {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await resp.json();
      setDriveConnected(Boolean(userData?.email));
    } catch (err) {
      console.error('Failed to refresh user info', err);
    }
  }, [setDriveConnected]);

  const refreshFiles = useCallback(async () => {
    setLoadingWorkflows(true);
    try {
      const files = await driveService.listWorkflows();
      setWorkflowList(files);
    } catch (err) {
      console.error('Failed to list files', err);
    } finally {
      setLoadingWorkflows(false);
    }
  }, [setLoadingWorkflows, setWorkflowList]);

  useEffect(() => {
    setLocalDrafts(listLocalDrafts());
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadPublicWorkflows() {
      if (!isSupabaseConfigured) {
        setPublicWorkflows(publicCommunityWorkflows);
        setPublicWorkflowError(null);
        return;
      }

      setIsLoadingPublicWorkflows(true);
      setPublicWorkflowError(null);
      try {
        const workflows = await listPublicWorkflows({ includeInteractions: false, limit: 48 });
        if (!isCancelled) {
          setPublicWorkflows(workflows);
          setIsLoadingPublicWorkflows(false);
        }

        const [workflowsWithInteractions, nodeTemplates] = await Promise.all([
          listPublicWorkflows({ includeInteractions: true, limit: 48 }),
          listPublicNodeTemplates(),
        ]);

        if (!isCancelled) {
          setPublicWorkflows(workflowsWithInteractions);
          const currentTemplates = useStore.getState().communityTemplates;
          setCommunityTemplates([
            ...nodeTemplates,
            ...currentTemplates.filter(existing => !nodeTemplates.some(template => template.id === existing.id)),
          ]);
        }
      } catch (err) {
        console.error('Failed to load public workflows', err);
        if (!isCancelled) {
          setPublicWorkflows(publicCommunityWorkflows);
          setPublicWorkflowError(err instanceof Error ? err.message : 'Failed to load public workflows');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPublicWorkflows(false);
        }
      }
    }

    loadPublicWorkflows();

    return () => {
      isCancelled = true;
    };
  }, [setCommunityTemplates]);

  const handleDriveLogin = async (silent: boolean | React.MouseEvent = false) => {
    if (!user) return;
    const isSilent = typeof silent === 'boolean' ? silent : false;
    try {
      await driveService.ensureDriveReady(user.email);
      const token = await driveService.authenticate(isSilent);
      await refreshDriveUserInfo(token);
      setDriveConnected(true);
      await refreshFiles();
    } catch (err) {
      console.error('Drive login failed', err);
    }
  };

  const handleSupabaseLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Supabase login failed', err);
    }
  };

  const handleSupabaseLogout = async () => {
    try {
      await signOutSupabase();
      setDriveConnected(false);
    } catch (err) {
      console.error('Supabase logout failed', err);
    }
  };

  const openBlueprint = async (workflowId: string, workflowCard?: CommunityWorkflowCard) => {
    void recordWorkflowView(workflowId, { surface: 'dashboard' }).catch((error) => {
      console.warn('[dashboard] failed to record workflow view:', error);
    });
    const blueprint =
      (isSupabaseConfigured ? await getWorkflowBlueprintFromSupabase(workflowId) : null) ??
      getCommunityWorkflowBlueprint(workflowId);
    if (!blueprint) return;
    setGraph(
      annotatePublicWorkflowNodes(blueprint.nodes as AppNode[], {
        ...blueprint.meta,
        reviewedByMe: workflowCard?.reviewedByMe ?? blueprint.meta?.reviewedByMe,
      }),
      blueprint.edges as Edge[],
    );
    setActiveFileId(null);
    setCurrentView('editor');
    pushRoute({ view: 'editor', source: 'public', id: workflowId });
  };

  const handleToggleInteraction = async (
    event: React.MouseEvent,
    workflowId: string,
    kind: WorkflowInteractionKind,
    currentlyEnabled: boolean | undefined,
  ) => {
    event.stopPropagation();
    if (!user) {
      alert('先登入才能收藏或按讚。');
      return;
    }

    const nextEnabled = !currentlyEnabled;
    const pendingKey = `${workflowId}:${kind}`;
    const countField = kind === 'like' ? 'likeCount' : kind === 'bookmark' ? 'bookmarkCount' : 'forkCount';
    const flagField = kind === 'like' ? 'liked' : kind === 'bookmark' ? 'bookmarked' : 'forked';

    setPendingInteractions((prev) => ({ ...prev, [pendingKey]: true }));
    setPublicWorkflows((prev) => prev.map((workflow) => {
      if (workflow.id !== workflowId) return workflow;
      const currentCount = workflow[countField] ?? 0;
      const updatedCount = nextEnabled ? currentCount + 1 : Math.max(0, currentCount - 1);
      return {
        ...workflow,
        [flagField]: nextEnabled,
        [countField]: updatedCount,
      };
    }));

    try {
      await setWorkflowInteraction(workflowId, kind, nextEnabled);
    } catch (error) {
      console.error(`[dashboard] failed to toggle ${kind}:`, error);
      setPublicWorkflows((prev) => prev.map((workflow) => {
        if (workflow.id !== workflowId) return workflow;
        const currentCount = workflow[countField] ?? 0;
        const revertedCount = nextEnabled ? Math.max(0, currentCount - 1) : currentCount + 1;
        return {
          ...workflow,
          [flagField]: !nextEnabled,
          [countField]: revertedCount,
        };
      }));
      alert('更新互動狀態失敗，請稍後再試。');
    } finally {
      setPendingInteractions((prev) => {
        const next = { ...prev };
        delete next[pendingKey];
        return next;
      });
    }
  };

  const handleOpenWorkflow = async (file: WorkflowListItem) => {
    try {
      const data = await driveService.loadWorkflow(file.id);
      if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
        setGraph(data.nodes, data.edges);
        setActiveFileId(file.id);
        setCurrentView('editor');
        pushRoute({ view: 'editor', source: 'drive', id: file.id });
      }
    } catch (err) {
      console.error('Failed to open workflow', err);
    }
  };

  const handleCreateNew = () => {
    setGraph([], []);
    setActiveFileId(null);
    setCurrentView('editor');
    const draftId = createLocalDraft();
    setLocalDrafts(listLocalDrafts());
    pushRoute({ view: 'editor', source: 'draft', id: draftId });
  };

  const handleOpenLocalDraft = (draftId: string) => {
    const draft = loadLocalDraft(draftId);
    if (!draft) return;
    setGraph(draft.nodes as AppNode[], draft.edges as Edge[]);
    setActiveFileId(null);
    setCurrentView('editor');
    pushRoute({ view: 'editor', source: 'draft', id: draftId });
  };

  const handleDeleteWorkflow = async (e: React.MouseEvent, fileId: string, fileName: string) => {
    e.stopPropagation();
    if (window.confirm(`${t('common.delete_confirm') || 'Are you sure you want to delete'} "${fileName}"?`)) {
      try {
        await driveService.deleteWorkflow(fileId);
        await refreshFiles();
      } catch (err) {
        console.error('Failed to delete workflow', err);
        alert('Delete failed.');
      }
    }
  };

  const filteredPublicWorkflows = useMemo(() => {
    const keyword = searchQuery.toLowerCase();

    const matchesKeyword = (workflow: CommunityWorkflowCard) =>
      `${workflow.title} ${workflow.summary} ${workflow.tags.join(' ')}`.toLowerCase().includes(keyword);

    const matchesListMode = (workflow: CommunityWorkflowCard) => {
      if (communityListMode === 'likes') return Boolean(workflow.liked);
      if (communityListMode === 'bookmarks') return Boolean(workflow.bookmarked);
      return true;
    };

    const rows = publicWorkflows
      .filter(matchesKeyword)
      .filter(matchesListMode);

    rows.sort((a, b) => {
      if (communitySortMode === 'popular') {
        const scoreA =
          (a.viewCount ?? 0) * 0.05 +
          (a.likeCount ?? 0) * 3 +
          (a.bookmarkCount ?? 0) * 4 +
          (a.forkCount ?? 0) * 5;
        const scoreB =
          (b.viewCount ?? 0) * 0.05 +
          (b.likeCount ?? 0) * 3 +
          (b.bookmarkCount ?? 0) * 4 +
          (b.forkCount ?? 0) * 5;
        return scoreB - scoreA;
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return rows;
  }, [publicWorkflows, searchQuery, communityListMode, communitySortMode]);

  useEffect(() => {
    if (!user && communityListMode !== 'all') {
      setCommunityListMode('all');
    }
  }, [communityListMode, user]);

  useEffect(() => {
    if (!canUseContributorArea && activeTab === 'contributor') {
      setActiveTab('community');
    }
  }, [activeTab, canUseContributorArea]);

  const contributorReviewSections = useMemo(() => {
    const matchesKeyword = (workflow: CommunityWorkflowCard) =>
      `${workflow.title} ${workflow.summary} ${workflow.tags.join(' ')}`.toLowerCase().includes(searchQuery.toLowerCase());
    const pending = publicWorkflows
      .filter(workflow => workflow.reviewStatus === 'unreviewed')
      .filter(matchesKeyword);
    const extraReview = pending.filter(workflow =>
      (workflow.extraContributorReviews ?? 0) > 0 || (workflow.extraExpertReviews ?? 0) > 0
    );

    return [
      {
        id: 'new-review',
        title: '新審核需求',
        description: '一般公開 workflow，審核不是必需，但通過後會移除未驗證感。',
        workflows: pending.filter(workflow => workflow.visibility !== 'core'),
      },
      {
        id: 'core-review',
        title: '新核心審核需求',
        description: '核心 workflow 需要 contributor 與 expert 共同通過後才算穩定。',
        workflows: pending.filter(workflow => workflow.visibility === 'core'),
      },
      {
        id: 'extra-review',
        title: '需額外審核',
        description: '貢獻者已要求更多 contributor 或 expert 參與確認。',
        workflows: extraReview,
      },
    ];
  }, [publicWorkflows, searchQuery]);

  const filteredWorkflows = workflowList.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredLocalDrafts = localDrafts.filter(d =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="dashboard-root">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img src={LogoIcon} alt="Logo" style={{ width: 34, height: 34 }} />
          <div>
            <h1>Methmatica</h1>
            <p>Workflow editor + publishing workspace</p>
          </div>
        </div>

        <div className="dashboard-search">
          <Icons.Search size={18} />
          <input
            type="text"
            placeholder={t('common.search_placeholder') || 'Search workflows...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="dashboard-user">
          <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Icons.Sun size={20} /> : <Icons.Moon size={20} />}
          </button>

          {user ? (
            <div className="user-profile">
              <div className="user-info">
                <span className="user-name">{user.name}</span>
                <span className="user-status">{user.role}</span>
              </div>
              <div className="user-avatar">
                <img
                  src={user.avatarUrl || user.fallbackAvatar}
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f46e5&color=fff&bold=true`;
                  }}
                />
              </div>
              <button className="sidebar-btn auth-logout" onClick={handleSupabaseLogout}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="auth-actions">
              <button className="login-btn" onClick={handleSupabaseLogin} disabled={!isSupabaseConfigured}>
                <Icons.Load size={16} /> {isSupabaseConfigured ? 'Sign in with Google' : 'Set Supabase envs'}
              </button>
              <span className={`auth-hint ${authStatus}`}>{isSupabaseConfigured ? authStatus : 'supabase not configured'}</span>
            </div>
          )}
        </div>
      </header>

      <main className="dashboard-content">
        <div className="dashboard-actions">
          <nav className="dashboard-tabs">
            <button className={activeTab === 'private' ? 'active' : ''} onClick={() => setActiveTab('private')}>
              <Icons.Load /> Private
            </button>
            <button className={activeTab === 'community' ? 'active' : ''} onClick={() => setActiveTab('community')}>
              <Icons.Languages /> Public
            </button>
            {canUseContributorArea && (
              <button className={activeTab === 'contributor' ? 'active' : ''} onClick={() => setActiveTab('contributor')}>
                <Icons.Check /> Review
              </button>
            )}
          </nav>
          <div className="dashboard-action-buttons">
            <button className="new-workflow-btn primary" onClick={handleCreateNew}>
              <span className="plus">+</span> New
            </button>
            {user && driveConnected ? (
              <button className="sidebar-btn compact" onClick={() => refreshFiles()} title="Refresh Drive">
                <Icons.Load /> Refresh
              </button>
            ) : (
              <button className="sidebar-btn compact" onClick={() => handleDriveLogin(false)} disabled={!user} title={user ? 'Connect Drive' : 'Sign in first'}>
                <Icons.Load /> Drive
              </button>
            )}
          </div>
        </div>

        {activeTab === 'community' && (
          <section className="community-panel">
            <div className="community-toolbar">
              <div className="community-list-modes">
                <button className={communityListMode === 'all' ? 'active' : ''} onClick={() => setCommunityListMode('all')}>
                  全部
                </button>
                <button
                  className={communityListMode === 'likes' ? 'active' : ''}
                  onClick={() => setCommunityListMode('likes')}
                  disabled={!user}
                  title={user ? '你按讚過的工作流' : '請先登入'}
                >
                  我的 Likes
                </button>
                <button
                  className={communityListMode === 'bookmarks' ? 'active' : ''}
                  onClick={() => setCommunityListMode('bookmarks')}
                  disabled={!user}
                  title={user ? '你收藏過的工作流' : '請先登入'}
                >
                  我的 Bookmarks
                </button>
              </div>
              <label className="community-sort">
                排序
                <select value={communitySortMode} onChange={(e) => setCommunitySortMode(e.target.value as CommunitySortMode)}>
                  <option value="recent">最新</option>
                  <option value="popular">最熱門</option>
                </select>
              </label>
            </div>
          <div className="section-grid">
            {isLoadingPublicWorkflows && (
              <div className="loading-state" style={{ gridColumn: '1 / -1' }}>
                <div className="spinner"></div>
                <p>Loading public workflows...</p>
              </div>
            )}
            {!isLoadingPublicWorkflows && publicWorkflowError && (
              <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                <Icons.Clear size={42} style={{ opacity: 0.18, marginBottom: 12 }} />
                <h3>Public workflows could not load</h3>
                <p>{publicWorkflowError}</p>
                <p>現在先顯示本地示例資料，你仍然可以繼續操作。</p>
              </div>
            )}
            {!isLoadingPublicWorkflows && filteredPublicWorkflows.length === 0 && !publicWorkflowError && (
              <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                <Icons.Search size={42} style={{ opacity: 0.12, marginBottom: 12 }} />
                <h3>{communityListMode === 'all' ? 'No public workflows yet' : `沒有${communityListMode === 'likes' ? '按讚' : '收藏'}紀錄`}</h3>
                <p>{communityListMode === 'all' ? '第一條公開 workflow 發布後，就會出現在這裡。' : '先在公開工作流按讚或收藏，就會出現在這裡。'}</p>
              </div>
            )}
            {filteredPublicWorkflows.map(workflow => (
              <article key={workflow.id} className="workflow-card" onClick={() => openBlueprint(workflow.id, workflow)}>
                <div className="card-top">
                  <div className="card-icon-box" style={{ background: 'rgba(74, 222, 128, 0.1)', color: 'var(--accent-bright)' }}>
                    <Icons.Languages size={20} />
                  </div>
                  <span className={`status-pill ${workflow.reviewStatus === 'unreviewed' ? 'review' : workflow.visibility}`}>
                    {workflow.reviewStatus === 'unreviewed'
                      ? `review ${workflow.contributorReviewCount ?? workflow.reviewCount ?? 0}/${workflow.requiredContributorReviews ?? 0}${workflow.requiredExpertReviews ? ` + expert ${workflow.expertReviewCount ?? 0}/${workflow.requiredExpertReviews}` : ''}`
                      : workflow.visibility}
                  </span>
                </div>
                {workflow.reviewedByMe && (
                  <span className="reviewed-badge"><Icons.Check size={12} style={{ marginRight: 4 }} />已審核</span>
                )}
                <div className="card-metrics">
                  <span title="Views"><Icons.Eye size={12} style={{ marginRight: 4 }} />{workflow.viewCount ?? 0}</span>
                  <span title="Likes"><Icons.Heart size={12} style={{ marginRight: 4 }} />{workflow.likeCount ?? 0}</span>
                  <span title="Bookmarks"><Icons.Bookmark size={12} style={{ marginRight: 4 }} />{workflow.bookmarkCount ?? 0}</span>
                  <span title="Forks"><Icons.Fork size={12} style={{ marginRight: 4 }} />{workflow.forkCount ?? 0}</span>
                </div>
                <div className="card-body">
                  <h3>{workflow.title}</h3>
                  <p>{workflow.summary}</p>
                  <div className="card-tags">
                    {workflow.tags.map(tag => <span key={tag}>{tag}</span>)}
                  </div>
                </div>
                <div className="card-footer">
                  <span>{workflow.author}</span>
                  <div className="card-footer-actions">
                    <div className="workflow-interactions">
                      <button
                        className={`interaction-btn ${workflow.liked ? 'active' : ''}`}
                        onClick={(e) => handleToggleInteraction(e, workflow.id, 'like', workflow.liked)}
                        disabled={pendingInteractions[`${workflow.id}:like`]}
                        title={workflow.liked ? '取消讚' : '按讚'}
                      >
                        <Icons.Heart size={14} style={{ marginRight: 0 }} />
                        <span>{workflow.likeCount ?? 0}</span>
                      </button>
                      <button
                        className={`interaction-btn ${workflow.bookmarked ? 'active' : ''}`}
                        onClick={(e) => handleToggleInteraction(e, workflow.id, 'bookmark', workflow.bookmarked)}
                        disabled={pendingInteractions[`${workflow.id}:bookmark`]}
                        title={workflow.bookmarked ? '取消收藏' : '收藏'}
                      >
                        <Icons.Bookmark size={14} style={{ marginRight: 0 }} />
                        <span>{workflow.bookmarkCount ?? 0}</span>
                      </button>
                    </div>
                    <button className="card-open-btn icon-open" onClick={(e) => { e.stopPropagation(); openBlueprint(workflow.id, workflow); }} title="Open workflow">
                      <Icons.ExternalLink size={14} style={{ marginRight: 0 }} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          </section>
        )}

        {activeTab === 'contributor' && canUseContributorArea && (
          <section className="contributor-panel">
            <div className="contributor-summary">
              <div>
                <span className="eyebrow">Contributor</span>
                <h2>審核工作台</h2>
                <p>先集中處理未審核、核心與額外審核需求。點卡片會直接開啟 workflow 進行審核。</p>
              </div>
              <div className="review-summary-count">
                <strong>{contributorReviewSections.reduce((sum, section) => sum + section.workflows.length, 0)}</strong>
                <span>pending items</span>
              </div>
            </div>

            {contributorReviewSections.map(section => (
              <section key={section.id} className="review-queue-section">
                <div className="review-queue-header">
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.description}</p>
                  </div>
                  <span>{section.workflows.length}</span>
                </div>
                {section.workflows.length > 0 ? (
                  <div className="section-grid compact-review-grid">
                    {section.workflows.map(workflow => (
                      <article key={`${section.id}-${workflow.id}`} className="workflow-card review-card" onClick={() => openBlueprint(workflow.id, workflow)}>
                        <div className="card-top">
                          <div className="card-icon-box" style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}>
                            <Icons.Check size={20} />
                          </div>
                          <span className={`status-pill ${workflow.visibility === 'core' ? 'core' : 'review'}`}>
                            {workflow.visibility === 'core' ? 'core' : 'review'}
                          </span>
                        </div>
                        {workflow.reviewedByMe && (
                          <span className="reviewed-badge"><Icons.Check size={12} style={{ marginRight: 4 }} />已審核</span>
                        )}
                        <div className="card-body">
                          <h3>{workflow.title}</h3>
                          <p>{workflow.summary}</p>
                        </div>
                        <div className="card-footer">
                          <span>{workflow.author}</span>
                          <span className="review-progress">
                            {workflow.contributorReviewCount ?? workflow.reviewCount ?? 0}/{workflow.requiredContributorReviews ?? 0}
                            {workflow.requiredExpertReviews ? ` · E ${workflow.expertReviewCount ?? 0}/${workflow.requiredExpertReviews}` : ''}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state small">
                    <Icons.Check size={34} style={{ opacity: 0.16, marginBottom: 10 }} />
                    <h3>目前沒有項目</h3>
                    <p>這個隊列清空了，宇宙暫時安靜。</p>
                  </div>
                )}
              </section>
            ))}
          </section>
        )}

        {activeTab === 'private' && (
          <section className="private-panel">
            {filteredLocalDrafts.length > 0 ? (
              <div className="workflow-grid">
                {filteredLocalDrafts.map(draft => (
                  <div key={draft.id} className="workflow-card" onClick={() => handleOpenLocalDraft(draft.id)}>
                    <div className="card-top">
                      <div className="card-icon-box" style={{ background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa' }}>
                        <Icons.Text size={20} />
                      </div>
                    </div>
                    <div className="card-body">
                      <h3>{draft.title}</h3>
                      <p className="card-meta">Updated: {new Date(draft.updatedAt).toLocaleString()}</p>
                    </div>
                    <div className="card-footer">
                      <span className="status-pill">Local</span>
                      <span className="node-count">Ref: {draft.id.slice(0, 12)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Icons.Text size={40} style={{ opacity: 0.15, marginBottom: 12 }} />
                <h3>No local drafts yet</h3>
                <p>點上方 New Workflow 建立第一個本機草稿。</p>
              </div>
            )}

            {isLoadingWorkflows ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Syncing with Google Drive...</p>
              </div>
            ) : !user ? (
              <div className="empty-state">
                <Icons.Load size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                <h3>Sign in and connect Drive to see your workflows</h3>
                <p>Supabase handles identity; Google Drive still stores your private workflow files.</p>
                <button className="sidebar-btn" onClick={handleSupabaseLogin} style={{ width: 'auto', marginTop: 16 }}>
                  Sign in with Google
                </button>
              </div>
            ) : !driveConnected && workflowList.length === 0 ? (
              <div className="empty-state">
                <Icons.ExternalLink size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                <h3>Not connected to Google Drive</h3>
                <p>Your session needs to reconnect. This only takes a moment.</p>
                <button className="new-workflow-btn" onClick={() => handleDriveLogin(false)} style={{ marginTop: 16 }}>
                  Reconnect to Drive
                </button>
              </div>
            ) : (
              <div className="workflow-grid">
                {filteredWorkflows.map(workflow => (
                  <div key={workflow.id} className="workflow-card" onClick={() => handleOpenWorkflow(workflow)}>
                    <div className="card-top">
                      <div className="card-icon-box" style={{ background: 'rgba(74, 222, 128, 0.1)', color: 'var(--accent-bright)' }}>
                        <Icons.Languages size={20} />
                      </div>
                      <div className="card-actions">
                        <button className="card-action-btn delete" onClick={(e) => handleDeleteWorkflow(e, workflow.id, workflow.name)}>
                          <Icons.Clear size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="card-body">
                      <h3>{workflow.name.replace('.json', '')}</h3>
                      <p className="card-meta">Modified: {new Date(workflow.modifiedTime).toLocaleString()}</p>
                    </div>

                    <div className="card-footer">
                      <span className="status-pill complete">Cloud</span>
                      <span className="node-count">Ref: {workflow.id.slice(0, 8)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <style>{`
        .dashboard-root {
          width: 100vw;
          height: 100vh;
          background: radial-gradient(circle at top left, rgba(74, 222, 128, 0.08), transparent 34%),
            radial-gradient(circle at top right, rgba(96, 165, 250, 0.08), transparent 28%),
            var(--bg-page);
          color: var(--text-main);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: var(--font-main);
        }
        [data-theme='light'] .dashboard-root {
          background:
            radial-gradient(circle at top left, rgba(34, 197, 94, 0.1), transparent 30%),
            radial-gradient(circle at top right, rgba(245, 158, 11, 0.08), transparent 24%),
            linear-gradient(180deg, rgba(255,255,255,0.65), rgba(252,250,242,0.96)),
            var(--bg-page);
        }
        .dashboard-header {
          height: 72px;
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-header);
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(14px);
        }
        [data-theme='light'] .dashboard-header {
          background: rgba(255,255,255,0.72);
          box-shadow: 0 10px 32px rgba(14, 47, 11, 0.06);
        }
        .dashboard-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .dashboard-brand h1 {
          margin: 0;
          font-size: 1.1rem;
        }
        .dashboard-brand p {
          margin: 0;
          color: var(--text-sub);
          font-size: 0.8rem;
        }
        .dashboard-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          background: var(--bg-sidebar);
          border: 1px solid var(--border-node);
          min-width: min(420px, 40vw);
        }
        [data-theme='light'] .dashboard-search {
          background: rgba(255,255,255,0.88);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .dashboard-search input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-main);
          font: inherit;
        }
        .dashboard-user {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .auth-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }
        .auth-hint {
          font-size: 0.72rem;
          color: var(--text-sub);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .auth-hint.authenticated {
          color: var(--accent-bright);
        }
        .auth-hint.error {
          color: #fca5a5;
        }
        .theme-toggle,
        .login-btn,
        .card-open-btn,
        .new-workflow-btn,
        .sidebar-btn {
          cursor: pointer;
          border: 1px solid var(--border-node);
          border-radius: 12px;
          padding: 10px 14px;
          background: var(--bg-sidebar);
          color: var(--text-main);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font: inherit;
        }
        [data-theme='light'] .theme-toggle,
        [data-theme='light'] .login-btn,
        [data-theme='light'] .card-open-btn,
        [data-theme='light'] .new-workflow-btn,
        [data-theme='light'] .sidebar-btn {
          background: rgba(255,255,255,0.9);
          box-shadow: 0 8px 18px rgba(14, 47, 11, 0.05);
        }
        .new-workflow-btn.primary {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border-color: rgba(34, 197, 94, 0.7);
          color: white;
          font-weight: 700;
          box-shadow: 0 12px 24px rgba(34, 197, 94, 0.2);
        }
        .new-workflow-btn.primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 28px rgba(34, 197, 94, 0.28);
        }
        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .auth-logout {
          white-space: nowrap;
        }
        .user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        .user-name {
          font-weight: 700;
        }
        .user-status {
          font-size: 0.75rem;
          color: var(--accent-bright);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .user-avatar img {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          object-fit: cover;
          border: 1px solid var(--border-node);
        }
        .dashboard-content {
          flex: 1;
          padding: 24px 32px 32px;
          overflow: auto;
          display: grid;
          gap: 16px;
        }
        .hero-panel {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: stretch;
          padding: 20px 22px;
          background: linear-gradient(135deg, rgba(74, 222, 128, 0.06), rgba(96, 165, 250, 0.04));
          border: 1px solid var(--border-node);
          border-radius: 20px;
          box-shadow: var(--node-shadow);
        }
        [data-theme='light'] .hero-panel {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(245, 158, 11, 0.08) 55%, rgba(255,255,255,0.72));
        }
        .hero-copy {
          max-width: 680px;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.72rem;
          color: var(--accent-bright);
        }
        .hero-copy h2 {
          margin: 8px 0 10px;
          font-size: clamp(1.2rem, 1.8vw, 1.9rem);
          line-height: 1.2;
          max-width: 24ch;
        }
        .hero-copy p {
          margin: 0;
          color: var(--text-sub);
          max-width: 58ch;
          font-size: 0.92rem;
        }
        .hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(120px, 1fr));
          gap: 10px;
          min-width: 240px;
        }
        .hero-stat {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border-node);
          border-radius: 16px;
          padding: 14px;
          display: grid;
          gap: 6px;
          align-content: start;
        }
        [data-theme='light'] .hero-stat {
          background: rgba(255,255,255,0.7);
        }
        .hero-stat strong {
          font-size: 1.45rem;
          line-height: 1;
        }
        .hero-stat span {
          font-size: 0.72rem;
          color: var(--text-sub);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .supabase-health-panel {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border: 1px solid var(--border-node);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.35);
        }
        [data-theme='light'] .supabase-health-panel {
          background: rgba(255,255,255,0.78);
        }
        .health-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          font-size: 0.72rem;
          color: var(--text-sub);
        }
        .health-chip strong {
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .health-chip.ok strong {
          color: #4ade80;
        }
        .health-chip.warn strong {
          color: #f59e0b;
        }
        .health-message {
          min-width: 240px;
          flex: 1;
          font-size: 0.8rem;
          color: var(--text-sub);
        }
        .dashboard-actions {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
          padding: 10px;
          border: 1px solid var(--border-node);
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
        }
        [data-theme='light'] .dashboard-actions {
          background: rgba(255,255,255,0.72);
        }
        .dashboard-action-buttons {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dashboard-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dashboard-tabs button {
          cursor: pointer;
          border: 1px solid var(--border-node);
          background: var(--bg-sidebar);
          color: var(--text-main);
          border-radius: 10px;
          padding: 8px 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font: inherit;
        }
        .sidebar-btn.compact,
        .new-workflow-btn.primary {
          width: auto;
          min-height: 38px;
          white-space: nowrap;
        }
        .dashboard-tabs button.active {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
        }
        .section-grid,
        .workflow-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }
        .community-panel {
          display: grid;
          gap: 12px;
        }
        .community-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .community-list-modes {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .community-list-modes button {
          cursor: pointer;
          border: 1px solid var(--border-node);
          background: var(--bg-sidebar);
          color: var(--text-sub);
          border-radius: 999px;
          padding: 6px 10px;
          font: inherit;
          font-size: 0.76rem;
        }
        .community-list-modes button.active {
          color: white;
          background: var(--accent);
          border-color: var(--accent);
        }
        .community-list-modes button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .community-sort {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--text-sub);
          font-size: 0.76rem;
        }
        .community-sort select {
          border: 1px solid var(--border-node);
          background: var(--bg-sidebar);
          color: var(--text-main);
          border-radius: 8px;
          padding: 6px 8px;
          font: inherit;
        }
        .workflow-card {
          background: var(--bg-sidebar);
          border: 1px solid var(--border-node);
          border-radius: 14px;
          padding: 18px;
          box-shadow: var(--node-shadow);
          cursor: pointer;
          display: grid;
          gap: 12px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        [data-theme='light'] .workflow-card,
        [data-theme='light'] .private-copy,
        [data-theme='light'] .loading-state,
        [data-theme='light'] .empty-state {
          background: rgba(255,255,255,0.88);
        }
        .workflow-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--node-hover-shadow);
        }
        .card-top,
        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .card-footer-actions,
        .workflow-interactions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .workflow-interactions {
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .interaction-btn {
          cursor: pointer;
          border: 1px solid var(--border-node);
          border-radius: 10px;
          padding: 6px 8px;
          background: rgba(255,255,255,0.03);
          color: var(--text-sub);
          font: inherit;
          font-size: 0.72rem;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          gap: 5px;
        }
        [data-theme='light'] .interaction-btn {
          background: rgba(255,255,255,0.95);
        }
        .interaction-btn.active {
          color: var(--accent-bright);
          border-color: rgba(74, 222, 128, 0.45);
          background: rgba(74, 222, 128, 0.08);
        }
        .interaction-btn:disabled {
          opacity: 0.55;
          cursor: wait;
        }
        .card-icon-box {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .card-body h3 {
          margin: 0 0 6px;
        }
        .card-metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .card-metrics span {
          border: 1px solid var(--border-node);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.68rem;
          color: var(--text-sub);
          background: rgba(255,255,255,0.02);
          display: inline-flex;
          align-items: center;
        }
        .card-body p,
        .card-meta {
          margin: 0;
          color: var(--text-sub);
          line-height: 1.5;
        }
        .card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .card-tags span,
        .status-pill {
          border: 1px solid var(--border-node);
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-sub);
        }
        [data-theme='light'] .status-pill,
        [data-theme='light'] .card-tags span {
          background: rgba(14, 47, 11, 0.04);
        }
        .status-pill.public {
          color: #4ade80;
        }
        .status-pill.core {
          color: #60a5fa;
        }
        .status-pill.review {
          color: #fbbf24;
        }
        .status-pill.complete {
          color: #fbbf24;
        }
        .reviewed-badge {
          justify-self: start;
          display: inline-flex;
          align-items: center;
          width: fit-content;
          border: 1px solid rgba(74, 222, 128, 0.32);
          border-radius: 8px;
          padding: 3px 8px;
          color: var(--accent-bright);
          background: rgba(74, 222, 128, 0.08);
          font-size: 0.68rem;
          font-weight: 700;
        }
        .icon-open {
          width: 34px;
          min-width: 34px;
          height: 34px;
          padding: 0;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .contributor-panel {
          display: grid;
          gap: 18px;
        }
        .contributor-summary,
        .review-queue-section {
          background: var(--bg-sidebar);
          border: 1px solid var(--border-node);
          border-radius: 14px;
          box-shadow: var(--node-shadow);
        }
        [data-theme='light'] .contributor-summary,
        [data-theme='light'] .review-queue-section {
          background: rgba(255,255,255,0.88);
        }
        .contributor-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 20px;
        }
        .contributor-summary h2,
        .review-queue-header h3 {
          margin: 0;
        }
        .contributor-summary p,
        .review-queue-header p {
          margin: 6px 0 0;
          color: var(--text-sub);
        }
        .review-summary-count {
          min-width: 118px;
          border: 1px solid var(--border-node);
          border-radius: 12px;
          padding: 14px;
          text-align: center;
          background: rgba(251, 191, 36, 0.06);
        }
        .review-summary-count strong {
          display: block;
          font-size: 1.7rem;
          line-height: 1;
        }
        .review-summary-count span,
        .review-progress {
          color: var(--text-sub);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .review-queue-section {
          padding: 16px;
          display: grid;
          gap: 14px;
        }
        .review-queue-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: start;
        }
        .review-queue-header > span {
          min-width: 34px;
          height: 34px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(74, 222, 128, 0.1);
          color: var(--accent-bright);
          font-weight: 800;
        }
        .compact-review-grid {
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .review-card {
          box-shadow: none;
          border-radius: 12px;
        }
        .empty-state.small {
          min-height: 150px;
          border-radius: 12px;
        }
        .private-panel {
          display: grid;
          gap: 18px;
        }
        .private-copy {
          background: var(--bg-sidebar);
          border: 1px solid var(--border-node);
          border-radius: 14px;
          padding: 20px;
          box-shadow: var(--node-shadow);
        }
        .private-copy h3 {
          margin: 0 0 8px;
        }
        .private-copy p {
          margin: 0;
          color: var(--text-sub);
        }
        .private-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }
        .loading-state,
        .empty-state {
          min-height: 240px;
          background: var(--bg-sidebar);
          border: 1px dashed var(--border-node);
          border-radius: 14px;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 24px;
        }
        .loading-state p,
        .empty-state p {
          color: var(--text-sub);
        }
        @media (max-width: 960px) {
          .dashboard-header {
            height: auto;
            padding: 16px;
            gap: 12px;
            flex-wrap: wrap;
          }
          .dashboard-search {
            min-width: 100%;
            order: 3;
          }
          .hero-panel {
            flex-direction: column;
          }
          .dashboard-actions {
            align-items: stretch;
          }
          .community-toolbar {
            align-items: flex-start;
          }
          .card-footer {
            flex-direction: column;
            align-items: flex-start;
          }
          .card-footer-actions {
            width: 100%;
            justify-content: space-between;
          }
          .workflow-interactions {
            justify-content: flex-start;
          }
        }
        @media (max-width: 640px) {
          .dashboard-content {
            padding: 16px;
          }
          .hero-stats {
            grid-template-columns: 1fr 1fr;
            min-width: 0;
          }
        }
      `}</style>
    </div>
  );
}
