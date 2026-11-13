# NomoTax · Área de clientes

App web para clientes de NomoTax: gastos con lectura automática (OCR con Claude), facturas, presupuestos, clientes, resumen, **laboral** (altas de trabajadores, fichas con costes y nóminas por meses) y **contabilidad** automática (libro diario, mayor, sumas y saldos, pérdidas y ganancias, balance, inmovilizado y amortizaciones). Panel de asesor para ver todas las cuentas. Publicada en https://clientes.nomotax.io.

- **Frontend:** React + Vite + Tailwind (carpeta `src/`)
- **Backend:** Supabase (login, base de datos, archivos) — `supabase/schema.sql`
- **Funciones:** `ocr-factura` (lee facturas), `leer-nomina` (lee nóminas, solo asesor) e `invitar-cliente` (alta de clientes), en `supabase/functions/`

## Puesta en marcha (una sola vez)

1. **Base de datos.** Supabase → SQL Editor → New query → pega `supabase/schema.sql` entero → Run. Después, igual con `supabase/laboral.sql`, `supabase/rectificativas.sql`, `supabase/asesor.sql`, `supabase/contabilidad.sql` , `supabase/divisas.sql` , `supabase/bienvenida.sql` y `supabase/impuestos.sql`.
2. **Login cerrado.** Authentication → Sign In / Providers → desactiva «Allow new users to sign up».
   Authentication → URL Configuration → Site URL `http://localhost:5173` (luego `https://clientes.nomotax.io`).
3. **Tu usuario.** Authentication → Users → Add user → con tu email y contraseña (marca «Auto confirm»).
   Después, en el SQL Editor:
   ```sql
   update public.profiles set role = 'advisor' where email = 'TU-EMAIL';
   ```
4. **Clave de Anthropic.** Edge Functions → Secrets → `ANTHROPIC_API_KEY` = tu clave.
5. **Funciones.** Edge Functions → Deploy a new function → Via Editor: pega cada `index.ts` con su nombre (`ocr-factura`, `leer-nomina`, `invitar-cliente`). La API de Claude admite como máximo 16 campos opcionales (anyOf) en el esquema de respuesta.
6. **Conexión del frontend.** Copia `.env.example` como `.env.local` y pon la Project URL y la clave publishable (o anon).

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/ para publicar
```

## Contabilidad

Los asientos no se guardan: se calculan al momento (`src/lib/contabilidad.ts`, plan PGC PYMES, subcuentas de 8 dígitos) a partir de las facturas, gastos revisados, nóminas publicadas, la apertura/asientos manuales y el inmovilizado. Por eso cualquier cambio en la plataforma actualiza todos los libros.

- **Amortizaciones:** la IA marca si un gasto es una inversión; si pasa de 300 € queda «en revisión» y el asesor decide en el propio gasto si es gasto o inmovilizado (tipo, coeficiente, fecha). Lista en el Panel del asesor.
- **Exportar:** Excel con todos los libros, y asientos para A3, Sage y Holded (`src/lib/exportar.ts`). Haz una importación de prueba en cada programa antes de usarlo de verdad: cada versión puede pedir columnas algo distintas.

### Copia automática a las carpetas de clientes

`scripts/sincronizar.ts` copia todo a `~/Documents/NomoTax Clientes/<Cliente>/` (libros en `02 Contabilidad/<año>/Libros contables/Área de clientes`, facturas recibidas y emitidas subidas, nóminas en `06 Laboral/<año>/Nóminas/Área de clientes`). Solo escribe dentro de las carpetas «Área de clientes».

1. Copia `scripts/sincronizar.env.example` como `scripts/sincronizar.env` y pega la clave secreta de Supabase (Project Settings → API Keys → Secret keys). Ese archivo no se sube nunca.
2. `npm run sincronizar` hace una pasada. `npm run sincronizar:instalar` la deja siempre activa en este Mac (escucha cambios en directo y repasa todo cada 30 min). `npm run sincronizar:quitar` la desactiva.

## Pendiente antes de usarlo con clientes reales

- **Verifactu:** mientras `MODO_PRUEBAS_FACTURAS = true` (`src/lib/config.ts`), las facturas salen marcadas como documento de pruebas.
- **Email propio (SMTP):** el email de Supabase por defecto solo llega a miembros del equipo; para «He olvidado la contraseña» hace falta configurar un SMTP (Authentication → Emails).
- **Seguridad y RGPD:** revisión de seguridad, contratos de encargado del tratamiento (Supabase, Anthropic), política de privacidad.
