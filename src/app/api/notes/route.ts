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
        const result = await sql`SELECT content FROM notes WHERE id = 1`;
        if (result.length > 0) {
            return NextResponse.json({ content: result[0].content });
        }
        return NextResponse.json({ content: '' });
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
        const { content } = body;

        // Upsert logic
        await sql`
      INSERT INTO notes (id, content) VALUES (1, ${content})
      ON CONFLICT (id) DO UPDATE SET content = ${content}
    `;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Database error:', error);
        if (error.message === 'Missing Neon Connection String') {
            return NextResponse.json({ error: 'Configuración de DB faltante' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
    }
}

