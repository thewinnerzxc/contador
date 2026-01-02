'use client';

import { useState, useMemo } from 'react';
import { ActivityType, Activity } from '@/types';
import { digitsOnly } from '@/lib/utils';

interface ActivityFormProps {
    onAdd: (kind: ActivityType, email: string, wa: string, comment: string) => void;
    rows: Activity[];
}

export default function ActivityForm({ onAdd, rows }: ActivityFormProps) {
    // Shared State Lifted Up
    const [row1, setRow1] = useState({ email: '', wa: '', comment: '' });
    const [row2, setRow2] = useState({ email: '', wa: '', comment: '' });
    const [btnState1, setBtnState1] = useState('Agregar');
    const [btnState2, setBtnState2] = useState('Agregar');

    // Build autocomplete maps from history
    const { mapEmailToWa, mapWaToEmail } = useMemo(() => {
        const e2w = new Map<string, string>();
        const w2e = new Map<string, string>();
        rows.forEach(r => {
            const e = (r.email || '').trim().toLowerCase();
            const w = digitsOnly(r.whatsapp);
            if (e && w) {
                e2w.set(e, w);
                w2e.set(w, e);
            }
        });
        return { mapEmailToWa: e2w, mapWaToEmail: w2e };
    }, [rows]);

    const handleClearAll = () => {
        if (confirm('¿Limpiar todos los campos de registro?')) {
            setRow1({ email: '', wa: '', comment: '' });
            setRow2({ email: '', wa: '', comment: '' });
        }
    };

    return (
        <div className="actions">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5 }}>
                <button className="btn small" onClick={handleClearAll} title="Limpiar todas las celdas de esta sección">
                    Limpiar todo
                </button>
            </div>

            {/* Row 1: WhatsApp */}
            <div className="row t2">
                <div className="tag">WhatsApp</div>
                <FormRow
                    kind="Resuelta su consulta de WhatsApp"
                    data={row1}
                    setData={setRow1}
                    btnText={btnState1}
                    setBtnText={setBtnState1}
                    onAdd={onAdd}
                    btnColor="btn primary"
                    mapEmailToWa={mapEmailToWa}
                    mapWaToEmail={mapWaToEmail}
                />
            </div>

            {/* Row 2: Email */}
            <div className="row t3">
                <div className="tag">Email</div>
                <FormRow
                    kind="Resuelta consulta de Email"
                    data={row2}
                    setData={setRow2}
                    btnText={btnState2}
                    setBtnText={setBtnState2}
                    onAdd={onAdd}
                    btnColor="btn primary"
                    mapEmailToWa={mapEmailToWa}
                    mapWaToEmail={mapWaToEmail}
                />
            </div>
        </div>
    );
}

// Controlled Sub-component
interface RowData { email: string, wa: string, comment: string }

function FormRow({ kind, data, setData, btnText, setBtnText, onAdd, btnColor, mapEmailToWa, mapWaToEmail }: {
    kind: ActivityType,
    data: RowData,
    setData: (d: RowData) => void,
    btnText: string,
    setBtnText: (s: string) => void,
    onAdd: (kind: ActivityType, email: string, wa: string, comment: string) => void,
    btnColor: string,
    mapEmailToWa: Map<string, string>,
    mapWaToEmail: Map<string, string>
}) {
    const handleSubmit = () => {
        if (!data.email.trim() && !data.wa.trim()) return;
        onAdd(kind, data.email, data.wa, data.comment);
        setBtnText('Agregado');
        setTimeout(() => setBtnText('Agregar'), 1500);
        // DO NOT CLEAR STATE HERE
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSubmit();
    };

    const updateField = (field: keyof RowData, val: string) => {
        const newData = { ...data, [field]: val };

        // Auto-fill logic
        if (field === 'email') {
            const e = val.trim().toLowerCase();
            if (e && !newData.wa && mapEmailToWa.has(e)) {
                newData.wa = mapEmailToWa.get(e)!;
            }
        } else if (field === 'wa') {
            const clean = digitsOnly(val);
            // newData.wa is already set above to raw input, but we might want to store clean? 
            // Input usually shows raw. Let's keep raw in input but check clean for map.
            if (clean && !newData.email && mapWaToEmail.has(clean)) {
                newData.email = mapWaToEmail.get(clean)!;
            }
        }
        setData(newData);
    };

    return (
        <>
            <div className="email">
                <label>Email</label>
                <input
                    type="email"
                    value={data.email}
                    onChange={e => updateField('email', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="email@dominio.com"
                />
            </div>
            <div className="wa">
                <label>WhatsApp</label>
                <input
                    type="text"
                    value={data.wa}
                    onChange={e => updateField('wa', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="+51 999 888 777"
                />
            </div>
            <div className="comment">
                <label>Comentario</label>
                <input
                    type="text"
                    value={data.comment}
                    onChange={e => updateField('comment', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Notas breves (opcional)"
                />
            </div>
            <div className="row-btns">
                <button className={btnColor} onClick={handleSubmit}>{btnText}</button>
                {/* Individual Clear button removed */}
            </div>
        </>
    );
}
