'use client';

import { useState, useRef } from 'react';
import { ActivityType } from '@/types';

interface ImportRow {
    email: string;
    whatsapp: string;
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
        // Basic CSV parser logic matching legacy app roughly
        const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const newRows = lines.map(ln => {
            // Simple comma split
            const parts = ln.split(',');
            return {
                email: parts[0] || '',
                whatsapp: parts[1] || '',
                comentario: parts.slice(2).join(',') || ''
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
                    <h3>Importar masivo (Email, WhatsApp, Comentario)</h3>
                    <textarea
                        rows={10}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="email@example.com, 999888777, Comentario..."
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
