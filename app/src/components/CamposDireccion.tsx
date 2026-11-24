import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { buscarDirecciones, detalleDireccion, PROVEEDOR, type DireccionPartes, type Sugerencia } from '../lib/direcciones'
import {
  PAISES_ARRIBA,
  PROVINCIAS_ORDENADAS,
  codigoPais,
  esEspana,
  listaPaises,
  nombrePais,
  provinciaDe,
  provinciaPorCp,
} from '../lib/paises'
import SelectBuscable from './SelectBuscable'
import { Field, Input, cx } from './ui'

/**
 * Campo de dirección con sugerencias: al elegir una, `onElegir` recibe calle, CP, ciudad, provincia y país.
 */
export function InputDireccion({
  value,
  onChange,
  onElegir,
  soloEspana = false,
  placeholder = 'Empieza a escribir la dirección',
  autoFocus,
}: {
  value: string
  onChange: (texto: string) => void
  onElegir: (d: DireccionPartes) => void
  soloEspana?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [buscando, setBuscando] = useState(false)
  // Solo se busca cuando escribe la persona (no al abrir un formulario ya relleno ni al elegir)
  const escrito = useRef(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!escrito.current) return
    const texto = value.trim()
    if (texto.length < 3) {
      setSugerencias([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const r = await buscarDirecciones(texto, soloEspana, ctrl.signal)
        if (ctrl.signal.aborted) return
        setSugerencias(r)
        setActiva(-1)
        setAbierto(true)
      } catch {
        if (!ctrl.signal.aborted) setSugerencias([])
      } finally {
        if (!ctrl.signal.aborted) setBuscando(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [value, soloEspana])

  // Cerrar al pulsar fuera
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])

  const elegir = async (s: Sugerencia) => {
    setAbierto(false)
    escrito.current = false
    setBuscando(true)
    try {
      const d = await detalleDireccion(s)
      if (d) onElegir(d)
      else onChange(s.principal)
    } catch {
      onChange(s.principal)
    } finally {
      setBuscando(false)
    }
  }

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!abierto || !sugerencias.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiva((i) => (i + 1) % sugerencias.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiva((i) => (i <= 0 ? sugerencias.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activa >= 0) {
      e.preventDefault()
      elegir(sugerencias[activa])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setAbierto(false)
    }
  }

  const ver = abierto && sugerencias.length > 0
  return (
    <div ref={caja} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          escrito.current = true
          onChange(e.target.value)
        }}
        onKeyDown={teclas}
        onFocus={() => sugerencias.length && escrito.current && setAbierto(true)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={ver}
        aria-autocomplete="list"
        className="pr-9"
      />
      {buscando && <Loader2 className="pointer-events-none absolute right-3 top-3 size-4 animate-spin text-muted" />}
      {ver && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {sugerencias.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === activa}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault()
                  elegir(s)
                }}
                onMouseEnter={() => setActiva(i)}
                className={cx(
                  'flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left',
                  i === activa ? 'bg-paper' : 'hover:bg-paper',
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">{s.principal}</span>
                  {s.secundario && <span className="block truncate text-xs text-muted">{s.secundario}</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 pb-1 pt-1.5 text-right text-[11px] text-muted/80">
            {PROVEEDOR === 'google' ? 'Con tecnología de Google' : '© OpenStreetMap'}
          </li>
        </ul>
      )}
    </div>
  )
}

/** Desplegable de país: guarda el nombre en español (como siempre en la BD) */
export function SelectPais({ value, onChange }: { value: string | null | undefined; onChange: (pais: string) => void }) {
  const codigo = codigoPais(value)
  const desconocido = !codigo && value?.trim() ? value.trim() : null
  const todos = listaPaises()
  const opcion = (c: string, nombre: string) => ({ value: c, label: nombre, buscar: c })
  return (
    <SelectBuscable
      value={codigo ?? (desconocido ? '__otro' : '')}
      onChange={(v) => v !== '__otro' && onChange(v ? nombrePais(v) : '')}
      destacadas={[
        { value: '', label: '—' },
        ...(desconocido ? [{ value: '__otro', label: desconocido }] : []),
        ...PAISES_ARRIBA.map((c) => opcion(c, nombrePais(c))),
      ]}
      opciones={todos.map((p) => opcion(p.codigo, p.nombre))}
      buscarPlaceholder="Buscar país…"
    />
  )
}

/** Para encontrar la provincia también por su otro nombre */
const OTROS_NOMBRES: Record<string, string> = {
  Álava: 'Araba', Alicante: 'Alacant', Castellón: 'Castelló', 'Illes Balears': 'Baleares Islas', 'A Coruña': 'La Coruña',
  Gipuzkoa: 'Guipúzcoa', Bizkaia: 'Vizcaya', Girona: 'Gerona', Lleida: 'Lérida', Ourense: 'Orense', Valencia: 'València',
  'Santa Cruz de Tenerife': 'Tenerife Canarias', 'Las Palmas': 'Gran Canaria Canarias',
}

/** Provincia: desplegable si es España; texto libre en el resto de países */
export function CampoProvincia({
  value,
  onChange,
  espana,
}: {
  value: string | null | undefined
  onChange: (provincia: string) => void
  espana: boolean
}) {
  if (!espana) return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Región, estado…" />
  const conocida = provinciaDe(value)
  const otra = !conocida && value?.trim() ? value.trim() : null
  return (
    <SelectBuscable
      value={conocida ?? otra ?? ''}
      onChange={onChange}
      opciones={[
        { value: '', label: '—' },
        ...(otra ? [{ value: otra, label: otra }] : []),
        ...PROVINCIAS_ORDENADAS.map((p) => ({ value: p, label: p, buscar: OTROS_NOMBRES[p] })),
      ]}
      buscarPlaceholder="Buscar provincia…"
    />
  )
}

export type Direccion = {
  direccion?: string | null
  cp?: string | null
  ciudad?: string | null
  provincia?: string | null
  pais?: string | null
}

/**
 * Dirección, CP, ciudad, provincia y país, para meter dentro de una rejilla de 2 columnas (sm:grid-cols-2).
 * Sin `conPais` es siempre España (p. ej. centros de trabajo).
 */
export default function CamposDireccion({
  valor,
  onChange,
  conPais = true,
}: {
  valor: Direccion
  onChange: (cambios: Partial<Required<Direccion>>) => void
  conPais?: boolean
}) {
  const espana = !conPais || esEspana(valor.pais)

  const elegir = (d: DireccionPartes) => {
    const cambios: Partial<Required<Direccion>> = { direccion: d.direccion, cp: d.cp, ciudad: d.ciudad, provincia: d.provincia }
    if (conPais && d.pais) cambios.pais = d.pais
    onChange(cambios)
  }

  const cambiarCp = (cp: string) => {
    const prov = espana ? provinciaPorCp(cp) : null
    onChange(prov ? { cp, provincia: prov } : { cp })
  }

  const cambiarPais = (pais: string) => {
    // Al salir de España, una provincia española ya no vale
    if (!esEspana(pais) && provinciaDe(valor.provincia)) onChange({ pais, provincia: '' })
    else onChange({ pais })
  }

  return (
    <>
      <Field label="Dirección" className="sm:col-span-2">
        <InputDireccion
          value={valor.direccion ?? ''}
          onChange={(direccion) => onChange({ direccion })}
          onElegir={elegir}
          soloEspana={!conPais}
        />
      </Field>
      <Field label="Código postal">
        <Input value={valor.cp ?? ''} onChange={(e) => cambiarCp(e.target.value)} inputMode={espana ? 'numeric' : undefined} />
      </Field>
      <Field label="Ciudad">
        <Input value={valor.ciudad ?? ''} onChange={(e) => onChange({ ciudad: e.target.value })} />
      </Field>
      <Field label="Provincia">
        <CampoProvincia value={valor.provincia} onChange={(provincia) => onChange({ provincia })} espana={espana} />
      </Field>
      {conPais && (
        <Field label="País">
          <SelectPais value={valor.pais} onChange={cambiarPais} />
        </Field>
      )}
    </>
  )
}
