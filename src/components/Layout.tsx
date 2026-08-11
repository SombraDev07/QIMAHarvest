import { NavLink, Outlet } from 'react-router-dom'
import { LogoQima } from './Logo'
import {
  IconAdmin,
  IconAlerta,
  IconFotos,
  IconRelatorios,
  IconRotas,
  IconSolicitacao,
  IconVisitas,
} from './icons'
import { USUARIO, iniciais } from '../usuario'

const ABAS = [
  { to: '/administracao', label: 'Administração', Icone: IconAdmin },
  { to: '/visitas', label: 'Visitas', Icone: IconVisitas },
  { to: '/acumulado', label: 'Acumulado', Icone: IconRelatorios },
  { to: '/rotas', label: 'Rotas', Icone: IconRotas },
  { to: '/ocorrencias', label: 'Ocorrências', Icone: IconAlerta },
  { to: '/relatorios', label: 'Relatórios', Icone: IconRelatorios },
  { to: '/analise-fotos', label: 'Análise de Fotos', Icone: IconFotos },
  { to: '/solicitacoes', label: 'Solicitações', Icone: IconSolicitacao },
]


export default function Layout() {
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
          <div className="user__avatar">{iniciais(USUARIO.nome)}</div>
          <div className="user__name">
            {USUARIO.nome}
            <div className="user__role">{USUARIO.papel}</div>
          </div>
        </div>
      </header>

      <nav className="nav">
        {ABAS.map(({ to, label, Icone }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav__link${isActive ? ' is-active' : ''}`}
          >
            <Icone />
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
