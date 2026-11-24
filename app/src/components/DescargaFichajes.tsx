import { useState } from 'react'
import { Clock, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MESES } from '../lib/laboral'
import { csvRegistro, descargar, resumenDias, type Fichaje } from '../lib/fichaje'
import { enDemo, fichajesDemo } from '../lib/demoFichaje'
import { useAuth } from '../lib/auth'
import { Button, Card, Select, notify } from './ui'

/** En «Mis documentos»: el trabajador se descarga su registro de jornada de cualquier mes */
export default function DescargaFichajes({ trabajadorId, nombre, dni }: { trabajadorId: string; nombre: string; dni: string | null }) {
  const hoy = new Date()
  const meses = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const { viendoComo } = useAuth()
  const [mes, setMes] = useState(meses[0])
  const [cargando, setCargando] = useState(false)

  const bajar = async () => {
    const [a, m] = mes.split('-').map(Number)
    const desde = new Date(a, m - 1, 1)
    const hasta = new Date(a, m, 1)
    setCargando(true)
    let fs: Fichaje[]
    if (enDemo()) fs = fichajesDemo().filter((f) => f.trabajador_id === 'd1')
    else {
      const { data, error } = await supabase
        .from('fichajes')
        .select('*')
        .eq('trabajador_id', trabajadorId)
        .gte('momento', desde.toISOString())
        .lt('momento', hasta.toISOString())
        .order('momento')
      if (error) {
        setCargando(false)
        return notify('No se ha podido descargar', 'error')
      }
      fs = (data as Fichaje[]) ?? []
      // Cuenta demo sin fichajes cargados: uno de ejemplo
      if (viendoComo && !fs.length) fs = fichajesDemo().filter((f) => f.trabajador_id === 'd1')
    }
    fs = fs.filter((f) => new Date(f.momento) >= desde && new Date(f.momento) < hasta)
    setCargando(false)
    if (!fs.length) return notify(`No hay fichajes en ${MESES[m - 1]} ${a}`, 'error')
    descargar(`Registro de jornada ${nombre} ${MESES[m - 1]} ${a}.csv`, csvRegistro(nombre, dni, resumenDias(fs)))
  }

  return (
    <Card className="mb-4 max-w-2xl p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Clock className="size-4" /> Registro de jornada
      </h2>
      <p className="mt-1 text-sm text-muted">Tus fichajes del mes: entradas, pausas, salidas y horas. Se abre en Excel.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Select className="!w-auto" value={mes} onChange={(e) => setMes(e.target.value)}>
          {meses.map((x) => (
            <option key={x} value={x}>
              {MESES[Number(x.slice(5)) - 1]} {x.slice(0, 4)}
            </option>
          ))}
        </Select>
        <Button variant="secondary" loading={cargando} icon={<Download className="size-4" />} onClick={bajar}>
          Descargar
        </Button>
      </div>
    </Card>
  )
}
