// Da de alta a un cliente nuevo. Solo lo puede usar el asesor.
// Entrada (POST JSON): { email: string, nombre?: string, nif?: string }
// Devuelve una contraseña provisional para entregar al cliente
// (luego la cambia en "Mi perfil").

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";

// Claves de Supabase dentro de las Edge Functions.
// Sirve tanto con las claves antiguas (anon / service_role) como con las nuevas
// (publishable / secret), que Supabase expone como JSON en SUPABASE_*_KEYS.

function primeraDeJson(nombre: string): string | undefined {
  const raw = Deno.env.get(nombre)
  if (!raw) return undefined
  try {
    const obj = JSON.parse(raw)
    if (typeof obj === "string") return obj
    if (obj && typeof obj === "object") return obj.default ?? Object.values(obj)[0]
  } catch {
    return raw
  }
  return undefined
}

/** Clave pública: la que envía la app en la cabecera apikey, o la del entorno */
function clavePublica(req: Request): string {
  const k = req.headers.get("apikey") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    primeraDeJson("SUPABASE_PUBLISHABLE_KEYS")
  if (!k) throw new Error("Falta la clave pública de Supabase")
  return k
}

/** Clave secreta (solo para operaciones de administración) */
function claveSecreta(): string {
  const k = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!k) throw new Error("Falta la clave secreta de Supabase")
  return k
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function passwordProvisional(): string {
  // Sin caracteres que se confundan (0/O, 1/l/I)
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, clavePublica(req), {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "Sesión no válida" }, 401);

  const { data: me } = await asUser.from("profiles").select("role").eq("id", userData.user.id).single();
  if (me?.role !== "advisor") return json({ error: "Solo el asesor puede dar de alta clientes" }, 403);

  let body: { email?: string; nombre?: string; nif?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email no válido" }, 400);

  const admin = createClient(url, claveSecreta(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = passwordProvisional();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: body.nombre ?? null },
  });
  if (error || !created.user) {
    const msg = error?.message?.toLowerCase().includes("already")
      ? "Ya existe un usuario con ese email"
      : "No se ha podido crear el usuario";
    return json({ error: msg }, 400);
  }

  if (body.nombre || body.nif) {
    await admin.from("profiles")
      .update({ nombre: body.nombre ?? null, nif: body.nif?.toUpperCase().replace(/[\s.-]/g, "") ?? null })
      .eq("id", created.user.id);
  }

  return json({ id: created.user.id, email, password });
});
