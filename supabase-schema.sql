-- Plantilla predeterminada · Restaurante
-- Base de datos para la carta online, los pedidos y el panel del dueño.
--
-- Cómo usarlo: Supabase -> SQL Editor -> New query -> pegar TODO este archivo -> Run.
-- Se puede volver a correr sin romper nada (crea solo lo que falta).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------

-- Datos del local (una sola fila). "datos" guarda nombre, logo, colores,
-- horarios, WhatsApp, envíos, formas de pago, etc. Lo edita el panel.
create table if not exists negocio (
  id text primary key default 'default',
  datos jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);
insert into negocio (id) values ('default') on conflict (id) do nothing;

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden int not null default 0,
  visible boolean not null default true,
  creado timestamptz not null default now()
);

create table if not exists platos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references categorias(id) on delete set null,
  nombre text not null,
  descripcion text,
  precio numeric(12,2) not null default 0 check (precio >= 0),
  foto text,
  etiquetas text[] not null default '{}',
  disponible boolean not null default true,
  stock int check (stock is null or stock >= 0),   -- null = no se controla stock
  destacado boolean not null default false,
  orden int not null default 0,
  creado timestamptz not null default now()
);

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  cliente text,
  telefono text,
  entrega text not null default 'retiro' check (entrega in ('retiro','envio')),
  direccion text,
  pago text,
  notas text,
  items jsonb not null,            -- [{id, nombre, precio, cantidad, nota}] tal como estaban al pedir
  subtotal numeric(12,2) not null default 0,
  envio numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','entregado')),
  creado timestamptz not null default now()
);
create index if not exists pedidos_estado_creado on pedidos (estado, creado desc);

-- Quién puede entrar al panel.
create table if not exists perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol text not null default 'dueno' check (rol in ('dueno','encargado')),
  creado timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where user_id = auth.uid());
$$;

