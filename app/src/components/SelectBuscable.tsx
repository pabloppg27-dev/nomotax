import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Search } from 'lucide-react'
import { cx } from './ui'

export type OpcionBuscable = {
  value: string
  label: string
  /** Texto pequeño a la derecha (NIF, cuenta…); también se busca en él */
  detalle?: string
  /** Texto extra por el que encontrarla, sin mostrarlo */
  buscar?: string
}

/** Sin tildes ni mayúsculas: «castellon» encuentra «Castellón» */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Desplegable con buscador: se pulsa, se abre la lista con un campo para escribir y filtra al vuelo
 * (sin tildes, por cualquier palabra del nombre o del detalle). Teclado: flechas, Intro y Esc.
 * `destacadas` salen arriba mientras no se escribe nada (p. ej. los países más usados).
 */
export default function SelectBuscable({
  value,
  onChange,
  opciones,
  destacadas,
  placeholder = '—',
  buscarPlaceholder = 'Buscar…',
  sinResultados = 'No hay resultados',
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  opciones: OpcionBuscable[]
  destacadas?: OpcionBuscable[]
  placeholder?: string
  buscarPlaceholder?: string
  sinResultados?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [activa, setActiva] = useState(0)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)

  const elegida = opciones.find((o) => o.value === value) ?? destacadas?.find((o) => o.value === value)

  const filtradas = useMemo(() => {
    const palabras = normalizar(q).split(/\s+/).filter(Boolean)
    if (!palabras.length) return { arriba: destacadas ?? [], resto: opciones }
    const vistos = new Set<string>()
    const resto = [...(destacadas ?? []), ...opciones].filter((o) => {
      if (vistos.has(o.value)) return false
      const texto = normalizar(`${o.label} ${o.detalle ?? ''} ${o.buscar ?? ''}`)
      const ok = palabras.every((p) => texto.includes(p))
      if (ok) vistos.add(o.value)
      return ok
    })
    return { arriba: [] as OpcionBuscable[], resto }
  }, [q, opciones, destacadas])
  const visibles = [...filtradas.arriba, ...filtradas.resto]

  // Posición: debajo del campo (o encima si no cabe), fija a la ventana para que no la corte un modal
  const colocar = () => {
    const r = boton.current?.getBoundingClientRect()
    if (!r) return
    const altoVentana = window.visualViewport?.height ?? window.innerHeight
    const anchoVentana = document.documentElement.clientWidth
    const width = Math.min(Math.max(r.width, 260), anchoVentana - 16)
    const left = Math.min(Math.max(8, r.left), anchoVentana - width - 8)
    const abajo = altoVentana - r.bottom - 8
    const arriba = r.top - 8
    if (abajo >= 220 || abajo >= arriba) setPos({ left, width, top: r.bottom + 4, maxH: Math.min(340, abajo - 4) })
    else setPos({ left, width, bottom: altoVentana - r.top + 4, maxH: Math.min(340, arriba - 4) })
  }

  useLayoutEffect(() => {
    if (!abierto) return
    colocar()
    const mover = () => colocar()
    window.addEventListener('resize', mover)
    window.addEventListener('scroll', mover, true)
    window.visualViewport?.addEventListener('resize', mover)
    return () => {
      window.removeEventListener('resize', mover)
      window.removeEventListener('scroll', mover, true)
      window.visualViewport?.removeEventListener('resize', mover)
    }
  }, [abierto])

  // Cerrar al pulsar fuera
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])

  // La opción activa, siempre a la vista
  useEffect(() => {
    if (!abierto) return
    lista.current?.querySelector<HTMLElement>(`[data-i="${activa}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activa, abierto])

  const abrir = (texto = '') => {
    if (disabled) return
    setQ(texto)
    const i = texto ? 0 : Math.max(0, [...(destacadas ?? []), ...opciones].findIndex((o) => o.value === value))
    setActiva(i)
    setAbierto(true)
  }

  const cerrar = (devolverFoco = true) => {
    setAbierto(false)
    setQ('')
    if (devolverFoco) boton.current?.focus()
  }

  const elegir = (o: OpcionBuscable) => {
    if (o.value !== value) onChange(o.value)
    cerrar()
  }

  const teclasBoton = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (abierto) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      abrir()
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== ' ') {
      // Empezar a escribir sobre el campo cerrado ya abre la búsqueda con esa letra
      e.preventDefault()
      abrir(e.key)
    }
  }

  const teclasBuscar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiva((i) => Math.min(i + 1, visibles.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiva((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (visibles[activa]) elegir(visibles[activa])
    } else if (e.key === 'Escape') {
      // Que no cierre también el modal en el que está
      e.preventDefault()
      e.stopPropagation()
      cerrar()
    } else if (e.key === 'Tab') {
      cerrar(false)
    }
  }

  const fila = (o: OpcionBuscable, i: number) => (
    <li key={`${i}-${o.value}`} role="option" aria-selected={o.value === value} data-i={i}>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => elegir(o)}
        onMouseMove={() => i !== activa && setActiva(i)}
        className={cx(
          'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[14px]',
          i === activa ? 'bg-paper' : 'hover:bg-paper',
        )}
      >
        <Check className={cx('size-4 shrink-0', o.value === value ? 'text-ink' : 'invisible')} />
        <span className="min-w-0 flex-1 truncate text-ink">{o.label}</span>
        {o.detalle && <span className="shrink-0 text-xs text-muted">{o.detalle}</span>}
      </button>
    </li>
  )

  return (
    <div ref={caja} className={cx('relative min-w-0', /(^|\s)!?w-/.test(className ?? '') ? '' : 'w-full')}>
      <button
        ref={boton}
        type="button"
        disabled={disabled}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={teclasBoton}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={ariaLabel}
        className={cx(
          'select-flecha flex h-10 w-full cursor-pointer items-center rounded-lg border border-line bg-white px-3 pr-8 text-left text-[15px] text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-lima/60 disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted',
          abierto && 'border-ink ring-2 ring-lima/60',
          className,
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', !elegida && 'text-muted/70')}>
          {elegida ? (
            <>
              {elegida.label}
              {elegida.detalle && <span className="text-muted"> · {elegida.detalle}</span>}
            </>
          ) : (
            placeholder
          )}
        </span>
      </button>

      {abierto && pos && (
        <div
          className="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-lg"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          // Dentro de un <label> (Field), un clic en la lista no debe «pulsar» otra vez el campo
          onClick={(e) => e.preventDefault()}
        >
          <div className="relative shrink-0 border-b border-line p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            {/* 16px: así el iPhone no hace zoom al escribir */}
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setActiva(0)
              }}
              onKeyDown={teclasBuscar}
              placeholder={buscarPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              role="combobox"
              aria-expanded
              aria-autocomplete="list"
              className="h-9 w-full rounded-md bg-paper pl-8 pr-2 text-base text-ink outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-lima/60 sm:text-[14px]"
            />
          </div>
          <ul ref={lista} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {filtradas.arriba.map((o, i) => fila(o, i))}
            {filtradas.arriba.length > 0 && filtradas.resto.length > 0 && <li role="separator" className="my-1 border-t border-line" />}
            {filtradas.resto.map((o, i) => fila(o, i + filtradas.arriba.length))}
            {visibles.length === 0 && <li className="px-3 py-3 text-sm text-muted">{sinResultados}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
