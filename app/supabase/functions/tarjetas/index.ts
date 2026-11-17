// Tarjetas de empresa con Stripe (Connect + Issuing). Una sola función para todo el apartado «Tarjetas».
// Entrada (POST JSON): { accion, owner_id, ... }. Quien llama tiene que poder gestionar los «Datos de la empresa»
// de esa cuenta (titular, asesor o admin con ese módulo; ver puede() en supabase/usuarios.sql).
//
// Acciones:
//   estado          → { cuenta, saldo, tarjetas, movimientos }   (refresca el estado de la cuenta en Stripe)
//   activar         → crea la cuenta conectada de la empresa (si no existe) y devuelve el enlace del alta { url }
//   enlace          → enlace nuevo para completar el alta { url }
//   sesion          → { client_secret } para el alta integrada dentro de la app (Connect embedded components)
//   crear_tarjeta   → { alias, tipo: 'virtual'|'fisica', limite_mensual? }
//   estado_tarjeta  → { tarjeta_id, estado: 'activa'|'congelada'|'cancelada' }
//   limite          → { tarjeta_id, limite_mensual: number|null }
//   fondos          → instrucciones para ingresar saldo { instrucciones }
//
// Secretos: STRIPE_SECRET_KEY (clave SECRETA de Stripe; en pruebas empieza por sk_test_…). Nunca en el chat ni en el repo.
// Opcionales: APP_URL (por defecto https://clientes.nomotax.io). STRIPE_EMISION=1 cuando Stripe apruebe Issuing para la plataforma.
// Las tablas son las de supabase/tarjetas.sql. La app solo las lee: aquí se escriben con la clave secreta de Supabase.
//
// OJO: los parámetros de la cuenta conectada (controller, capacidades) están pensados para «Connect con alta
// alojada por Stripe». Cuando Stripe apruebe Issuing/Treasury para España puede hacer falta ajustarlos.

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";

const STRIPE = "https://api.stripe.com/v1";
const APP_URL = Deno.env.get("APP_URL") ?? "https://clientes.nomotax.io";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

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

class ErrorApp extends Error {
  constructor(mensaje: string, public estado = 400) {
    super(mensaje);
  }
}

// ---------------------------------------------------------------- Stripe

/** { a: { b: [1, 2] } } → a[b][0]=1&a[b][1]=2 (formato de la API de Stripe) */
function formulario(obj: unknown, prefijo = "", partes: string[] = []): string[] {
  if (obj === undefined || obj === null) return partes;
  if (Array.isArray(obj)) obj.forEach((v, i) => formulario(v, `${prefijo}[${i}]`, partes));
  else if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) formulario(v, prefijo ? `${prefijo}[${k}]` : k, partes);
  } else partes.push(`${encodeURIComponent(prefijo)}=${encodeURIComponent(String(obj))}`);
  return partes;
}

async function stripe<T = Record<string, any>>(metodo: "GET" | "POST", ruta: string, datos?: unknown, cuenta?: string): Promise<T> {
  const clave = Deno.env.get("STRIPE_SECRET_KEY");
  if (!clave) throw new ErrorApp("Falta el secreto STRIPE_SECRET_KEY en las funciones de Supabase", 500);
  const cabeceras: Record<string, string> = { Authorization: `Bearer ${clave}` };
  if (cuenta) cabeceras["Stripe-Account"] = cuenta;
  let url = `${STRIPE}${ruta}`;
  let cuerpo: string | undefined;
  const form = formulario(datos).join("&");
  if (metodo === "GET") {
    if (form) url += `?${form}`;
  } else {
    cabeceras["Content-Type"] = "application/x-www-form-urlencoded";
    cuerpo = form;
  }
  const r = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo });
  const t = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (t as any)?.error?.message ?? `Stripe respondió ${r.status}`;
    throw new ErrorApp(`Stripe: ${msg}`, r.status >= 500 ? 502 : 400);
  }
  return t as T;
}

const centimos = (euros: number) => Math.round(euros * 100);

// ---------------------------------------------------------------- Datos

