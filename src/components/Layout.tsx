import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogoQima } from './Logo'
import {
  IconAdmin,
  IconAlerta,
  IconFotos,
  IconLista,
  IconRelatorios,
  IconRotas,
  IconSolicitacao,
  IconUpload,
  IconVisitas,
} from './icons'
import { iniciais } from '../usuario'
import MinhaSenha from './MinhaSenha'
import BotaoSair from './BotaoSair'
import SeletorIdioma from './SeletorIdioma'
import { useT } from '../i18n'
import { useFalhaPersistencia, useUsuarioLogado } from '../store'
import { ehPerfilRtv, rotaInicial, rotaPermitida } from '../types'

const ABAS = [
  { to: '/administracao', label: 'Administração', Icone: IconAdmin },
  { to: '/visitas', label: 'Visitas', Icone: IconVisitas },
  { to: '/acumulado', label: 'Acumulado', Icone: IconRelatorios },
  { to: '/rotas', label: 'Rotas', Icone: IconRotas },
  { to: '/ocorrencias', label: 'Ocorrências', Icone: IconAlerta },
  { to: '/relatorios', label: 'Relatórios', Icone: IconRelatorios },
  { to: '/analise-fotos', label: 'Análise de Fotos', Icone: IconFotos },
  { to: '/analise-final', label: 'Análise Final', Icone: IconLista },
  { to: '/solicitacoes', label: 'Solicitações', Icone: IconSolicitacao },
  { to: '/importar-visitas', label: 'Importar planilha', Icone: IconUpload },
]


export default function Layout() {
  const usuario = useUsuarioLogado()
  const location = useLocation()
  const t = useT()
  const falhaAoGravar = useFalhaPersistencia()
  const abas = ehPerfilRtv(usuario.perfil) ? ABAS.filter((a) => a.to === '/ocorrencias') : ABAS

  if (!rotaPermitida(usuario.perfil, location.pathname)) {
    return <Navigate to={rotaInicial(usuario.perfil)} replace />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <LogoQima height={24} />
          <span className="brand__divider" />
          <span className="brand__app">
            <b>Harvest</b> 2026
          </span>
        </div>

        <div className="topbar__spacer" />
        <div className="topbar__chip">SAFRA 2025/2026 · BRASIL</div>

        <div className="user">
          <div className="user__avatar">{iniciais(usuario.nome)}</div>
          <div className="user__name">
            {usuario.nome}
            <div className="user__role">{usuario.perfil}</div>
          </div>
          <MinhaSenha />
          <BotaoSair />
          <SeletorIdioma />
        </div>
      </header>

      {falhaAoGravar && (
        <div className="faixa-falha" role="alert">
          <strong>Alterações não estão sendo salvas.</strong> {falhaAoGravar}
        </div>
      )}

      <nav className="nav">
        {abas.map(({ to, label, Icone }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav__link${isActive ? ' is-active' : ''}`}
          >
            <Icone />
            {t(label)}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
