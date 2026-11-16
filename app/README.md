# NomoTax · Área de clientes

App web para clientes de NomoTax: gastos con lectura automática (OCR con Claude), facturas, presupuestos, clientes, resumen, **laboral** (altas de trabajadores, fichas con costes y nóminas por meses) y **contabilidad** automática (libro diario, mayor, sumas y saldos, pérdidas y ganancias, balance, inmovilizado y amortizaciones). Panel de asesor para ver todas las cuentas. **Usuarios de la empresa** (admin, socio, comercial, empleado) con permisos por módulo y **Vista de socio**. Publicada en https://clientes.nomotax.io.

- **Frontend:** React + Vite + Tailwind (carpeta `src/`)
- **Backend:** Supabase (login, base de datos, archivos) — `supabase/schema.sql`
- **Funciones:** `ocr-factura` (lee facturas), `leer-nomina` (lee nóminas, solo asesor), `invitar-cliente` (alta de clientes), `invitar-miembro` (usuarios de la empresa), `vista-socio` (cifras para socios) y `enviar-factura` (envía facturas a los clientes de cada empresa), en `supabase/functions/`

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

## Usuarios de la empresa

Cada empresa (el titular de la cuenta) da acceso a otras personas desde **Usuarios** (`src/pages/Usuarios.tsx`):

| Rol | Qué ve |
|---|---|
| Administración | Los módulos que se le activen: ventas, gastos, bancos, contabilidad, impuestos, laboral, nóminas, usuarios, datos de la empresa. Siempre la Vista de socio y Mi asesor |
| Socio | Solo la **Vista de socio** (cifras, pérdidas y ganancias, balance, liquidez, plantilla, informe PDF) y Mi asesor |
| Comercial | Presupuestos, clientes y facturas **en borrador** (las emite el titular o administración) |
| Empleado | **Mi espacio**: sube sus tickets (quedan pendientes de revisar) y ve sus nóminas, documentos y ficha |

Lo que manda es la base de datos (`supabase/usuarios.sql`: funciones `puede()`, `mi_rol()`, `puede_archivo()` y todas las reglas de acceso); la app solo esconde lo que no toca (`src/lib/permisos.ts`). La Vista de socio de quien no ve todos los documentos se calcula en el servidor (`vista-socio`), que solo devuelve totales.

Puesta en marcha:
1. SQL Editor → pega `supabase/usuarios.sql` → Run.
2. Edge Functions → `invitar-miembro`: pega `supabase/functions/invitar-miembro/index.ts`.
3. `node scripts/empaquetar-facturar.mjs vista-socio` y pega `supabase/functions/vista-socio/index.ts` como función `vista-socio`.

Pruebas de las reglas de acceso, sin tocar Supabase: `test-data/probar-usuarios-sql.mjs` (Postgres en memoria con PGlite).

## Envío de facturas a los clientes de cada empresa

Desde una factura emitida, **Enviar por email** (`src/components/EnviarFactura.tsx`): sale desde **invoice@nomotax.io** con el nombre de la empresa («Empresa vía NomoTax»), con el PDF adjunto, su logo y su color, y **Responder a** = el email de respuestas de la empresa, así las respuestas le llegan a ella y no a NomoTax. La plantilla (asunto y mensaje con `{cliente}`, `{numero}`, `{total}`, `{fecha}`, `{vencimiento}`, `{empresa}`) se edita en **Configuración → Envío de facturas** (`src/components/EnvioFacturas.tsx`). Diseño del correo: `src/lib/correoFactura.ts`. A clientes de fuera de España se les envía en inglés. El PDF lleva al pie «Creado con NomoTax · nomotax.io».

Puesta en marcha:
1. Hostinger: invoice@nomotax.io es un **alias** de info@nomotax.io. La función entra con info@ (secretos `SMTP_USER` / `SMTP_PASSWORD`, los de siempre) y envía como invoice@. Si Hostinger no lo deja, sale desde info@ (también con «Responder a» de la empresa). Con un buzón propio: `SMTP_FACTURAS_USER` + `SMTP_FACTURAS_PASSWORD`.
2. SQL Editor → pega `supabase/envio-facturas.sql` → Run (después de `usuarios.sql`). La función envía aunque falte, pero sin registro de envíos ni «Enviada el…».
3. (Opcional) Secret `FACTURAS_FROM` si el remitente no es invoice@nomotax.io.
4. `node scripts/empaquetar-facturar.mjs enviar-factura` y pega `supabase/functions/enviar-factura/index.ts` como función `enviar-factura`.

Puede enviar quien puede emitir (titular, asesor, administración con «ventas»; el comercial no). Máximo 5 destinatarios por envío y 100 envíos al día por empresa (`FACTURAS_LIMITE_DIA`). Cada envío queda en `envios_factura`.

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
