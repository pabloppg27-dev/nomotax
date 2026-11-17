/** Selector de color: cuadro de color + código #RRGGBB. Vacío = el color por defecto. */
import { Field, Input } from './ui'

export const normalizarHex = (v: string): string => {
  const t = v.trim()
  return t ? (t.startsWith('#') ? t : `#${t}`).toUpperCase() : ''
}
export const hexValido = (v: string): boolean => v === '' || /^#[0-9A-F]{6}$/.test(v)

export default function SelectorColor({
  label,
  hint,
  valor,
  porDefecto,
  onChange,
}: {
  label: string
  hint?: string
  /** Lo que hay escrito (vacío = el de por defecto) */
  valor: string
  porDefecto: string
  onChange: (hex: string) => void
}) {
  const normal = normalizarHex(valor)
  const ok = hexValido(normal)
  const muestra = ok && normal ? normal : porDefecto
  return (
    <Field label={label} hint={ok ? hint : 'Usa el formato #RRGGBB, por ejemplo #1D4FD7.'}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Elegir ${label.toLowerCase()}`}
          value={muestra.toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1"
        />
        <Input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={porDefecto.toUpperCase()} maxLength={7} className="min-w-0 font-mono uppercase" />
        {normal && (
          <button type="button" onClick={() => onChange('')} className="shrink-0 text-sm font-medium underline">
            Quitar
          </button>
        )}
      </div>
    </Field>
  )
}
