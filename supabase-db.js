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
    // select * order by id desc
    const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('Error fetching activities:', error);
        return [];
    }
    return data || [];
}

export async function saveRow(row) {
    if (!supabase) return;
    // Upsert: inserta o actualiza si id coincide
    const { error } = await supabase
        .from('activities')
        .upsert({
            id: row.id,
            fecha: row.fecha,
            tipo: row.tipo,
            email: row.email,
            whatsapp: row.whatsapp,
            estado: row.estado,
            comentario: row.comentario
        });

    if (error) console.error('Error saving row:', error);
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
    if (!supabase) return '';
    const { data, error } = await supabase
        .from('notes')
        .select('content')
        .eq('id', 1)
        .single();

    if (error) {
        // Si no existe, no es error grave, retorna vacío
        return '';
    }
    return data?.content || '';
}

export async function saveNote(content) {
    if (!supabase) return;
    const { error } = await supabase
        .from('notes')
        .upsert({ id: 1, content });

    if (error) console.error('Error saving note:', error);
}


// ====== Contacts ======

export async function getContacts() {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('contacts')
        .select('email, whatsapp');

    if (error) return [];
    return data || [];
}

export async function saveContactsBulk(pairs) {
    if (!supabase || !pairs.length) return;

    // Filtrar vacíos
    const valid = pairs.filter(p => p.email || p.whatsapp);
    if (!valid.length) return;

    // Upsert con ignoreDuplicates: true para evitar error de violación de unique
    const { error } = await supabase
        .from('contacts')
        .upsert(valid, { onConflict: 'email, whatsapp', ignoreDuplicates: true });

    if (error) console.error('Error saving contacts:', error);
}
