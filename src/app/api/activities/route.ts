import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function getSql(request: Request) {
    const url = request.headers.get('X-Neon-Url');
    if (!url) {
        throw new Error('Missing Neon Connection String');
    }
    return getDb(url);
}

export async function GET(request: Request) {
    try {
        const sql = getSql(request);
        const { searchParams } = new URL(request.url);
        if (searchParams.get('fix_sequence') === 'true') {
            await sql`SELECT setval(pg_get_serial_sequence('activities', 'id'), COALESCE((SELECT MAX(id) + 1 FROM activities), 1), false)`;
            return NextResponse.json({ message: 'Sequence fixed' });
        }

        const activities = await sql`SELECT * FROM activities ORDER BY fecha DESC`;
        return NextResponse.json(activities);
    } catch (error: any) {
        console.error('Database error:', error);
        if (error.message === 'Missing Neon Connection String') {
            return NextResponse.json({ error: 'Configuración de DB faltante' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const sql = getSql(request);
        const body = await request.json();
        const { fecha, tipo, email, whatsapp, estado, comentario } = body;

        const result = await sql`
      INSERT INTO activities (fecha, tipo, email, whatsapp, estado, comentario)
      VALUES (${fecha || new Date().toISOString()}, ${tipo}, ${email || ''}, ${whatsapp || ''}, ${estado || false}, ${comentario || ''})
      RETURNING *
    `;

        return NextResponse.json(result[0]);
    } catch (error: any) {
        console.error('Database error:', error);
        if (error.message === 'Missing Neon Connection String') {
            return NextResponse.json({ error: 'Configuración de DB faltante' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const sql = getSql(request);
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            const mode = searchParams.get('mode');
            if (mode === 'all') {
                await sql`DELETE FROM activities`;
                return NextResponse.json({ message: 'All activities deleted' });
            }
            return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
        }

        await sql`DELETE FROM activities WHERE id = ${id}`;
        return NextResponse.json({ message: 'Deleted' });
    } catch (error: any) {
        console.error('Database error:', error);
        if (error.message === 'Missing Neon Connection String') {
            return NextResponse.json({ error: 'Configuración de DB faltante' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const sql = getSql(request);
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        if (Object.keys(updates).length > 0) {
            await sql`UPDATE activities SET ${sql(updates)} WHERE id = ${id}`;
        }

        return NextResponse.json({ message: 'Updated' });
    } catch (error: any) {
        console.error('Update error', error);
        if (error.message === 'Missing Neon Connection String') {
            return NextResponse.json({ error: 'Configuración de DB faltante' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

