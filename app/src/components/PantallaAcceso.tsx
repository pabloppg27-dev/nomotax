import type { ReactNode } from 'react'

/** Marco de las pantallas sin sesión (iniciar sesión, nueva contraseña): panel negro a la izquierda en escritorio */
export default function PantallaAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="size-11" />
          <span className="text-lg font-semibold tracking-tight">NomoTax</span>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="mb-4 text-xs uppercase tracking-[0.14em] text-lima">Business Hub</p>
          <h1 className="font-display text-[44px] leading-[1.08] tracking-tight">
            Tu contabilidad, <span className="text-lima">al día</span> y en un solo sitio.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-white/65">
            Sube tus gastos con una foto, crea presupuestos y facturas, y consulta cómo va tu negocio cada trimestre.
          </p>
        </div>
        <p className="relative z-10 text-sm text-white/40">© {new Date().getFullYear()} NomoTax · Asesoría fiscal</p>
        <div className="pointer-events-none absolute -bottom-40 -right-40 size-[480px] rounded-full bg-lima/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="" className="size-10" />
            <div>
              <div className="font-semibold">NomoTax</div>
              <div className="text-xs uppercase tracking-[0.12em] text-muted">Business Hub</div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
