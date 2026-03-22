import React, { useRef } from 'react';
import useStore from '../store/useStore';
import { Icons } from './Icons';

export function Sidebar() {
    const { nodes, edges, setGraph, theme, setTheme } = useStore();
    const [isOpen, setIsOpen] = React.useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        <div className={`sidebar-container ${isOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-drawer">
                <div className="sidebar-header">
                    <h2>methmatica</h2>
                    <p>v0.6.1</p>
                </div>

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
            </div>

            <button className="sidebar-toggle-btn" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? '‹' : '›'}
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
                    transform: translateX(-260px);
                }
                .sidebar-drawer {
                    width: 260px;
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
                .sidebar-header h2 {
                    margin: 0;
                    font-size: 1.4rem;
                    letter-spacing: -0.5px;
                    background: linear-gradient(135deg, #4ade80, #0E2F0B);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    font-weight: 800;
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
                }
                .sidebar-section label {
                    font-size: 0.75rem;
                    color: var(--text-sub);
                    margin-bottom: 4px;
                    font-weight: 600;
                    letter-spacing: 0.01em;
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
            `}</style>
        </div>
    );
}
