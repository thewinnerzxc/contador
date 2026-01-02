export interface Activity {
    id: number;
    fecha: string;
    tipo: string;
    email: string;
    whatsapp: string;
    estado: boolean;
    comentario: string;
}

export type ActivityType = 'Resuelta su consulta de WhatsApp' | 'Resuelta consulta de Email';

export interface Counters {
    t: number;
    2: number;
    3: number;
    pending: number;
    done: number;
}
