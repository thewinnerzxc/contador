import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.8/+esm';
import { supabaseUrl, supabaseKey } from './config.js';

let supabase = null;

// Inicializa el cliente Supabase
export async function initDB() {
    if (!supabaseUrl || !supabaseKey) {
        console.error('Faltan credenciales de Supabase en config.js');
        return false;
    }
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        // Verificar conexión simple pintando algo
        const { data, error } = await supabase.from('notes').select('id').limit(1);
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('Error connecting to Supabase:', e);
        alert('Error conectando a Supabase:\n' + (e.message || e));
        return false;
    }
}

export function isDbConnected() {
    return !!supabase;
}

// ====== Activities ======

export async function fetchAll() {
    if (!supabase) return [];

    let allData = [];
    let from = 0;
    let to = 999;
    const CHUNK_SIZE = 1000;
    const MAX_RECORDS = 20000; // Increased safety limit to 20,000 records

    try {
        while (allData.length < MAX_RECORDS) {
            const { data, error } = await supabase
                .from('activities')
                .select('*')
                .order('id', { ascending: false })
                .range(from, to);

            if (error) throw error;
            if (!data || data.length === 0) break;

            allData = allData.concat(data);

            // If we got fewer records than requested, we reached the end
            if (data.length < CHUNK_SIZE) break;

            from += CHUNK_SIZE;
            to += CHUNK_SIZE;
        }
    } catch (error) {
        console.error('Error fetching activities:', error);
        return allData.length > 0 ? allData : [];
    }

    return allData;
}

export async function saveRow(row) {
    if (!supabase) return;
    const payload = {
        id: row.id,
        fecha: row.fecha,
        fecha_historial: row.fecha_historial || [],
        tipo: row.tipo,
        email: row.email,
        whatsapp: row.whatsapp,
        nickname: row.nickname || '',
        estado: row.estado,
        comentario: row.comentario
    };
    const { error } = await supabase
        .from('activities')
        .upsert(payload);

    if (error) {
        // Compatibilidad mientras se habilita la columna de historial remoto.
        let remainingError = error;
        for (const field of ['fecha_historial', 'nickname']) {
            if (remainingError && String(remainingError.message || '').includes(field)) {
                delete payload[field];
                if (field === 'fecha_historial') {
                    window.dispatchEvent(new CustomEvent('date-history-local-only'));
                }
                const result = await supabase.from('activities').upsert(payload);
                remainingError = result.error;
            }
        }
        if (remainingError) {
            console.error('Error saving row:', remainingError);
            throw new Error(remainingError.message || 'No se pudo guardar');
        }
    }
}

export async function deleteRow(id) {
    if (!supabase) return;
    const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id);

    if (error) console.error('Error deleting row:', error);
}

export async function deleteAll() {
    if (!supabase) return;
    // Delete all (sin where -> cuidado, supabase requiere policy o filtro, pero con API key anon suele dejar si RLS permite)
    const { error } = await supabase
        .from('activities')
        .delete()
        .neq('id', 0); // Hack para delete all si no permite sin where

    if (error) console.error('Error deleting all:', error);
}

// ====== Bulk Operations ======
export async function bulkUpsert(rows) {
    if (!supabase || !rows.length) return;
    const { error } = await supabase
        .from('activities')
        .upsert(rows);

    if (error) console.error('Error bulk upsert:', error);
}


// ====== Notes ======

export async function getNote() {
    if (!supabase) throw new Error('Sin conexión a Supabase');
    const { data, error } = await supabase
        .from('notes')
        .select('content')
        .eq('id', 1)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.content || '';
}

export async function saveNote(content) {
    if (!supabase) throw new Error('Sin conexión a Supabase');
    const { error } = await supabase
        .from('notes')
        .upsert({ id: 1, content });

    if (error) throw new Error(error.message);
}


// ====== Contacts ======

export async function getContacts() {
    if (!supabase) throw new Error('Sin conexión a Supabase');
    const all = [];
    for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase.from('contacts').select('email, whatsapp, nickname')
            .order('email').order('whatsapp').range(start, start + 999);
        if (error) throw new Error(error.message);
        all.push(...(data || []));
        if (!data || data.length < 1000) return all;
    }
}
export async function saveContactsBulk(pairs) {
    if (!pairs.length) return;
    if (!supabase) throw new Error('Sin conexión a Supabase');
    const unique = new Map();
    for (const p of pairs) {
        const row = { email: (p.email || '').trim().toLowerCase(), whatsapp: String(p.whatsapp || '').replace(/\D/g, ''), nickname: (p.nickname || '').trim() };
        if (row.email || row.whatsapp || row.nickname) unique.set(JSON.stringify([row.email, row.whatsapp]), row);
    }
    const valid = [...unique.values()];
    for (let i = 0; i < valid.length; i += 500) {
        const { error } = await supabase.from('contacts').upsert(valid.slice(i, i + 500), { onConflict: 'email, whatsapp' });
        if (error) throw new Error(error.message);
    }
}
