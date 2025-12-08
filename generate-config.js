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
    'neon-db.js',
    'fs.js',
    'idb.js'
];

console.log(`📂 Copiando archivos a /${OUTPUT_DIR}...`);
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join(OUTPUT_DIR, file));
    }
});

// 3. Generar config.js dentro de OUTPUT_DIR
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn("⚠️  ADVERTENCIA: La variable DATABASE_URL no está definida.");
}

const content = `// ESTE ARCHIVO ES GENERADO AUTOMÁTICAMENTE
// NO LO EDITES MANUALMENTE EN PRODUCCIÓN

export const connectionString = '${connectionString || ''}';
`;

fs.writeFileSync(path.join(OUTPUT_DIR, 'config.js'), content);

console.log("✅ Build completado: Archivos copiados y config.js generado en /public.");
