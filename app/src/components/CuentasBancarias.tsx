/**
 * Configuración → «Cuentas bancarias»: las cuentas de la empresa en euros, dólares, libras…
 * Se guardan en profiles.cuentas_bancarias (supabase/cuentas-bancarias.sql). Al facturar se elige
 * cuál sale; a un cliente de EE. UU. o de Reino Unido se le propone la de su moneda.
 */
import { useState } from 'react'
import { Landmark, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage, supabase } from '../lib/supabase'
import { ibanValido, limpiarIban } from '../lib/laboral'
import { nuevoId } from '../lib/id'
import { MONEDAS, cuentasDe, ibanBonito, infoMoneda, type CuentaBancaria } from '../lib/cuentasBancarias'
import { Badge, Button, Card, Field, Input, Modal, Select, confirmar, cx, notify } from './ui'

const vacia = (moneda = 'EUR'): CuentaBancaria => ({
  id: '',
  moneda,
  alias: '',
  banco: '',
  titular: '',
  iban: '',
  numero: '',
  codigo_local: '',
  swift: '',
  direccion_banco: '',
  predeterminada: false,
})

/** Sin campos vacíos y con el IBAN y el SWIFT en su formato */
function limpiar(c: CuentaBancaria): CuentaBancaria {
  const t = (v: string | null | undefined) => v?.trim() || null
  return {
    id: c.id,
    moneda: c.moneda,
    alias: c.alias.trim() || c.banco?.trim() || `Cuenta en ${c.moneda}`,
    banco: t(c.banco),
    titular: t(c.titular),
    iban: c.iban?.trim() ? ibanBonito(c.iban) : null,
    numero: t(c.numero),
    codigo_local: t(c.codigo_local),
    swift: c.swift?.trim() ? c.swift.replace(/\s+/g, '').toUpperCase() : null,
    direccion_banco: t(c.direccion_banco),
    predeterminada: Boolean(c.predeterminada),
  }
}

/** Una predeterminada por moneda: la marcada o, si no hay ninguna, la primera */
function normalizar(lista: CuentaBancaria[]): CuentaBancaria[] {
  const vistas = new Set<string>()
  const conDefecto = new Set(lista.filter((c) => c.predeterminada).map((c) => c.moneda))
  return lista.map((c) => {
    const toca = conDefecto.has(c.moneda) ? Boolean(c.predeterminada) : true
    const predeterminada = toca && !vistas.has(c.moneda)
    if (predeterminada) vistas.add(c.moneda)
    return { ...c, predeterminada }
  })
}

