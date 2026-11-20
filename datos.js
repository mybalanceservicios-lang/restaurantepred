// Capa de datos compartida por la carta (index.html) y el panel (admin.html).
// Con Supabase configurado en config.js usa la base; si no, trabaja en "modo demo"
// con demo.json y guarda los cambios en el navegador (localStorage).
(function () {
  const C = window.RESTO_CONFIG || {};
  const conSb = !!(C.supabaseUrl && C.supabaseKey && !/tu-proyecto/.test(C.supabaseUrl));
  const sb = conSb && window.supabase ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey) : null;
  const DEMO = 'restoDemo_v1';

  const NEGOCIO_BASE = {
    nombre: 'Tu Restaurante', bajada: '', logo: '', portada: '', direccion: '', mapa: '',
    telefono: '', whatsapp: '', instagram: '', horarios: [], aceptaRetiro: true, aceptaEnvios: false,
    costoEnvio: 0, pedidoMinimo: 0, envios: '', pagos: 'Efectivo, Transferencia', aviso: '',
    tema: { color: '#b4532a', modo: 'claro', fuente: 'moderna' }
  };

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const err = (e) => { throw new Error((e && (e.message || e.error_description)) || 'Error de conexión'); };

  // ---------- modo demo ----------
  let demoCache = null;
  async function demo() {
    if (demoCache) return demoCache;
    let d = ls.get(DEMO);
    if (!d) { d = await fetch('demo.json', { cache: 'no-store' }).then(r => r.json()); d.pedidos = []; }
    return (demoCache = d);
  }
  function guardarDemo() {
    if (!ls.set(DEMO, demoCache)) throw new Error('No hay más lugar en este navegador. Usá fotos más chicas o conectá Supabase.');
  }

  // ---------- utilidades ----------
  const ordenar = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre).localeCompare(String(b.nombre));
  const completarNegocio = (d) => ({ ...NEGOCIO_BASE, ...(d || {}), tema: { ...NEGOCIO_BASE.tema, ...((d && d.tema) || {}) } });

  async function achicarFoto(file, max) {
    const img = await new Promise((ok, mal) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo leer la imagen'));
      i.src = URL.createObjectURL(file);
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return c;
  }

  const API = {
    modo: sb ? 'supabase' : 'demo',
    NEGOCIO_BASE,

    async cargar() {
      if (!sb) {
        const d = await demo();
        return { negocio: completarNegocio(d.negocio), categorias: [...d.categorias].sort(ordenar), platos: [...d.platos].sort(ordenar) };
      }
      const [n, c, p] = await Promise.all([
        sb.from('negocio').select('datos').eq('id', 'default').maybeSingle(),
        sb.from('categorias').select('*'),
        sb.from('platos').select('*')
      ]);
      for (const r of [n, c, p]) if (r.error) err(r.error);
      return { negocio: completarNegocio(n.data && n.data.datos), categorias: c.data.sort(ordenar), platos: p.data.sort(ordenar) };
    },

    async guardarNegocio(datos) {
      if (!sb) { (await demo()).negocio = datos; return guardarDemo(); }
      const r = await sb.from('negocio').upsert({ id: 'default', datos, actualizado: new Date().toISOString() });
      if (r.error) err(r.error);
    },

    async guardarCategoria(c) {
      const fila = { id: c.id || nuevoId(), nombre: c.nombre, orden: c.orden ?? 0, visible: c.visible !== false };
      if (!sb) {
        const d = await demo(), i = d.categorias.findIndex(x => x.id === fila.id);
        if (i >= 0) d.categorias[i] = fila; else d.categorias.push(fila);
        guardarDemo(); return fila;
      }
      const r = await sb.from('categorias').upsert(fila).select().single();
      if (r.error) err(r.error); return r.data;
    },
    async borrarCategoria(id) {
      if (!sb) {
        const d = await demo();
        d.categorias = d.categorias.filter(c => c.id !== id);
        d.platos.forEach(p => { if (p.categoria_id === id) p.categoria_id = null; });
        return guardarDemo();
      }
      const r = await sb.from('categorias').delete().eq('id', id);
      if (r.error) err(r.error);
    },

    async guardarPlato(p) {
      const fila = {
        id: p.id || nuevoId(), categoria_id: p.categoria_id || null, nombre: p.nombre, descripcion: p.descripcion || '',
        precio: Number(p.precio) || 0, foto: p.foto || null, etiquetas: p.etiquetas || [], disponible: p.disponible !== false,
        stock: (p.stock === '' || p.stock == null) ? null : Math.max(0, parseInt(p.stock, 10) || 0),
        destacado: !!p.destacado, orden: p.orden ?? 0
      };
      if (!sb) {
        const d = await demo(), i = d.platos.findIndex(x => x.id === fila.id);
        if (i >= 0) d.platos[i] = fila; else d.platos.push(fila);
        guardarDemo(); return fila;
      }
      const r = await sb.from('platos').upsert(fila).select().single();
      if (r.error) err(r.error); return r.data;
    },
    async borrarPlato(id) {
      if (!sb) { const d = await demo(); d.platos = d.platos.filter(p => p.id !== id); return guardarDemo(); }
      const r = await sb.from('platos').delete().eq('id', id);
      if (r.error) err(r.error);
    },

    // Achica la foto en el navegador y la sube. Devuelve la dirección para guardar.
    async subirFoto(file, max = 1200) {
      if (!sb) return (await achicarFoto(file, Math.min(max, 640))).toDataURL('image/jpeg', 0.78);
      const canvas = await achicarFoto(file, max);
      const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.84));
      const ruta = nuevoId() + '.jpg';
      const r = await sb.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (r.error) err(r.error);
      return sb.storage.from('fotos').getPublicUrl(ruta).data.publicUrl;
    },

    // ---------- pedidos ----------
    async crearPedido(p) {
      if (sb) {
        const r = await sb.rpc('crear_pedido', { p });
        if (r.error) err(r.error); return r.data;
      }
      const d = await demo(), neg = completarNegocio(d.negocio);
      const items = p.items.map(it => {
        const pl = d.platos.find(x => x.id === it.id);
        if (!pl || !pl.disponible || (pl.stock != null && pl.stock < it.cantidad)) throw new Error('Sin stock: ' + (pl ? pl.nombre : 'un producto'));
        return { id: pl.id, nombre: pl.nombre, precio: pl.precio, cantidad: it.cantidad, nota: it.nota || '' };
      });
      const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
      const envio = p.entrega === 'envio' ? Number(neg.costoEnvio) || 0 : 0;
      const alf = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let codigo; do { codigo = Array.from({ length: 4 }, () => alf[Math.floor(Math.random() * alf.length)]).join(''); } while (d.pedidos.some(x => x.codigo === codigo));
      d.pedidos.unshift({ id: nuevoId(), codigo, ...p, items, subtotal, envio, total: subtotal + envio, estado: 'pendiente', creado: new Date().toISOString() });
      guardarDemo();
      return { codigo, subtotal, envio, total: subtotal + envio };
    },
    async pedidos(estado) {
      if (!sb) { const d = await demo(); return d.pedidos.filter(p => !estado || p.estado === estado); }
      let q = sb.from('pedidos').select('*').order('creado', { ascending: false }).limit(200);
      if (estado) q = q.eq('estado', estado);
      const r = await q; if (r.error) err(r.error); return r.data;
    },
    async cambiarEstado(id, estado) {
      if (!sb) {
        const d = await demo(), p = d.pedidos.find(x => x.id === id);
        if (!p) return;
        if (estado === 'aprobado' && p.estado === 'pendiente') {
          p.items.forEach(it => { const pl = d.platos.find(x => x.id === it.id); if (pl && pl.stock != null) pl.stock = Math.max(0, pl.stock - it.cantidad); });
        }
        p.estado = estado; return guardarDemo();
      }
      const r = estado === 'aprobado'
        ? await sb.rpc('aprobar_pedido', { p_id: id })
        : await sb.from('pedidos').update({ estado }).eq('id', id);
      if (r.error) err(r.error);
    },
    // Avisa cuando entra un pedido nuevo (en vivo con Supabase; en demo, revisando cada tanto).
    escucharPedidos(cb) {
      if (sb) {
        const ch = sb.channel('pedidos').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => cb()).subscribe();
        const t = setInterval(cb, 60000);
        return () => { clearInterval(t); sb.removeChannel(ch); };
      }
      const f = (e) => { if (e.key === DEMO) { demoCache = null; cb(); } };
      addEventListener('storage', f);
      return () => removeEventListener('storage', f);
    },

    // ---------- acceso al panel ----------
    async sesion() { if (!sb) return { demo: true }; const r = await sb.auth.getSession(); return r.data.session; },
    async entrar(email, clave) { const r = await sb.auth.signInWithPassword({ email, password: clave }); if (r.error) err(r.error); return r.data.session; },
    async crearCuenta(email, clave) {
      const r = await sb.auth.signUp({ email, password: clave });
      if (r.error) err(r.error);
      return r.data.session; // null si Supabase pide confirmar el email
    },
    async salir() { if (sb) await sb.auth.signOut(); },
    async esAdmin() { if (!sb) return true; const r = await sb.rpc('es_admin'); if (r.error) err(r.error); return !!r.data; },
    async reclamarDueno(nombre) { const r = await sb.rpc('reclamar_dueno', { p_nombre: nombre || null }); if (r.error) err(r.error); },
    async darAcceso(email, nombre) { const r = await sb.rpc('dar_acceso', { p_email: email, p_nombre: nombre || null }); if (r.error) err(r.error); },

    restablecerDemo() { ls.del(DEMO); demoCache = null; },
    cambiosDemo(cb) { addEventListener('storage', e => { if (e.key === DEMO) { demoCache = null; cb(); } }); }
  };

  // ---------- ayudas para mostrar ----------
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const min = (h) => { const [a, b] = String(h || '0:0').split(':').map(Number); return (a || 0) * 60 + (b || 0); };

  API.util = {
    DIAS, DIAS_C,
    plata: (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'),
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    normal: (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
    soloNumeros: (s) => String(s || '').replace(/\D/g, ''),

    // Agrupa los días con el mismo horario: "Mar a Dom · 12:00 a 15:30"
    horarioTexto(horarios) {
      const porDia = DIAS.map((_, d) => (horarios || []).filter(h => (h.dias || []).includes(d)).sort((a, b) => min(a.desde) - min(b.desde)).map(h => `${h.desde} a ${h.hasta}`).join(' y '));
      const orden = [1, 2, 3, 4, 5, 6, 0], filas = [];
      for (const d of orden) {
        const t = porDia[d] || 'Cerrado', ult = filas[filas.length - 1];
        if (ult && ult.t === t && orden.indexOf(d) === orden.indexOf(ult.hasta) + 1) ult.hasta = d; else filas.push({ desde: d, hasta: d, t });
      }
      return filas.map(f => ({ dias: f.desde === f.hasta ? DIAS[f.desde] : `${DIAS[f.desde]} a ${DIAS[f.hasta]}`, horas: f.t, incluye: orden.slice(orden.indexOf(f.desde), orden.indexOf(f.hasta) + 1) }));
    },

    // { abierto, texto }  ej: "Abierto hasta 15:30" / "Abre hoy a las 20:00" / "Abre el jueves a las 12:00"
    estadoAhora(horarios, ahora = new Date()) {
      const hs = horarios || [];
      if (!hs.length) return { abierto: null, texto: '' };
      const d = ahora.getDay(), m = ahora.getHours() * 60 + ahora.getMinutes();
      for (const h of hs) {
        const a = min(h.desde), b = min(h.hasta);
        if (b > a ? (h.dias.includes(d) && m >= a && m < b) : ((h.dias.includes(d) && m >= a) || (h.dias.includes((d + 6) % 7) && m < b))) {
          return { abierto: true, texto: `Abierto hasta las ${h.hasta}` };
        }
      }
      for (let k = 0; k < 7; k++) {
        const dd = (d + k) % 7;
        const prox = hs.filter(h => h.dias.includes(dd) && (k > 0 || min(h.desde) > m)).sort((a, b) => min(a.desde) - min(b.desde))[0];
        if (prox) return { abierto: false, texto: k === 0 ? `Abre hoy a las ${prox.desde}` : k === 1 ? `Abre mañana a las ${prox.desde}` : `Abre el ${DIAS[dd].toLowerCase()} a las ${prox.desde}` };
      }
      return { abierto: false, texto: 'Cerrado' };
    },

    // Colores, claro/oscuro y tipografía elegidos en el panel.
    aplicarTema(tema) {
      const t = { ...NEGOCIO_BASE.tema, ...(tema || {}) };
      const FUENTES = {
        moderna: { fam: 'Plus+Jakarta+Sans:wght@400;500;600;700;800', titulo: '"Plus Jakarta Sans"', texto: '"Plus Jakarta Sans"' },
        clasica: { fam: 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700', titulo: '"Fraunces"', texto: '"Inter"' },
        redonda: { fam: 'Nunito:wght@400;600;700;800;900', titulo: '"Nunito"', texto: '"Nunito"' }
      };
      const f = FUENTES[t.fuente] || FUENTES.moderna;
      let link = document.getElementById('fuenteTema');
      if (!link) { link = document.createElement('link'); link.id = 'fuenteTema'; link.rel = 'stylesheet'; document.head.appendChild(link); }
      link.href = `https://fonts.googleapis.com/css2?family=${f.fam}&display=swap`;
      const r = document.documentElement.style;
      r.setProperty('--acento', /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : NEGOCIO_BASE.tema.color);
      r.setProperty('--f-titulo', `${f.titulo}, system-ui, sans-serif`);
      r.setProperty('--f-texto', `${f.texto}, system-ui, sans-serif`);
      document.documentElement.dataset.modo = t.modo === 'oscuro' ? 'oscuro' : 'claro';
    }
  };

  window.Resto = API;
})();
