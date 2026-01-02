const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' }); // Load local env vars

const OUTPUT_DIR = 'public';

// 1. Crear directorio (si no existe)
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// 2. Archivos estáticos a copiar para el deploy
const filesToCopy = [
    'index.html',
    'style.css',
    'app.js',
    'csv.js',
    'supabase-db.js',
    'config.js'
];

console.log(`📂 Copiando archivos a /${OUTPUT_DIR}...`);
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join(OUTPUT_DIR, file));
    }
});

// 3. Generar config.js dinámicamente desde variables de entorno (Vercel)
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL; // Vercel standard or custom
const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const content = `// CONFIG GENERATED AT BUILD TIME
export const supabaseUrl = '${sbUrl || ''}';
export const supabaseKey = '${sbKey || ''}';
`;

// Escribir en public/config.js (que es lo que se sirve)
fs.writeFileSync(path.join(OUTPUT_DIR, 'config.js'), content);

console.log("✅ Build completado: config.js generado con variables de entorno.");

console.log("✅ Build completado: Archivos copiados y config.js generado en /public.");
