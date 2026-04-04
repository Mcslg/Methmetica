import React, { useRef } from 'react';
import useStore, { createGraphSignature } from '../store/useStore';
import { NodeLibrary } from './NodeLibrary';
import { Icons } from './Icons';
import TitleLogo from '../assets/Title.svg';
import TitleDarkLogo from '../assets/Title_dark.svg';
import { useLanguage } from '../contexts/LanguageContext';
import * as driveService from '../utils/googleDriveService';

export function Sidebar() {
    const { t, language, setLanguage } = useLanguage();
    const { 
        nodes, edges, setGraph, theme, setTheme, isSidebarOpen, setSidebarOpen, 
        isDeletingHover, isPaletteFloating, setPaletteFloating, setCurrentView,
        user, driveConnected, activeFileId, setActiveFileId, savedGraphSignature, markCurrentGraphSaved
    } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [holdProgress, setHoldProgress] = React.useState(0);
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
    const holdTimerRef = useRef<any>(null);
    const isDirty = createGraphSignature(nodes, edges) !== savedGraphSignature;

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
                } else {
                    alert(t('common.invalid_file') || 'Invalid project file format.');
                }
            } catch (err) {
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
                    clearInterval(holdTimerRef.current);
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

    const handleBackToHome = () => {
        if (isDirty) {
            const shouldLeave = window.confirm(
                t('common.unsaved_warning') || 'You have unsaved changes. Exit to Dashboard?'
            );
            if (!shouldLeave) return;
        }
        setCurrentView('home');
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
                    {isDirty && (
                        <div className="sidebar-unsaved-hint">
                            <Icons.Comment />
                            <span>Unsaved changes</span>
                        </div>
                    )}
                    <button className="sidebar-btn" onClick={handleSave}>
                        <Icons.Save /> {t('sidebar.save_export')}
                    </button>
                    <button className="sidebar-btn" onClick={() => fileInputRef.current?.click()}>
                        <Icons.Load /> {t('sidebar.load_import')}
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

                <div className="sidebar-section">
                    <label>{t('sidebar.system')}</label>
                    <div className="stat-row">
                        <span>{t('sidebar.nodes_count')}:</span>
                        <span>{nodes.length}</span>
                    </div>
                    <div className="stat-row">
                        <span>{t('sidebar.edges_count')}:</span>
                        <span>{edges.length}</span>
                    </div>
                    <button className="sidebar-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ marginTop: '8px' }}>
                        {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
                        {theme === 'dark' ? t('sidebar.theme_toggle_light') || 'Light Mode' : t('sidebar.theme_toggle_dark') || 'Dark Mode'}
                    </button>
                    <button className="sidebar-btn" onClick={() => setLanguage(language === 'en' ? 'zh-TW' : 'en')} style={{ marginTop: '4px' }}>
                        <Icons.Languages />
                        {language === 'en' ? '繁體中文' : 'English'}
                    </button>
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".json"
                    onChange={handleLoad}
                />

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
