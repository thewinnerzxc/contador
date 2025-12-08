let ClientClass = null;
let client = null;
// Hardcoded connection string as per user request
const connectionString = 'postgresql://neondb_owner:npg_XcVmB1shATv7@ep-solitary-cake-adastd8n-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function getClient() {
    if (client) return client;

    let cs = (connectionString || '').trim();
    if (!cs) throw new Error('No Connection String');

    // Limpiar parámetros conflictivos para el driver web
    try {
        const u = new URL(cs);
        u.searchParams.delete('sslmode');
        u.searchParams.delete('channel_binding');
        cs = u.toString();
    } catch (e) {
        // Si falla el parseo, seguimos con el string original (se validará abajo)
    }

    if (!cs.startsWith('postgres://') && !cs.startsWith('postgresql://')) {
        throw new Error('Invalid Connection String. Must start with postgres:// or postgresql://');
    }

    if (!ClientClass) {
        try {
            const module = await import('https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.10.4/+esm');
            ClientClass = module.Client;
        } catch (e) {
            throw new Error('Failed to load Neon driver: ' + e.message);
        }
    }

    try {
        client = new ClientClass(cs);
        await client.connect();
        return client;
    } catch (e) {
        client = null;
        throw e;
    }
}

export async function initDB() {
    try {
        const sql = await getClient();
        // Create table if not exists
        await sql.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY,
        fecha TEXT,
        tipo TEXT,
        email TEXT,
        whatsapp TEXT,
        estado BOOLEAN,
        comentario TEXT
      )
    `);
        // Schema migration: ensure columns exist for older tables
        await sql.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS email TEXT`);
        await sql.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS whatsapp TEXT`);

        // Create notes table
        await sql.query(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, content TEXT)`);

        // Create contacts table (dictionary)
        await sql.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                email TEXT, 
                whatsapp TEXT,
                UNIQUE(email, whatsapp)
            )
        `);

        // Ensure row 1 exists
        // Ensure row 1 exists
        await sql.query(`INSERT INTO notes (id, content) VALUES (1, '') ON CONFLICT (id) DO NOTHING`);

        return true;
    } catch (e) {
        console.error('Error initializing DB:', e);
        alert('Error connecting to Neon DB:\n' + e.message);
        return false;
    }
}

export async function fetchAll() {
    const sql = await getClient();
    const res = await sql.query('SELECT * FROM activities ORDER BY id DESC');
    return res.rows;
}

export async function getNote() {
    const sql = await getClient();
    const res = await sql.query('SELECT content FROM notes WHERE id = 1');
    return res.rows[0]?.content || '';
}

export async function saveNote(content) {
    const sql = await getClient();
    await sql.query('INSERT INTO notes (id, content) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content', [content]);
}

export async function saveRow(row) {
    const sql = await getClient();
    await sql.query(`
    INSERT INTO activities (id, fecha, tipo, email, whatsapp, estado, comentario)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      fecha = EXCLUDED.fecha,
      tipo = EXCLUDED.tipo,
      email = EXCLUDED.email,
      whatsapp = EXCLUDED.whatsapp,
      estado = EXCLUDED.estado,
      comentario = EXCLUDED.comentario
  `, [row.id, row.fecha, row.tipo, row.email, row.whatsapp, row.estado, row.comentario]);
}

export async function deleteRow(id) {
    const sql = await getClient();
    await sql.query('DELETE FROM activities WHERE id = $1', [id]);
}

export async function deleteAll() {
    const sql = await getClient();
    await sql.query('DELETE FROM activities');
}

export async function bulkUpsert(rows) {
    for (const r of rows) {
        await saveRow(r);
    }
}

export async function getContacts() {
    const sql = await getClient();
    // Obtener todos los contactos (pares email/wa)
    const res = await sql.query('SELECT email, whatsapp FROM contacts');
    return res.rows;
}

export async function saveContactsBulk(pairs) {
    const sql = await getClient();
    // Upsert simple: on conflict do nothing (o update si quisiéramos)
    // Para eficiencia en bulk, lo hacemos en loop o una query grande.
    // Loop es más seguro para evitar límites de params.
    for (const p of pairs) {
        if (!p.email && !p.whatsapp) continue;
        await sql.query(`
            INSERT INTO contacts (email, whatsapp)
            VALUES ($1, $2)
            ON CONFLICT (email, whatsapp) DO NOTHING
        `, [p.email || '', p.whatsapp || '']);
    }
}

export function isDbConnected() {
    return !!client;
}
