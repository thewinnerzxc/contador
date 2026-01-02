'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import AuthDialog from './AuthDialog';
// import Stats from './Stats';
import QuickNotes from './QuickNotes';
import ActivityForm from './ActivityForm';
import ActivityTable from './ActivityTable';
import BulkImport from './BulkImport';
import ExtraTools from './ExtraTools';
import { Activity, ActivityType } from '@/types';
import { nowStr, digitsOnly } from '@/lib/utils';

export default function Dashboard() {
    const [authenticated, setAuthenticated] = useState(false);
    const handleAuth = useCallback(() => setAuthenticated(true), []);

    const [rows, setRows] = useState<Activity[]>([]);
    const [q, setQ] = useState('');
    const [filterState, setFilterState] = useState<'all' | 'pending' | 'done' | 'whatsapp' | 'email'>('all');
    const [sortDesc, setSortDesc] = useState(true);
    const [waToolNum, setWaToolNum] = useState('');

    const [dbUrl, setDbUrl] = useState('');
    const [showConfig, setShowConfig] = useState(false);

    // Initial load of DB Config
    useEffect(() => {
        const stored = localStorage.getItem('ms_neon_url');
        if (stored) {
            setDbUrl(stored);
        } else {
            setShowConfig(true);
        }
    }, []);

    // Fetch Helper
    const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
        const storedUrl = localStorage.getItem('ms_neon_url');
        if (!storedUrl) {
            setShowConfig(true);
            throw new Error('Sin configuración DB');
        }

        const headers = {
            ...options.headers,
            'X-Neon-Url': storedUrl
        };

        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            // BackendRejected likely due to bad connection string or empty
        }
        return res;
    }, []);

    const loadData = useCallback(() => {
        if (!authenticated || !dbUrl) return;
        fetchWithAuth('/api/activities')
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    console.error('Fetch error', data.error);
                    return;
                }
                if (Array.isArray(data)) {
                    const unique = Array.from(new Map(data.map(item => [item.id, item])).values());
                    setRows(unique.sort((a, b) => b.id - a.id));
                }
            })
            .catch(err => console.error(err));
    }, [authenticated, dbUrl, fetchWithAuth]);

    // Load data
    useEffect(() => {
        loadData();
    }, [loadData]);


    const handleSaveConfig = () => {
        if (!dbUrl.trim()) return;
        localStorage.setItem('ms_neon_url', dbUrl.trim());
        setShowConfig(false);
        loadData(); // Trigger reload
    };


    // Derived state: Filtered List
    const filteredRows = useMemo(() => {
        let list = rows;

        if (q.trim()) {
            const lowerQ = q.toLowerCase();
            list = list.filter(r =>
                r.email.toLowerCase().includes(lowerQ) ||
                r.whatsapp.includes(lowerQ) ||
                r.comentario.toLowerCase().includes(lowerQ)
            );
        }

        if (filterState === 'pending') list = list.filter(r => !r.estado);
        else if (filterState === 'done') list = list.filter(r => r.estado);
        else if (filterState === 'whatsapp') list = list.filter(r => r.tipo === 'Resuelta su consulta de WhatsApp');
        else if (filterState === 'email') list = list.filter(r => r.tipo === 'Resuelta consulta de Email');

        return [...list].sort((a, b) => {
            if (sortDesc) return b.id - a.id;
            return a.id - b.id;
        });
    }, [rows, q, filterState, sortDesc]);

    const handleAdd = async (kind: ActivityType, email: string, wa: string, comment: string) => {
        const newActivity = {
            fecha: nowStr(),
            tipo: kind,
            email,
            whatsapp: digitsOnly(wa),
            estado: false,
            comentario: comment
        };
        const tempId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

        const optimistic = { ...newActivity, id: tempId };
        setRows(prev => [optimistic, ...prev]);
        try {
            const res = await fetchWithAuth('/api/activities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newActivity)
            });
            const saved = await res.json();

            if (!res.ok || !saved || !saved.id) {
                console.error('API Error:', saved);
                setRows(prev => prev.filter(r => r.id !== tempId));
                alert('Error al guardar actividad. Verifique configuración DB.');
                return;
            }

            setRows(prev => {
                const exists = prev.some(r => r.id === saved.id && r.id !== tempId);
                if (exists) {
                    return prev.map(r => r.id === tempId ? saved : r);
                }
                return prev.map(r => r.id === tempId ? saved : r);
            });
        } catch (e) {
            console.error(e);
            setRows(prev => prev.filter(r => r.id !== tempId));
            alert('Error de conexión.');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('¿Eliminar?')) return;
        setRows(prev => prev.filter(r => r.id !== id));
        try {
            await fetchWithAuth(`/api/activities?id=${id}`, { method: 'DELETE' });
        } catch (e) { console.error(e); }
    };

    const handleDeleteAll = async () => {
        setRows([]);
        try {
            await fetchWithAuth('/api/activities?mode=all', { method: 'DELETE' });
        } catch (e) { console.error(e); }
    };

    const handleUpdate = async (id: number, updates: Partial<Activity>) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
        try {
            await fetchWithAuth('/api/activities', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...updates })
            });
        } catch (e) { console.error(e); }
    };

    const handleBulkImport = async (newItems: { email: string, whatsapp: string, comentario: string }[]) => {
        const activitiesToAdd = newItems.map(item => ({
            fecha: nowStr(),
            tipo: 'Resuelta su consulta de WhatsApp',
            email: item.email,
            whatsapp: digitsOnly(item.whatsapp),
            estado: true,
            comentario: item.comentario
        }));
        activitiesToAdd.forEach(a => {
            if (a.comentario.toLowerCase().includes('email')) {
                a.tipo = 'Resuelta consulta de Email';
            }
        });

        let successCount = 0;
        for (const act of activitiesToAdd) {
            try {
                const res = await fetchWithAuth('/api/activities', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(act)
                });
                const saved = await res.json();
                if (res.ok && saved.id) {
                    successCount++;
                } else {
                    console.error('Bulk import error', saved);
                }
            } catch (e) { console.error(e); }
        }
        if (successCount > 0) loadData();
        alert(`Importados ${successCount} de ${activitiesToAdd.length}`);
    };

    return (
        <>
            <AuthDialog onAuth={handleAuth} />

            {showConfig && authenticated && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: '#1e1e1e', padding: '2rem', borderRadius: '8px', minWidth: '400px' }}>
                        <h3>Configuración Neon DB</h3>
                        <p style={{ marginBottom: '1rem', color: '#ccc' }}>
                            Ingresa tu String de Conexión (postgres://...)
                        </p>
                        <input
                            type="password"
                            style={{
                                width: '100%', padding: '10px', marginBottom: '1rem',
                                background: '#333', border: '1px solid #444', color: 'white'
                            }}
                            value={dbUrl}
                            onChange={e => setDbUrl(e.target.value)}
                            placeholder="postgres://user:pass@host/db..."
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            {localStorage.getItem('ms_neon_url') && (
                                <button className="btn" onClick={() => setShowConfig(false)}>Cancelar</button>
                            )}
                            <button className="btn" style={{ background: '#0070f3' }} onClick={handleSaveConfig}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {authenticated && (
                <div className="wrap">
                    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h1>MS — Contador de Actividades v2.0</h1>
                        <div className="bar">
                            <button className="btn" onClick={() => setShowConfig(true)}>Config DB</button>
                            <button className="btn" onClick={() => window.location.reload()}>Sincronizar</button>
                            <button className="btn warn" onClick={async () => {
                                if (confirm('¿Reparar IDs de base de datos? (Usar si hay errores al crear)')) {
                                    try {
                                        await fetchWithAuth('/api/activities?fix_sequence=true');
                                        alert('Base de datos reparada.');
                                        loadData();
                                    } catch (e) { alert('Error al reparar'); }
                                }
                            }}>Reparar DB</button>
                            <button className="btn" onClick={() => {
                                const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = 'activities_backup.json';
                                a.click();
                            }}>Descargar (JSON)</button>
                            <button className="btn" onClick={() => { if (confirm('¿Eliminar TODO?')) handleDeleteAll(); }}>Limpiar todo</button>
                            <BulkImport onImport={handleBulkImport} />
                        </div>
                    </header>

                    <div className="layout" style={{ marginTop: '20px' }}>
                        <div className="side-container side">
                            <QuickNotes />
                            <ExtraTools waNum={waToolNum} setWaNum={setWaToolNum} />
                        </div>

                        <div className="main">
                            <h2 className="h2">Registrar actividad</h2>
                            <ActivityForm onAdd={handleAdd} rows={rows} />

                            <h2 className="h2" style={{ marginTop: '30px' }}>Registros</h2>
                            <div className="searchbar">
                                <input
                                    type="text"
                                    placeholder="Buscar... (email, whatsapp, comentario)"
                                    value={q}
                                    onChange={e => setQ(e.target.value)}
                                />
                                <select
                                    className="btn"
                                    value={filterState}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterState(e.target.value as any)}
                                >
                                    <option value="all">Todos</option>
                                    <option value="pending">Pendientes</option>
                                    <option value="done">Completados</option>
                                    <option value="whatsapp">Solo WhatsApp</option>
                                    <option value="email">Solo Email</option>
                                </select>
                                <button className="btn" onClick={() => setQ('')}>Clear</button>
                            </div>

                            <ActivityTable
                                rows={filteredRows}
                                onDelete={handleDelete}
                                onUpdate={handleUpdate}
                                onWaClick={setWaToolNum}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