function telefonoInternacional(t: string | null | undefined): string | undefined {
  const s = (t ?? "").replace(/[^\d+]/g, "");
  if (!s) return undefined;
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  return `+34${s}`;
}

function estadoCuenta(a: Record<string, any>): "pendiente" | "activa" | "restringida" {
  if (a.capabilities?.card_issuing === "active") return "activa";
  if (a.requirements?.disabled_reason && a.details_submitted) return "restringida";
  return "pendiente";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new ErrorApp("Falta la sesión", 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
    const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!publica || !secreta) throw new ErrorApp("Faltan las claves de Supabase", 500);

    const asUser = createClient(url, publica, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    const user = userData?.user;
    if (!user) throw new ErrorApp("Sesión no válida", 401);

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      throw new ErrorApp("Petición no válida");
    }
    const owner = String(body.owner_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(owner)) throw new ErrorApp("Falta la empresa");

    // ¿Puede esta persona gestionar las tarjetas de esa empresa?
    let permitido = owner === user.id;
    const { data: ok, error: errPuede } = await asUser.rpc("puede", { cuenta: owner, modulo: "empresa" });
    if (!errPuede) permitido = Boolean(ok);
    else if (!permitido) {
      const { data: yo } = await asUser.from("profiles").select("role").eq("id", user.id).single();
      permitido = yo?.role === "advisor";
    }
    if (!permitido) throw new ErrorApp("No tienes permiso para gestionar las tarjetas de esta empresa", 403);

    const { data: perfil } = await admin
      .from("profiles")
      .select("*")
      .eq("id", owner)
      .single();
    if (!perfil) throw new ErrorApp("Empresa no encontrada", 404);
    const nombreEmpresa: string = perfil.nombre_comercial || perfil.nombre || perfil.email || "Empresa";

    const cargarCuenta = async () => {
      const { data } = await admin.from("stripe_cuentas").select("*").eq("owner_id", owner).maybeSingle();
      return data as Record<string, any> | null;
    };

    /** Trae de Stripe el estado actual de la cuenta y lo guarda */
    const refrescar = async (cuenta: Record<string, any>) => {
      const a = await stripe("GET", `/accounts/${cuenta.stripe_account_id}`);
      const nuevo = {
        estado: estadoCuenta(a),
        emision_activa: a.capabilities?.card_issuing === "active",
        requisitos: a.requirements?.currently_due ?? [],
        updated_at: new Date().toISOString(),
      };
      await admin.from("stripe_cuentas").update(nuevo).eq("owner_id", owner);
      return { ...cuenta, ...nuevo };
    };

    const enlaceAlta = async (cuentaStripe: string) => {
      const l = await stripe("POST", "/account_links", {
        account: cuentaStripe,
        type: "account_onboarding",
        refresh_url: `${APP_URL}/tarjetas?alta=reintentar`,
        return_url: `${APP_URL}/tarjetas?alta=ok`,
      });
      return l.url as string;
    };

    const accion = String(body.accion ?? "");

    // ------------------------------------------------------------- estado
    if (accion === "estado") {
      let cuenta = await cargarCuenta();
      let saldo: number | null = null;
      if (cuenta) {
        try {
          cuenta = await refrescar(cuenta);
          const b = await stripe("GET", "/balance", undefined, cuenta.stripe_account_id);
          const disp = (b.issuing?.available ?? []).find((x: any) => x.currency === "eur");
          saldo = disp ? disp.amount / 100 : 0;
        } catch {
          /* se enseña lo último que se guardó */
        }
      }
      const [{ data: tarjetas }, { data: movimientos }] = await Promise.all([
        admin.from("tarjetas").select("*").eq("owner_id", owner).order("created_at", { ascending: false }),
        admin.from("tarjetas_movimientos").select("*").eq("owner_id", owner).order("fecha", { ascending: false }).limit(100),
      ]);
      return json({ cuenta, saldo, tarjetas: tarjetas ?? [], movimientos: movimientos ?? [] });
    }

    // ------------------------------------------------- activar / enlace
    if (accion === "activar" || accion === "enlace") {
      let cuenta = await cargarCuenta();
      if (!cuenta) {
        if (accion === "enlace") throw new ErrorApp("Todavía no has activado las tarjetas");
        const a = await stripe("POST", "/accounts", {
          country: "ES",
          email: perfil.email,
          controller: {
            stripe_dashboard: { type: "none" },
            fees: { payer: "application" },
            losses: { payments: "stripe" }, // con alta alojada por Stripe, Stripe responde de saldos negativos y devoluciones
            requirement_collection: "stripe",
          },
          // card_issuing solo se puede pedir cuando Stripe ha dado de alta a la plataforma en Issuing (aprobación de ventas).
          // Hasta entonces la cuenta se crea sin esa capacidad. Con STRIPE_EMISION=1 se pide también.
          capabilities: Deno.env.get("STRIPE_EMISION") === "1"
            ? { card_issuing: { requested: true }, card_payments: { requested: true }, transfers: { requested: true } }
            : { card_payments: { requested: true }, transfers: { requested: true } }, // en la UE, transfers exige card_payments
          business_profile: { name: nombreEmpresa, url: "https://nomotax.io", product_description: "Gastos de empresa con tarjeta" },
          metadata: { nomotax_owner: owner },
        });
        const fila = { owner_id: owner, stripe_account_id: a.id as string, estado: estadoCuenta(a), emision_activa: false, requisitos: a.requirements?.currently_due ?? [] };
        const { error } = await admin.from("stripe_cuentas").insert(fila);
        if (error) throw new ErrorApp("No se ha podido guardar la cuenta de Stripe", 500);
        cuenta = await cargarCuenta();
      }
      // Alta integrada en la app: no hace falta enlace, la pantalla pide después una sesión («sesion»)
      if (body.sin_enlace) return json({ ok: true });
      return json({ url: await enlaceAlta(cuenta!.stripe_account_id) });
    }

    // Lo siguiente necesita la cuenta ya activada
    let cuenta = await cargarCuenta();
    if (!cuenta) throw new ErrorApp("Primero activa las tarjetas de la empresa");

    // --------------------------------------------------------------- sesion
    // Alta integrada: Stripe da una clave de un solo uso para pintar su formulario dentro de la app.
    if (accion === "sesion") {
      const sesion = await stripe("POST", "/account_sessions", {
        account: cuenta.stripe_account_id,
        components: { account_onboarding: { enabled: true, features: { external_account_collection: true } } },
      });
      return json({ client_secret: sesion.client_secret });
    }

    // ------------------------------------------------------------- fondos
    if (accion === "fondos") {
      // Pendiente de confirmar con Stripe para España: en pruebas se puede añadir saldo desde su panel.
      try {
        const f = await stripe("POST", "/funding_instructions", {
          funding_type: "bank_transfer",
          currency: "eur",
          bank_transfer: { type: "eu_bank_transfer", eu_bank_transfer: { country: "ES" } },
        }, cuenta.stripe_account_id);
        return json({ instrucciones: f.bank_transfer ?? f });
      } catch (e) {
        throw new ErrorApp(`No se han podido obtener los datos para ingresar: ${(e as Error).message}`);
      }
    }

    cuenta = await refrescar(cuenta);

    // ------------------------------------------------------ crear_tarjeta
    if (accion === "crear_tarjeta") {
      if (!cuenta.emision_activa) throw new ErrorApp("Falta completar el alta en Stripe para poder emitir tarjetas");
      const alias = String(body.alias ?? "").trim().slice(0, 60);
      if (!alias) throw new ErrorApp("Ponle un nombre a la tarjeta");
      const tipo = body.tipo === "fisica" ? "physical" : "virtual";
      const limite = body.limite_mensual == null || body.limite_mensual === "" ? null : Number(body.limite_mensual);
      if (limite !== null && (!Number.isFinite(limite) || limite < 0)) throw new ErrorApp("El límite no es válido");

      // Titular: la propia empresa (se crea la primera vez)
      let titular: string | null = cuenta.titular_id;
      if (!titular) {
        if (!perfil.direccion || !perfil.cp || !perfil.ciudad) throw new ErrorApp("Completa la dirección de la empresa en Configuración → Perfil antes de emitir tarjetas");
        const t = await stripe("POST", "/issuing/cardholders", {
          type: "company",
          name: nombreEmpresa.slice(0, 24),
          email: perfil.email,
          phone_number: telefonoInternacional(perfil.telefono),
          status: "active",
          billing: { address: { line1: perfil.direccion, city: perfil.ciudad, postal_code: perfil.cp, state: perfil.provincia ?? undefined, country: "ES" } },
        }, cuenta.stripe_account_id);
        titular = t.id as string;
        await admin.from("stripe_cuentas").update({ titular_id: titular }).eq("owner_id", owner);
      }

      const c = await stripe("POST", "/issuing/cards", {
        cardholder: titular,
        currency: "eur",
        type: tipo,
        status: "active",
        spending_controls: limite !== null ? { spending_limits: [{ amount: centimos(limite), interval: "monthly" }] } : undefined,
        shipping: tipo === "physical"
          ? { name: nombreEmpresa.slice(0, 24), address: { line1: perfil.direccion, city: perfil.ciudad, postal_code: perfil.cp, state: perfil.provincia ?? undefined, country: "ES" } }
          : undefined,
        metadata: { alias, nomotax_owner: owner },
      }, cuenta.stripe_account_id);

      const { data: fila, error } = await admin
        .from("tarjetas")
        .insert({
          owner_id: owner,
          stripe_card_id: c.id,
          alias,
          titular_nombre: nombreEmpresa.slice(0, 26),
          tipo: tipo === "physical" ? "fisica" : "virtual",
          ultimos4: c.last4,
          marca: "Visa",
          exp_mes: c.exp_month,
          exp_anio: c.exp_year,
          estado: "activa",
          limite_mensual: limite,
        })
        .select()
        .single();
      if (error) throw new ErrorApp("La tarjeta se ha creado en Stripe pero no se ha podido guardar. Avisa a tu asesor.", 500);
      return json({ tarjeta: fila });
    }

    // ----------------------------------- estado_tarjeta / límite
    if (accion === "estado_tarjeta" || accion === "limite") {
      const { data: t } = await admin.from("tarjetas").select("*").eq("id", String(body.tarjeta_id ?? "")).eq("owner_id", owner).maybeSingle();
      if (!t) throw new ErrorApp("Tarjeta no encontrada", 404);
      if (t.estado === "cancelada") throw new ErrorApp("La tarjeta ya está cancelada");

      if (accion === "estado_tarjeta") {
        const nuevo = String(body.estado ?? "");
        const mapa: Record<string, string> = { activa: "active", congelada: "inactive", cancelada: "canceled" };
        if (!mapa[nuevo]) throw new ErrorApp("Estado no válido");
        await stripe("POST", `/issuing/cards/${t.stripe_card_id}`, { status: mapa[nuevo] }, cuenta.stripe_account_id);
        const { data } = await admin.from("tarjetas").update({ estado: nuevo, updated_at: new Date().toISOString() }).eq("id", t.id).select().single();
        return json({ tarjeta: data });
      }

      const limite = body.limite_mensual == null || body.limite_mensual === "" ? null : Number(body.limite_mensual);
      if (limite !== null && (!Number.isFinite(limite) || limite < 0)) throw new ErrorApp("El límite no es válido");
      await stripe("POST", `/issuing/cards/${t.stripe_card_id}`, {
        spending_controls: { spending_limits: limite !== null ? [{ amount: centimos(limite), interval: "monthly" }] : "" },
      }, cuenta.stripe_account_id);
      const { data } = await admin.from("tarjetas").update({ limite_mensual: limite, updated_at: new Date().toISOString() }).eq("id", t.id).select().single();
      return json({ tarjeta: data });
    }

    throw new ErrorApp("Acción no reconocida");
  } catch (e) {
    if (e instanceof ErrorApp) return json({ error: e.message }, e.estado);
    console.error(e);
    return json({ error: "Error inesperado en el servidor" }, 500);
  }
});
