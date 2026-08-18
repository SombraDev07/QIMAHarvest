import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Breadcrumb, Modal, PageHead } from '../components/ui'
import { IconAlerta, IconAnexo, IconChat, IconLixeira, IconLupa, IconMais } from '../components/icons'
import { OPCOES } from '../data/mock'
import {
  obterUsuarioLogado,
  adicionarParticipante,
  criarAnexo,
  criarSolicitacao,
  enviarMensagemSolicitacao,
  excluirSolicitacao,
  moverSolicitacao,
  useSolicitacoes,
} from '../store'
import { corDoNome, iniciais } from '../usuario'
import { fmtDataHora } from '../format'
import type {
  AnexoArquivo,
  MensagemSolicitacao,
  Solicitacao,
  StatusSolicitacao,
  TipoSolicitacao,
} from '../types'

const TIPO_INFO: Record<TipoSolicitacao, { label: string; cor: string }> = {
  'exclusao-carga': { label: 'Exclusão de carga', cor: '#dc2626' },
  'insercao-dados': { label: 'Inserção de dados', cor: '#1d4ed8' },
  acumulado: { label: 'Acumulado', cor: '#6d28d9' },
}

const COLUNAS: { status: StatusSolicitacao; label: string }[] = [
  { status: 'pendente', label: 'Pendentes' },
  { status: 'analise', label: 'Em Análise' },
  { status: 'feito', label: 'Feitos' },
]

