import type { ReactNode } from 'react'
import { Breadcrumb, PageHead, Placeholder } from '../components/ui'

export default function EmBreve({
  titulo,
  icone,
  texto,
}: {
  titulo: string
  icone: ReactNode
  texto: string
}) {
  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: 'Início', to: '/visitas' }, { label: titulo }]} />
      <PageHead titulo={titulo} />
      <Placeholder icone={icone} titulo="Módulo em construção" texto={texto} />
    </main>
  )
}
