import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Breadcrumb, KV, Modal, Toast } from '../components/ui'
import {
  IconAnexo,
  IconArmazem,
  IconCadeado,
  IconCalendario,
  IconDocumento,
  IconDownload,
  IconEscudo,
  IconInfo,
  IconLista,
  IconMais,
  IconPessoa,
  IconPrancheta,
  IconUsuarios,
} from '../components/icons'
import {
  CATEGORIAS_OCORRENCIA_CAMPO,
  CORES_CLASSIFICACAO_OCORRENCIA,
  categoriaOcorrenciaCampoPorTipo,
  situacaoOcorrenciaCampoPorId,
} from '../data/mock'
import {
  adicionarAnexosOcorrencia,
  alterarCategoriaOcorrencia,
  cancelarOcorrencia,
  criarAnexo,
  devolverOcorrenciaParaCentral,
  enviarMensagemOcorrencia,
  enviarOcorrenciaParaOperacao,
  enviarOcorrenciaParaRtv,
  finalizarOcorrencia,
  obterUsuarioLogado,
  salvarObsOcorrencia,
  useOcorrenciaCampo,
  useUsuarioLogado,
  useVisita,
} from '../store'
import { corDoNome, iniciais } from '../usuario'
import CampoOrtografico, { type CampoOrtograficoHandle } from '../components/CampoOrtografico'
import { preaquecerCorretorPortugues } from '../ortografia'
import { fmtDataHora } from '../format'
import {
  ehPerfilRtv,
  eventoVisivelParaRtv,
  mensagemVisivelParaRtv,
  ocorrenciaVisivelParaRtv,
  papelConversaOcorrencia,
  podeEditarObsOcorrencia,
  rotaInicial,
  type AnexoArquivo,
  type CampoObsOcorrencia,
  type EventoOcorrencia,
  type Mensagem,
  type ObservacaoOcorrencia,
  type OcorrenciaCampo,
  type Visita,
} from '../types'

type AbaDetalhe = 'historico' | 'anexos' | 'dados' | 'tecnicos' | 'comunicacao'
type PassoId = 'consultor' | 'analista' | 'lider' | 'rtv'
type PassoStatus = 'feito' | 'atual' | 'pendente'

const PASSOS: { id: PassoId; label: string }[] = [
  { id: 'consultor', label: 'Consultor' },
  { id: 'analista', label: 'Analista' },
  { id: 'lider', label: 'Líder' },
  { id: 'rtv', label: 'RTV' },
]

