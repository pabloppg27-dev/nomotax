/** Panel flotante con las subidas en segundo plano (gastos, tickets, facturas). Se ve en cualquier página. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import { useSubidas, type Subida } from '../lib/subidas'
import { cx } from './ui'

const enMarcha = (s: Subida) => s.estado === 'esperando' || s.estado === 'subiendo' || s.estado === 'leyendo'

function queSon(subidas: Subida[]) {
  const tipos = new Set(subidas.map((s) => s.tipo))
  if (tipos.size > 1) return 'documentos'
  return tipos.has('factura') ? 'facturas' : tipos.has('ticket') ? 'tickets' : 'gastos'
}

export default function PanelSubidas() {
  const { subidas, limpiar } = useSubidas()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  if (!subidas.length) return null

  const pendientes = subidas.filter(enMarcha).length
  const terminadas = subidas.length - pendientes
  const avisos = subidas.filter((s) => s.estado === 'error').length
  const que = queSon(subidas)

  const ir = (s: Subida) => {
    if (s.tipo === 'ticket') navigate('/mi-espacio/tickets')
    else if (s.id) navigate(s.tipo === 'factura' ? `/facturas?ver=${s.id}` : `/gastos?revisar=${s.id}`)
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-line lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96">
      <div className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
        {pendientes ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-lima" />
        ) : avisos ? (
          <AlertCircle className="size-4 shrink-0 text-lima" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-lima" />
        )}
        <button onClick={() => setAbierto((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium">
            {pendientes ? `Subiendo ${que}: ${terminadas} de ${subidas.length}` : `${subidas.length} ${que} subidos`}
          </p>
          <p className="truncate text-xs text-white/60">
            {pendientes ? 'Puedes seguir trabajando; no cierres la pestaña' : avisos ? `${avisos} con aviso: revísalos` : 'Todo listo para revisar'}
          </p>
        </button>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
          aria-label={abierto ? 'Ocultar detalle' : 'Ver detalle'}
        >
          {abierto ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
        {!pendientes && (
          <button onClick={limpiar} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Barra de progreso */}
      <div className="h-1 bg-line">
        <div className="h-full bg-lima transition-all" style={{ width: `${(terminadas / subidas.length) * 100}%` }} />
      </div>

      {abierto && (
        <div className="max-h-[45dvh] divide-y divide-line overflow-y-auto">
          {subidas.map((s) => {
            const clicable = !enMarcha(s) && (s.tipo === 'ticket' || !!s.id)
            return (
              <button
                key={s.key}
                disabled={!clicable}
                onClick={() => ir(s)}
                className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm', clicable && 'hover:bg-paper')}
              >
                {s.estado === 'hecho' ? (
                  <CheckCircle2 className="size-4 shrink-0 text-verde" />
                ) : s.estado === 'error' ? (
                  <AlertCircle className="size-4 shrink-0 text-rojo" />
                ) : (
                  <Loader2 className={cx('size-4 shrink-0 text-muted', s.estado !== 'esperando' && 'animate-spin')} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.nombre}</span>
                  {s.estado === 'error' && s.error && <span className="line-clamp-2 text-xs text-rojo">{s.error}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {s.estado === 'esperando' && 'En cola'}
                  {s.estado === 'subiendo' && 'Subiendo…'}
                  {s.estado === 'leyendo' && 'Leyendo…'}
                  {s.estado === 'hecho' && 'Ver'}
                  {s.estado === 'error' && (clicable ? 'Revisar' : '')}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
