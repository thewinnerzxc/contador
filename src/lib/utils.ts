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
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
