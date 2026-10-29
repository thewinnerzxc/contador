-- Si contacts ya existe sin nickname, habilitarlo sin alterar los contactos.
alter table public.contacts add column if not exists nickname text default '';
