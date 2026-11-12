import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { Input } from './ui'

/** Convierte "1.234,56", "1234,56" o "1234.56" en número */
export function parseNum(txt: string): number {
  const t = txt.trim().replace(/\s|€/g, '')
  if (!t) return 0
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isFinite(n) ? n : 0
}

const show = (n: number) => (n === 0 ? '' : String(n).replace('.', ','))

export default function NumInput({
  value,
  onValue,
  ...rest
}: { value: number; onValue: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [txt, setTxt] = useState(show(value))

  useEffect(() => {
    if (parseNum(txt) !== value) setTxt(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <Input
      inputMode="decimal"
      value={txt}
      placeholder="0"
      onChange={(e) => {
        setTxt(e.target.value)
        onValue(parseNum(e.target.value))
      }}
      {...rest}
    />
  )
}
