// Avisos de Stripe (webhook de Connect) para las tarjetas: estado de la cuenta, tarjetas, autorizaciones y compras.
// En Stripe → Developers → Webhooks → «Añadir endpoint»: URL de esta función, «Eventos de cuentas conectadas»
// y estos eventos: account.updated, issuing_card.updated, issuing_authorization.created,
// issuing_authorization.updated, issuing_transaction.created. Stripe da una clave «whsec_…»: se guarda como
// secreto STRIPE_WEBHOOK_SECRET. En esta función hay que DESACTIVAR la verificación JWT (Stripe no envía sesión):
// se protege con la firma del propio aviso.

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";

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

const enc = new TextEncoder();

function aHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Firma de Stripe: cabecera «t=…,v1=…»; v1 = HMAC-SHA256(secreto, `${t}.${cuerpo}`). Se rechaza si pasan más de 5 minutos. */
async function firmaValida(cuerpo: string, cabecera: string | null, secreto: string): Promise<boolean> {
  if (!cabecera) return false;
  const partes = Object.fromEntries(cabecera.split(",").map((p) => p.split("=") as [string, string]));
  const t = partes["t"];
  const v1 = cabecera.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || v1.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const clave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperada = aHex(await crypto.subtle.sign("HMAC", clave, enc.encode(`${t}.${cuerpo}`)));
  return v1.some((x) => x.length === esperada.length && x === esperada);
}

const estadoCuenta = (a: Record<string, any>) =>
  a.capabilities?.card_issuing === "active" ? "activa" : a.requirements?.disabled_reason && a.details_submitted ? "restringida" : "pendiente";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  const secreto = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secreto) return new Response("Falta STRIPE_WEBHOOK_SECRET", { status: 500 });

  const cuerpo = await req.text();
  if (!(await firmaValida(cuerpo, req.headers.get("stripe-signature"), secreto))) return new Response("Firma no válida", { status: 400 });

  const evento = JSON.parse(cuerpo) as { type: string; account?: string; data: { object: Record<string, any> } };
  const obj = evento.data.object;

  const url = Deno.env.get("SUPABASE_URL")!;
  const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secreta) return new Response("Faltan las claves de Supabase", { status: 500 });
  const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

  // Cuenta conectada → empresa
  const cuentaStripe = evento.type === "account.updated" ? (obj.id as string) : evento.account;
  if (!cuentaStripe) return new Response("ok");
  const { data: cuenta } = await admin.from("stripe_cuentas").select("owner_id").eq("stripe_account_id", cuentaStripe).maybeSingle();
  if (!cuenta) return new Response("ok");
  const owner = cuenta.owner_id as string;

  switch (evento.type) {
    case "account.updated":
      await admin
        .from("stripe_cuentas")
        .update({
          estado: estadoCuenta(obj),
          emision_activa: obj.capabilities?.card_issuing === "active",
          requisitos: obj.requirements?.currently_due ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", owner);
      break;

    case "issuing_card.updated": {
      const estado = obj.status === "active" ? "activa" : obj.status === "inactive" ? "congelada" : "cancelada";
      await admin.from("tarjetas").update({ estado, updated_at: new Date().toISOString() }).eq("stripe_card_id", obj.id).eq("owner_id", owner);
      break;
    }

    case "issuing_authorization.created":
    case "issuing_authorization.updated":
    case "issuing_transaction.created": {
      const esTransaccion = evento.type === "issuing_transaction.created";
      const cardId = typeof obj.card === "string" ? obj.card : obj.card?.id;
      const { data: t } = await admin.from("tarjetas").select("id").eq("stripe_card_id", cardId).eq("owner_id", owner).maybeSingle();
      const comercio = obj.merchant_data?.name ?? null;
      const categoria = obj.merchant_data?.category ?? null;
      const importe = Math.abs(Number(esTransaccion ? obj.amount : obj.amount)) / 100;
      const moneda = String(esTransaccion ? obj.currency : obj.currency ?? "eur").toUpperCase();
      let estado: "aprobada" | "rechazada" | "pendiente" | "reembolsada" = "aprobada";
      let motivo: string | null = null;
      if (!esTransaccion) {
        if (obj.status === "closed" && !obj.approved) {
          estado = "rechazada";
          motivo = obj.request_history?.[0]?.reason ?? null;
        } else if (obj.status === "pending") estado = "pendiente";
      } else if (obj.type === "refund") estado = "reembolsada";

      // Una compra aprobada llega primero como autorización y luego como transacción: la transacción la sustituye
      await admin.from("tarjetas_movimientos").upsert(
        {
          owner_id: owner,
          tarjeta_id: t?.id ?? null,
          stripe_id: obj.id,
          importe,
          moneda,
          comercio,
          categoria,
          estado,
          motivo,
          fecha: new Date((obj.created ?? Date.now() / 1000) * 1000).toISOString(),
        },
        { onConflict: "stripe_id" },
      );
      if (esTransaccion && obj.authorization) await admin.from("tarjetas_movimientos").delete().eq("stripe_id", obj.authorization).eq("owner_id", owner);
      break;
    }
  }
  return new Response("ok");
});
