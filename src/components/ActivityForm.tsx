'use client';

import { useState, useMemo } from 'react';
import { ActivityType, Activity } from '@/types';
import { digitsOnly } from '@/lib/utils';

interface ActivityFormProps {
    onAdd: (kind: ActivityType, email: string, wa: string, comment: string, nickname?: string) => void;
    rows: Activity[];
}

export default function ActivityForm({ onAdd, rows }: ActivityFormProps) {
    // Shared State Lifted Up
    const [row1, setRow1] = useState({ email: '', wa: '', nickname: '', comment: '' });
    const [row2, setRow2] = useState({ email: '', wa: '', nickname: '', comment: '' });
    const [btnState1, setBtnState1] = useState('Agregar');
    const [btnState2, setBtnState2] = useState('Agregar');

    // Build autocomplete maps from history
    const { mapEmailToWa, mapWaToEmail, mapEmailToNick, mapWaToNick, mapNickToContact } = useMemo(() => {
        const e2w = new Map<string, string>();
        const w2e = new Map<string, string>();
        const e2n = new Map<string, string>();
        const w2n = new Map<string, string>();
        const n2c = new Map<string, { email: string, whatsapp: string, nickname: string }>();

        rows.forEach(r => {
            const e = (r.email || '').trim().toLowerCase();
            const w = digitsOnly(r.whatsapp);
            const nKey = (r.nickname || '').trim().toLowerCase().replace(/^@/, '');
            const nOrig = (r.nickname || '').trim();

            if (e && w) {
                if (!e2w.has(e)) e2w.set(e, w);
                if (!w2e.has(w)) w2e.set(w, e);
            }
            if (e && nOrig && !e2n.has(e)) e2n.set(e, nOrig);
            if (w && nOrig && !w2n.has(w)) w2n.set(w, nOrig);

            if (nKey) {
                if (!n2c.has(nKey)) {
                    n2c.set(nKey, { email: r.email || '', whatsapp: w || '', nickname: nOrig });
                } else {
                    const existing = n2c.get(nKey)!;
                    if (!existing.email && r.email) existing.email = r.email;
                    if (!existing.whatsapp && w) existing.whatsapp = w;
                }
            }
        });
        return { mapEmailToWa: e2w, mapWaToEmail: w2e, mapEmailToNick: e2n, mapWaToNick: w2n, mapNickToContact: n2c };
    }, [rows]);

    const handleClearAll = () => {
        if (confirm('¿Limpiar todos los campos de registro?')) {
            setRow1({ email: '', wa: '', nickname: '', comment: '' });
            setRow2({ email: '', wa: '', nickname: '', comment: '' });
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
                <div className="tag">1) WhatsApp</div>
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
                    mapEmailToNick={mapEmailToNick}
                    mapWaToNick={mapWaToNick}
                    mapNickToContact={mapNickToContact}
                />
            </div>

            {/* Row 2: Email */}
            <div className="row t3">
                <div className="tag">2) Email</div>
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
                    mapEmailToNick={mapEmailToNick}
                    mapWaToNick={mapWaToNick}
                    mapNickToContact={mapNickToContact}
                />
            </div>
        </div>
    );
}

// Controlled Sub-component
interface RowData { email: string, wa: string, nickname: string, comment: string }

function FormRow({ kind, data, setData, btnText, setBtnText, onAdd, btnColor, mapEmailToWa, mapWaToEmail, mapEmailToNick, mapWaToNick, mapNickToContact }: {
    kind: ActivityType,
    data: RowData,
    setData: (d: RowData) => void,
    btnText: string,
    setBtnText: (s: string) => void,
    onAdd: (kind: ActivityType, email: string, wa: string, comment: string, nickname?: string) => void,
    btnColor: string,
    mapEmailToWa: Map<string, string>,
    mapWaToEmail: Map<string, string>,
    mapEmailToNick: Map<string, string>,
    mapWaToNick: Map<string, string>,
    mapNickToContact: Map<string, { email: string, whatsapp: string, nickname: string }>
}) {
    const handleSubmit = () => {
        if (!data.email.trim() && !data.wa.trim() && !data.nickname.trim()) return;
        onAdd(kind, data.email, data.wa, data.comment, data.nickname);
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
            if (e) {
                if (!newData.wa && mapEmailToWa.has(e)) newData.wa = mapEmailToWa.get(e)!;
                if (!newData.nickname && mapEmailToNick.has(e)) newData.nickname = mapEmailToNick.get(e)!;
            }
        } else if (field === 'wa') {
            const clean = digitsOnly(val);
            if (clean) {
                if (!newData.email && mapWaToEmail.has(clean)) newData.email = mapWaToEmail.get(clean)!;
                if (!newData.nickname && mapWaToNick.has(clean)) newData.nickname = mapWaToNick.get(clean)!;
            }
        } else if (field === 'nickname') {
            const nKey = val.trim().toLowerCase().replace(/^@/, '');
            if (nKey && mapNickToContact.has(nKey)) {
                const c = mapNickToContact.get(nKey)!;
                if (!newData.email && c.email) newData.email = c.email;
                if (!newData.wa && c.whatsapp) newData.wa = c.whatsapp;
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
            <div className="nickname">
                <label>Nickname</label>
                <input
                    type="text"
                    value={data.nickname}
                    onChange={e => updateField('nickname', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="@nickname"
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
            </div>
        </>
    );
}
