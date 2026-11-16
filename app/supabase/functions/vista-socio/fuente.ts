// FUENTE de la Edge Function vista-socio. NO se pega en Supabase:
// `node scripts/empaquetar-facturar.mjs vista-socio` genera index.ts (un solo archivo) y ese es el que se pega.
//
// Devuelve la «Vista de socio» de una empresa (cifras, pérdidas y ganancias, balance, liquidez, plantilla)
// calculada aquí, en el servidor, con todos los datos. Al navegador solo le llegan TOTALES:
// el socio nunca recibe una factura suelta ni la nómina de nadie.
//
// Entrada (POST JSON, con la sesión del usuario): { cuenta_id, desde: "YYYY-MM-DD", hasta: "YYYY-MM-DD" }
// Pueden usarla el titular, el asesor, los admins y los socios de esa empresa (función SQL puede(cuenta, 'socio')).

import { createClient } from "@supabase/supabase-js";
import { agregarNominas, calcularVistaSocio } from "../../../src/lib/vistaSocio";
import type { AsientoManual, Inmovilizado } from "../../../src/lib/contabilidad";
import type { Expense, Invoice } from "../../../src/lib/types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function primeraDeJson(nombre: string): string | undefined {
  const raw = Deno.env.get(nombre);
  if (!raw) return undefined;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "string") return obj;
    if (obj && typeof obj === "object") return obj.default ?? Object.values(obj)[0];
  } catch {
    return raw;
  }
  return undefined;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
  const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!publica || !secreta) return json({ error: "Faltan las claves de Supabase" }, 500);

  const asUser = createClient(url, publica, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "Sesión no válida" }, 401);

  let body: { cuenta_id?: string; desde?: string; hasta?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  const { cuenta_id, desde, hasta } = body;
  if (!cuenta_id || !desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return json({ error: "Indica la empresa y un periodo válido" }, 400);
  }

  // ¿Puede ver la vista de socio de esa empresa? (lo decide la base de datos, con su sesión)
  const { data: puede, error: ePuede } = await asUser.rpc("puede", { cuenta: cuenta_id, modulo: "socio" });
  if (ePuede) return json({ error: "No se ha podido comprobar el acceso" }, 500);
  if (!puede) return json({ error: "No tienes acceso a la vista de socio de esta empresa" }, 403);

  // A partir de aquí, con la clave secreta: los datos completos no salen de este servidor
  const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });
  const [f, g, n, t, m, i] = await Promise.all([
    admin.from("invoices").select("*").eq("owner_id", cuenta_id).neq("estado", "borrador"),
    admin.from("expenses").select("*").eq("owner_id", cuenta_id).eq("estado", "revisado"),
    admin.from("nominas").select("anio, mes, estado, bruto, neto, irpf, ss_trabajador, ss_empresa, coste_total")
      .eq("owner_id", cuenta_id).eq("estado", "publicada"),
    admin.from("trabajadores").select("id", { count: "exact", head: true }).eq("owner_id", cuenta_id).eq("estado", "alta"),
    admin.from("asientos_manuales").select("*").eq("owner_id", cuenta_id),
    admin.from("inmovilizados").select("*").eq("owner_id", cuenta_id),
  ]);
  const error = [f, g, n, t, m, i].find((r) => r.error)?.error;
  if (error) {
    console.error("vista-socio", error);
    return json({ error: "No se han podido leer los datos" }, 500);
  }

  const vista = calcularVistaSocio(
    {
      facturas: (f.data as Invoice[]) ?? [],
      gastos: (g.data as Expense[]) ?? [],
      nominas: agregarNominas(n.data ?? []),
      manuales: (m.data as AsientoManual[]) ?? [],
      inmovilizados: (i.data as Inmovilizado[]) ?? [],
    },
    t.count ?? 0,
    desde,
    hasta,
  );
  return json(vista);
});
