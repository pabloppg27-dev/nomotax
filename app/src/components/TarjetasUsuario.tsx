import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Plus, SlidersHorizontal } from 'lucide-react'
import { eur } from '../lib/format'
import { errorMessage } from '../lib/supabase'
import {
  cargarEstado,
  cargarPersonas,
  configurarTarjeta,
  crearTarjeta,
  tarjetasDeUsuario,
  type Persona,
  type Tarjeta,
} from '../lib/tarjetas'
import TarjetaVisual from './TarjetaVisual'
import { ConfigurarTarjeta, NuevaTarjeta } from './FormTarjeta'
import { Badge, Button, Empty, Loading, Modal, notify } from './ui'

/** Desde Usuarios: las tarjetas de una persona de la empresa, darle una nueva o cambiar sus límites */
export default function TarjetasUsuario({
  ownerId,
  nombreEmpresa,
  usuario,
  onClose,
}: {
  ownerId: string
  nombreEmpresa: string
  usuario: { user_id: string; nombre: string }
  onClose: () => void
}) {
  const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null)
  const [puedeEmitir, setPuedeEmitir] = useState<boolean | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [nueva, setNueva] = useState(false)
  const [configDe, setConfigDe] = useState<Tarjeta | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([tarjetasDeUsuario(ownerId, usuario.user_id), cargarEstado(ownerId, nombreEmpresa)])
      setTarjetas(t)
      setPuedeEmitir(Boolean(e.cuenta?.emision_activa))
    } catch (e) {
      notify(await errorMessage(e), 'error')
      setTarjetas([])
      setPuedeEmitir(false)
    }
  }, [ownerId, usuario.user_id, nombreEmpresa])

  useEffect(() => {
    cargar()
    cargarPersonas(ownerId).then(setPersonas).catch(() => setPersonas([]))
  }, [cargar, ownerId])

  const nombre = usuario.nombre.slice(0, 26)

  return (
    <>
      <Modal
        open={!nueva && !configDe}
        onClose={onClose}
        title={`Tarjetas de ${usuario.nombre}`}
        footer={
          puedeEmitir ? (
            <Button icon={<Plus className="size-4" />} onClick={() => setNueva(true)}>
              Dar tarjeta
            </Button>
          ) : undefined
        }
      >
        {tarjetas === null || puedeEmitir === null ? (
          <Loading />
        ) : !puedeEmitir ? (
          <div className="text-[15px]">
            <p>Para dar tarjetas, primero hay que activar las tarjetas de la empresa.</p>
            <Link to="/tarjetas" onClick={onClose} className="mt-2 inline-block font-medium underline">
              Ir a Tarjetas
            </Link>
          </div>
        ) : tarjetas.length === 0 ? (
          <Empty icon={<CreditCard className="size-5" />} title="Todavía no tiene tarjeta" text="Dale una con su nombre y sus límites. La verá en su menú, en «Mi tarjeta»." />
        ) : (
          <ul className="space-y-5">
            {tarjetas.map((t) => (
              <li key={t.id} className="space-y-2">
                <TarjetaVisual titular={t.asignada_a || t.titular_nombre} alias={t.alias} ultimos4={t.ultimos4} exp_mes={t.exp_mes} exp_anio={t.exp_anio} estado={t.estado} tipo={t.tipo} className="max-w-[300px]" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{t.alias}</span>
                    {t.estado === 'congelada' && (
                      <span className="ml-2">
                        <Badge tono="ambar">Congelada</Badge>
                      </span>
                    )}
                    <div className="text-xs text-muted">
                      {t.limite_mensual === null ? 'Sin límite al mes' : `${eur(t.limite_mensual)}/mes`}
                      {t.limite_compra != null && ` · máx. ${eur(t.limite_compra)} por compra`}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setConfigDe(t)}>
                    Configurar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {nueva && (
        <NuevaTarjeta
          titular={nombreEmpresa}
          personas={personas}
          inicial={{ user_id: usuario.user_id, asignada_a: nombre }}
          onClose={() => setNueva(false)}
          onCrear={async (d) => {
            await crearTarjeta(ownerId, { ...d, titular: nombreEmpresa })
            notify(`Tarjeta creada para ${usuario.nombre}`)
            setNueva(false)
            await cargar()
          }}
        />
      )}
      {configDe && (
        <ConfigurarTarjeta
          t={configDe}
          titular={nombreEmpresa}
          personas={personas}
          onClose={() => setConfigDe(null)}
          onGuardar={async (c) => {
            await configurarTarjeta(ownerId, configDe.id, c, nombreEmpresa)
            notify('Tarjeta actualizada')
            setConfigDe(null)
            await cargar()
          }}
        />
      )}
    </>
  )
}
