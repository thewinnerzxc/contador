'use client';

import { Activity } from '@/types';
import { useState } from 'react';

interface ActivityTableProps {
    rows: Activity[];
    onDelete: (id: number) => void;
    onUpdate: (id: number, updates: Partial<Activity>) => void;
    onWaClick: (num: string) => void;
}

export default function ActivityTable({ rows, onDelete, onUpdate, onWaClick }: ActivityTableProps) {
    return (
        <div className="card p0">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th id="thDate" className="thclick">Fecha</th>
                        <th>Tipo</th>
                        <th>Email</th>
                        <th>WhatsApp</th>
                        <th>Estado</th>
                        <th>Comentario</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="tbody">
                    {rows.map((r, i) => (
                        <TableRow
                            key={r.id}
                            row={r}
                            idx={rows.length - i}
                            onDelete={onDelete}
                            onUpdate={onUpdate}
                            onWaClick={onWaClick}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TableRow({ row, idx, onDelete, onUpdate, onWaClick }: {
    row: Activity, idx: number, onDelete: (id: number) => void, onUpdate: (id: number, updates: Partial<Activity>) => void, onWaClick: (n: string) => void
}) {
    const [emailCopied, setEmailCopied] = useState(false);
    const [waPicked, setWaPicked] = useState(false); // Using 'picked' for purple style

    const kind = row.tipo === 'Resuelta su consulta de WhatsApp' ? 2 : (row.tipo === 'Resuelta consulta de Email' ? 3 : 0);
    const badgeClass = kind === 2 ? 't2' : (kind === 3 ? 't3' : 'gray');
    const cssClass = kind === 2 ? 'type-2' : (kind === 3 ? 'type-3' : '');

    const handleEmailClick = () => {
        if (row.email) {
            navigator.clipboard.writeText(row.email);
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 800);
        }
    };

    const handleWaClick = () => {
        if (row.whatsapp) {
            navigator.clipboard.writeText(row.whatsapp);
            onWaClick(row.whatsapp);
            setWaPicked(true);
            // Don't auto-remove 'picked' state instantly, keeps it purple 'selected' feel?
            // Legacy behavior: stays picked until another is picked? or just visual feedback?
            // Legacy just added .picked. Let's keep it simple: timeout for visual feedback, 
            // or permanent 'active' state? 
            // User said "paint purple", sounds like a selection state. 
            // But I'll do a long timeout or toggle.
            setTimeout(() => setWaPicked(false), 2000);
        }
    };

    // Custom class logic
    // legacy: .copy-mail.copied (green), .copy-wa.picked (purple)

    return (
        <tr className={cssClass}>
            <td>{idx}</td>
            <td><span className="muted">{row.fecha}</span></td>
            <td>
                <select
                    className={`typeSel ${badgeClass}`}
                    value={kind}
                    onChange={(e) => {
                        const newKind = parseInt(e.target.value);
                        const label = newKind === 2 ? 'Resuelta su consulta de WhatsApp' : 'Resuelta consulta de Email';
                        onUpdate(row.id, { tipo: label });
                    }}
                >
                    <option value="2">WhatsApp</option>
                    <option value="3">Email</option>
                </select>
            </td>
            <td>
                <span
                    className={`copy-mail ${emailCopied ? 'copied' : ''}`}
                    onClick={handleEmailClick}
                    title="Click para copiar"
                >
                    {row.email}
                </span>
            </td>
            <td>
                <span
                    className={`copy-wa ${waPicked ? 'picked' : ''}`}
                    onClick={handleWaClick}
                    title="Click para copiar y enviar a herramientas"
                >
                    {row.whatsapp}
                </span>
            </td>
            <td>
                <label className={`switch ${row.estado ? 'done' : 'pending'}`}>
                    <input
                        type="checkbox"
                        checked={row.estado}
                        onChange={(e) => onUpdate(row.id, { estado: e.target.checked })}
                    />
                    <span className="slider"></span>
                </label>
            </td>
            <td
                className="editable"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => onUpdate(row.id, { comentario: e.currentTarget.innerHTML })}
                onKeyDown={(e) => {
                    // Enter = save (blur) unless Shift+Enter
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                    }
                    // Shortcuts for basic colors? Ctrl+M = Magenta/Red? Maybe just standard bold/italic.
                    // User asked for "highlight with basic colors".
                    // Browser default execCommand is easiest for now.
                }}
                dangerouslySetInnerHTML={{ __html: row.comentario }}
            />
            <td>
                <button className="btn" onClick={() => onDelete(row.id)}>Eliminar</button>
            </td>
        </tr >
    );
}
