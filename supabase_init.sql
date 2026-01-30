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

-- REGLES DE SEGURIDAD (RLS)
-- Habilitar RLS en todas las tablas
alter table activities enable row level security;
alter table notes enable row level security;
alter table contacts enable row level security;

-- Políticas para acceso público (rol anon)
-- Nota: Esto permite que la app siga funcionando con la API key 'anon'
create policy "Allow public read activities" on activities for select to anon using (true);
create policy "Allow public insert activities" on activities for insert to anon with check (true);
create policy "Allow public update activities" on activities for update to anon using (true);
create policy "Allow public delete activities" on activities for delete to anon using (true);

create policy "Allow public read notes" on notes for select to anon using (true);
create policy "Allow public insert notes" on notes for insert to anon with check (true);
create policy "Allow public update notes" on notes for update to anon using (true);

create policy "Allow public read contacts" on contacts for select to anon using (true);
create policy "Allow public insert contacts" on contacts for insert to anon with check (true);
create policy "Allow public update contacts" on contacts for update to anon using (true);
