import { Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import LayoutVisita from './components/LayoutVisita'
import { IconAlerta, IconRotas } from './components/icons'
import EmBreve from './pages/EmBreve'
import Login from './pages/Login'
import { useSessaoAtiva } from './store'

/**
 * Cada página vira um chunk próprio: quem abre Visitas não baixa o código de
 * Solicitações, nem a biblioteca de planilha que só a importação usa. O que
 * pesa no primeiro carregamento é só a rota que a pessoa pediu.
 */
const Acumulado = lazy(() => import('./pages/Acumulado'))
const Administracao = lazy(() => import('./pages/Administracao'))
const Parametros = lazy(() => import('./pages/Parametros'))
const PDRs = lazy(() => import('./pages/PDRs'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const ImportarVisitas = lazy(() => import('./pages/ImportarVisitas'))
const CorrigirVisitas = lazy(() => import('./pages/CorrigirVisitas'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const AnaliseFotos = lazy(() => import('./pages/AnaliseFotos'))
const Solicitacoes = lazy(() => import('./pages/Solicitacoes'))
const VisitaDetalhe = lazy(() => import('./pages/VisitaDetalhe'))
const Visitas = lazy(() => import('./pages/Visitas'))
const VisitasLista = lazy(() => import('./pages/VisitasLista'))

/** placeholder curto: as rotas são chunks pequenos, um spinner pesado piscaria à toa */
const Carregando = () => <div className="empty">Carregando…</div>

function RequireAuth() {
  const logado = useSessaoAtiva()
  const location = useLocation()
  if (!logado) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/visitas" replace />} />
          <Route path="/administracao" element={<Administracao />} />
          <Route path="/administracao/pdrs" element={<PDRs />} />
          <Route path="/administracao/parametros" element={<Parametros />} />
          <Route path="/administracao/usuarios" element={<Usuarios />} />
          <Route path="/administracao/importar-visitas" element={<ImportarVisitas />} />
          <Route path="/administracao/corrigir-visitas" element={<CorrigirVisitas />} />
          <Route path="/acumulado" element={<Acumulado />} />
          <Route path="/visitas" element={<Visitas />} />
          <Route path="/visitas/:situacao" element={<VisitasLista />} />
          <Route
            path="/rotas"
            element={
              <EmBreve
                titulo="Rotas"
                icone={<IconRotas size={36} />}
                texto="Planejamento e acompanhamento das rotas diárias dos consultores."
              />
            }
          />
          <Route
            path="/ocorrencias"
            element={
              <EmBreve
                titulo="Ocorrências"
                icone={<IconAlerta size={36} />}
                texto="Painel consolidado das ocorrências abertas em campo."
              />
            }
          />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/analise-fotos" element={<AnaliseFotos />} />
          <Route path="/solicitacoes" element={<Solicitacoes />} />
          <Route path="/importar-visitas" element={<ImportarVisitas />} />
          <Route path="*" element={<Navigate to="/visitas" replace />} />
        </Route>

        {/* registro da visita: layout próprio, sem as abas globais do sistema */}
        <Route element={<LayoutVisita />}>
          <Route path="/visita/:cod" element={<VisitaDetalhe />} />
        </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