export default function OcorrenciaDetalhe() {
  const { numero } = useParams<{ numero: string }>()
  const usuario = useUsuarioLogado()
  const visaoRtv = ehPerfilRtv(usuario.perfil)
  const ocorrencia = useOcorrenciaCampo(Number(numero))
  const visita = useVisita(ocorrencia?.visitaCod ?? -1)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const abaPadrao: AbaDetalhe = visaoRtv ? 'comunicacao' : 'historico'
  const [aba, setAba] = useState<AbaDetalhe>(abaPadrao)
  const [abaDaOcorrencia, setAbaDaOcorrencia] = useState(ocorrencia?.id)
  if (ocorrencia && abaDaOcorrencia !== ocorrencia.id) {
    setAbaDaOcorrencia(ocorrencia.id)
    setAba(visaoRtv ? 'comunicacao' : 'historico')
  }

  useEffect(() => {
    preaquecerCorretorPortugues()
  }, [])

  const foraDaFila = Boolean(ocorrencia && visaoRtv && !ocorrenciaVisivelParaRtv(ocorrencia))

  if (!ocorrencia || foraDaFila) {
    return (
      <main className="page">
        <Breadcrumb trilha={[{ label: 'Ocorrências', to: '/ocorrencias' }, { label: 'Não encontrada' }]} />
        <div className="empty">
          {foraDaFila
            ? 'Esta ocorrência não está na sua fila.'
            : `Ocorrência ${numero} não encontrada.`}
        </div>
      </main>
    )
  }

  const categoria = categoriaOcorrenciaCampoPorTipo(ocorrencia.categoria)
  const cor = categoria ? CORES_CLASSIFICACAO_OCORRENCIA[categoria.classificacao] : '#5b6673'
  const meta = situacaoOcorrenciaCampoPorId(ocorrencia.status)
  const finalizada = ocorrencia.status === 'finalizada'
  const cancelada = ocorrencia.status === 'cancelada'
  const encerrada = finalizada || cancelada
  const podeEnviarRtv = categoria?.classificacao === 'Grave'
  const passos = statusDosPassos(ocorrencia)
  const eventosTodos = eventosDaOcorrencia(ocorrencia, visita?.consultor ?? 'Consultor')
  const eventos = visaoRtv ? eventosTodos.filter(eventoVisivelParaRtv) : eventosTodos
  const mensagens = visaoRtv
    ? ocorrencia.mensagens.filter(mensagemVisivelParaRtv)
    : ocorrencia.mensagens
  const passosVisiveis = visaoRtv ? PASSOS.filter((p) => p.id === 'analista' || p.id === 'rtv') : PASSOS
  const abas: [AbaDetalhe, string][] = visaoRtv
    ? [
        ['anexos', `Anexos (${ocorrencia.anexos?.length ?? 0})`],
        ['dados', 'Dados da Ocorrência'],
        ['tecnicos', 'Dados da Unidade'],
        ['comunicacao', `Comunicação (${mensagens.length})`],
      ]
    : [
        ['historico', 'Histórico'],
        ['anexos', `Anexos (${ocorrencia.anexos?.length ?? 0})`],
        ['dados', 'Dados da Ocorrência'],
        ['tecnicos', 'Detalhes Técnicos'],
        ['comunicacao', `Comunicação (${ocorrencia.mensagens.length})`],
      ]

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: 'Início', to: rotaInicial(usuario.perfil) },
          { label: 'Ocorrências', to: '/ocorrencias' },
          { label: `#${ocorrencia.numero}` },
        ]}
      />

      <header className="oc-head">
        <div className="oc-head__titulo">
          <span className="oc-head__icone" aria-hidden>
            <IconDocumento size={20} />
          </span>
          <div>
            <h1>Observação de Campo</h1>
            <p>Registro, revisão e acompanhamento das observações · #{ocorrencia.numero}</p>
          </div>
        </div>
        <div className="oc-head__acoes">
          <Link className="btn btn--ghost" to="/ocorrencias">
            ← Voltar
          </Link>
          <button
            className="btn btn--dark"
            type="button"
            onClick={() => exportarOcorrencia(ocorrencia, visita, visaoRtv)}
          >
            <IconDownload size={15} /> Exportar
          </button>
        </div>
      </header>

      <div className="oc-layout">
        <div className="oc-main">
          <div className="oc-ajuda">
            <IconInfo size={15} />
            <div>
              <strong>Como funciona</strong>
              <p>
                {visaoRtv
                  ? 'A Central encaminha o caso. Você conversa com o analista, registra o parecer do RTV e finaliza.'
                  : 'O consultor registra em campo → o analista revisa na Central → o líder acompanha a equipe → o RTV dá o parecer final.'}
              </p>
            </div>
          </div>

          <TrilhaObservacoes
            ocorrencia={ocorrencia}
            visita={visita}
            encerrada={encerrada}
            visaoRtv={visaoRtv}
            onAviso={setAviso}
          />

          {!encerrada && (
            <div className="acoes-visita">
              <div className="acoes-visita__estado">
                <span className="acoes-visita__ok">Etapa atual: {meta.label}</span>
                {!visaoRtv && !podeEnviarRtv && ocorrencia.status !== 'rtv-pendente' && (
                  <span className="cell-muted">Só ocorrências classificadas como Grave vão direto para o RTV.</span>
                )}
              </div>

              {!visaoRtv && ocorrencia.status === 'pendente-central' && (
                <button
                  className="btn btn--dark"
                  type="button"
                  onClick={() => {
                    enviarOcorrenciaParaOperacao(ocorrencia.id)
                    setAviso('Ocorrência enviada para a Operação.')
                  }}
                >
                  Mandar para Operação
                </button>
              )}

              {!visaoRtv && ocorrencia.status === 'operacao-pendente' && (
                <button
                  className="btn btn--dark"
                  type="button"
                  onClick={() => {
                    devolverOcorrenciaParaCentral(ocorrencia.id)
                    setAviso('Ocorrência devolvida para a Central.')
                  }}
                >
                  Devolver para Central
                </button>
              )}

              {!visaoRtv && podeEnviarRtv && ocorrencia.status !== 'rtv-pendente' && (
                <button
                  className="btn btn--dark"
                  type="button"
                  onClick={() => {
                    enviarOcorrenciaParaRtv(ocorrencia.id)
                    setAviso('Ocorrência enviada para o RTV.')
                  }}
                >
                  Enviar para RTV
                </button>
              )}

              {ocorrencia.status === 'rtv-pendente' && (
                <button
                  className="btn btn--certificar"
                  type="button"
                  onClick={() => {
                    finalizarOcorrencia(ocorrencia.id)
                    setAviso('Ocorrência finalizada.')
                  }}
                >
                  Finalizar
                </button>
              )}

              {!visaoRtv && (
                <button
                  className="btn btn--ghost"
                  type="button"
                  style={{ color: 'var(--err)' }}
                  onClick={() => setCancelando(true)}
                >
                  Cancelar
                </button>
              )}
            </div>
          )}

          <section className="oc-abas">
            <div className="tabs" role="tablist">
              {abas.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={`tabs__btn${aba === id ? ' is-active' : ''}`}
                  onClick={() => setAba(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {aba === 'historico' && !visaoRtv && <TabelaHistorico eventos={eventos} />}
            {aba === 'anexos' && (
              <AbaAnexos ocorrencia={ocorrencia} onAviso={setAviso} podeAdicionar={!visaoRtv} />
            )}
            {aba === 'dados' && (
              <AbaDados
                ocorrencia={ocorrencia}
                categoriaCor={cor}
                categoriaLabel={categoria?.classificacao}
                somenteLeitura={visaoRtv}
              />
            )}
            {aba === 'tecnicos' && (
              <AbaTecnicos ocorrencia={ocorrencia} visita={visita} visaoRtv={visaoRtv} />
            )}
            {aba === 'comunicacao' && (
              <>
                <ListaMensagensOcorrencia mensagens={mensagens} />
                {!encerrada && <ComposerOcorrencia ocorrenciaId={ocorrencia.id} />}
              </>
            )}
          </section>
        </div>

        <aside className="oc-side">
          <section className="oc-card">
            <h2>Status da Ocorrência</h2>
            <ol className="oc-stepper">
              {passosVisiveis.map((p, i) => (
                <li key={p.id} className={`oc-stepper__item is-${passos[p.id]}`}>
                  <span className="oc-stepper__marca" aria-hidden>
                    {passos[p.id] === 'feito' ? '✓' : i + 1}
                  </span>
                  <span className="oc-stepper__label">{p.label}</span>
                </li>
              ))}
            </ol>
            <Badge cor={meta.color} texto={meta.label} />
          </section>

          <section className="oc-card">
            <h2>Informações da Ocorrência</h2>
            <ul className="oc-info">
              <li>
                <IconLista size={14} />
                <span>
                  <small>ID da Ocorrência</small>
                  <strong>OC-{ocorrencia.numero}</strong>
                </span>
              </li>
              <li>
                <IconArmazem size={14} />
                <span>
                  <small>Unidade</small>
                  <strong>{visita?.pdr.nome ?? '—'}</strong>
                </span>
              </li>
              <li>
                <IconCalendario size={14} />
                <span>
                  <small>Data da Ocorrência</small>
                  <strong>{fmtDataHora(ocorrencia.dataHora)}</strong>
                </span>
              </li>
              <li>
                <IconAlertaCategoria />
                <span>
                  <small>Categoria</small>
                  <strong>{ocorrencia.categoria}</strong>
                </span>
              </li>
              {!visaoRtv && (
                <li>
                  <IconPessoa size={14} />
                  <span>
                    <small>Registrado por</small>
                    <strong>{visita?.consultor ?? '—'}</strong>
                  </span>
                </li>
              )}
            </ul>
          </section>

          <section className="oc-card">
            <h2>Atividade Recente</h2>
            {eventos.length === 0 ? (
              <p className="cell-muted">Nenhuma atividade ainda.</p>
            ) : (
              <ul className="oc-feed">
                {[...eventos].reverse().slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <span className="oc-feed__dot" />
                    <div>
                      <strong>{e.acao ?? e.descricao}</strong>
                      <span>
                        {e.por} · {fmtDataHora(e.ts)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}

      {cancelando && (
        <ModalCancelarOcorrencia
          onClose={() => setCancelando(false)}
          onConfirmar={(motivo) => {
            cancelarOcorrencia(ocorrencia.id, motivo)
            setCancelando(false)
            setAviso('Ocorrência cancelada.')
          }}
        />
      )}
    </main>
  )
}

function IconAlertaCategoria() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.3 3.9L2.6 17.2A2 2 0 004.3 20h15.4a2 2 0 001.7-2.8L13.7 3.9a2 2 0 00-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

function statusDosPassos(o: OcorrenciaCampo): Record<PassoId, PassoStatus> {
  if (o.status === 'finalizada') {
    return { consultor: 'feito', analista: 'feito', lider: 'feito', rtv: 'feito' }
  }
  if (o.status === 'cancelada') {
    return {
      consultor: 'feito',
      analista: o.obsAnalista ? 'feito' : 'atual',
      lider: o.obsLider ? 'feito' : 'pendente',
      rtv: o.obsRtv ? 'feito' : 'pendente',
    }
  }
  if (o.status === 'rtv-pendente') {
    return {
      consultor: 'feito',
      analista: 'feito',
      lider: o.obsLider ? 'feito' : 'pendente',
      rtv: 'atual',
    }
  }
  if (o.status === 'operacao-pendente') {
    return { consultor: 'feito', analista: 'feito', lider: 'atual', rtv: 'pendente' }
  }
  return { consultor: 'feito', analista: 'atual', lider: 'pendente', rtv: 'pendente' }
}

function eventosDaOcorrencia(o: OcorrenciaCampo, consultor: string): EventoOcorrencia[] {
  if (o.historico?.length) return o.historico
  const lista: EventoOcorrencia[] = [
    {
      id: `sint-1-${o.id}`,
      ts: o.dataHora,
      por: consultor,
      papel: 'Consultor',
      etapa: 'Consultor',
      acao: 'Registrou observação',
      descricao: 'Observação original enviada pelo tablet em campo.',
    },
  ]
  if (o.obsAnalista) {
    lista.push({
      id: `sint-2-${o.id}`,
      ts: o.obsAnalista.ts,
      por: o.obsAnalista.por,
      papel: 'Analista',
      etapa: 'Analista',
      acao: 'Salvou revisão',
      descricao: 'Revisão da Central registrada.',
    })
  }
  if (o.obsLider) {
    lista.push({
      id: `sint-3-${o.id}`,
      ts: o.obsLider.ts,
      por: o.obsLider.por,
      papel: 'Líder',
      etapa: 'Líder',
      acao: 'Salvou observação',
      descricao: 'Acompanhamento do líder registrado.',
    })
  }
  if (o.obsRtv) {
    lista.push({
      id: `sint-4-${o.id}`,
      ts: o.obsRtv.ts,
      por: o.obsRtv.por,
      papel: 'RTV',
      etapa: 'RTV',
      acao: 'Salvou parecer',
      descricao: 'Parecer do RTV registrado.',
    })
  }
  return lista
}

function exportarOcorrencia(o: OcorrenciaCampo, visita: Visita | undefined, visaoRtv = false) {
  const cel = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const linhas = visaoRtv
    ? [
        ['Campo', 'Valor'],
        ['COD', o.numero],
        ['Status', situacaoOcorrenciaCampoPorId(o.status).label],
        ['Categoria', o.categoria],
        ['Unidade', visita?.pdr.nome ?? ''],
        ['Romaneio', o.romaneio ?? ''],
        ['Data', fmtDataHora(o.dataHora)],
        ['Revisão do analista', o.obsAnalista?.texto ?? ''],
        ['Parecer do RTV', o.obsRtv?.texto ?? ''],
      ]
    : [
        ['Campo', 'Valor'],
        ['COD', o.numero],
        ['Status', situacaoOcorrenciaCampoPorId(o.status).label],
        ['Categoria', o.categoria],
        ['Visita', o.visitaCod],
        ['Unidade', visita?.pdr.nome ?? ''],
        ['Romaneio', o.romaneio ?? ''],
        ['Data', fmtDataHora(o.dataHora)],
        ['Consultor', visita?.consultor ?? ''],
        ['Observação do consultor', o.obsOcorrencia],
        ['Revisão do analista', o.obsAnalista?.texto ?? ''],
        ['Observação do líder', o.obsLider?.texto ?? ''],
        ['Parecer do RTV', o.obsRtv?.texto ?? ''],
      ]
  const texto = `\uFEFF${linhas.map((l) => l.map(cel).join(';')).join('\n')}`
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ocorrencia-${o.numero}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ================================================================= *
 * Timeline das quatro etapas
 * ================================================================= */
function TrilhaObservacoes({
  ocorrencia,
  visita,
  encerrada,
  visaoRtv,
  onAviso,
}: {
  ocorrencia: OcorrenciaCampo
  visita: Visita | undefined
  encerrada: boolean
  visaoRtv: boolean
  onAviso: (msg: string) => void
}) {
  const usuario = useUsuarioLogado()
  const trava = (campo: CampoObsOcorrencia) => encerrada || !podeEditarObsOcorrencia(usuario.perfil, campo)

  return (
    <div className="oc-trilha">
      <EtapaCard
        cor="#1d4ed8"
        icone={<IconPessoa size={16} />}
        titulo="Observação do Consultor"
        badge={{ texto: visaoRtv ? 'Restrito' : 'Registrado', cor: '#5b6673' }}
        meta={visaoRtv ? 'Não visível nesta conta' : `Registrado em ${fmtDataHora(ocorrencia.dataHora)}`}
        valor={visaoRtv ? undefined : { texto: ocorrencia.obsOcorrencia, por: visita?.consultor ?? '', ts: ocorrencia.dataHora }}
        somenteLeitura
        fechado={visaoRtv}
        hint={
          visaoRtv
            ? 'A observação do consultor não aparece para o RTV.'
            : 'Texto original, enviado pelo tablet em campo — não pode ser editado aqui.'
        }
      />

      <EtapaCard
        cor="#1d4ed8"
        icone={<IconPrancheta size={16} />}
        titulo="Revisão do Analista"
        badge={
          ocorrencia.obsAnalista
            ? { texto: 'Revisado', cor: '#1d4ed8' }
            : { texto: 'Em revisão', cor: '#1d4ed8' }
        }
        meta={
          ocorrencia.obsAnalista
            ? `Última edição em ${fmtDataHora(ocorrencia.obsAnalista.ts)}`
            : 'Aguardando revisão'
        }
        valor={ocorrencia.obsAnalista}
        placeholder="Como a ocorrência foi analisada e padronizada pela Central…"
        botaoSalvar="Salvar revisão"
        somenteLeitura={trava('obsAnalista')}
        hint={
          encerrada
            ? undefined
            : trava('obsAnalista')
              ? 'Somente o analista da Central ou um Admin pode editar esta revisão.'
              : undefined
        }
        onSalvar={(texto) => {
          salvarObsOcorrencia(ocorrencia.id, 'obsAnalista', texto, usuario.nome)
          onAviso('Revisão do analista salva.')
        }}
      />

      <EtapaCard
        cor="#6d28d9"
        icone={<IconUsuarios size={16} />}
        titulo="Observação do Líder"
        badge={{ texto: visaoRtv ? 'Restrito' : ocorrencia.obsLider ? 'Registrado' : 'Pendente', cor: '#6d28d9' }}
        meta={
          visaoRtv
            ? 'Não visível nesta conta'
            : ocorrencia.obsLider
              ? `Última edição em ${fmtDataHora(ocorrencia.obsLider.ts)}`
              : 'Aguardando acompanhamento'
        }
        valor={visaoRtv ? undefined : ocorrencia.obsLider}
        placeholder="Acompanhamento e orientações passadas à equipe em campo…"
        botaoSalvar="Salvar observação"
        somenteLeitura={trava('obsLider')}
        fechado={visaoRtv}
        hint={
          visaoRtv
            ? 'A observação do líder não aparece para o RTV.'
            : encerrada
              ? undefined
              : trava('obsLider')
                ? 'Somente o líder ou um Admin pode editar esta observação.'
                : undefined
        }
        onSalvar={(texto) => {
          salvarObsOcorrencia(ocorrencia.id, 'obsLider', texto, usuario.nome)
          onAviso('Observação do líder salva.')
        }}
      />

      <EtapaCard
        cor="#0e8f6c"
        icone={<IconEscudo size={16} />}
        titulo="Parecer do RTV"
        badge={
          ocorrencia.obsRtv
            ? { texto: 'Registrado', cor: '#0e8f6c' }
            : { texto: 'Pendente', cor: '#0e8f6c' }
        }
        meta={
          ocorrencia.obsRtv
            ? `Última edição em ${fmtDataHora(ocorrencia.obsRtv.ts)}`
            : 'Aguardando parecer'
        }
        valor={ocorrencia.obsRtv}
        placeholder="Parecer do RTV sobre esta ocorrência…"
        botaoSalvar="Salvar parecer"
        ultima
        somenteLeitura={trava('obsRtv')}
        hint={
          encerrada
            ? undefined
            : trava('obsRtv')
              ? 'Somente o RTV ou um Admin pode editar este parecer.'
              : undefined
        }
        onSalvar={(texto) => {
          salvarObsOcorrencia(ocorrencia.id, 'obsRtv', texto, usuario.nome)
          onAviso('Parecer do RTV salvo.')
        }}
      />
    </div>
  )
}

function EtapaCard({
  cor,
  icone,
  titulo,
  badge,
  meta,
  valor,
  placeholder,
  hint,
  botaoSalvar,
  somenteLeitura,
  fechado,
  ultima,
  onSalvar,
}: {
  cor: string
  icone: ReactNode
  titulo: string
  badge: { texto: string; cor: string }
  meta: string
  valor?: ObservacaoOcorrencia
  placeholder?: string
  hint?: string
  botaoSalvar?: string
  somenteLeitura?: boolean
  fechado?: boolean
  ultima?: boolean
  onSalvar?: (texto: string) => void
}) {
  const campoRef = useRef<CampoOrtograficoHandle>(null)
  const [rascunho, setRascunho] = useState(valor?.texto ?? '')
  const [salvo, setSalvo] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [msgOrto, setMsgOrto] = useState<string | null>(null)

  const [ultimoValor, setUltimoValor] = useState(valor?.texto)
  if (valor?.texto !== ultimoValor) {
    setUltimoValor(valor?.texto)
    setRascunho(valor?.texto ?? '')
  }

  const alterado = !somenteLeitura && rascunho.trim() !== (valor?.texto ?? '')

  function salvar() {
    onSalvar?.(rascunho.trim())
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  async function verificarOrtografia() {
    setVerificando(true)
    setMsgOrto(null)
    try {
      const n = (await campoRef.current?.verificar()) ?? 0
      setMsgOrto(
        n === 0
          ? 'Nenhuma palavra desconhecida.'
          : `${n} palavra(s) não reconhecida(s) — clique com o botão direito para corrigir.`,
      )
    } catch {
      setMsgOrto('Não foi possível carregar o dicionário.')
    } finally {
      setVerificando(false)
    }
  }

  return (
    <article className={`oc-etapa${fechado ? ' oc-etapa--fechada' : ''}`} style={{ ['--c' as string]: cor }}>
      <div className="oc-etapa__eixo">
        <span className="oc-etapa__bolha">{icone}</span>
        {!ultima && <span className="oc-etapa__linha" />}
      </div>

      <div className="oc-etapa__card">
        <header className="oc-etapa__topo">
          <div className="oc-etapa__titulos">
            <h3>{titulo}</h3>
            <Badge cor={badge.cor} texto={badge.texto} />
          </div>
          <span className="cell-muted">{meta}</span>
        </header>

        {fechado ? (
          <div className="oc-etapa__fechado">
            <IconCadeado size={14} />
            <span>{hint ?? 'Conteúdo indisponível nesta conta.'}</span>
          </div>
        ) : (
          <>
            <CampoOrtografico
              ref={campoRef}
              value={rascunho}
              onChange={setRascunho}
              placeholder={placeholder}
              readOnly={somenteLeitura}
              minHeight={96}
            />
            {hint && (
              <span className="field__hint">
                {somenteLeitura && onSalvar && <IconCadeado size={12} />} {hint}
              </span>
            )}
            {valor?.por && (!somenteLeitura || onSalvar) && (
              <span className="field__hint">
                por <strong>{valor.por}</strong> em {fmtDataHora(valor.ts)}
              </span>
            )}

            {!somenteLeitura && onSalvar && (
              <div className="oc-etapa__acoes">
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => void verificarOrtografia()} disabled={verificando || !rascunho.trim()}>
                  {verificando ? 'Verificando…' : 'Verificar ortografia'}
                </button>
                {msgOrto && <span className="cell-muted">{msgOrto}</span>}
                <span className="oc-etapa__acoes-fim">
                  {salvo && <span className="cell-muted">Salvo ✓</span>}
                  <button
                    className="btn btn--sm oc-etapa__salvar"
                    type="button"
                    disabled={!alterado}
                    onClick={salvar}
                  >
                    {botaoSalvar ?? 'Salvar'}
                  </button>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  )
}

/* ================================================================= *
 * Abas inferiores
 * ================================================================= */
function TabelaHistorico({ eventos }: { eventos: EventoOcorrencia[] }) {
  if (eventos.length === 0) {
    return <div className="empty">Nenhum evento registrado ainda.</div>
  }

  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Usuário</th>
              <th>Etapa</th>
              <th>Ação</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.id}>
                <td className="mono">{fmtDataHora(e.ts)}</td>
                <td>
                  <strong>{e.por}</strong>
                  {e.papel && <div className="cell-muted">{e.papel}</div>}
                </td>
                <td>{e.etapa ?? '—'}</td>
                <td>{e.acao ?? '—'}</td>
                <td>{e.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function AbaAnexos({
  ocorrencia,
  onAviso,
  podeAdicionar = true,
}: {
  ocorrencia: OcorrenciaCampo
  onAviso: (msg: string) => void
  podeAdicionar?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const anexos = ocorrencia.anexos ?? []

  function aoEscolher(files: FileList | null) {
    if (!files?.length) return
    const novos: AnexoArquivo[] = [...files].map((f) => criarAnexo(f))
    adicionarAnexosOcorrencia(ocorrencia.id, novos)
    onAviso(novos.length === 1 ? 'Anexo adicionado.' : `${novos.length} anexos adicionados.`)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      {podeAdicionar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => inputRef.current?.click()}>
            <IconMais size={14} /> Adicionar anexo
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => aoEscolher(e.target.files)}
          />
        </div>
      )}

      {anexos.length === 0 ? (
        <div className="empty">Nenhum anexo nesta ocorrência.</div>
      ) : (
        <ul className="oc-anexos">
          {anexos.map((a) => (
            <li key={a.id}>
              <IconAnexo size={16} />
              <div>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    {a.nome}
                  </a>
                ) : (
                  <strong>{a.nome}</strong>
                )}
                <span className="cell-muted">{fmtBytes(a.tamanho)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AbaDados({
  ocorrencia,
  categoriaCor,
  categoriaLabel,
  somenteLeitura = false,
}: {
  ocorrencia: OcorrenciaCampo
  categoriaCor: string
  categoriaLabel?: string
  somenteLeitura?: boolean
}) {
  const meta = situacaoOcorrenciaCampoPorId(ocorrencia.status)
  return (
    <div className="kv-grid">
      <KV label="COD da ocorrência">#{ocorrencia.numero}</KV>
      <KV label="Categoria">
        {somenteLeitura ? (
          ocorrencia.categoria
        ) : (
          <select
            className="field-select"
            value={ocorrencia.categoria}
            onChange={(e) => alterarCategoriaOcorrencia(ocorrencia.id, e.target.value)}
          >
            {CATEGORIAS_OCORRENCIA_CAMPO.map((c) => (
              <option key={c.tipo} value={c.tipo}>
                {c.tipo}
              </option>
            ))}
          </select>
        )}
      </KV>
      <KV label="Classificação de gravidade">
        <Badge cor={categoriaCor} texto={categoriaLabel ?? '—'} />
        {!somenteLeitura && (
          <div className="field__hint" style={{ marginTop: 4 }}>
            Definida automaticamente pela categoria escolhida ao lado.
          </div>
        )}
      </KV>
      <KV label="Data/hora">{fmtDataHora(ocorrencia.dataHora)}</KV>
      <KV label="Status">
        <Badge cor={meta.color} texto={meta.label} />
      </KV>
      <KV label="Visita relacionada">
        {somenteLeitura ? (
          ocorrencia.visitaCod
        ) : (
          <Link className="link-cod" to={`/visita/${ocorrencia.visitaCod}`} target="_blank" rel="noopener noreferrer">
            {ocorrencia.visitaCod} ↗
          </Link>
        )}
      </KV>
      <KV label="Romaneio">{ocorrencia.romaneio ?? '—'}</KV>
      {ocorrencia.motivo && <KV label="Motivo">{ocorrencia.motivo}</KV>}
    </div>
  )
}

function AbaTecnicos({
  ocorrencia,
  visita,
  visaoRtv = false,
}: {
  ocorrencia: OcorrenciaCampo
  visita: Visita | undefined
  visaoRtv?: boolean
}) {
  if (!visita) {
    return <div className="empty">Visita {ocorrencia.visitaCod} não encontrada.</div>
  }
  return (
    <>
      <div className="kv-grid">
        <KV label="PDR">{visita.pdr.nome}</KV>
        <KV label="CNPJ">{visita.pdr.cnpj}</KV>
        <KV label="Cidade/UF">{`${visita.pdr.cidade}/${visita.pdr.uf}`}</KV>
        {!visaoRtv && <KV label="Consultor">{visita.consultor}</KV>}
        {!visaoRtv && <KV label="Líder">{visita.lider}</KV>}
        {!visaoRtv && <KV label="Líder Focal">{visita.liderFocal}</KV>}
        {!visaoRtv && <KV label="Supervisor">{visita.supervisor}</KV>}
        <KV label="RTV">{ocorrencia.rtv ?? '—'}</KV>
        {!visaoRtv && <KV label="Passagem pela Central">{ocorrencia.rodada}ª</KV>}
        <KV label="Atualizado em">{fmtDataHora(ocorrencia.atualizadoEm)}</KV>
      </div>
      {!visaoRtv && (
        <Link
          className="btn btn--ghost btn--sm"
          style={{ marginTop: 14, width: 'fit-content' }}
          to={`/visita/${ocorrencia.visitaCod}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir visita {ocorrencia.visitaCod} →
        </Link>
      )}
    </>
  )
}

/* ================================================================= *
 * Chat da ocorrência
 * ================================================================= */
function ListaMensagensOcorrencia({ mensagens }: { mensagens: Mensagem[] }) {
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' })
  }, [mensagens.length])

  return (
    <div className="conversa">
      {mensagens.length === 0 && (
        <div className="conversa__vazio">Nenhuma mensagem ainda. Use o campo abaixo para começar a conversa.</div>
      )}
      {mensagens.map((m) => (
        <article className={`msg${m.autor === obterUsuarioLogado().nome ? ' msg--propria' : ''}`} key={m.id}>
          <div className="msg__avatar" style={{ background: corDoNome(m.autor) }}>
            {iniciais(m.autor)}
          </div>
          <div className="msg__balao">
            <div className="msg__topo">
              <span className="msg__autor">{m.autor}</span>
              <span className="msg__papel">{m.papel}</span>
              <span className="msg__hora">{fmtDataHora(m.ts)}</span>
            </div>
            <div className="msg__texto">{m.texto}</div>
          </div>
        </article>
      ))}
      <div ref={fim} />
    </div>
  )
}

function ComposerOcorrencia({ ocorrenciaId }: { ocorrenciaId: string }) {
  const usuario = useUsuarioLogado()
  const [texto, setTexto] = useState('')

  function enviar() {
    const limpo = texto.trim()
    if (!limpo) return
    enviarMensagemOcorrencia(ocorrenciaId, usuario.nome, papelConversaOcorrencia(usuario.perfil), limpo)
    setTexto('')
  }

  return (
    <div className="compositor">
      <div className="compositor__avatar" style={{ background: corDoNome(usuario.nome) }}>
        {iniciais(usuario.nome)}
      </div>
      <div className="compositor__corpo">
        <CampoOrtografico
          value={texto}
          onChange={setTexto}
          placeholder="Escreva uma mensagem sobre esta ocorrência…  (Ctrl+Enter envia)"
          minHeight={74}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar()
          }}
        />
        <div className="compositor__rodape">
          <span style={{ flex: 1 }} />
          <button className="btn btn--primary btn--sm" type="button" onClick={enviar} disabled={!texto.trim()}>
            Enviar mensagem
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalCancelarOcorrencia({
  onClose,
  onConfirmar,
}: {
  onClose: () => void
  onConfirmar: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')

  return (
    <Modal
      titulo="Cancelar ocorrência"
      subtitulo="Informe o motivo do cancelamento — ele fica registrado no histórico da ocorrência."
      onClose={onClose}
      rodape={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Voltar
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={!motivo.trim()}
            onClick={() => onConfirmar(motivo.trim())}
          >
            Confirmar cancelamento
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="motivo-cancelamento">Motivo</label>
        <input
          id="motivo-cancelamento"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: denúncia não confirmada após apuração"
          autoFocus
        />
      </div>
    </Modal>
  )
}
