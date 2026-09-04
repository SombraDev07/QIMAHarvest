import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Breadcrumb, Modal, PageHead } from '../components/ui'
import { IconMais, IconNovaAba } from '../components/icons'
import {
  CATEGORIAS_OCORRENCIA_CAMPO,
  CORES_CLASSIFICACAO_OCORRENCIA,
  categoriaOcorrenciaCampoPorTipo,
  situacaoOcorrenciaCampoPorId,
  SITUACOES_OCORRENCIA_CAMPO,
} from '../data/mock'
import { criarOcorrenciaCampo, useOcorrenciasCampo, useUsuarioLogado, useVisitas } from '../store'
import CampoOrtografico from '../components/CampoOrtografico'
import { preaquecerCorretorPortugues } from '../ortografia'
import { fmtDataHora, fmtNum, fmtPct } from '../format'
import {
  ehPerfilRtv,
  ocorrenciaVisivelParaRtv,
  rotaInicial,
  STATUS_FILA_RTV,
  type OcorrenciaCampo,
  type SituacaoOcorrenciaCampo,
  type StatusOcorrenciaCampo,
  type Visita,
} from '../types'

/** minúsculo e sem acento, pra busca não depender de digitar "não" com o til */
function normalizar(v: string): string {
  const SINAIS_DIACRITICOS = /[̀-ͯ]/g
  return v.toLowerCase().normalize('NFD').replace(SINAIS_DIACRITICOS, '')
}

function corresponde(o: OcorrenciaCampo, termo: string, pdrNome: string): boolean {
  const alvo = normalizar(termo)
  if (!alvo) return true
  const campos = [String(o.numero), String(o.visitaCod), o.categoria, o.romaneio ?? '', pdrNome]
  return campos.some((c) => normalizar(c).includes(alvo))
}

const FILTROS_VAZIOS = { busca: '', status: '', categoria: '' }
const POR_PAGINA = 12

type ColunaKey = 'numero' | 'dataHora' | 'categoria' | 'visitaCod' | 'status'