/** todas as pessoas que podem ser solicitante ou anexadas ao chat */
function useEquipe(): string[] {
  return useMemo(
    () =>
      [
        obterUsuarioLogado().nome,
        ...OPCOES.consultores,
        ...OPCOES.lideres,
        ...OPCOES.lideresFocais,
        ...OPCOES.supervisores,
      ].filter((nome, i, arr) => arr.indexOf(nome) === i),
    [],
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** minúsculo e sem acento, pra busca não depender de digitar "exclusão" com ç e til */
function normalizar(v: string): string {
  const SINAIS_DIACRITICOS = /[̀-ͯ]/g
  return v.toLowerCase().normalize('NFD').replace(SINAIS_DIACRITICOS, '')
}

/** quem abriu o pedido, ou quem administra o sistema, pode excluir */
function podeExcluir(s: Solicitacao): boolean {
  const usuario = obterUsuarioLogado()
  return s.solicitante === usuario.nome || usuario.perfil === 'Admin'
}

function corresponde(s: Solicitacao, termo: string): boolean {
  const alvo = normalizar(termo)
  if (!alvo) return true
  const campos = [
    String(s.numero),
    s.titulo,
    s.descricao,
    s.motivo ?? '',
    s.solicitante,
    TIPO_INFO[s.tipo].label,
    s.tipo,
    s.visitaCod ? String(s.visitaCod) : '',
    s.cargaId ?? '',
  ]
  return campos.some((c) => normalizar(c).includes(alvo))
}

export default function Solicitacoes() {
  const solicitacoes = useSolicitacoes()
  const [apenasMinhas, setApenasMinhas] = useState(false)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Solicitacao | null>(null)
  const [sobreColuna, setSobreColuna] = useState<StatusSolicitacao | null>(null)

  const visiveis = useMemo(() => {
    const base = apenasMinhas
      ? solicitacoes.filter(
          (s) => s.solicitante === obterUsuarioLogado().nome || s.participantes.includes(obterUsuarioLogado().nome),
        )
      : solicitacoes
    return base.filter((s) => corresponde(s, busca))
  }, [solicitacoes, apenasMinhas, busca])

  const selecionada = selecionadaId ? solicitacoes.find((s) => s.id === selecionadaId) : undefined

  const porStatus = (status: StatusSolicitacao) => visiveis.filter((s) => s.status === status)
  const devolutivasProntas = solicitacoes.filter(
    (s) => s.status === 'feito' && s.solicitante === obterUsuarioLogado().nome,
  )

  function soltar(e: React.DragEvent, status: StatusSolicitacao) {
    e.preventDefault()
    setSobreColuna(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) moverSolicitacao(id, status)
  }

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: 'Início', to: '/visitas' }, { label: 'Solicitações' }]} />
      <PageHead
        titulo="Solicitações"
        subtitulo="Pedidos de exclusão de carga, inserção de dados e acumulado — com chat e anexos, sem sair do sistema."
        acoes={
          <>
            <button
              className={`btn btn--ghost${apenasMinhas ? ' is-on' : ''}`}
              type="button"
              onClick={() => setApenasMinhas((v) => !v)}
            >
              {apenasMinhas ? 'Ver todas' : 'Minhas solicitações'}
              {devolutivasProntas.length > 0 && !apenasMinhas && (
                <span className="chip chip--ok" style={{ marginLeft: 8 }}>
                  {devolutivasProntas.length} retorno{devolutivasProntas.length > 1 ? 's' : ''}
                </span>
              )}
            </button>
            <button className="btn btn--primary" type="button" onClick={() => setCriando(true)}>
              <IconMais /> Nova solicitação
            </button>
          </>
        }
      />

      <div className="sol-busca">
        <IconLupa size={15} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número (#1043), título, PDR, visita, carga ou tipo (exclusão, acumulado, inserção…)"
        />
        {busca && (
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setBusca('')}>
            Limpar
          </button>
        )}
      </div>

      <div className="kanban">
        {COLUNAS.map((col) => {
          const cards = porStatus(col.status)
          return (
            <div
              key={col.status}
              className={`kanban-col${sobreColuna === col.status ? ' is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setSobreColuna(col.status)
              }}
              onDragLeave={() => setSobreColuna((c) => (c === col.status ? null : c))}
              onDrop={(e) => soltar(e, col.status)}
            >
              <div className="kanban-col__head">
                <span>{col.label}</span>
                <span className="tabs__count">{cards.length}</span>
              </div>
              <div className="kanban-col__body">
                {cards.map((s) => (
                  <CardSolicitacao
                    key={s.id}
                    s={s}
                    onAbrir={() => setSelecionadaId(s.id)}
                    onExcluir={() => setExcluindo(s)}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="kanban-col__vazio">
                    {busca
                      ? `Nenhum resultado para "${busca}".`
                      : col.status === 'pendente'
                        ? 'Arraste um card pendente para aqui.'
                        : 'Nenhuma solicitação aqui.'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {criando && (
        <NovaSolicitacaoModal
          onClose={() => setCriando(false)}
          onCriar={(dados) => {
            const nova = criarSolicitacao(dados)
            setCriando(false)
            setSelecionadaId(nova.id)
          }}
        />
      )}

      {selecionada && (
        <DetalheSolicitacaoModal
          s={selecionada}
          onClose={() => setSelecionadaId(null)}
          onExcluir={() => {
            setSelecionadaId(null)
            setExcluindo(selecionada)
          }}
        />
      )}

      {excluindo && (
        <ModalConfirmarExclusao
          s={excluindo}
          onClose={() => setExcluindo(null)}
          onConfirmar={() => {
            excluirSolicitacao(excluindo.id)
            setExcluindo(null)
          }}
        />
      )}
    </main>
  )
}

/* ------------------------------------------------------------------ */
function ModalConfirmarExclusao({
  s,
  onClose,
  onConfirmar,
}: {
  s: Solicitacao
  onClose: () => void
  onConfirmar: () => void
}) {
  return (
    <Modal
      titulo="Excluir solicitação"
      onClose={onClose}
      rodape={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="button" onClick={onConfirmar}>
            Excluir definitivamente
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        Confirma a exclusão da solicitação <strong>#{s.numero}</strong> — "{s.titulo}"? Essa ação
        não pode ser desfeita e todo o chat com anexos será perdido.
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function CardSolicitacao({
  s,
  onAbrir,
  onExcluir,
}: {
  s: Solicitacao
  onAbrir: () => void
  onExcluir: () => void
}) {
  const info = TIPO_INFO[s.tipo]
  const devolutiva = s.status === 'feito' && s.solicitante === obterUsuarioLogado().nome

  return (
    <article
      className={`kanban-card${devolutiva ? ' kanban-card--devolutiva' : ''}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', s.id)}
      onClick={onAbrir}
    >
      <div className="kanban-card__topo">
        <span
          className="badge"
          style={{ color: info.cor, borderColor: `${info.cor}44`, background: `${info.cor}12` }}
        >
          {info.label}
        </span>
        <span className="kanban-card__topo-direita">
          <span className="kanban-card__num mono">#{s.numero}</span>
          {podeExcluir(s) && (
            <button
              className="kanban-card__excluir"
              type="button"
              title="Excluir solicitação"
              onClick={(e) => {
                e.stopPropagation()
                onExcluir()
              }}
            >
              <IconLixeira size={12} />
            </button>
          )}
        </span>
      </div>

      <div className="kanban-card__titulo">{s.titulo}</div>

      {(s.visitaCod || s.cargaId) && (
        <div className="kanban-card__ref">
          {s.visitaCod && <span>Visita {s.visitaCod}</span>}
          {s.cargaId && <span>Carga {s.cargaId}</span>}
        </div>
      )}

      {s.motivo && <div className="kanban-card__motivo">Motivo: {s.motivo}</div>}

      <div className="kanban-card__rodape">
        <span className="kanban-card__solicitante">{s.solicitante}</span>
        <span className="kanban-card__msgs">
          <IconChat size={11} /> {s.mensagens.length}
        </span>
      </div>

      {devolutiva && (
        <div className="kanban-card__devolutiva">
          <IconAlerta size={11} /> Retorno pronto — confira o resultado
        </div>
      )}
    </article>
  )
}

/* ------------------------------------------------------------------ */
type DadosNovaSolicitacao = {
  tipo: TipoSolicitacao
  titulo: string
  descricao: string
  motivo?: string
  visitaCod?: number
  cargaId?: string
  solicitante: string
  anexos?: AnexoArquivo[]
}

function NovaSolicitacaoModal({
  onClose,
  onCriar,
}: {
  onClose: () => void
  onCriar: (dados: DadosNovaSolicitacao) => void
}) {
  const equipe = useEquipe()
  const [tipo, setTipo] = useState<TipoSolicitacao>('exclusao-carga')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [visitaCod, setVisitaCod] = useState('')
  const [cargaId, setCargaId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [anexos, setAnexos] = useState<AnexoArquivo[]>([])
  const [solicitante, setSolicitante] = useState(obterUsuarioLogado().nome)
  const inputRef = useRef<HTMLInputElement>(null)

  function adicionarArquivos(files: FileList | null) {
    if (!files || files.length === 0) return
    setAnexos((prev) => [...prev, ...Array.from(files).map(criarAnexo)])
  }

  const valido =
    tipo === 'exclusao-carga'
      ? Boolean(visitaCod && cargaId.trim() && motivo.trim())
      : tipo === 'insercao-dados'
        ? Boolean(visitaCod)
        : Boolean(titulo.trim())

  function confirmar() {
    if (!valido) return
    const tituloFinal =
      tipo === 'exclusao-carga'
        ? `Exclusão de carga ${cargaId.trim()} — visita ${visitaCod}`
        : tipo === 'insercao-dados'
          ? `Inserção de dados — visita ${visitaCod}`
          : titulo.trim()

    onCriar({
      tipo,
      titulo: tituloFinal,
      descricao: descricao.trim(),
      motivo: tipo === 'exclusao-carga' ? motivo.trim() : undefined,
      visitaCod: visitaCod ? Number(visitaCod) : undefined,
      cargaId: tipo === 'exclusao-carga' ? cargaId.trim() : undefined,
      solicitante,
      anexos,
    })
  }

  const campoAnexo = (
    <div className="field">
      <label>Anexo</label>
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{ width: 'fit-content' }}
      >
        <IconAnexo size={13} /> Selecionar arquivo(s)
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          adicionarArquivos(e.target.files)
          e.target.value = ''
        }}
      />
      {anexos.length > 0 && (
        <div className="sol-anexos-pendentes" style={{ marginTop: 8 }}>
          {anexos.map((a) => (
            <span key={a.id} className="chip">
              <IconAnexo size={11} /> {a.nome}
              <button
                type="button"
                className="sol-anexo-remover"
                onClick={() => setAnexos((prev) => prev.filter((x) => x.id !== a.id))}
                aria-label={`Remover ${a.nome}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <Modal
      titulo="Nova solicitação"
      subtitulo="Peça exclusão de carga, inserção de dados ou correção de acumulado."
      largo
      onClose={onClose}
      rodape={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="button" disabled={!valido} onClick={confirmar}>
            Criar solicitação
          </button>
        </>
      }
    >
      <div className="field">
        <label>Tipo de solicitação</label>
        <div className="segmented">
          {(Object.keys(TIPO_INFO) as TipoSolicitacao[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tipo === t ? 'is-on' : undefined}
              onClick={() => setTipo(t)}
            >
              {TIPO_INFO[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="sol-quem">Solicitante</label>
        <select id="sol-quem" value={solicitante} onChange={(e) => setSolicitante(e.target.value)}>
          {equipe.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {tipo === 'exclusao-carga' && (
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="sol-visita">Código da visita</label>
            <input
              id="sol-visita"
              value={visitaCod}
              onChange={(e) => setVisitaCod(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex.: 295428"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="sol-carga">ID da carga</label>
            <input
              id="sol-carga"
              value={cargaId}
              onChange={(e) => setCargaId(e.target.value)}
              placeholder="Ex.: 30414012"
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="sol-motivo">Motivo</label>
            <input
              id="sol-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: lançada em duplicidade pelo tablet"
            />
          </div>
        </div>
      )}

      {tipo === 'insercao-dados' && (
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="sol-visita">Código da visita</label>
            <input
              id="sol-visita"
              value={visitaCod}
              onChange={(e) => setVisitaCod(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex.: 295428"
              autoFocus
            />
          </div>
          {campoAnexo}
        </div>
      )}

      {tipo === 'acumulado' && (
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="sol-titulo">Título</label>
            <input
              id="sol-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Corrigir acumulado divergente do laudo"
              autoFocus
            />
          </div>
          {campoAnexo}
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="sol-desc">Descrição</label>
        <textarea
          id="sol-desc"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Explique o que precisa ser feito — essa descrição entra como a primeira mensagem do chat."
          style={{ minHeight: 90 }}
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function DetalheSolicitacaoModal({
  s,
  onClose,
  onExcluir,
}: {
  s: Solicitacao
  onClose: () => void
  onExcluir: () => void
}) {
  const equipe = useEquipe()
  const info = TIPO_INFO[s.tipo]
  const pessoas = [s.solicitante, ...s.participantes]

  return (
    <Modal
      titulo={`#${s.numero} — ${s.titulo}`}
      subtitulo={s.descricao || undefined}
      largo
      onClose={onClose}
      rodape={
        <>
          {podeExcluir(s) && (
            <button
              className="btn btn--ghost"
              type="button"
              style={{ color: 'var(--err)' }}
              onClick={onExcluir}
            >
              <IconLixeira size={14} /> Excluir
            </button>
          )}
          <span className="spacer" />
          {s.status !== 'pendente' && (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => moverSolicitacao(s.id, 'pendente')}
            >
              ← Pendente
            </button>
          )}
          {s.status !== 'analise' && (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => moverSolicitacao(s.id, 'analise')}
            >
              {s.status === 'feito' ? '← Em análise' : 'Em análise →'}
            </button>
          )}
          {s.status !== 'feito' && (
            <button
              className="btn btn--certificar"
              type="button"
              onClick={() => moverSolicitacao(s.id, 'feito')}
            >
              Marcar como feito →
            </button>
          )}
          <button className="btn btn--primary" type="button" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <div className="sol-meta">
        <span
          className="badge"
          style={{ color: info.cor, borderColor: `${info.cor}44`, background: `${info.cor}12` }}
        >
          {info.label}
        </span>
        {s.visitaCod && (
          <Link className="chip chip--info" to={`/visita/${s.visitaCod}`} target="_blank" rel="noopener noreferrer">
            Visita {s.visitaCod}
          </Link>
        )}
        {s.cargaId && <span className="chip mono">Carga {s.cargaId}</span>}
        {s.motivo && <span className="chip">Motivo: {s.motivo}</span>}
        <span className="cell-muted">
          Aberto por <strong>{s.solicitante}</strong> em {fmtDataHora(s.criadoEm)}
        </span>
      </div>

      <div className="sol-participantes">
        <span className="cell-muted">Participantes: {pessoas.join(', ')}</span>
        <select
          className="field-select"
          value=""
          onChange={(e) => {
            if (e.target.value) adicionarParticipante(s.id, e.target.value)
          }}
        >
          <option value="">+ Anexar pessoa ao chat</option>
          {equipe
            .filter((n) => !pessoas.includes(n))
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </select>
      </div>

      <ListaMensagensSolicitacao mensagens={s.mensagens} />
      <ComposerSolicitacao solicitacaoId={s.id} />
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function ListaMensagensSolicitacao({ mensagens }: { mensagens: MensagemSolicitacao[] }) {
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' })
  }, [mensagens.length])

  return (
    <div className="conversa" style={{ marginTop: 16 }}>
      {mensagens.length === 0 && (
        <div className="conversa__vazio">Nenhuma mensagem ainda. Comece a conversa abaixo.</div>
      )}
      {mensagens.map((m) => (
        <article className={`msg${m.autor === obterUsuarioLogado().nome ? ' msg--propria' : ''}`} key={m.id}>
          <div className="msg__avatar" style={{ background: corDoNome(m.autor) }}>
            {iniciais(m.autor)}
          </div>
          <div className="msg__balao">
            <div className="msg__topo">
              <span className="msg__autor">{m.autor}</span>
              <span className="msg__hora">{fmtDataHora(m.ts)}</span>
            </div>
            {m.texto && <div className="msg__texto">{m.texto}</div>}
            {m.anexos.length > 0 && (
              <div className="sol-anexos">
                {m.anexos.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    download={a.nome}
                    className="sol-anexo"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconAnexo size={13} />
                    {a.nome}
                    <span className="cell-muted">({fmtBytes(a.tamanho)})</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
      <div ref={fim} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
function ComposerSolicitacao({ solicitacaoId }: { solicitacaoId: string }) {
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<AnexoArquivo[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function adicionarArquivos(files: FileList | null) {
    if (!files || files.length === 0) return
    setAnexos((prev) => [...prev, ...Array.from(files).map(criarAnexo)])
  }

  function enviar() {
    if (!texto.trim() && anexos.length === 0) return
    enviarMensagemSolicitacao(solicitacaoId, obterUsuarioLogado().nome, texto.trim(), anexos)
    setTexto('')
    setAnexos([])
  }

  return (
    <div className="compositor">
      <div className="compositor__avatar" style={{ background: corDoNome(obterUsuarioLogado().nome) }}>
        {iniciais(obterUsuarioLogado().nome)}
      </div>
      <div className="compositor__corpo">
        {anexos.length > 0 && (
          <div className="sol-anexos-pendentes">
            {anexos.map((a) => (
              <span key={a.id} className="chip">
                <IconAnexo size={11} /> {a.nome}
                <button
                  type="button"
                  className="sol-anexo-remover"
                  onClick={() => setAnexos((prev) => prev.filter((x) => x.id !== a.id))}
                  aria-label={`Remover ${a.nome}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva uma mensagem…  (Ctrl+Enter envia)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar()
          }}
        />

        <div className="compositor__rodape">
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            <IconAnexo size={13} /> Anexar arquivo
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              adicionarArquivos(e.target.files)
              e.target.value = ''
            }}
          />
          <span style={{ flex: 1 }} />
          <button
            className="btn btn--primary btn--sm"
            type="button"
            onClick={enviar}
            disabled={!texto.trim() && anexos.length === 0}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
