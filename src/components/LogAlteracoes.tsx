import type { LogAlteracao } from '../types'
import { fmtDataHora } from '../format'

function rotuloTipo(tipo: LogAlteracao['tipo']) {
  if (tipo === 'carga') return 'Carga'
  if (tipo === 'dia-anterior') return 'Dia anterior'
  return 'Acumulado'
}

export default function LogAlteracoes({ itens }: { itens: LogAlteracao[] }) {
  const lista = [...itens].reverse()
  if (lista.length === 0) {
    return <div className="empty">Nenhuma alteração registrada nesta visita.</div>
  }
  return (
    <div className="log-lista">
      {lista.map((l) => (
        <article className="log-item" key={l.id}>
          <div className="log-item__topo">
            <span className="log-item__tipo">{rotuloTipo(l.tipo)}</span>
            <span className="cell-muted mono">{fmtDataHora(l.ts)}</span>
          </div>
          <div className="log-item__resumo">{l.resumo}</div>
          <div className="log-item__meta">
            <span>
              Por <strong>{l.por}</strong>
            </span>
            <span>
              {l.origem === 'edicao' ? 'Tela' : `Planilha: ${l.planilha}`}
            </span>
            <span className="mono">{l.chave}</span>
          </div>
        </article>
      ))}
    </div>
  )
}
