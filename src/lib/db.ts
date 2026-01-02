import { neon } from '@neondatabase/serverless';

export function getDb(connectionString: string) {
    return neon(connectionString);
}
