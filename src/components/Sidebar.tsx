import React, { useRef } from 'react';
import useStore from '../store/useStore';
import { NodeLibrary } from './NodeLibrary';
import { Icons } from './Icons';
import TitleLogo from '../assets/Title.svg';
import TitleDarkLogo from '../assets/Title_dark.svg';

export function Sidebar() {
    const { nodes, edges, setGraph, theme, setTheme, isSidebarOpen, setSidebarOpen, isDeletingHover, isPaletteFloating, setPaletteFloating } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
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
                    alert('Invalid project file format.');
                }
            } catch (err) {
                alert('Failed to parse project file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleClear = () => {
        if (confirm('Are you sure you want to clear the entire workspace?')) {
            setGraph([], []);
        }
    };

    return (
        <div className={`sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-drawer">
                <div className="sidebar-header">
                    <img
                        src={theme === 'dark' ? TitleDarkLogo : TitleLogo}
                        alt="methmatica"
                        style={{ height: '64px', width: 'auto', marginTop: '6px' }}
                    />
                    <p style={{ marginTop: '4px' }}>v0.8.0</p>
                </div>

                {!isPaletteFloating && (
                    <div className="sidebar-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ marginBottom: 0 }}>Add Nodes <span>(Drag & Drop)</span></label>
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
                    <label>Project</label>
                    <button className="sidebar-btn" onClick={handleSave}>
                        <Icons.Save /> Save / Export
                    </button>
                    <button className="sidebar-btn" onClick={() => fileInputRef.current?.click()}>
                        <Icons.Load /> Load / Import
                    </button>
                    <button className="sidebar-btn danger" onClick={handleClear}>
                        <Icons.Clear /> Clear All
                    </button>
                </div>

                <div className="sidebar-section">
                    <label>System</label>
                    <div className="stat-row">
                        <span>Nodes:</span>
                        <span>{nodes.length}</span>
                    </div>
                    <div className="stat-row">
                        <span>Edges:</span>
                        <span>{edges.length}</span>
                    </div>
                    <button className="sidebar-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ marginTop: '8px' }}>
                        {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
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
                        <span>Drop to Delete</span>
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
                }
                .sidebar-header {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    pointer-events: none;
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
            `}</style>
        </div>
    );
}
