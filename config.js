// Conexión con la base de datos (Supabase) de ESTE restaurante.
// Mientras quede vacío, la web funciona en "modo demo": la carta sale de demo.json
// y los cambios del panel se guardan solo en el navegador de quien los hace.
//
// Dónde están: Supabase -> Project Settings -> API.
// Usá la "publishable key" (o "anon public"), NUNCA la "secret" / "service_role".
window.RESTO_CONFIG = {
  supabaseUrl: "",   // ej: "https://abcdefgh.supabase.co"
  supabaseKey: ""    // ej: "sb_publishable_..."
};
