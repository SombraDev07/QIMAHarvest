import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Modal, Panel } from './ui'
import {
  IconAlerta,
  IconEditar,
  IconFotos,
  IconLixeira,
  IconMais,
  IconMigrar,
  IconUpload,
} from './icons'
import EditarCarga, { criarCargaVazia } from './EditarCarga'
import ImportarCargas from './ImportarCargas'
import { CORES_CLASSIFICACAO } from '../data/mock'
import {
  adicionarCargas,
  usePodeEditarVisita,
  excluirCarga,
  gruposDeRateio,
  migrarCargas,
  percentualDesconto,
  salvarCarga,
} from '../store'
import type { Carga, GrupoRateio, Visita } from '../types'
import { campoNaoInformado } from '../types'
import { severidadeDaCarga, type Alerta } from '../analise'
import { fmtKg, fmtPct } from '../format'

export default function TabelaCargas({
  visita,
  acompanhada,
  titulo,
  numero,
  onAviso,
  foco,
  onFocoConsumido,
  problemas,
}: {
  visita: Visita
  acompanhada: boolean
  titulo: string
  numero: string
  onAviso: (msg: string) => void
  /** id da carga que a análise pediu para inspecionar */
  foco?: string | null
  onFocoConsumido?: () => void
  /** alertas da análise indexados por carga, para pintar as linhas */
  problemas?: Map<string, Alerta[]>
}) {
  const t = useT()
  const podeEditar = usePodeEditarVisita()
  const [editando, setEditando] = useState<Carga | null>(null)
  const [importando, setImportando] = useState(false)
  const [excluindo, setExcluindo] = useState<Carga | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set())
  const linhaFoco = useRef<HTMLTableRowElement | null>(null)

  const destinoAcompanhada = !acompanhada
  const destinoLabel = t(destinoAcompanhada ? 'acompanhadas' : 'não acompanhadas')
  const rotuloMover = t(
    destinoAcompanhada ? 'Mover para acompanhadas' : 'Mover para não acompanhadas',
  )

  // o callback chega inline do pai, com identidade nova a cada render; guardar
  // em ref mantém o efeito abaixo preso só ao foco
  const consumirFoco = useRef(onFocoConsumido)
  useEffect(() => {
    consumirFoco.current = onFocoConsumido
  })

  // ao chegar pela análise, rola até a carga e mantém o realce por alguns segundos
  useEffect(() => {
    if (!foco) return
    linhaFoco.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timeout = setTimeout(() => consumirFoco.current?.(), 6000)
    return () => clearTimeout(timeout)
  }, [foco])

  const cargas = useMemo(
    () => visita.cargas.filter((c) => c.acompanhada === acompanhada),
    [visita.cargas, acompanhada],
  )

  const grupos = useMemo(() => gruposDeRateio(cargas), [cargas])
  const todosGrupos = useMemo(() => gruposDeRateio(visita.cargas), [visita.cargas])

  const avulsas = useMemo(
    () =>
      cargas
        .filter((c) => !c.rateio || !c.grupoRateio)
        .sort((a, b) => a.hora.localeCompare(b.hora)),
    [cargas],
  )

  /** cargas que originaram alguma ocorrência */
  const comOcorrencia = useMemo(
    () => new Map(visita.ocorrencias.filter((o) => o.cargaId).map((o) => [o.cargaId!, o])),
    [visita.ocorrencias],
  )

  const totalLiquido = cargas.reduce((s, c) => s + c.pesoLiquido, 0)
  const totalDesconto = cargas.reduce((s, c) => s + c.pesoComDesconto, 0)
  const pctMedio = totalLiquido ? ((totalLiquido - totalDesconto) / totalLiquido) * 100 : 0

  /**
   * id do próximo grupo a partir do maior sufixo já usado — pela contagem ele
   * colidiria com um grupo existente sempre que outro tivesse sido dissolvido.
   */
  const proximoGrupo = useMemo(() => {
    const maior = todosGrupos.reduce((max, g) => {
      const n = Number(g.id.split('-').pop())
      return Number.isFinite(n) ? Math.max(max, n) : max
    }, 0)
    return `RT-${visita.cod}-${String(maior + 1).padStart(2, '0')}`
  }, [todosGrupos, visita.cod])

  function salvar(c: Carga) {
    salvarCarga(visita.cod, c)
    setEditando(null)
    onAviso(`Carga ${c.id} salva.`)
  }

  function importar(novas: Carga[]) {
    adicionarCargas(
      visita.cod,
      novas.map((c) => ({ ...c, acompanhada })),
    )
    setImportando(false)
    onAviso(`${novas.length} carga(s) importada(s) com sucesso.`)
  }

  function confirmarExclusao() {
    if (!excluindo) return
    excluirCarga(visita.cod, excluindo.id)
    onAviso(`Carga ${excluindo.id} excluída.`)
    setExcluindo(null)
  }

  function alternar(id: string) {
    setMarcadas((atual) => {
      const next = new Set(atual)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function alternarVarias(ids: string[]) {
    setMarcadas((atual) => {
      const next = new Set(atual)
      const todos = ids.length > 0 && ids.every((id) => next.has(id))
      if (todos) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  function confirmarMigracao() {
    const ids = [...marcadas]
    if (!ids.length) return
    migrarCargas(visita.cod, ids, destinoAcompanhada)
    onAviso(
      ids.length === 1
        ? `Carga ${ids[0]} movida para cargas ${destinoLabel}.`
        : `${ids.length} cargas movidas para ${destinoLabel}.`,
    )
    setMarcadas(new Set())
  }

  const acoes = (c: Carga) => (
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
        title={podeEditar ? 'Editar carga' : 'Seu perfil abre a visita em leitura'}
        disabled={!podeEditar}
        onClick={() => setEditando(c)}
      >
        <IconEditar />
      </button>
      <button
        className="btn btn--danger btn--sm btn--icon"
        type="button"
        title={podeEditar ? 'Excluir carga' : 'Seu perfil abre a visita em leitura'}
        disabled={!podeEditar}
        onClick={() => setExcluindo(c)}
      >
        <IconLixeira />
      </button>
    </div>
  )

  const colunaPeso = (c: Carga) => {
    const pct = percentualDesconto(c)
    const ni = (campo: 'pesoLiquido' | 'pesoComDesconto') =>
      campoNaoInformado(c, campo) ? <span className="cell-ni">Não informado</span> : fmtKg(c[campo])
    return (
      <>
        <td className="num">{ni('pesoLiquido')}</td>
        <td className="num">{ni('pesoComDesconto')}</td>
        <td className="num">
          <span className="pct" title={`Diferença: ${fmtKg(c.pesoLiquido - c.pesoComDesconto)}`}>
            {fmtPct(pct)}
          </span>
        </td>
      </>
    )
  }

  const marcadorOcorrencia = (c: Carga) => {
    const oc = comOcorrencia.get(c.id)
    const lista = problemas?.get(c.id)
    const sev = severidadeDaCarga(lista)

    return (
      <>
        {sev && (
          <span
            className={`tag-problema tag-problema--${sev}`}
            title={lista!.map((a) => a.regra).join(' · ')}
          >
            <IconAlerta size={12} />
            {lista!.length > 1 ? `${lista!.length} ${sev === 'erro' ? 'erros' : 'alertas'}` : lista![0].regra}
          </span>
        )}
        {oc && (
          <span className="tag-ocorrencia" title={`${oc.id} — ${oc.tipo}`}>
            <IconAlerta size={12} /> ocorrência
          </span>
        )}
      </>
    )
  }

  /** classes de destaque da linha: foco da análise + severidade do problema */
  const classeLinha = (c: Carga) => {
    const sev = severidadeDaCarga(problemas?.get(c.id))
    return [
      foco === c.id ? 'is-foco' : null,
      marcadas.has(c.id) ? 'is-marcada' : null,
      sev ? `row-${sev}` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  }

  return (
    <>
      <Panel
        numero={numero}
        titulo={titulo}
        acoes={
          <>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={!podeEditar || marcadas.size === 0}
              title={
                !podeEditar
                  ? 'Seu perfil abre a visita em leitura'
                  : marcadas.size === 0
                    ? 'Marque as cargas ao lado para mover'
                    : rotuloMover
              }
              onClick={confirmarMigracao}
            >
              <IconMigrar /> {marcadas.size > 0 ? `${rotuloMover} (${marcadas.size})` : rotuloMover}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={!podeEditar}
              onClick={() => setImportando(true)}
            >
              <IconUpload /> Importar planilha
            </button>
            <button
              className="btn btn--primary btn--sm"
              type="button"
              disabled={!podeEditar}
              onClick={() => setEditando({ ...criarCargaVazia(visita.data), acompanhada })}
            >
              <IconMais /> Nova carga
            </button>
          </>
        }
      >
        {cargas.length > 0 && (
          <div className="resumo-strip">
            <div className="resumo-item">
              <span className="resumo-item__label">Cargas</span>
              <span className="resumo-item__valor">{cargas.length}</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-item__label">Avulsas</span>
              <span className="resumo-item__valor">{avulsas.length}</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-item__label">Grupos de rateio</span>
              <span className="resumo-item__valor" style={{ color: 'var(--violet)' }}>
                {grupos.length}
              </span>
            </div>
            <div className="resumo-item">
              <span className="resumo-item__label">Peso líquido</span>
              <span className="resumo-item__valor">{fmtKg(totalLiquido)}</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-item__label">Peso c/ desconto</span>
              <span className="resumo-item__valor">{fmtKg(totalDesconto)}</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-item__label">Desconto médio</span>
              <span className="resumo-item__valor">{fmtPct(pctMedio)}</span>
            </div>
          </div>
        )}

        <div className="panel__body" style={{ paddingTop: 16 }}>
          {/* ---------------- cargas avulsas ---------------- */}
          <div className="bloco">
            <div className="bloco__head">
              <span className="bloco__titulo">Cargas avulsas</span>
              <span className="bloco__sub">{avulsas.length} carga(s) sem rateio</span>
            </div>

            {avulsas.length === 0 ? (
              <div className="bloco__vazio">Nenhuma carga avulsa nesta visita.</div>
            ) : (
              <div className="table-scroll">
                <table className="data data--cargas">
                  <thead>
                    <tr>
                      <th className="check">
                        <input
                          className="carga-check"
                          type="checkbox"
                          disabled={!podeEditar}
                          checked={
                            avulsas.length > 0 && avulsas.every((c) => marcadas.has(c.id))
                          }
                          ref={(el) => {
                            if (!el) return
                            const alguma = avulsas.some((c) => marcadas.has(c.id))
                            const todas = avulsas.every((c) => marcadas.has(c.id))
                            el.indeterminate = alguma && !todas
                          }}
                          onChange={() => alternarVarias(avulsas.map((c) => c.id))}
                          aria-label={t('Marcar todas')}
                        />
                      </th>
                      <th>ID</th>
                      <th>Data / hora</th>
                      <th>Placa</th>
                      <th>Produtor</th>
                      <th>Romaneio</th>
                      <th style={{ textAlign: 'right' }}>Peso líquido</th>
                      <th style={{ textAlign: 'right' }}>Peso c/ desconto</th>
                      <th style={{ textAlign: 'right' }}>Desconto</th>
                      <th>Classificação</th>
                      <th>Observação</th>
                      <th style={{ textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avulsas.map((c) => (
                      <tr
                        key={c.id}
                        ref={foco === c.id ? linhaFoco : undefined}
                        className={classeLinha(c)}
                      >
                        <td className="check">
                          <input
                            className="carga-check"
                            type="checkbox"
                            disabled={!podeEditar}
                            checked={marcadas.has(c.id)}
                            onChange={() => alternar(c.id)}
                            aria-label={`${t('Mover')} ${c.id}`}
                          />
                        </td>
                        <td className="mono cell-id">{c.id}</td>
                        <td>
                          <div className="mono">{c.data}</div>
                          <div className="cell-muted mono">{c.hora}</div>
                        </td>
                        <td>
                          <span className="placa">
                            {campoNaoInformado(c, 'placa') ? (
                              <span className="cell-ni">Não informado</span>
                            ) : (
                              c.placa
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="produtor">
                            {campoNaoInformado(c, 'produtor') ? (
                              <span className="cell-ni">Não informado</span>
                            ) : (
                              c.produtor
                            )}
                          </div>
                          <div className="cell-muted mono">
                            {campoNaoInformado(c, 'cpfCnpjProdutor') ? (
                              <span className="cell-ni">Não informado</span>
                            ) : (
                              c.cpfCnpjProdutor
                            )}
                          </div>
                        </td>
                        <td className="mono">
                          {campoNaoInformado(c, 'romaneio') || !c.romaneio ? (
                            campoNaoInformado(c, 'romaneio') ? (
                              <span className="cell-ni">Não informado</span>
                            ) : (
                              <span className="cell-muted">—</span>
                            )
                          ) : (
                            c.romaneio
                          )}
                        </td>
                        {colunaPeso(c)}
                        <td>
                          <ClassificacaoBadge carga={c} />
                        </td>
                        <td className="obs">
                          {marcadorOcorrencia(c)}
                          {c.observacao ? (
                            <span className="cell-muted">{c.observacao}</span>
                          ) : (
                            !comOcorrencia.get(c.id) && <span className="cell-muted">—</span>
                          )}
                        </td>
                        <td>{acoes(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---------------- grupos de rateio ---------------- */}
          {grupos.length > 0 && (
            <div className="bloco" style={{ marginTop: 22 }}>
              <div className="bloco__head">
                <span className="bloco__titulo">Grupos de rateio</span>
                <span className="bloco__sub">
                  {grupos.length} grupo(s) ·{' '}
                  {grupos.reduce((s, g) => s + g.cargas.length, 0)} cargas · mesma placa, data,
                  hora e classificação
                </span>
              </div>

              <div className="grupos">
                {grupos.map((g) => (
                  <CardGrupo
                    key={g.id}
                    grupo={g}
                    colunaPeso={colunaPeso}
                    acoes={acoes}
                    marcador={marcadorOcorrencia}
                    foco={foco}
                    refFoco={linhaFoco}
                    classeLinha={classeLinha}
                    podeEditar={podeEditar}
                    marcadas={marcadas}
                    onAlternar={alternar}
                    onAlternarGrupo={() => alternarVarias(g.cargas.map((c) => c.id))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {cargas.length === 0 && (
          <div className="empty">
            Nenhuma carga lançada. Use <strong>Nova carga</strong> ou{' '}
            <strong>Importar planilha</strong>.
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

      {importando && (
        <ImportarCargas
          dataPadrao={visita.data}
          onImportar={importar}
          onClose={() => setImportando(false)}
        />
      )}

      {excluindo && (
        <Modal
          titulo="Excluir carga"
          onClose={() => setExcluindo(null)}
          rodape={
            <>
              <span className="spacer" />
              <button className="btn btn--ghost" type="button" onClick={() => setExcluindo(null)}>
                Cancelar
              </button>
              <button className="btn btn--primary" type="button" onClick={confirmarExclusao}>
                Excluir definitivamente
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Confirma a exclusão da carga <strong>{excluindo.id}</strong> — placa{' '}
            <strong>{excluindo.placa}</strong>, romaneio <strong>{excluindo.romaneio}</strong>,{' '}
            {fmtKg(excluindo.pesoLiquido)}?
          </p>
          {excluindo.rateio && (
            <div className="alert alert--info" style={{ marginTop: 14 }}>
              Esta carga pertence ao rateio <strong>{excluindo.grupoRateio}</strong>. Os totais do
              grupo serão recalculados; se restar apenas uma carga, ela deixa de ser rateio.
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function ClassificacaoBadge({ carga }: { carga: Carga }) {
  const cor = CORES_CLASSIFICACAO[carga.classificacao]
  return (
    <span
      className="badge"
      style={{ color: cor, borderColor: `${cor}44`, background: `${cor}12` }}
    >
      {carga.classificacao}
    </span>
  )
}

function CardGrupo({
  grupo,
  colunaPeso,
  acoes,
  marcador,
  foco,
  refFoco,
  classeLinha,
  podeEditar,
  marcadas,
  onAlternar,
  onAlternarGrupo,
}: {
  grupo: GrupoRateio
  colunaPeso: (c: Carga) => React.ReactNode
  acoes: (c: Carga) => React.ReactNode
  marcador: (c: Carga) => React.ReactNode
  foco?: string | null
  refFoco: React.RefObject<HTMLTableRowElement | null>
  classeLinha: (c: Carga) => string | undefined
  podeEditar: boolean
  marcadas: Set<string>
  onAlternar: (id: string) => void
  onAlternarGrupo: () => void
}) {
  const cor = CORES_CLASSIFICACAO[grupo.classificacao]
  const ids = grupo.cargas.map((c) => c.id)
  const todasMarcadas = ids.length > 0 && ids.every((id) => marcadas.has(id))
  const algumaMarcada = ids.some((id) => marcadas.has(id))

  return (
    <article className="grupo">
      <header className="grupo__head">
        <input
          className="carga-check"
          type="checkbox"
          disabled={!podeEditar}
          checked={todasMarcadas}
          ref={(el) => {
            if (el) el.indeterminate = algumaMarcada && !todasMarcadas
          }}
          onChange={onAlternarGrupo}
          aria-label={`Selecionar grupo ${grupo.id}`}
        />
        <span className="grupo__id">⛓ {grupo.id}</span>
        <span className="placa placa--grupo">{grupo.placa}</span>
        <span className="grupo__meta mono">
          {grupo.data} · {grupo.hora}
        </span>
        <span
          className="badge"
          style={{ color: cor, borderColor: `${cor}55`, background: '#fff' }}
        >
          {grupo.classificacao}
        </span>
        <span className="grupo__meta">{grupo.cargas.length} cargas</span>

        <div className="grupo__totais">
          <div>
            <span className="grupo__totais-label">Peso líquido do grupo</span>
            <span className="grupo__totais-valor">{fmtKg(grupo.pesoLiquidoTotal)}</span>
          </div>
          <div>
            <span className="grupo__totais-label">Peso c/ desconto do grupo</span>
            <span className="grupo__totais-valor">{fmtKg(grupo.pesoComDescontoTotal)}</span>
          </div>
        </div>
      </header>

      <div className="table-scroll">
        <table className="data data--cargas data--aninhada">
          <thead>
            <tr>
              <th className="check" />
              <th>ID</th>
              <th>Data / hora</th>
              <th>Placa</th>
              <th>Produtor</th>
              <th>Romaneio</th>
              <th style={{ textAlign: 'right' }}>Peso líquido</th>
              <th style={{ textAlign: 'right' }}>Peso c/ desconto</th>
              <th style={{ textAlign: 'right' }}>Desconto</th>
              <th>Observação</th>
              <th style={{ textAlign: 'center' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {grupo.cargas.map((c) => (
              <tr
                key={c.id}
                ref={foco === c.id ? refFoco : undefined}
                className={classeLinha(c)}
              >
                <td className="check">
                  <input
                    className="carga-check"
                    type="checkbox"
                    disabled={!podeEditar}
                    checked={marcadas.has(c.id)}
                    onChange={() => onAlternar(c.id)}
                    aria-label={`Selecionar ${c.id}`}
                  />
                </td>
                <td className="mono cell-id">{c.id}</td>
                <td>
                  <div className="mono">{c.data}</div>
                  <div className="cell-muted mono">{c.hora}</div>
                </td>
                <td>
                  <span className="placa">
                    {campoNaoInformado(c, 'placa') ? (
                      <span className="cell-ni">Não informado</span>
                    ) : (
                      c.placa
                    )}
                  </span>
                </td>
                <td>
                  <div className="produtor">
                    {campoNaoInformado(c, 'produtor') ? (
                      <span className="cell-ni">Não informado</span>
                    ) : (
                      c.produtor
                    )}
                  </div>
                  <div className="cell-muted mono">
                    {campoNaoInformado(c, 'cpfCnpjProdutor') ? (
                      <span className="cell-ni">Não informado</span>
                    ) : (
                      c.cpfCnpjProdutor
                    )}
                  </div>
                </td>
                <td className="mono">
                  {campoNaoInformado(c, 'romaneio') || !c.romaneio ? (
                    campoNaoInformado(c, 'romaneio') ? (
                      <span className="cell-ni">Não informado</span>
                    ) : (
                      <span className="cell-muted">—</span>
                    )
                  ) : (
                    c.romaneio
                  )}
                </td>
                {colunaPeso(c)}
                <td className="obs">
                  {marcador(c)}
                  {c.observacao && <span className="cell-muted">{c.observacao}</span>}
                </td>
                <td>{acoes(c)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="grupo__foot-label">
                Total do grupo
              </td>
              <td className="num cell-strong">{fmtKg(grupo.pesoLiquidoTotal)}</td>
              <td className="num cell-strong">{fmtKg(grupo.pesoComDescontoTotal)}</td>
              <td className="num cell-strong">
                {fmtPct(
                  grupo.pesoLiquidoTotal
                    ? ((grupo.pesoLiquidoTotal - grupo.pesoComDescontoTotal) /
                        grupo.pesoLiquidoTotal) *
                        100
                    : 0,
                )}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </article>
  )
}
