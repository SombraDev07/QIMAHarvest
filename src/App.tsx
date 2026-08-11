import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import LayoutVisita from './components/LayoutVisita'
import { IconAlerta, IconFotos, IconRelatorios, IconRotas } from './components/icons'
import Acumulado from './pages/Acumulado'
import Administracao from './pages/Administracao'
import EmBreve from './pages/EmBreve'
import Parametros from './pages/Parametros'
import PDRs from './pages/PDRs'
import Solicitacoes from './pages/Solicitacoes'
import VisitaDetalhe from './pages/VisitaDetalhe'
import Visitas from './pages/Visitas'
import VisitasLista from './pages/VisitasLista'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/visitas" replace />} />
        <Route path="/administracao" element={<Administracao />} />
        <Route path="/administracao/pdrs" element={<PDRs />} />
        <Route path="/administracao/parametros" element={<Parametros />} />
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
        <Route
          path="/relatorios"
          element={
            <EmBreve
              titulo="Relatórios"
              icone={<IconRelatorios size={36} />}
              texto="Exportações gerenciais e indicadores da safra."
            />
          }
        />
        <Route
          path="/analise-fotos"
          element={
            <EmBreve
              titulo="Análise de Fotos"
              icone={<IconFotos size={36} />}
              texto="Triagem das evidências fotográficas enviadas pelos tablets."
            />
          }
        />
        <Route path="/solicitacoes" element={<Solicitacoes />} />
        <Route path="*" element={<Navigate to="/visitas" replace />} />
      </Route>

      {/* registro da visita: layout próprio, sem as abas globais do sistema */}
      <Route element={<LayoutVisita />}>
        <Route path="/visita/:cod" element={<VisitaDetalhe />} />
      </Route>
    </Routes>
  )
}
