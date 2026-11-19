import { useState } from 'react'
import { Card, cx } from '../components/ui'
import { Datos, filasContrato, filasPersonales } from './laboral/FichaTrabajador'
import { FichaContrato } from './MiEspacio'
import { PedirCambioIrpf, SolicitudesIrpfGestor } from '../components/SolicitudIrpf'
import type { Trabajador } from '../lib/types'

/** Solo en local (npm run dev), sin iniciar sesión: /vista-previa-trabajadores
 *  Las fichas de Nova Hiring tal como las ve el asesor y como las ve cada trabajador. */
const base = { owner_id: 'demo', tipo_contrato: 'indefinido', jornada: 'completa', horas_semana: 40, teletrabajo: true, pagas: 12, nss_tramitar: false, convenio: 'Convenio TIC', vacaciones_dias: 25, vacaciones_nota: '24 + 1 por cumpleaños' } as const
const T = [
  { ...base, id: 'adria', nombre: 'Adrià Calvet Calderón', dni: '41568656C', nss: '171056549075', fecha_nacimiento: '2001-11-16', domicilio: 'C/ Nou 11 1r, 17600 Figueres', nivel_estudios: 'Grado universitario', fecha_inicio: '2026-04-07', puesto: 'Full Stack Developer', salario_bruto_mensual: 2500, irpf_pct: 16.42, clasificacion: 'Área 3 · Grupo C · Nivel III (Programador Junior)', prueba_meses: 6 },
  { ...base, id: 'roger', nombre: 'Roger Franch Carreras', dni: '47999578G', nss: '081232258865', fecha_nacimiento: '1991-08-18', domicilio: 'Carrer de Vistalegre 10, 08391 Tiana', fecha_inicio: '2026-07-13', puesto: 'Operations Manager', salario_bruto_mensual: 3333.33, irpf_pct: 19.36, clasificacion: 'Área 4 · Grupo B · Nivel 1', prueba_meses: 6 },
  { ...base, id: 'nico', nombre: 'Nicolás Paniello Jiménez', dni: '48270098K', nss: '081420912448', domicilio: 'Av. Barberà 172, 1.º 2.ª A, 08203 Sabadell', telefono: '628666048', fecha_inicio: '2026-09-01', puesto: 'Marketing y ventas', salario_bruto_mensual: 3333.33, irpf_pct: 14.09, prueba_meses: 6, nivel_estudios: 'Grado universitario' },
] as unknown as Trabajador[]

export default function VistaPreviaTrabajadores() {
  const [sel, setSel] = useState(0)
  const [, setTick] = useState(0)
  const [vista, setVista] = useState<'asesor' | 'trabajador'>('asesor')
  const t = T[sel]
  const boton = (activo: boolean) => cx('rounded-full px-4 py-2 text-sm font-medium', activo ? 'bg-ink text-white' : 'border border-line bg-white hover:border-ink')
  return (
    <div className="min-h-screen bg-paper px-4 py-6 sm:px-8">
      <p className="mb-4 text-xs text-muted">Vista previa local · Nova Hiring, S.L. · datos del SQL de carga</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {T.map((x, i) => (
          <button key={x.id} className={boton(i === sel)} onClick={() => setSel(i)}>{x.nombre.split(' ')[0]}</button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <button className={boton(vista === 'asesor')} onClick={() => setVista('asesor')}>Como lo ves tú</button>
        <button className={boton(vista === 'trabajador')} onClick={() => setVista('trabajador')}>Como lo ve el trabajador</button>
      </div>

      {vista === 'asesor' ? (
        <>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-[28px]">{t.nombre}</h1>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="mb-3 font-semibold">Datos personales</h2>
              <Datos filas={filasPersonales(t)} />
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="mb-3 font-semibold">Contrato</h2>
              <Datos filas={filasContrato(t)} />
            </Card>
            <SolicitudesIrpfGestor key={t.id} trabajador={t} demo onAplicada={() => setTick((x) => x + 1)} />
          </div>
        </>
      ) : (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Mi ficha</h1>
            <p className="mt-1 text-[15px] text-muted">Los datos de tu contrato.</p>
          </div>
          <FichaContrato ficha={t} />
          <PedirCambioIrpf key={t.id} trabajador={t} demo />
        </>
      )}
    </div>
  )
}
