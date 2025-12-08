const fs = require('fs');

// Obtener el string de conexión de la variable de entorno
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn("⚠️  ADVERTENCIA: La variable DATABASE_URL no está definida.");
    console.warn("   El archivo config.js se generará con un string vacío o por defecto.");
}

// Crear el contenido del archivo config.js
const content = `// ESTE ARCHIVO ES GENERADO AUTOMÁTICAMENTE
// NO LO EDITES MANUALMENTE EN PRODUCCIÓN

export const connectionString = '${connectionString || ''}';
`;

// Escribir el archivo
fs.writeFileSync('config.js', content);

console.log("✅ config.js generado exitosamente desde variable de entorno.");
