import { useState, useEffect, useMemo } from 'react';
import useStore from '../store/useStore';
import { Icons } from './Icons';
import { useLanguage } from '../contexts/LanguageContext';
import * as driveService from '../utils/googleDriveService';
import LogoIcon from '../assets/icon.svg';
import { getCommunityWorkflowBlueprint, publicCommunityWorkflows } from '../community/catalog';
import type { CommunityWorkflowCard } from '../community/types';
import { isSupabaseConfigured } from '../integrations/supabase/client';
import { signInWithGoogle, signOutSupabase } from '../integrations/supabase/auth';
import { getWorkflowBlueprintFromSupabase, listPublicWorkflows } from '../integrations/supabase/workflows';

type DashboardTab = 'community' | 'private';

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
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<DashboardTab>('private');
  const [publicWorkflows, setPublicWorkflows] = useState<CommunityWorkflowCard[]>(publicCommunityWorkflows);
  const [isLoadingPublicWorkflows, setIsLoadingPublicWorkflows] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await driveService.initGapi();
        await driveService.initGis(user?.email);
      } catch (err) {
        console.error('Failed to initialize Google SDKs', err);
      }
    }
    init();
  }, [user?.email]);

  useEffect(() => {
    let isCancelled = false;

    async function restoreDriveSession() {
      if (!user) {
        setDriveConnected(false);
        setWorkflowList([]);
        return;
      }

      try {
        const token = await driveService.trySilentAuth();
        if (!token || isCancelled) {
          setDriveConnected(false);
          return;
        }

        await refreshDriveUserInfo(token);
        if (isCancelled) return;

        setDriveConnected(true);
        await refreshFiles();
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to restore Drive session', err);
          setDriveConnected(false);
        }
      }
    }

    restoreDriveSession();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPublicWorkflows() {
      if (!isSupabaseConfigured) {
        setPublicWorkflows(publicCommunityWorkflows);
        return;
      }

      setIsLoadingPublicWorkflows(true);
      try {
        const workflows = await listPublicWorkflows();
        if (!isCancelled) {
          setPublicWorkflows(workflows);
        }
      } catch (err) {
        console.error('Failed to load public workflows', err);
        if (!isCancelled) {
          setPublicWorkflows(publicCommunityWorkflows);
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
  }, [authStatus]);

  const refreshDriveUserInfo = async (token: string) => {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await resp.json();
      setDriveConnected(Boolean(userData?.email));
    } catch (err) {
      console.error('Failed to refresh user info', err);
    }
  };

  const handleDriveLogin = async (silent: boolean | React.MouseEvent = false) => {
    if (!user) return;
    const isSilent = typeof silent === 'boolean' ? silent : false;
    try {
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

  const refreshFiles = async () => {
    setLoadingWorkflows(true);
    try {
      const files = await driveService.listWorkflows();
      setWorkflowList(files);
    } catch (err) {
      console.error('Failed to list files', err);
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const openBlueprint = async (workflowId: string) => {
    const blueprint =
      (isSupabaseConfigured ? await getWorkflowBlueprintFromSupabase(workflowId) : null) ??
      getCommunityWorkflowBlueprint(workflowId);
    if (!blueprint) return;
    setGraph(blueprint.nodes as any, blueprint.edges as any);
    setActiveFileId(null);
    setCurrentView('editor');
  };

  const handleOpenWorkflow = async (file: any) => {
    try {
      const data = await driveService.loadWorkflow(file.id);
      if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
        setGraph(data.nodes, data.edges);
        setActiveFileId(file.id);
        setCurrentView('editor');
      }
    } catch (err) {
      console.error('Failed to open workflow', err);
    }
  };

  const handleCreateNew = () => {
    setGraph([], []);
    setActiveFileId(null);
    setCurrentView('editor');
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
    return publicWorkflows.filter(workflow =>
      `${workflow.title} ${workflow.summary} ${workflow.tags.join(' ')}`.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [publicWorkflows, searchQuery]);

  const filteredWorkflows = workflowList.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
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
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Workspace</span>
            <h2>先開始做你的工作流，再決定要不要公開分享。</h2>
            <p>
              私人草稿會保留在 Google Drive，公開工作流則放在社群區探索。
              一條工作流可以直接成為可搜尋的節點。
            </p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{workflowList.length}</strong>
              <span>Private drafts</span>
            </div>
            <div className="hero-stat">
              <strong>{publicWorkflows.length}</strong>
              <span>Public workflows</span>
            </div>
          </div>
        </section>

        <div className="dashboard-actions">
          <button className="new-workflow-btn primary" onClick={handleCreateNew}>
            <span className="plus">+</span> New Workflow
          </button>
          {user && driveConnected ? (
            <button className="sidebar-btn" onClick={() => refreshFiles()}>
              <Icons.Load /> Refresh Drive
            </button>
          ) : (
            <button className="sidebar-btn" onClick={() => handleDriveLogin(false)} disabled={!user}>
              <Icons.Load /> {user ? 'Connect Drive' : 'Sign in first'}
            </button>
          )}
        </div>

        <nav className="dashboard-tabs">
          <button className={activeTab === 'private' ? 'active' : ''} onClick={() => setActiveTab('private')}>
            <Icons.Load /> Private Drive
          </button>
          <button className={activeTab === 'community' ? 'active' : ''} onClick={() => setActiveTab('community')}>
            <Icons.Languages /> Public Workflows
          </button>
        </nav>

        {activeTab === 'community' && (
          <section className="section-grid">
            {isLoadingPublicWorkflows && (
              <div className="loading-state" style={{ gridColumn: '1 / -1' }}>
                <div className="spinner"></div>
                <p>Loading public workflows...</p>
              </div>
            )}
            {filteredPublicWorkflows.map(workflow => (
              <article key={workflow.id} className="workflow-card" onClick={() => openBlueprint(workflow.id)}>
                <div className="card-top">
                  <div className="card-icon-box" style={{ background: 'rgba(74, 222, 128, 0.1)', color: 'var(--accent-bright)' }}>
                    <Icons.Languages size={20} />
                  </div>
                  <span className={`status-pill ${workflow.visibility}`}>{workflow.visibility}</span>
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
                  <button className="card-open-btn" onClick={(e) => { e.stopPropagation(); openBlueprint(workflow.id); }}>
                    Open
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === 'private' && (
          <section className="private-panel">
            <div className="private-copy">
              <h3>Private Drive Workspace</h3>
              <p>
                這裡保留你現有的 Google Drive 流程。公開社群內容先在 Supabase 型的公共資料層中流通，
                私人草稿仍然可以同步回你的帳號。
              </p>
              <div className="private-actions">
                <button className="new-workflow-btn primary" onClick={handleCreateNew}>
                  <span className="plus">+</span> New Workflow
                </button>
                {user && driveConnected ? (
                  <button className="sidebar-btn" onClick={() => refreshFiles()}>
                    <Icons.Load /> Refresh drive
                  </button>
                ) : (
                  <button className="sidebar-btn" onClick={() => handleDriveLogin(false)} disabled={!user}>
                    <Icons.Load /> {user ? 'Connect Drive' : 'Sign in first'}
                  </button>
                )}
              </div>
            </div>

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
        .dashboard-actions {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
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
        .workflow-card {
          background: var(--bg-sidebar);
          border: 1px solid var(--border-node);
          border-radius: 24px;
          padding: 18px;
          box-shadow: var(--node-shadow);
          cursor: pointer;
          display: grid;
          gap: 12px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
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
        .card-icon-box {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .card-body h3 {
          margin: 0 0 6px;
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
        .status-pill.public {
          color: #4ade80;
        }
        .status-pill.core {
          color: #60a5fa;
        }
        .status-pill.complete {
          color: #fbbf24;
        }
        .private-panel {
          display: grid;
          gap: 18px;
        }
        .private-copy {
          background: var(--bg-sidebar);
          border: 1px solid var(--border-node);
          border-radius: 24px;
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
          border-radius: 24px;
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
