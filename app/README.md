# NomoTax · Área de clientes

App web para clientes de NomoTax: gastos con lectura automática (OCR con Claude), facturas, presupuestos, clientes, resumen y **laboral** (altas de trabajadores, fichas con costes y nóminas por meses). Panel de asesor para ver todas las cuentas. Publicada en https://clientes.nomotax.io.

- **Frontend:** React + Vite + Tailwind (carpeta `src/`)
- **Backend:** Supabase (login, base de datos, archivos) — `supabase/schema.sql`
- **Funciones:** `ocr-factura` (lee facturas), `leer-nomina` (lee nóminas, solo asesor) e `invitar-cliente` (alta de clientes), en `supabase/functions/`

## Puesta en marcha (una sola vez)

1. **Base de datos.** Supabase → SQL Editor → New query → pega `supabase/schema.sql` entero → Run. Después, igual con `supabase/laboral.sql` y `supabase/rectificativas.sql`.
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

## Pendiente antes de usarlo con clientes reales

- **Verifactu:** mientras `MODO_PRUEBAS_FACTURAS = true` (`src/lib/config.ts`), las facturas salen marcadas como documento de pruebas.
- **Email propio (SMTP):** el email de Supabase por defecto solo llega a miembros del equipo; para «He olvidado la contraseña» hace falta configurar un SMTP (Authentication → Emails).
- **Seguridad y RGPD:** revisión de seguridad, contratos de encargado del tratamiento (Supabase, Anthropic), política de privacidad.
