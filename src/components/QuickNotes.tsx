'use client';

import { useState, useEffect } from 'react';

export default function QuickNotes() {
    const [note, setNote] = useState('');
    const [status, setStatus] = useState('');

    useEffect(() => {
        const neonUrl = localStorage.getItem('ms_neon_url');
        if (!neonUrl) return;

        fetch('/api/notes', { headers: { 'X-Neon-Url': neonUrl } })
            .then(res => res.json())
            .then(data => {
                if (data.content) setNote(data.content);
            })
            .catch(err => console.error(err));
    }, []);

    const save = async (content: string) => {
        setStatus('Guardando...');
        const neonUrl = localStorage.getItem('ms_neon_url');
        if (!neonUrl) {
            setStatus('Error: Sin config DB');
            return;
        }

        try {
            await fetch('/api/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Neon-Url': neonUrl
                },
                body: JSON.stringify({ content })
            });
            setStatus('Guardado en DB ' + new Date().toLocaleTimeString());
        } catch (error) {
            console.error(error);
            setStatus('Error al guardar');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            save(note);
        }
    };

    return (
        <div className="side">
            <div className="card">
                <span className="h2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📄 Notas rápidas
                </span>
                <hr className="sep" />
                <textarea
                    id="quickNotes"
                    placeholder="Escribe aquí tus apuntes..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => save(note)}
                ></textarea>
                <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--muted)', minHeight: '16px' }}>
                    {status}
                </div>
            </div>
        </div>
    );
}