export default function Ocorrencias() {
  const navigate = useNavigate()
  const usuario = useUsuarioLogado()
  const visaoRtv = ehPerfilRtv(usuario.perfil)
  const ocorrencias = useOcorrenciasCampo()
  const visitas = useVisitas()
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const [ordem, setOrdem] = useState<{ key: ColunaKey; dir: 'asc' | 'desc' }>({
    key: 'dataHora',
    dir: 'desc',
  })
  const [pagina, setPagina] = useState(1)
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    preaquecerCorretorPortugues()
  }, [])

  const visitaPorCod = useMemo(() => new Map(visitas.map((v) => [v.cod, v])), [visitas])
  const daFila = useMemo(
    () => (visaoRtv ? ocorrencias.filter(ocorrenciaVisivelParaRtv) : ocorrencias),
    [ocorrencias, visaoRtv],
  )
  const situacoesCard = visaoRtv
    ? SITUACOES_OCORRENCIA_CAMPO.filter((s) => STATUS_FILA_RTV.includes(s.id))
    : SITUACOES_OCORRENCIA_CAMPO

  const filtradas = useMemo(() => {
    return daFila.filter((o) => {
      const pdrNome = visitaPorCod.get(o.visitaCod)?.pdr.nome ?? ''
      if (!corresponde(o, filtros.busca, pdrNome)) return false
      if (filtros.status && o.status !== filtros.status) return false
      if (filtros.categoria && o.categoria !== filtros.categoria) return false
      return true
    })
  }, [daFila, filtros, visitaPorCod])

  const ordenadas = useMemo(() => {
    const dir = ordem.dir === 'asc' ? 1 : -1
    const valor = (o: OcorrenciaCampo): string | number => {
      switch (ordem.key) {
        case 'numero':
          return o.numero
        case 'dataHora':
          return o.dataHora
        case 'categoria':
          return o.categoria
        case 'visitaCod':
          return o.visitaCod
        case 'status':
          return situacaoOcorrenciaCampoPorId(o.status).label
      }
    }
    return [...filtradas].sort((a, b) => {
      const va = valor(a)
      const vb = valor(b)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [filtradas, ordem])

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = ordenadas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  function ordenarPor(key: ColunaKey) {
    setOrdem((o) => (o.key === key ? { key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  function set(campo: keyof typeof FILTROS_VAZIOS, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
    setPagina(1)
  }

  const colunas: { key: ColunaKey; label: string }[] = [
    { key: 'numero', label: 'Cód' },
    { key: 'dataHora', label: 'Data/Hora' },
    { key: 'categoria', label: 'Categoria' },
    { key: 'visitaCod', label: 'Visita' },
    { key: 'status', label: 'Status' },
  ]

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: 'Início', to: rotaInicial(usuario.perfil) }, { label: 'Ocorrências' }]} />
      <PageHead
        titulo="Ocorrências"
        subtitulo={
          visaoRtv
            ? 'Fila do RTV: casos aguardando parecer e os que já foram finalizados depois do RTV.'
            : 'Ocorrências abertas em campo pelo tablet, organizadas pela etapa de tratamento — Central, Operação e RTV.'
        }
        acoes={
          visaoRtv ? undefined : (
            <button className="btn btn--primary" type="button" onClick={() => setCriando(true)}>
              <IconMais /> Nova ocorrência
            </button>
          )
        }
      />

      <ResumoStatusOcorrencias
        ocorrencias={daFila}
        situacoes={situacoesCard}
        visaoRtv={visaoRtv}
        statusAtivo={filtros.status}
        onFiltrar={(status) => set('status', filtros.status === status ? '' : status)}
      />

      <section className="filters">
        <div className="filters__grid">
          <div className="field">
            <label htmlFor="f-busca">Buscar</label>
            <input
              id="f-busca"
              value={filtros.busca}
              onChange={(e) => set('busca', e.target.value)}
              placeholder="COD, visita, PDR, categoria ou romaneio…"
            />
          </div>
          <div className="field">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" value={filtros.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Todos</option>
              {situacoesCard.map((s) => (
                <option key={s.id} value={s.id}>
                  {visaoRtv && s.id === 'rtv-pendente' ? 'RTV' : visaoRtv && s.id === 'finalizada' ? 'Finalizadas' : s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-categoria">Categoria</label>
            <select id="f-categoria" value={filtros.categoria} onChange={(e) => set('categoria', e.target.value)}>
              <option value="">Todas</option>
              {CATEGORIAS_OCORRENCIA_CAMPO.map((c) => (
                <option key={c.tipo} value={c.tipo}>
                  {c.tipo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filters__actions">
          <button className="btn btn--ghost" type="button" onClick={() => { setFiltros(FILTROS_VAZIOS); setPagina(1) }}>
            Limpar filtros
          </button>
          <span className="filters__count">{fmtNum(ordenadas.length)} de {fmtNum(daFila.length)} ocorrências</span>
        </div>
      </section>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c.key} className="sortable" onClick={() => ordenarPor(c.key)}>
                    {c.label}
                    <span className="arrow">
                      {ordem.key === c.key ? (ordem.dir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                ))}
                <th>Romaneio</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((o) => {
                const categoria = categoriaOcorrenciaCampoPorTipo(o.categoria)
                const cor = categoria ? CORES_CLASSIFICACAO_OCORRENCIA[categoria.classificacao] : '#5b6673'
                const meta = situacaoOcorrenciaCampoPorId(o.status)
                const visita = visitaPorCod.get(o.visitaCod)
                return (
                  <tr key={o.id}>
                    <td>
                      <Link
                        className="link-cod"
                        to={`/ocorrencia/${o.numero}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir o detalhe da ocorrência em nova aba"
                      >
                        {o.numero}
                      </Link>
                      {o.rodada > 1 && (
                        <div className="cell-muted" style={{ marginTop: 4 }}>
                          {o.rodada}ª passagem
                        </div>
                      )}
                    </td>
                    <td className="cell-strong mono">{fmtDataHora(o.dataHora)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.categoria}</div>
                      <Badge cor={cor} texto={categoria?.classificacao ?? '—'} />
                    </td>
                    <td>
                      {visaoRtv ? (
                        <span className="mono">{o.visitaCod}</span>
                      ) : (
                        <Link className="link-cod" to={`/visita/${o.visitaCod}`} target="_blank" rel="noopener noreferrer">
                          {o.visitaCod}
                        </Link>
                      )}
                      {visita && <div className="cell-muted">{visita.pdr.nome}</div>}
                    </td>
                    <td>
                      <Badge cor={meta.color} texto={meta.label} />
                    </td>
                    <td className="mono">{o.romaneio ?? '—'}</td>
                    <td>
                      <Link
                        className="btn btn--ghost btn--sm"
                        to={`/ocorrencia/${o.numero}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir em nova aba"
                      >
                        Detalhar <IconNovaAba size={13} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {visiveis.length === 0 && (
          <div className="empty">Nenhuma ocorrência encontrada com os filtros aplicados.</div>
        )}

        <div className="pagination">
          <span>
            Página {paginaAtual} de {totalPaginas}
          </span>
          <div className="pagination__pages">
            <button type="button" disabled={paginaAtual === 1} onClick={() => setPagina(paginaAtual - 1)}>
              ‹
            </button>
            {paginasVisiveis(paginaAtual, totalPaginas).map((p) => (
              <button
                type="button"
                key={p}
                className={p === paginaAtual ? 'is-active' : undefined}
                onClick={() => setPagina(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={paginaAtual === totalPaginas}
              onClick={() => setPagina(paginaAtual + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {criando && (
        <NovaOcorrenciaModal
          visitas={visitas}
          onClose={() => setCriando(false)}
          onCriar={(dados) => {
            const nova = criarOcorrenciaCampo(dados)
            setCriando(false)
            navigate(`/ocorrencia/${nova.numero}`)
          }}
        />
      )}
    </main>
  )
}

function paginasVisiveis(atual: number, total: number): number[] {
  const inicio = Math.max(1, Math.min(atual - 2, total - 4))
  const fim = Math.min(total, inicio + 4)
  const paginas: number[] = []
  for (let p = inicio; p <= fim; p++) paginas.push(p)
  return paginas
}

/**
 * Cards por status — mesmo padrão do "Fluxo de tratamento" da tela de
 * Visitas (FluxoVisitas.tsx), mas sem as setas de conexão: aqui a
 * ocorrência pode ir de Central pra Operação e voltar, então não há uma
 * ordem única de leitura da esquerda pra direita. Clicar filtra a
 * tabela abaixo pelo status; clicar de novo no mesmo card limpa o filtro.
 */
function ResumoStatusOcorrencias({
  ocorrencias,
  situacoes,
  visaoRtv,
  statusAtivo,
  onFiltrar,
}: {
  ocorrencias: OcorrenciaCampo[]
  situacoes: SituacaoOcorrenciaCampo[]
  visaoRtv: boolean
  statusAtivo: string
  onFiltrar: (status: StatusOcorrenciaCampo) => void
}) {
  const total = ocorrencias.length

  return (
    <section className="fluxo">
      <div className="fluxo__head">
        <span className="fluxo__titulo">{visaoRtv ? 'Minha fila' : 'Ocorrências por etapa'}</span>
        <span className="fluxo__hint">Clique em um card para filtrar a tabela abaixo</span>
      </div>

      <div className="fluxo__trilha">
        {situacoes.map((s) => {
          const qtd = ocorrencias.filter((o) => o.status === s.id).length
          const pct = total ? (qtd / total) * 100 : 0
          const ativo = statusAtivo === s.id
          const titulo =
            visaoRtv && s.id === 'rtv-pendente' ? 'RTV' : visaoRtv && s.id === 'finalizada' ? 'Finalizadas' : s.label
          const descricao =
            visaoRtv && s.id === 'rtv-pendente'
              ? 'Aguardando seu parecer'
              : visaoRtv && s.id === 'finalizada'
                ? 'Encerradas depois do RTV'
                : s.descricao

          return (
            <div className="fluxo__no" key={s.id}>
              <button
                type="button"
                className="fluxo-card"
                style={{
                  ['--c' as string]: s.color,
                  boxShadow: ativo ? `0 0 0 2px ${s.color}` : undefined,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onClick={() => onFiltrar(s.id)}
              >
                <span className="fluxo-card__titulo">
                  <i className="fluxo-card__dot" />
                  {titulo}
                </span>
                <span className="fluxo-card__desc">{descricao}</span>

                <span className="fluxo-card__valor">
                  <b className="fluxo-card__num">{fmtNum(qtd)}</b>
                  <span className="fluxo-card__cta">{ativo ? 'Limpar filtro' : 'Filtrar →'}</span>
                </span>

                <span className="fluxo-card__barra">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className="fluxo-card__rodape">{fmtPct(pct)} do total</span>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ================================================================= *
 * Nova ocorrência — cadastro manual, vinculado a um COD de visita já
 * existente. Provisório: a fonte real é o tablet em campo; esta tela
 * cobre o período em que o registro ainda não chega integrado.
 * ================================================================= */
function paraDatetimeLocal(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

type DadosNovaOcorrencia = {
  visitaCod: number
  romaneio?: string
  categoria: string
  obsOcorrencia: string
  dataHora: number
  rtv?: string
}

function NovaOcorrenciaModal({
  visitas,
  onClose,
  onCriar,
}: {
  visitas: Visita[]
  onClose: () => void
  onCriar: (dados: DadosNovaOcorrencia) => void
}) {
  const [visitaCod, setVisitaCod] = useState('')
  const [romaneio, setRomaneio] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS_OCORRENCIA_CAMPO[0].tipo)
  const [dataHora, setDataHora] = useState(() => paraDatetimeLocal(Date.now()))
  const [rtv, setRtv] = useState('')
  const [obsOcorrencia, setObsOcorrencia] = useState('')

  const visita = visitas.find((v) => v.cod === Number(visitaCod))
  const codDigitado = visitaCod.trim().length > 0
  const visitaValida = codDigitado && Boolean(visita)
  const categoriaInfo = categoriaOcorrenciaCampoPorTipo(categoria)
  const valido = visitaValida && categoria && obsOcorrencia.trim().length > 0 && dataHora

  function confirmar() {
    if (!valido) return
    onCriar({
      visitaCod: Number(visitaCod),
      romaneio: romaneio.trim() || undefined,
      categoria,
      obsOcorrencia: obsOcorrencia.trim(),
      dataHora: new Date(dataHora).getTime(),
      rtv: rtv.trim() || undefined,
    })
  }

  return (
    <Modal
      titulo="Nova ocorrência"
      subtitulo="Cadastro manual, vinculado a uma visita já existente no sistema — enquanto o registro do tablet não chega integrado."
      largo
      onClose={onClose}
      rodape={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="button" disabled={!valido} onClick={confirmar}>
            Criar ocorrência
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="nova-oc-visita">Código da visita</label>
          <input
            id="nova-oc-visita"
            value={visitaCod}
            onChange={(e) => setVisitaCod(e.target.value.replace(/\D/g, ''))}
            placeholder="Ex.: 295428"
            autoFocus
          />
          {codDigitado && (
            <span className="field__hint" style={{ color: visita ? 'var(--green)' : 'var(--err)' }}>
              {visita ? `Visita encontrada — ${visita.pdr.nome}` : 'Nenhuma visita com esse código.'}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="nova-oc-romaneio">Romaneio (opcional)</label>
          <input
            id="nova-oc-romaneio"
            value={romaneio}
            onChange={(e) => setRomaneio(e.target.value)}
            placeholder="Quando a ocorrência vier de uma carga específica"
          />
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="nova-oc-categoria">Categoria</label>
          <select id="nova-oc-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS_OCORRENCIA_CAMPO.map((c) => (
              <option key={c.tipo} value={c.tipo}>
                {c.tipo}
              </option>
            ))}
          </select>
          {categoriaInfo && (
            <span className="field__hint">
              Classificação de gravidade:{' '}
              <Badge cor={CORES_CLASSIFICACAO_OCORRENCIA[categoriaInfo.classificacao]} texto={categoriaInfo.classificacao} />
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="nova-oc-data">Data/hora do registro</label>
          <input
            id="nova-oc-data"
            type="datetime-local"
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="nova-oc-rtv">RTV (opcional)</label>
          <input
            id="nova-oc-rtv"
            value={rtv}
            onChange={(e) => setRtv(e.target.value)}
            placeholder="Nome do RTV, se já for conhecido"
          />
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="nova-oc-obs">Observação da ocorrência</label>
          <CampoOrtografico
            id="nova-oc-obs"
            value={obsOcorrencia}
            onChange={setObsOcorrencia}
            placeholder="Descreva o que foi observado em campo — este é o registro original da ocorrência."
            minHeight={90}
          />
          <span className="field__hint">
            Dica: palavra com linha vermelha ondulada embaixo — clique com o botão direito para ver a
            correção. Abreviações como "vc" e "pq" viram a forma completa ao terminar de digitar.
          </span>
        </div>
      </div>
    </Modal>
  )
}