export default function CuentasBancarias() {
  const { owner, refresh } = useAuth()
  const [editando, setEditando] = useState<CuentaBancaria | null>(null)
  const [guardando, setGuardando] = useState(false)
  if (!owner) return null
  // La columna existe cuando se ha ejecutado supabase/cuentas-bancarias.sql
  const preparada = 'cuentas_bancarias' in owner
  const cuentas = cuentasDe(owner)

  const guardarLista = async (lista: CuentaBancaria[], aviso: string) => {
    const final = normalizar(lista)
    const eur = final.find((c) => c.moneda === 'EUR' && c.predeterminada && c.iban)
    setGuardando(true)
    const { error } = await supabase
      .from('profiles')
      // La de euros por defecto también en «iban»: la usan los correos y la facturación automática
      .update({ cuentas_bancarias: final, iban: eur?.iban ?? null })
      .eq('id', owner.id)
    setGuardando(false)
    if (error) {
      notify(await errorMessage(error), 'error')
      return false
    }
    await refresh()
    notify(aviso)
    return true
  }

  const guardarCuenta = async (c: CuentaBancaria) => {
    const m = infoMoneda(c.moneda)
    const iban = limpiarIban(c.iban)
    if (m.formato === 'iban' && !iban) return notify('Pon el IBAN de la cuenta', 'error')
    if (m.formato === 'local' && !iban && !c.numero?.trim()) return notify('Pon el número de cuenta (o el IBAN)', 'error')
    if (iban && !ibanValido(iban)) return notify('El IBAN no parece correcto: revisa los dígitos', 'error')
    if (c.swift?.trim() && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(c.swift.replace(/\s+/g, ''))) {
      return notify('El SWIFT/BIC tiene 8 u 11 letras y números', 'error')
    }
    const limpia = limpiar({ ...c, id: c.id || nuevoId() })
    // La primera de su moneda queda por defecto; si se marca como predeterminada, se desmarcan las demás de esa moneda
    let lista = cuentas.some((x) => x.id === limpia.id) ? cuentas.map((x) => (x.id === limpia.id ? limpia : x)) : [...cuentas, limpia]
    if (limpia.predeterminada) lista = lista.map((x) => (x.moneda === limpia.moneda && x.id !== limpia.id ? { ...x, predeterminada: false } : x))
    if (await guardarLista(lista, c.id ? 'Cuenta guardada' : 'Cuenta añadida')) setEditando(null)
  }

  const borrar = async (c: CuentaBancaria) => {
    const ok = await confirmar({
      titulo: 'Quitar cuenta',
      texto: `¿Quitar «${c.alias}»? Las facturas ya emitidas la siguen mostrando; las nuevas ya no la ofrecerán.`,
      accion: 'Quitar',
      peligro: true,
    })
    if (ok) await guardarLista(cuentas.filter((x) => x.id !== c.id), 'Cuenta quitada')
  }

  const porDefecto = (c: CuentaBancaria) =>
    guardarLista(
      cuentas.map((x) => (x.moneda === c.moneda ? { ...x, predeterminada: x.id === c.id } : x)),
      `«${c.alias}» es ahora tu cuenta por defecto en ${c.moneda}`,
    )

  const monedas = [...new Set(cuentas.map((c) => c.moneda))].sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b)))

  return (
    <div className="space-y-6">
      {!preparada && (
        <div className="rounded-xl bg-ambar/10 px-4 py-3 text-sm text-ambar">
          Falta activar las cuentas en varias monedas: ejecuta <strong>supabase/cuentas-bancarias.sql</strong> en Supabase.
        </div>
      )}

      <p className="text-[15px] text-ink/75">
        Añade tus cuentas en euros y, si cobras en otras monedas, también las de dólares, libras… Al hacer una factura a un cliente de
        Estados Unidos o Reino Unido te propondremos su moneda y su cuenta, y convertimos los importes al cambio oficial del BCE.
      </p>

      {cuentas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-ink text-lima">
            <Landmark className="size-6" />
          </span>
          <p className="font-medium">Aún no tienes cuentas</p>
          <p className="max-w-sm text-sm text-muted">La cuenta que elijas aparece en tus facturas para que el cliente sepa dónde pagar.</p>
        </Card>
      ) : (
        monedas.map((m) => (
          <section key={m}>
            <h4 className="mb-2 flex items-center gap-2 font-semibold">
              <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-xs text-lima">{m}</span>
              {infoMoneda(m).nombre}
            </h4>
            <div className="space-y-2">
              {cuentas
                .filter((c) => c.moneda === m)
                .map((c) => (
                  <Card key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{c.alias}</span>
                        {c.predeterminada && <Badge tono="verde">Por defecto</Badge>}
                      </p>
                      <p className="num mt-0.5 break-all text-sm text-muted">
                        {[
                          c.iban ? ibanBonito(c.iban) : null,
                          c.numero ? `Cuenta ${c.numero}` : null,
                          c.codigo_local ? `${infoMoneda(c.moneda).local ?? 'Código'} ${c.codigo_local}` : null,
                          c.swift ? `SWIFT ${c.swift}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {c.banco && <p className="truncate text-xs text-muted">{c.banco}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {!c.predeterminada && preparada && (
                        <Button size="sm" variant="ghost" icon={<Star className="size-4" />} onClick={() => porDefecto(c)} disabled={guardando}>
                          Por defecto
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditando(c)} disabled={!preparada}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rojo" icon={<Trash2 className="size-4" />} onClick={() => borrar(c)} disabled={!preparada || guardando} aria-label="Quitar cuenta" />
                    </div>
                  </Card>
                ))}
            </div>
          </section>
        ))
      )}

      <Button icon={<Plus className="size-4" />} onClick={() => setEditando(vacia(cuentas.some((c) => c.moneda === 'EUR') ? 'USD' : 'EUR'))} disabled={!preparada}>
        Añadir cuenta
      </Button>

      {editando && (
        <FormCuenta
          inicial={editando}
          titularPorDefecto={owner.nombre ?? ''}
          esPrimeraDeSuMoneda={(m) => !cuentas.some((c) => c.moneda === m && c.id !== editando.id)}
          guardando={guardando}
          onGuardar={guardarCuenta}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function FormCuenta({
  inicial,
  titularPorDefecto,
  esPrimeraDeSuMoneda,
  guardando,
  onGuardar,
  onClose,
}: {
  inicial: CuentaBancaria
  titularPorDefecto: string
  esPrimeraDeSuMoneda: (moneda: string) => boolean
  guardando: boolean
  onGuardar: (c: CuentaBancaria) => void
  onClose: () => void
}) {
  const [c, setC] = useState<CuentaBancaria>({ ...vacia(inicial.moneda), ...inicial })
  const set = (k: keyof CuentaBancaria) => (e: { target: { value: string } }) => setC((x) => ({ ...x, [k]: e.target.value }))
  const m = infoMoneda(c.moneda)
  const iban = limpiarIban(c.iban)
  const ibanMal = iban.length >= 15 && !ibanValido(iban)
  const primera = esPrimeraDeSuMoneda(c.moneda)

  return (
    <Modal
      open
      onClose={onClose}
      title={inicial.id ? 'Editar cuenta' : 'Nueva cuenta bancaria'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" loading={guardando} onClick={() => onGuardar({ ...c, predeterminada: c.predeterminada || primera })}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Moneda">
          <Select value={c.moneda} onChange={set('moneda')}>
            {MONEDAS.map((x) => (
              <option key={x.codigo} value={x.codigo}>
                {x.codigo} · {x.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nombre para reconocerla" hint="Solo lo ves tú">
          <Input value={c.alias} onChange={set('alias')} placeholder={c.moneda === 'EUR' ? 'BBVA principal' : `Wise ${c.moneda}`} />
        </Field>

        {m.formato === 'iban' ? (
          <Field label="IBAN" className="sm:col-span-2">
            <Input value={c.iban ?? ''} onChange={set('iban')} placeholder={c.moneda === 'EUR' ? 'ES00 0000 0000 0000 0000 0000' : 'IBAN de la cuenta'} className={cx('num', ibanMal && '!border-ambar')} />
            {ibanMal && <span className="mt-1 block text-xs text-ambar">El IBAN no parece correcto.</span>}
          </Field>
        ) : (
          <>
            <Field label="Número de cuenta" hint={c.moneda === 'USD' ? 'Account number' : undefined}>
              <Input value={c.numero ?? ''} onChange={set('numero')} className="num" inputMode="numeric" />
            </Field>
            {m.local ? (
              <Field label={m.local}>
                <Input value={c.codigo_local ?? ''} onChange={set('codigo_local')} placeholder={m.ejemploLocal} className="num" />
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
            <Field label="IBAN (opcional)" className="sm:col-span-2" hint="Si tu banco te da también un IBAN para recibir desde fuera">
              <Input value={c.iban ?? ''} onChange={set('iban')} className={cx('num', ibanMal && '!border-ambar')} />
            </Field>
          </>
        )}

        <Field label="SWIFT / BIC" hint={c.moneda === 'EUR' ? 'Opcional dentro de la zona SEPA' : 'Para pagos desde otro país'}>
          <Input value={c.swift ?? ''} onChange={set('swift')} placeholder="BBVAESMMXXX" className="num uppercase" />
        </Field>
        <Field label="Banco">
          <Input value={c.banco ?? ''} onChange={set('banco')} placeholder={c.moneda === 'USD' ? 'Community Federal Savings Bank' : 'BBVA'} />
        </Field>
        {m.codigo !== 'EUR' && (
          <Field label="Dirección del banco (opcional)" className="sm:col-span-2" hint="Algunos clientes la piden para transferencias internacionales">
            <Input value={c.direccion_banco ?? ''} onChange={set('direccion_banco')} />
          </Field>
        )}
        <Field label="Titular (opcional)" className="sm:col-span-2" hint="Solo si no coincide con tu nombre fiscal">
          <Input value={c.titular ?? ''} onChange={set('titular')} placeholder={titularPorDefecto} />
        </Field>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-ink"
            checked={Boolean(c.predeterminada) || primera}
            disabled={primera}
            onChange={(e) => setC((x) => ({ ...x, predeterminada: e.target.checked }))}
          />
          Cuenta por defecto para facturas en {c.moneda}
        </label>
      </div>
    </Modal>
  )
}
