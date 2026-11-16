# NomoTax — contexto para Claude

Pablo Pérez del Pulgar dirige NomoTax (asesoría fiscal). Habla español y dicta por voz: respuestas cortas, claras, sin rodeos. Ejecuta tras su OK; antes de construir algo grande, propón la estructura y espera su visto bueno.

## Qué hay
- Raíz: web estática nomotax.io (HTML/CSS/JS, 38 páginas ES/EN). Al cambiar `css/style.css`, subir el `?v=` en todas las páginas.
- `app/`: **Área de clientes** (clientes.nomotax.io). React 19 + Vite + Tailwind 4 + TypeScript. Supabase (ref `oepixesrcjbpsqsjroam`).
- Despliegue: `git push` a `main` → GitHub Actions sube por FTP a Hostinger (job `deploy-app` compila `app/`). Comprobar con `gh run watch`.

## Trabajar
- `cd app && npm install && npm run dev` (http://localhost:5173) · `npx tsc --noEmit -p .` antes de publicar · `npm run build`.
- Claves en `app/.env.production` (solo la publishable, pública). **Nunca** pegar claves secretas en el chat ni en el repo. `scripts/sincronizar.env` está en .gitignore.
- SQL: archivos en `app/supabase/*.sql` (schema, laboral, rectificativas, asesor, contabilidad, divisas, bienvenida, impuestos, marca). Se ejecutan pegándolos en Supabase → SQL Editor.
- Edge Functions (`app/supabase/functions/`: ocr-factura, leer-nomina, invitar-cliente) se publican pegando el código en el editor del dashboard (no hay CLI). Secretos: `ANTHROPIC_API_KEY`, `SMTP_PASSWORD` (buzón info@nomotax.io, Hostinger).
- Reservas/«Mi asesor»: Google Apps Script en `tools/booking/Code.gs`; Pablo pulsa «Implementar» él mismo.

## Reglas de negocio
- Las facturas emitidas **nunca se borran** (lo bloquea la BD): se corrigen con rectificativa.
- Contabilidad PGC PYMES calculada al vuelo desde facturas, gastos, nóminas, apertura e inmovilizado (`src/lib/contabilidad.ts`). Todo en euros: facturas en otra moneda se convierten al cambio BCE del día.
- Formato de importes: `1.234,56€` (punto de miles siempre, € pegado). Usar `eur()` / `num()` de `src/lib/format.ts`.
- La factura sale en el idioma del país del cliente (`src/lib/idiomaFactura.ts`).
- Móvil primero: probar a 390 px; nada que desborde en horizontal.
- Marca: negro `#111110`, lima `#CDF564`, fondo `#f7f7f5`. Cada cliente puede poner su «Color de marca» (profiles.color_marca) para la franja y el total del PDF.
- `MODO_PRUEBAS_FACTURAS` (src/lib/config.ts) sigue en true; Verifactu obligatorio desde oct. 2028 según Pablo.

## Pendiente
- Guardar `SMTP_PASSWORD` en Supabase → luego probar el correo de bienvenida y reenviar acceso a Jorge Espinosa.
- Poner `app/scripts/sincronizar.env` (clave secreta) y `npm run sincronizar:instalar` para la copia a ~/Documents/NomoTax Clientes.
- Probar importación real de A3, Sage y Holded.
