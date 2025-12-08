const fs = require('fs');
const path = require('path');

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

// 3. (Eliminado) No generar config.js dinámicamente, usar el estático copiado arriba.
console.log("✅ Build completado: Archivos copiados a /public.");

console.log("✅ Build completado: Archivos copiados y config.js generado en /public.");
