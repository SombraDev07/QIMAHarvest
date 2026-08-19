import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Breadcrumb, PageHead } from '../components/ui'
import { IconPlanilha, IconEditar, IconRelatorios } from '../components/icons'
import ImportarAcumulado from '../components/ImportarAcumulado'
import RelatoriosAcumulado from '../components/RelatoriosAcumulado'
import { useRelatoriosImportacao } from '../store'
import { useAcumuladoLista, useKpiAcumulado } from '../painel'
import { fmtKg, fmtNum } from '../format'
import { CLASSIFICACOES } from '../types'

export default function Acumulado() {
  const [mostrarImport, setMostrarImport] = useState(false)
  const [mostrarCorrecao, setMostrarCorrecao] = useState(false)
  const [mostrarReports, setMostrarReports] = useState(false)

  const kpi = useKpiAcumulado()
  const relatorios = useRelatoriosImportacao()

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: 'Início', to: '/visitas' }, { label: 'Acumulado' }]} />
      <PageHead
        titulo="Acumulado"
        subtitulo="Importação e correção de dados de acumulado por PDR"
      />

      {/* KPIs */}
      <div className="kpi-strip">
        <div className="kpi">
          <div className="kpi__label">Registros importados</div>
          <div className="kpi__value">{fmtNum(kpi.registros)}</div>
          <div className="kpi__sub">via planilha</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">PDRs no catálogo</div>
          <div className="kpi__value">{fmtNum(kpi.pdrs)}</div>
          <div className="kpi__sub">CNPJs cadastrados</div>
        </div>
        {CLASSIFICACOES.filter((c) => c !== 'Participante').map((c) => (
          <div className="kpi" key={c}>
            <div className="kpi__label">Total {c}</div>
            <div className="kpi__value">
              {fmtKg(
                c === 'Negativa' ? kpi.negativa : c === 'Declarada' ? kpi.declarada : kpi.positiva,
              )}
            </div>
            <div className="kpi__sub">kg acumulados</div>
          </div>
        ))}
      </div>

      {/* Cards de ação */}
      <div className="card-grid" style={{ marginTop: 28 }}>
        <div
          className="module-card"
          onClick={() => setMostrarImport(true)}
          style={{ cursor: 'pointer' }}
        >
          <div className="module-card__icon">
            <IconPlanilha />
          </div>
          <div className="module-card__title">Importar Acumulado</div>
          <div className="module-card__desc">
            Importe uma planilha Excel com os dados de acumulado por CNPJ e data.
          </div>
        </div>

        <div
          className="module-card"
          onClick={() => setMostrarCorrecao(true)}
          style={{ cursor: 'pointer' }}
        >
          <div className="module-card__icon">
            <IconEditar />
          </div>
          <div className="module-card__title">Correção de Acumulado</div>
          <div className="module-card__desc">
            Visualize e corrija os registros de acumulado importados.
          </div>
        </div>

        <div
          className="module-card"
          onClick={() => setMostrarReports(true)}
          style={{ cursor: 'pointer' }}
        >
          <div className="module-card__icon">
            <IconRelatorios />
          </div>
          <div className="module-card__title">Últimos Reports</div>
          <div className="module-card__desc">
            {relatorios.length > 0
              ? `${relatorios.length} importação(ões) registrada(s) nesta sessão.`
              : 'Veja o histórico de planilhas de acumulado já importadas.'}
          </div>
        </div>
      </div>

      {/* Modal de importação */}
      {mostrarImport && (
        <ImportarAcumulado onClose={() => setMostrarImport(false)} />
      )}

      {/* Modal de correção */}
      {mostrarCorrecao && (
        <CorrecaoAcumulado onClose={() => setMostrarCorrecao(false)} />
      )}

      {/* Modal de últimos reports */}
      {mostrarReports && (
        <RelatoriosAcumulado onClose={() => setMostrarReports(false)} />
      )}
    </main>
  )
}

function CorrecaoAcumulado({
  onClose,
}: {
  onClose: () => void
}) {
  const [busca, setBusca] = useState('')
  const filtradas = useAcumuladoLista(busca)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--wide" role="dialog" aria-modal="true">
        <div className="modal__head">
          <div>
            <div className="modal__title">Correção de Acumulado</div>
            <div className="modal__sub">
              {filtradas.length} registros importados via planilha
            </div>
          </div>
          <button className="modal__close" onClick={onClose} type="button" aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal__body">
          <div className="field" style={{ maxWidth: 400, marginBottom: 16 }}>
            <label htmlFor="corr-busca">Buscar por nome, CNPJ, cidade ou código</label>
            <input id="corr-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." />
          </div>

          <div className="preview-table">
            <table className="data">
              <thead>
                <tr>
                  <th>Cód</th>
                  <th>PDR</th>
                  <th>CNPJ</th>
                  <th>Cidade/UF</th>
                  <th>Data</th>
                  <th style={{ textAlign: 'right' }}>Negativa</th>
                  <th style={{ textAlign: 'right' }}>Declarada</th>
                  <th style={{ textAlign: 'right' }}>Positiva</th>
                  <th style={{ textAlign: 'right' }}>Participante</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((v) => (
                  <tr key={v.cod}>
                    <td>
                      <Link
                        className="link-cod"
                        to={`/visita/${v.cod}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {v.cod}
                      </Link>
                    </td>
                    <td className="cell-strong">{v.pdr.nome}</td>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>
                      {v.pdr.cnpj}
                    </td>
                    <td>{v.pdr.cidade}/{v.pdr.uf}</td>
                    <td>{v.data}</td>
                    <td className="num">{fmtKg(v.valores.Negativa)}</td>
                    <td className="num">{fmtKg(v.valores.Declarada)}</td>
                    <td className="num">{fmtKg(v.valores.Positiva)}</td>
                    <td className="num">{fmtKg(v.valores.Participante)}</td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                      Nenhum registro de acumulado encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal__foot">
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