-- La primera persona que crea su cuenta se convierte en dueña.
-- Solo funciona mientras no haya ningún perfil cargado.
create or replace function reclamar_dueno(p_nombre text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if exists (select 1 from perfiles) then raise exception 'Este local ya tiene dueño. Pedile acceso.'; end if;
  insert into perfiles (user_id, nombre, rol) values (auth.uid(), p_nombre, 'dueno');
end $$;

-- El dueño le da acceso a otra persona que ya creó su cuenta (por email).
create or replace function dar_acceso(p_email text, p_nombre text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from perfiles where user_id = auth.uid() and rol = 'dueno') then
    raise exception 'Solo el dueño puede dar acceso';
  end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'No hay ninguna cuenta con ese email. Primero tiene que crearla desde el panel.'; end if;
  insert into perfiles (user_id, nombre, rol) values (v_id, p_nombre, 'encargado')
  on conflict (user_id) do nothing;
end $$;

-- Crea un pedido desde la carta pública. Los precios se toman de la base,
-- no de lo que manda el navegador. Devuelve el código y el total.
create or replace function crear_pedido(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; pl platos%rowtype;
  v_items jsonb := '[]'::jsonb; v_sub numeric := 0; v_envio numeric := 0; v_cant int;
  v_neg jsonb; v_codigo text; v_alf text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int;
  v_entrega text := coalesce(p->>'entrega','retiro');
begin
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'El pedido está vacío';
  end if;
  if jsonb_array_length(p->'items') > 60 then raise exception 'Demasiados productos'; end if;
  if v_entrega not in ('retiro','envio') then raise exception 'Entrega inválida'; end if;
  -- freno básico contra abusos: muchos pedidos seguidos
  if (select count(*) from pedidos where creado > now() - interval '1 minute') > 30 then
    raise exception 'Hay muchos pedidos en este momento, probá en un minuto';
  end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_cant := greatest(1, least(99, coalesce((it->>'cantidad')::int, 1)));
    select * into pl from platos where id = (it->>'id')::uuid;
    if not found or not pl.disponible or (pl.stock is not null and pl.stock < v_cant) then
      raise exception 'Sin stock: %', coalesce(pl.nombre, 'un producto');
    end if;
    v_sub := v_sub + pl.precio * v_cant;
    v_items := v_items || jsonb_build_object('id', pl.id, 'nombre', pl.nombre, 'precio', pl.precio,
      'cantidad', v_cant, 'nota', left(coalesce(it->>'nota',''), 200));
  end loop;

  select datos into v_neg from negocio where id = 'default';
  if v_entrega = 'envio' then v_envio := coalesce((v_neg->>'costoEnvio')::numeric, 0); end if;

  loop
    v_codigo := '';
    for i in 1..4 loop v_codigo := v_codigo || substr(v_alf, 1 + floor(random() * length(v_alf))::int, 1); end loop;
    exit when not exists (select 1 from pedidos where codigo = v_codigo);
  end loop;

  insert into pedidos (codigo, cliente, telefono, entrega, direccion, pago, notas, items, subtotal, envio, total)
  values (v_codigo, left(p->>'cliente',80), left(p->>'telefono',40), v_entrega, left(p->>'direccion',200),
          left(p->>'pago',60), left(p->>'notas',500), v_items, v_sub, v_envio, v_sub + v_envio);

  return jsonb_build_object('codigo', v_codigo, 'subtotal', v_sub, 'envio', v_envio, 'total', v_sub + v_envio);
end $$;

-- Aprobar un pedido descuenta el stock de los platos que lo tienen cargado.
create or replace function aprobar_pedido(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ped pedidos%rowtype; it jsonb;
begin
  if not es_admin() then raise exception 'Sin permiso'; end if;
  select * into ped from pedidos where id = p_id for update;
  if not found then raise exception 'No existe el pedido'; end if;
  if ped.estado <> 'pendiente' then return; end if;
  for it in select * from jsonb_array_elements(ped.items) loop
    update platos set stock = greatest(stock - (it->>'cantidad')::int, 0)
    where id = (it->>'id')::uuid and stock is not null;
  end loop;
  update pedidos set estado = 'aprobado' where id = p_id;
end $$;

revoke all on function reclamar_dueno(text), dar_acceso(text, text), aprobar_pedido(uuid) from anon;
grant execute on function crear_pedido(jsonb) to anon, authenticated;
grant execute on function es_admin(), reclamar_dueno(text), dar_acceso(text, text), aprobar_pedido(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Permisos (Row Level Security)
-- La carta es pública para leer. Los pedidos solo se crean con crear_pedido()
-- y solo los ve el panel. Todo lo demás lo edita solo el panel.
-- ---------------------------------------------------------------

alter table negocio enable row level security;
alter table categorias enable row level security;
alter table platos enable row level security;
alter table pedidos enable row level security;
alter table perfiles enable row level security;

drop policy if exists negocio_leer on negocio;
create policy negocio_leer on negocio for select using (true);
drop policy if exists negocio_editar on negocio;
create policy negocio_editar on negocio for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists categorias_leer on categorias;
create policy categorias_leer on categorias for select using (true);
drop policy if exists categorias_editar on categorias;
create policy categorias_editar on categorias for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists platos_leer on platos;
create policy platos_leer on platos for select using (true);
drop policy if exists platos_editar on platos;
create policy platos_editar on platos for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists pedidos_panel on pedidos;
create policy pedidos_panel on pedidos for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists perfiles_ver on perfiles;
create policy perfiles_ver on perfiles for select to authenticated using (user_id = auth.uid() or es_admin());

-- ---------------------------------------------------------------
-- Fotos (Storage): lectura pública, subida solo desde el panel
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists fotos_leer on storage.objects;
create policy fotos_leer on storage.objects for select using (bucket_id = 'fotos');
drop policy if exists fotos_subir on storage.objects;
create policy fotos_subir on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and es_admin());
drop policy if exists fotos_cambiar on storage.objects;
create policy fotos_cambiar on storage.objects for update to authenticated using (bucket_id = 'fotos' and es_admin());
drop policy if exists fotos_borrar on storage.objects;
create policy fotos_borrar on storage.objects for delete to authenticated using (bucket_id = 'fotos' and es_admin());

-- ---------------------------------------------------------------
-- Pedidos en vivo: el panel se entera al instante de un pedido nuevo
-- ---------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table pedidos;
exception when duplicate_object then null; when undefined_object then null;
end $$;
