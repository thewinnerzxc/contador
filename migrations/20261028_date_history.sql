-- Ejecutar en el editor SQL de Supabase para compartir el historial.
-- No modifica fechas existentes ni comentarios.
alter table public.activities
  add column if not exists fecha_historial jsonb not null default '[]'::jsonb;
