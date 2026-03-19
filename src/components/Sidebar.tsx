import React, { useRef } from 'react';
import useStore from '../store/useStore';

export function Sidebar() {
    const { nodes, edges, setGraph } = useStore();
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
        // Reset input
        e.target.value = '';
    };

    const handleClear = () => {
        if (confirm('Are you sure you want to clear the entire workspace?')) {
            setGraph([], []);
        }
    };

    return (
        <div style={{
            position: 'absolute',
            left: '20px',
            top: '20px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'rgba(15, 15, 20, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            color: '#fff',
            minWidth: '200px'
        }}>
            <h2 style={{ 
                margin: '0 0 10px 0', 
                fontSize: '1.2rem', 
                fontWeight: 600,
                background: 'linear-gradient(45deg, #00f2fe, #4facfe)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
            }}>Methmatica</h2>

            <button className="sidebar-btn" onClick={handleSave}>
                <span className="icon">💾</span> Save / Export
            </button>
            <button className="sidebar-btn" onClick={() => fileInputRef.current?.click()}>
                <span className="icon">📂</span> Load / Import
            </button>
            <button className="sidebar-btn danger" onClick={handleClear}>
                <span className="icon">🗑</span> Clear Workspace
            </button>

            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json"
                onChange={handleLoad}
            />

            <style>{`
                .sidebar-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    color: rgba(255, 255, 255, 0.85);
                    cursor: pointer;
                    font-size: 0.9rem;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: left;
                }
                .sidebar-btn:hover {
                    background: rgba(79, 172, 254, 0.15);
                    border-color: rgba(79, 172, 254, 0.4);
                    color: #fff;
                    transform: translateX(4px);
                }
                .sidebar-btn.danger:hover {
                    background: rgba(255, 71, 87, 0.15);
                    border-color: rgba(255, 71, 87, 0.4);
                    color: #ff4757;
                }
                .sidebar-btn .icon {
                    font-size: 1.1rem;
                }
            `}</style>
        </div>
    );
}
