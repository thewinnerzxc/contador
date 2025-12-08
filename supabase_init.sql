-- Tabla principal de actividades
create table if not exists activities (
  id bigint primary key,
  fecha text,
  tipo text,
  email text,
  whatsapp text,
  estado boolean,
  comentario text
);

-- Tabla para notas rápidas (solo una fila, id=1)
create table if not exists notes (
  id bigint primary key,
  content text
);

-- Tabla de contactos (pares únicos)
create table if not exists contacts (
  email text,
  whatsapp text,
  unique(email, whatsapp)
);

-- Insertar nota inicial si no existe
insert into notes (id, content) values (1, '') on conflict (id) do nothing;
