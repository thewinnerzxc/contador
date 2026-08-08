'use client';

import { useState, useRef } from 'react';
import { ActivityType } from '@/types';

interface ImportRow {
    email: string;
    whatsapp: string;
    nickname?: string;
    comentario: string;
}

interface BulkImportProps {
    onImport: (rows: ImportRow[]) => void;
}

export default function BulkImport({ onImport }: BulkImportProps) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const dialogRef = useRef<HTMLDialogElement>(null);

    const handleOpen = () => {
        setOpen(true);
        setTimeout(() => dialogRef.current?.showModal(), 10);
    };

    const handleClose = () => {
        dialogRef.current?.close();
        setOpen(false);
    };

    const processImport = () => {
        const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const newRows = lines.map(ln => {
            const parts = ln.split(',').map(p => p.trim());
            if (parts.length >= 4) {
                return {
                    email: parts[0] || '',
                    whatsapp: parts[1] || '',
                    nickname: parts[2] || '',
                    comentario: parts.slice(3).join(',') || ''
                };
            }
            const isNick = (parts[2] || '').startsWith('@');
            return {
                email: parts[0] || '',
                whatsapp: parts[1] || '',
                nickname: isNick ? parts[2] : '',
                comentario: isNick ? parts.slice(3).join(',') : parts.slice(2).join(',')
            };
        });
        onImport(newRows);
        setText('');
        handleClose();
    };

    return (
        <>
            <button className="btn orange" onClick={handleOpen}>Bulk import</button>

            {open && (
                <dialog ref={dialogRef} className="dialog">
                    <h3>Importar masivo (Email, WhatsApp, Nickname, Comentario)</h3>
                    <textarea
                        rows={10}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="email@example.com, 999888777, @nickname, Comentario..."
                    />
                    <div className="actions-end">
                        <button className="btn" onClick={handleClose}>Cancelar</button>
                        <button className="btn primary" onClick={processImport}>Importar</button>
                    </div>
                </dialog>
            )}
        </>
    );
}
