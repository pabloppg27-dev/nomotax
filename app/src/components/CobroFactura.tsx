/**
 * Tarjeta «Cobro» del editor de facturas: en qué moneda sale la factura y qué cuentas aparecen para pagarla.
 * Los precios se escriben siempre en euros; si la factura va en otra moneda se convierten al cambio del BCE.
 */
import { ArrowRightLeft, Landmark, Loader2 } from 'lucide-react'
import { useConfig } from './Configuracion'
import { fecha as fmtFecha, eur, num } from '../lib/format'
import {
  MONEDAS,
  cuentasDe,
  esEur,
  infoMoneda,
  monedaDePais,
  monedasConCuenta,
  resumenCuenta,
  dinero,
  type CuentaBancaria,
} from '../lib/cuentasBancarias'
import type { Profile } from '../lib/types'
import { Button, Field, Select } from './ui'

export interface EleccionCobro {
  moneda: string
  cuentaLocal: string | null
  cuentaEur: string | null
}

export default function CobroFactura({
  owner,
  valor,
  onChange,
  cambio,
  cargandoCambio,
  totalEur,
  totalMoneda,
  paisCliente,
  bloqueada,
  cuentasEmitida,
}: {
  owner: Profile
  valor: EleccionCobro
  onChange: (v: EleccionCobro) => void
  cambio: { tasa: number; fecha: string } | null
  cargandoCambio: boolean
  totalEur: number
  /** Total en la moneda de la factura (de las líneas ya convertidas) */
  totalMoneda: number | null
  paisCliente: string | null | undefined
  bloqueada: boolean
  /** Factura emitida: las cuentas que lleva (no se pueden cambiar) */
  cuentasEmitida: CuentaBancaria[]
}) {
  const { abrir } = useConfig()
  const cuentas = cuentasDe(owner)
  const { moneda } = valor
  const otra = !esEur(moneda)
  const local = monedaDePais(paisCliente)

  const lineaCambio =
    otra &&
    (cargandoCambio ? (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Consultando el cambio del BCE…
      </p>
    ) : cambio ? (
      <div className="rounded-xl bg-paper px-4 py-3 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 font-medium">
          <span className="num">{eur(totalEur)}</span>
          <ArrowRightLeft className="size-3.5 text-muted" />
          <span className="num">{dinero(totalMoneda ?? 0, moneda)}</span>
        </p>
        <p className="mt-0.5 text-muted">
          Cambio oficial del BCE del {fmtFecha(cambio.fecha)}: 1€ = {num(cambio.tasa, 4)} {moneda}. La contabilidad sigue en euros.
        </p>
      </div>
    ) : (
      <p className="text-sm text-ambar">No se ha podido consultar el cambio del BCE. Vuelve a intentarlo en un momento.</p>
    ))

  // Emitida: solo se enseña lo que lleva
  if (bloqueada) {
    return (
      <>
        <h2 className="mb-3 font-semibold">Cobro</h2>
        <p className="mb-3 text-sm text-muted">
          Factura en <strong className="text-ink">{moneda}</strong>
          {otra && ` · ${infoMoneda(moneda).nombre}`}
        </p>
        {lineaCambio}
        <ul className="mt-3 space-y-1.5 text-sm">
          {cuentasEmitida.length ? (
            cuentasEmitida.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11px] text-lima">{c.moneda}</span>
                <span className="num truncate">{resumenCuenta({ ...c, alias: c.alias || c.banco || '' })}</span>
              </li>
            ))
          ) : (
            <li className="text-muted">Sin cuenta para el cobro</li>
          )}
        </ul>
      </>
    )
  }

  const deMoneda = (m: string) => cuentas.filter((c) => c.moneda === m)
  // Euros, las monedas en las que tienes cuenta y la del país del cliente
  const opciones = [...new Set(['EUR', ...monedasConCuenta(cuentas), ...(esEur(local) ? [] : [local]), moneda])]
  const sugerir = !esEur(local) && moneda !== local && deMoneda(local).length > 0

  if (!cuentas.length && !otra) {
    return (
      <>
        <h2 className="mb-3 font-semibold">Cobro</h2>
        <div className="flex flex-col gap-3 rounded-xl bg-paper p-4 sm:flex-row sm:items-center">
          <Landmark className="size-5 shrink-0 text-muted" />
          <p className="flex-1 text-sm text-muted">Añade tus cuentas bancarias para que salgan en la factura (en euros, dólares, libras…).</p>
          <Button size="sm" variant="secondary" onClick={() => abrir('bancos')}>
            Añadir cuenta
          </Button>
        </div>
        <MonedaSelect valor={valor} onChange={onChange} opciones={opciones} />
      </>
    )
  }

  return (
    <>
      <h2 className="mb-3 font-semibold">Cobro</h2>
      {sugerir && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl bg-lima/30 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <p className="flex-1">
            Cliente de {paisCliente}: puedes facturarle en <strong>{local}</strong> y darle tu cuenta en {local}.
          </p>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onChange({ ...valor, moneda: local, cuentaLocal: (deMoneda(local).find((c) => c.predeterminada) ?? deMoneda(local)[0])?.id ?? null })}
          >
            Facturar en {local}
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <MonedaSelect valor={valor} onChange={onChange} opciones={opciones} />

        {otra && (
          <Field label={`Cuenta en ${moneda}`}>
            {deMoneda(moneda).length ? (
              <Select value={valor.cuentaLocal ?? ''} onChange={(e) => onChange({ ...valor, cuentaLocal: e.target.value || null })}>
                {deMoneda(moneda).map((c) => (
                  <option key={c.id} value={c.id}>
                    {resumenCuenta(c)}
                  </option>
                ))}
                <option value="">No ponerla</option>
              </Select>
            ) : (
              <button type="button" onClick={() => abrir('bancos')} className="h-10 w-full rounded-lg border border-dashed border-line px-3 text-left text-sm text-muted hover:border-ink/30">
                No tienes cuenta en {moneda} · Añadir
              </button>
            )}
          </Field>
        )}

        <Field label="Cuenta en euros" className={otra ? 'sm:col-span-2' : undefined}>
          {deMoneda('EUR').length ? (
            <Select value={valor.cuentaEur ?? ''} onChange={(e) => onChange({ ...valor, cuentaEur: e.target.value || null })}>
              {deMoneda('EUR').map((c) => (
                <option key={c.id} value={c.id}>
                  {resumenCuenta(c)}
                </option>
              ))}
              <option value="">No ponerla</option>
            </Select>
          ) : (
            <button type="button" onClick={() => abrir('bancos')} className="h-10 w-full rounded-lg border border-dashed border-line px-3 text-left text-sm text-muted hover:border-ink/30">
              No tienes cuenta en euros · Añadir
            </button>
          )}
        </Field>
      </div>
      {otra && <div className="mt-4">{lineaCambio}</div>}
      {otra && <p className="mt-2 text-xs text-muted">Escribe los precios en euros: en el PDF salen en {moneda}, con el contravalor en euros al pie.</p>}
    </>
  )
}

function MonedaSelect({ valor, onChange, opciones }: { valor: EleccionCobro; onChange: (v: EleccionCobro) => void; opciones: string[] }) {
  const cuentasOrden = MONEDAS.map((m) => m.codigo)
  const lista = [...opciones].sort((a, b) => cuentasOrden.indexOf(a) - cuentasOrden.indexOf(b))
  return (
    <Field label="Moneda de la factura">
      <Select value={valor.moneda} onChange={(e) => onChange({ ...valor, moneda: e.target.value, cuentaLocal: null })}>
        {lista.map((m) => (
          <option key={m} value={m}>
            {m} · {infoMoneda(m).nombre}
          </option>
        ))}
      </Select>
    </Field>
  )
}
