# Plantilla predeterminada — Restaurante

Carta online con pedidos por WhatsApp + panel para el dueño. Sin marca ni estilo fijo: el nombre, logo, color, fondo claro/oscuro y tipografía se cambian desde el panel. Sirve como base para ofrecer a restaurantes clientes: se copia y se personaliza por cliente, igual que `peluqueriapredeterminado`, `esteticaspred` y `gimnasiospred`.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La carta pública (sin login): platos por categoría, buscador, destacados, carrito, pedido por WhatsApp, horarios, mapa y un asistente de preguntas frecuentes. |
| `admin.html` | Panel del dueño (con login): pedidos, carta y datos del local. |
| `datos.js` | Lo que usan las dos páginas para leer y guardar (Supabase o modo demo). |
| `config.js` | La conexión con Supabase de cada cliente. |
| `demo.json` | Carta de ejemplo para el modo demo. |
| `supabase-schema.sql` | Todo lo que hay que crear en Supabase (tablas, permisos, fotos). |

## Modo demo (sin configurar nada)

Si `config.js` está vacío, todo funciona igual pero con la carta de `demo.json`, y lo que se cambia en el panel o se pide en la carta queda guardado **solo en ese navegador**. Sirve para mostrarle la plantilla a un cliente: abrís `admin.html`, le cambiás nombre y color, y en la carta se ve al instante. El botón "Volver a la carta de ejemplo" deja todo como al principio.

## Qué tiene

**Carta (`index.html`)**
- Portada con logo, foto, frase, si está abierto o cerrado ahora, retiro/envío y un aviso destacado opcional.
- "Los más pedidos" (platos marcados como destacados), barra de categorías que acompaña al bajar y buscador.
- Cada plato: foto, descripción, precio, etiquetas (Vegetariano, Sin TACC…), "Quedan N" con poco stock y "Agotado".
- Ficha del plato con cantidad y aclaración ("sin cebolla").
- Carrito: retiro o envío (con costo), nombre, teléfono, dirección, forma de pago y notas. Respeta el pedido mínimo y avisa si el local está cerrado.
- Al enviar, el pedido se guarda con un código (ej. `#K7P2`) y se abre WhatsApp con el mensaje armado.
- Asistente: responde horarios, si está abierto, dirección, envíos, formas de pago, recomendados, opciones sin TACC/vegetarianas y precios de platos. Lo que no sabe lo deriva a WhatsApp.

**Panel (`admin.html`)**
- **Pedidos:** pendientes con contador y aviso sonoro cuando entra uno nuevo (en vivo). Aprobar (descuenta stock), rechazar, marcar entregado. Botón para escribirle al cliente por WhatsApp.
- **Carta:** categorías (crear, ocultar, ordenar, borrar) y platos (foto, nombre, descripción, precio, categoría, stock, etiquetas, disponible, destacado). Interruptor rápido de "Disponible" para marcar agotado.
- **El local:** nombre, frase, dirección, WhatsApp, teléfono, Instagram, aviso, logo, foto de portada, color, fondo, letra, horarios (varios turnos por día, también pasada la medianoche), retiro/envío, costo de envío, pedido mínimo, info de envíos, formas de pago y accesos para encargados.

## Armar la plantilla para un cliente nuevo

1. Copiar este repositorio (botón **Use this template** o descargar y subir a un repo nuevo).
2. Crear un proyecto gratis en [supabase.com](https://supabase.com).
3. En Supabase → **SQL Editor** → New query: pegar todo `supabase-schema.sql` y tocar **Run**. Se puede volver a correr sin romper nada.
4. En Supabase → **Project Settings → API**: copiar la **Project URL** y la **publishable key** (o "anon public") y pegarlas en `config.js`. Nunca la "secret" / "service_role".
5. En Supabase → **Authentication → Sign In / Providers → Email**: para que el dueño entre sin esperar un email, desactivar **Confirm email** (o dejarlo y que confirme desde su casilla).
6. Publicar: en GitHub → **Settings → Pages** → Deploy from a branch → `main` / root.
7. El dueño entra a `admin.html`, toca **"Todavía no tengo cuenta: crearla"**, elige email y clave, y en la pantalla siguiente toca **"Soy el dueño: activar el panel"**. Eso funciona una sola vez, mientras el local no tenga dueño.
8. Desde **El local** carga sus datos, logo, colores y horarios; desde **Carta**, los platos.

**Encargados:** la persona crea su cuenta en `admin.html`; el dueño va a **El local → Accesos al panel** y pone su email.

## Seguridad

- La carta es pública para leer. Nadie puede cambiar platos, precios ni datos del local sin estar logueado con un perfil del panel.
- Los pedidos solo se crean con la función `crear_pedido`, que toma los **precios de la base** (no los que manda el navegador), controla stock y disponibilidad, y frena ráfagas de pedidos. Desde la web pública no se pueden leer pedidos de nadie.
- Las fotos se suben achicadas desde el navegador a Supabase Storage (carpeta `fotos`, lectura pública).
- En modo demo no hay seguridad: es solo para mostrar.

## Pendiente / ideas para sumar

- Reservas de mesa.
- Menú del día y horarios por plato (ej. desayunos solo a la mañana).
- Cobro con Mercado Pago (se puede traer el de `peluqueriapredeterminado`).
- Variantes y adicionales por plato (tamaño, guarniciones, extras con precio).

> La base de datos (`supabase-schema.sql`) está escrita siguiendo el mismo esquema que las otras plantillas, pero todavía no se probó contra un proyecto real de Supabase. Antes de entregarla a un cliente, conviene armar un proyecto de prueba y hacer un pedido de punta a punta.

## Probar en la compu

```
python -m http.server 5174
```

y abrir http://localhost:5174 (la carta) y http://localhost:5174/admin.html (el panel). Abriendo el archivo con doble clic no carga la carta.
