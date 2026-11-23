# CRM NomoTax

CRM interno de Pablo: tareas por dictado, clientes, proyectos (normales e impuestos), calendario y documentos en una carpeta del Mac.

## Arrancar
    npm install
    npm run dev        # http://localhost:5180

## Dictado con Claude
- **En local**: abre `.env.local` y rellena `ANTHROPIC_API_KEY=` con tu clave (console.anthropic.com → API Keys).
  Se queda en tu Mac (el archivo no se sube) y nunca llega al navegador. Reinicia `npm run dev`.
  Sin clave, el dictado guarda el texto tal cual (modo básico).
- **Publicado**: función de Supabase `crm-dictado`. Se edita `servidor/pensar.ts` (cerebro) o `servidor/funcion.ts`
  y se regenera con `node scripts/empaquetar.mjs`; luego se pega `supabase/functions/crm-dictado/index.ts` en el dashboard.
  Usa el secreto `ANTHROPIC_API_KEY` que ya existe.

## Modo real (Supabase)
1. Pegar `supabase/crm.sql` en el SQL Editor.
2. Publicar `crm-dictado`.
3. `VITE_CRM_MODO=real` en `.env.local` (y en producción).
