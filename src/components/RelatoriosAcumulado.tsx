import { useMemo, useState } from 'react'
import { Modal } from './ui'
import { SituacaoAtual } from './ImportarAcumulado'
import { useRelatoriosImportacao } from '../store'
import { fmtDataHora, fmtKg } from '../format'
import type { DetalheAcumuladoImportado, SeveridadeAcumulado } from '../types'

const CORES: Record<SeveridadeAcumulado, string> = {
  sucesso: '#0e8f6c',
  alerta: '#c2410c',
  vermelho: '#dc2626',
}

const LABELS: Record<SeveridadeAcumulado, string> = {
  sucesso: 'Sucesso',
  alerta: 'Alerta',
  vermelho: 'Vermelho',
}

type RegistroFlat = DetalheAcumuladoImportado & {
  severidade: SeveridadeAcumulado
  importadoPor: string
  ts: number
}

export default function RelatoriosAcumulado({ onClose }: { onClose: () => void }) {
  const relatorios = useRelatoriosImportacao()
  const [busca, setBusca] = useState('')

  // achata todos os relatórios (de todos os arquivos) num único histórico por CNPJ
  const registros = useMemo<RegistroFlat[]>(() => {
    const severidades: SeveridadeAcumulado[] = ['vermelho', 'alerta', 'sucesso']
    const todos = relatorios.flatMap((r) =>
      severidades.flatMap((sev) =>
        r[sev].map((d) => ({ ...d, severidade: sev, importadoPor: r.importadoPor, ts: r.ts })),
      ),
    )
    return todos.sort((a, b) => b.ts - a.ts)
  }, [relatorios])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return registros
    return registros.filter(
      (d) => d.item.cnpj.toLowerCase().includes(termo) || d.item.nomePdr.toLowerCase().includes(termo),
    )
  }, [registros, busca])

  return (
    <Modal
      titulo="Últimos reports"
      subtitulo={`${registros.length} CNPJ(s) importado(s) nesta sessão`}
      largo
      onClose={onClose}
      rodape={
        <>
          <span className="spacer" />
          <button className="btn btn--primary" type="button" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      {registros.length === 0 ? (
        <div className="empty">Nenhuma importação de acumulado registrada ainda nesta sessão.</div>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 14, maxWidth: 380 }}>
            <label htmlFor="rel-busca">Buscar por PDR ou CNPJ</label>
            <input
              id="rel-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex.: 88.879.473/0001-51 ou Rosario do Sul"
              autoFocus
            />
          </div>

          {filtrados.length === 0 ? (
            <div className="empty">Nenhum resultado para "{busca}".</div>
          ) : (
            <div className="preview-table" style={{ maxHeight: 440, overflow: 'auto' }}>
              <table className="data" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Cód</th>
                    <th>CNPJ</th>
                    <th>PDR</th>
                    <th>Município</th>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Negativa</th>
                    <th style={{ textAlign: 'right' }}>Declarada</th>
                    <th style={{ textAlign: 'right' }}>Positiva</th>
                    <th style={{ textAlign: 'right' }}>Participante</th>
                    <th>Status</th>
                    <th>Situação atual</th>
                    <th>Importado por</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((d) => (
                    <tr key={`${d.cod}-${d.item.dtLancamento}`}>
                      <td className="mono">{d.cod}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{d.item.cnpj}</td>
                      <td className="cell-strong">{d.item.nomePdr}</td>
                      <td>{d.item.uf}/{d.item.municipio}</td>
                      <td>{d.item.dtLancamento}</td>
                      <td className="num">{fmtKg(d.item.kgNegativa)}</td>
                      <td className="num">{fmtKg(d.item.kgDeclarada)}</td>
                      <td className="num">{fmtKg(d.item.kgPositiva)}</td>
                      <td className="num">{fmtKg(d.item.kgParticipante)}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            color: CORES[d.severidade],
                            borderColor: `${CORES[d.severidade]}44`,
                            background: `${CORES[d.severidade]}12`,
                          }}
                          title={d.motivo}
                        >
                          {LABELS[d.severidade]}
                        </span>
                      </td>
                      <td>
                        <SituacaoAtual cod={d.cod} />
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        <div>{d.importadoPor}</div>
                        <div className="cell-muted">{fmtDataHora(d.ts)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
