import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from './ui'
import { IconAlerta, IconEditar, IconFotos } from './icons'
import EditarCarga from './EditarCarga'
import { CORES_CLASSIFICACAO } from '../data/mock'
import { gruposDeRateio, percentualDesconto, salvarCarga } from '../store'
import type { Carga, Visita } from '../types'
import { severidadeDaCarga, type Alerta } from '../analise'
import { fmtKg, fmtPct } from '../format'

export default function TabelaDivergencias({
  visita,
  problemas,
  onAviso,
  foco,
  onFocoConsumido,
}: {
  visita: Visita
  /** alertas da análise indexados por carga */
  problemas: Map<string, Alerta[]>
  onAviso: (msg: string) => void
  /** id da carga que a análise pediu para inspecionar */
  foco?: string | null
  onFocoConsumido?: () => void
}) {
  const [editando, setEditando] = useState<Carga | null>(null)
  const linhaFoco = useRef<HTMLTableRowElement | null>(null)

  // ao chegar pela análise, rola até a carga e mantém o realce por alguns segundos
  useEffect(() => {
    if (!foco) return
    linhaFoco.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => onFocoConsumido?.(), 6000)
    return () => clearTimeout(t)
  }, [foco, onFocoConsumido])

  const divergentes = useMemo(
    () => visita.cargas.filter((c) => (problemas.get(c.id)?.length ?? 0) > 0),
    [visita.cargas, problemas],
  )

  const todosGrupos = useMemo(() => gruposDeRateio(visita.cargas), [visita.cargas])
  const proximoGrupo = `RT-${visita.cod}-${String(todosGrupos.length + 1).padStart(2, '0')}`

  function salvar(c: Carga) {
    salvarCarga(visita.cod, c)
    setEditando(null)
    onAviso(`Carga ${c.id} salva.`)
  }

  return (
    <>
      <Panel
        numero="4.1"
        titulo="Divergências"
        hint={`${divergentes.length} carga(s) com inconsistência pendente`}
      >
        {divergentes.length === 0 ? (
          <div className="empty">
            <div style={{ color: 'var(--green)', fontSize: 30, marginBottom: 8 }}>✓</div>
            Nenhuma carga com divergência nesta visita.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data data--cargas">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Data / hora</th>
                  <th>Placa</th>
                  <th>Romaneio</th>
                  <th style={{ textAlign: 'right' }}>Peso líquido</th>
                  <th style={{ textAlign: 'right' }}>Peso c/ desconto</th>
                  <th style={{ textAlign: 'right' }}>Desconto</th>
                  <th>Classificação</th>
                  <th>Divergência</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {divergentes.map((c) => {
                  const alertasCarga = problemas.get(c.id) ?? []
                  const pct = percentualDesconto(c)
                  const cor = CORES_CLASSIFICACAO[c.classificacao]
                  const sev = severidadeDaCarga(alertasCarga)
                  const classeLinha = [foco === c.id ? 'is-foco' : null, sev ? `row-${sev}` : null]
                    .filter(Boolean)
                    .join(' ') || undefined

                  return (
                    <tr key={c.id} ref={foco === c.id ? linhaFoco : undefined} className={classeLinha}>
                      <td className="mono">{c.id}</td>
                      <td>
                        <div className="mono">{c.data}</div>
                        <div className="cell-muted mono">{c.hora}</div>
                      </td>
                      <td>
                        <span className="placa">{c.placa}</span>
                      </td>
                      <td className="mono">
                        {c.romaneio || <span className="cell-muted">—</span>}
                      </td>
                      <td className="num">{fmtKg(c.pesoLiquido)}</td>
                      <td className="num">{fmtKg(c.pesoComDesconto)}</td>
                      <td className="num">
                        <span className="pct" title={`Diferença: ${fmtKg(c.pesoLiquido - c.pesoComDesconto)}`}>
                          {fmtPct(pct)}
                        </span>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{ color: cor, borderColor: `${cor}44`, background: `${cor}12` }}
                        >
                          {c.classificacao}
                        </span>
                      </td>
                      <td className="obs" style={{ maxWidth: 320 }}>
                        {alertasCarga.map((a) => (
                          <div
                            key={a.id}
                            className={`tag-problema tag-problema--${a.severidade}`}
                            style={{ marginBottom: 4 }}
                            title={a.detalhe}
                          >
                            <IconAlerta size={12} /> {a.regra}
                          </div>
                        ))}
                      </td>
                      <td>
                        <div className="carga-acoes">
                          <button
                            className="btn btn--ghost btn--sm btn--icon"
                            type="button"
                            title={c.fotoUrl ? 'Ver foto da carga' : 'Nenhuma foto enviada'}
                            disabled={!c.fotoUrl}
                            onClick={() => window.open(c.fotoUrl, '_blank', 'noopener,noreferrer')}
                          >
                            <IconFotos size={14} />
                          </button>
                          <button
                            className="btn btn--ghost btn--sm btn--icon"
                            type="button"
                            title="Editar carga"
                            onClick={() => setEditando(c)}
                          >
                            <IconEditar />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editando && (
        <EditarCarga
          carga={editando}
          grupos={todosGrupos}
          novoGrupoId={proximoGrupo}
          onSalvar={salvar}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  )
}
