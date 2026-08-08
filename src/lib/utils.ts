export function normalizeState(v: unknown): boolean {
    const t = String(v ?? '').trim().toLowerCase();
    if ([
        '1', 'true', 'si', 'sí', 'ok', 'done',
        'completado', 'completada', 'completed', 'complete'
    ].includes(t)) return true;
    if ([
        '0', 'false', 'no', 'pendiente', 'pending', 'todo',
        'por hacer', 'incompleto', 'incomplete'
    ].includes(t)) return false;
    return true; // Default true
}

export function digitsOnly(s: string): string {
    return (s || '').replace(/\D/g, '');
}

export function nowStr(): string {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatDateHTML(str: string): string {
    if (!str) return '';
    const s = String(str).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+|T)?(\d{2}:\d{2}:\d{2})?/);
    if (m) {
        const [, y, mm, dd, time] = m;
        const dateBold = `<strong>${dd}-${mm}-${y}</strong>`;
        return time ? `${dateBold} ${time}` : dateBold;
    }
    const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+|T)?(\d{2}:\d{2}:\d{2})?/);
    if (m2) {
        const [, dd, mm, y, time] = m2;
        const dateBold = `<strong>${dd}-${mm}-${y}</strong>`;
        return time ? `${dateBold} ${time}` : dateBold;
    }
    return s;
}
