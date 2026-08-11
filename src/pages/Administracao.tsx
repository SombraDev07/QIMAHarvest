import { Link } from 'react-router-dom'
import { Breadcrumb, PageHead } from '../components/ui'
import {
  IconArmazem,
  IconBussola,
  IconEngrenagem,
  IconLista,
  IconMapa,
  IconUsuarios,
} from '../components/icons'

const MODULOS = [
  { Icone: IconMapa, titulo: 'Distritos', desc: 'Cadastro e vínculo de distritos por região' },
  { Icone: IconArmazem, titulo: "PDR's", desc: 'Pontos de recebimento, CNPJ e capacidade estática', to: '/administracao/pdrs' },
  { Icone: IconBussola, titulo: 'Regiões', desc: 'Estrutura geográfica da safra' },
  { Icone: IconUsuarios, titulo: 'Usuários', desc: 'Perfis, permissões e equipes de campo' },
  { Icone: IconLista, titulo: 'Tipos de Visita', desc: 'Modalidades 1H, 2H e 4H' },
  {
    Icone: IconEngrenagem,
    titulo: 'Parâmetros',
    desc: 'Limite de desconto, regras de rateio e origem do acumulado',
  },
]

export default function Administracao() {
  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: 'Início', to: '/visitas' }, { label: 'Administração' }]} />
      <PageHead titulo="Administrativo" subtitulo="Cadastros e configurações da safra" />

      <div className="card-grid">
        {MODULOS.map(({ Icone, titulo, desc, to }) =>
          to ? (
            <Link className="module-card" key={titulo} to={to}>
              <div className="module-card__icon">
                <Icone />
              </div>
              <div className="module-card__title">{titulo}</div>
              <div className="module-card__desc">{desc}</div>
            </Link>
          ) : (
            <div className="module-card" key={titulo}>
              <div className="module-card__icon">
                <Icone />
              </div>
              <div className="module-card__title">{titulo}</div>
              <div className="module-card__desc">{desc}</div>
            </div>
          ),
        )}
      </div>
    </main>
  )
}
