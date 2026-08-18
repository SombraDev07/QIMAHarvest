import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { Link, useParams } from 'react-router-dom'
import {
  CORES_CLASSIFICACAO,
  CORES_ORIGEM,
  situacaoPorId,
} from '../data/mock'
import {
  definirInformouDiaAnterior,
  diaAnteriorDe,
  historicoAcumuladoUnidade,
  percentualDesconto,
  salvarAcumulado,
  salvarDadosVisita,
  salvarDiaAnterior,
  useObservacaoPdr,
  useParametros,
  useUsuarioLogado,
  usePodeEditarVisita,
  useVisita,
  useVisitas,
} from '../store'
import {
  CLASSIFICACOES,
  ORIGENS_ACUMULADO,
  type AbaVisita,
  type AcumuladoPeriodo,
  type Carga,
  type Classificacao,
  type OrigemAcumulado,
  type Visita,
} from '../types'
import {
  analisarVisita,
  aplicarLiberacoes,
  problemasPorCarga,
  resumoAnalise,
  type Alerta,
} from '../analise'
import { IconAlerta } from '../components/icons'
import {
  Breadcrumb,
  KV,
  Modal,
  Panel,
  Question,
  SimNaoInput,
  SituacaoBadge,
  Toast,
} from '../components/ui'
import { IconCadeado, IconInfo } from '../components/icons'
import TabelaCargas from '../components/TabelaCargas'
import TabelaDivergencias from '../components/TabelaDivergencias'
import AbaComunicacao from '../components/AbaComunicacao'
import ChatFlutuante from '../components/ChatFlutuante'
import { fmtDataHora, fmtKg, fmtNum, fmtPct, fmtTon, numeroDigitado, dataComparavel } from '../format'

type AbaId = AbaVisita

/** "dd/mm/aaaa" → Date local, sem passar por Date.parse (que lê como UTC) */
function dataParaDate(data: string): Date {
  const [d, m, a] = data.split('/').map(Number)
  return new Date(a, m - 1, d)
}

export default function VisitaDetalhe() {
  const { cod } = useParams<{ cod: string }>()
  const visita = useVisita(Number(cod))
  // analisarVisita lê os parâmetros por obterParametros(), que não é reativo —
  // assinar aqui é o que faz a análise reagir a uma mudança em Administração
  const parametros = useParametros()
  const usuarioLogado = useUsuarioLogado()
  const t = useT()
  const podeEditar = usePodeEditarVisita()
  const [aba, setAba] = useState<AbaId>('visita')
  const [aviso, setAviso] = useState<string | null>(null)
  /** carga que o analista pediu para inspecionar a partir da análise */
  const [foco, setFoco] = useState<string | null>(null)

  // trocar de visita reseta aba e foco. Ajustar durante o render (e não num
  // efeito) evita o flash da visita nova exibida com o estado da anterior
  const [codAnterior, setCodAnterior] = useState(cod)
  if (cod !== codAnterior) {
    setCodAnterior(cod)
    setAba('visita')
    setFoco(null)
  }

  // a análise percorre o catálogo inteiro e devolve estruturas novas (o Map de
  // problemas é prop das tabelas); sem memo ela refaz tudo e invalida os memos
  // das filhas a cada tecla digitada em qualquer modal
  const analise = useMemo(() => {
    if (!visita) return null
    const alertas = analisarVisita(visita)
    // erros já liberados com justificativa não voltam a bloquear
    const { ativos } = aplicarLiberacoes(alertas, visita.errosLiberados)
    return { alertas, resumo: resumoAnalise(ativos), problemas: problemasPorCarga(ativos) }
    // parametros não aparece no corpo, mas analisarVisita o lê por obterParametros();
    // sem ele na lista, mexer em Administração não recalcularia a análise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visita, parametros])

  if (!visita || !analise) {
    return (
      <main className="page">
        <Breadcrumb trilha={[{ label: 'Visitas', to: '/visitas' }, { label: 'Não encontrada' }]} />
        <div className="empty">Visita {cod} não encontrada.</div>
      </main>
    )
  }

  const meta = situacaoPorId(visita.situacao)
  const acompanhadas = visita.cargas.filter((c) => c.acompanhada)
  const naoAcompanhadas = visita.cargas.filter((c) => !c.acompanhada)

  const { alertas, resumo, problemas } = analise

  /** leva o analista direto ao ponto do problema */
  function irAoAlerta(a: Alerta) {
    setAba(a.aba)
    setFoco(a.cargaId ?? null)
    // quando o alerta aponta uma carga, quem rola é a própria linha destacada
    if (!a.cargaId) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const abas: { id: AbaId; num: string; label: string; count?: number }[] = [
    { id: 'analise', num: '!', label: 'Análise', count: resumo.total },
    { id: 'unidade', num: '1', label: 'Dados da Unidade' },
    { id: 'visita', num: '2', label: 'Dados da Visita' },
    { id: 'acumulado', num: '3', label: 'Histórico de Acumulado' },
    {
      id: 'dia-anterior',
      num: '3.1',
      label: 'Dia Anterior',
      count: visita.diaAnterior.length,
    },
    { id: 'cargas', num: '4', label: 'Acompanhamento de Cargas', count: acompanhadas.length },
    { id: 'divergencias', num: '4.1', label: 'Divergências', count: problemas.size },
    {
      id: 'nao-acompanhadas',
      num: '5',
      label: 'Cargas não Acompanhadas',
      count: naoAcompanhadas.length,
    },
    { id: 'ocorrencias', num: '6', label: 'Ocorrências', count: visita.ocorrencias.length },
    { id: 'resumo', num: '7', label: 'Comunicação', count: visita.mensagens.length },
  ]

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: t('Início'), to: '/visitas' },
          { label: t('Visitas'), to: '/visitas' },
          { label: t(meta.label), to: `/visitas/${visita.situacao}` },
          { label: String(visita.cod) },
        ]}
      />

      <header className="detail-head">
        <div className="detail-head__top">
          <div className="detail-head__chips">
            <SituacaoBadge id={visita.situacao} />
            <span className="chip chip--info">{visita.pdr.regiao}</span>
            <span className="chip">{visita.pdr.tipoUnidade}</span>
            {visita.primeiraVisita && <span className="chip">1ª visita</span>}
            {visita.pdrMista && <span className="chip">PDR mista</span>}
            {visita.cincoEstrelas && <span className="chip chip--warn">★ 5 estrelas</span>}
          </div>
          <div className="detail-head__right">
            <Link className="btn btn--ghost btn--sm" to={`/visitas/${visita.situacao}`}>
              Ver lista de {t(meta.label)} →
            </Link>
          </div>
        </div>

        <div className="detail-head__linha">
          <span>
            <strong>{visita.data}</strong> · envio {visita.envioTablet}
          </span>
          <span className="detail-head__sep">·</span>
          <span>
            {visita.tipoVisita} · {visita.modalidade} · {visita.horaInicio}–{visita.horaFim}
          </span>
          <span className="detail-head__sep">·</span>
          <span>
            Consultor <strong>{visita.consultor}</strong>
          </span>
          <span className="detail-head__sep">·</span>
          <span>
            Caixa de fita <strong>{visita.dadosVisita.caixaFitaTeste || '—'}</strong>
          </span>
        </div>

        {visita.motivo && (
          <div className="detail-head__motivo">
            <IconInfo size={13} />
            <span>
              <strong>Motivo:</strong> {visita.motivo}
            </span>
          </div>
        )}

        {!podeEditar && (
        <div className="alert alert--lock" style={{ marginTop: 14 }}>
          <IconCadeado />
          <span>
            Seu perfil (<strong>{usuarioLogado.perfil}</strong>) abre a visita em leitura. Alterar
            cargas, acumulado e dados da visita é permitido a Admin, Strategic Leader, Operational
            Leader e Information Analyst — o chat segue liberado.
          </span>
        </div>
      )}

      {resumo.total > 0 && (
          <button
            type="button"
            className={`detail-head__analise${resumo.erros ? ' detail-head__analise--erro' : ' detail-head__analise--atencao'}`}
            onClick={() => {
              setAba('analise')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <IconAlerta size={14} />
            <span>
              <strong>
                {resumo.erros > 0
                  ? `${resumo.erros} erro${resumo.erros > 1 ? 's' : ''}`
                  : `${resumo.atencoes} ponto${resumo.atencoes > 1 ? 's' : ''} de atenção`}
              </strong>{' '}
              nesta visita
              {resumo.erros > 0 && resumo.atencoes > 0 && ` · ${resumo.atencoes} de atenção`}
            </span>
            <span className="detail-head__analise-ir">Ver análise completa →</span>
          </button>
        )}
      </header>

      <nav className="tabs">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            ref={(el) => {
              if (aba === a.id) el?.scrollIntoView({ block: 'nearest', inline: 'center' })
            }}
            className={`tabs__btn${aba === a.id ? ' is-active' : ''}`}
            onClick={() => setAba(a.id)}
          >
            <span className="tabs__num">{a.num}</span>
            <span className="tabs__label">{t(a.label)}</span>
            {a.count !== undefined && <span className="tabs__count">{a.count}</span>}
          </button>
        ))}
      </nav>

      {aba === 'analise' && (
        <AbaAnalise visita={visita} alertas={alertas} onIr={irAoAlerta} />
      )}
      {aba === 'unidade' && <AbaUnidade visita={visita} />}
      {aba === 'visita' && (
        <AbaDadosVisita visita={visita} onAviso={setAviso} podeEditar={podeEditar} />
      )}
      {aba === 'acumulado' && (
        <AbaAcumulado visita={visita} onAviso={setAviso} podeEditar={podeEditar} />
      )}
      {aba === 'dia-anterior' && (
        <AbaDiaAnterior visita={visita} onAviso={setAviso} podeEditar={podeEditar} />
      )}
      {aba === 'cargas' && (
        <TabelaCargas
          visita={visita}
          acompanhada
          numero="4."
          titulo="Acompanhamento de cargas"
          onAviso={setAviso}
          foco={foco}
          onFocoConsumido={() => setFoco(null)}
          problemas={problemas}
        />
      )}
      {aba === 'divergencias' && (
        <TabelaDivergencias
          visita={visita}
          problemas={problemas}
          onAviso={setAviso}
          foco={foco}
          onFocoConsumido={() => setFoco(null)}
        />
      )}
      {aba === 'nao-acompanhadas' && (
        <TabelaCargas
          visita={visita}
          acompanhada={false}
          numero="5."
          titulo="Cargas não acompanhadas pelo consultor"
          onAviso={setAviso}
          foco={foco}
          onFocoConsumido={() => setFoco(null)}
          problemas={problemas}
        />
      )}
      {aba === 'ocorrencias' && <AbaOcorrencias visita={visita} />}
      {aba === 'resumo' && (
        <AbaComunicacao
          visita={visita}
          alertas={alertas}
          onAviso={setAviso}
          onIrParaAnalise={() => {
            setAba('analise')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )}

      <NavegacaoAbas abas={abas} atual={aba} onIr={setAba} />

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}

      <ChatFlutuante
        visita={visita}
        onAbrirComunicacao={() => {
          setAba('resumo')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </main>
  )
}

/* ================================================================= *
 * Análise — regras quebradas na visita
 * ================================================================= */
function AbaAnalise({
  visita,
  alertas,
  onIr,
}: {
  visita: Visita
  alertas: Alerta[]
  onIr: (a: Alerta) => void
}) {
  const { ativos, perdoados } = aplicarLiberacoes(alertas, visita.errosLiberados)
  const resumo = resumoAnalise(ativos)
  const erros = ativos.filter((a) => a.severidade === 'erro')
  const atencoes = ativos.filter((a) => a.severidade === 'atencao')
  const [verAtencoes, setVerAtencoes] = useState(false)

  const validacao = visita.ultimaValidacao && (
    <div className="alert alert--info" style={{ margin: '0 18px 16px' }}>
      <IconInfo />
      <span>
        Última validação por <strong>{visita.ultimaValidacao.por}</strong> em{' '}
        {fmtDataHora(visita.ultimaValidacao.ts)} — {visita.ultimaValidacao.erros} erro(s) e{' '}
        {visita.ultimaValidacao.atencoes} ponto(s) de atenção no momento da checagem.
      </span>
    </div>
  )

  const liberados = perdoados.length > 0 && (
    <div className="panel__body" style={{ paddingTop: 0 }}>
      <div className="bloco__head">
        <span className="bloco__titulo">Erros liberados ({perdoados.length})</span>
        <span className="bloco__sub">Passaram na certificação mediante justificativa</span>
      </div>
      <div className="liberados">
        {perdoados.map(({ alerta, liberacao }) => (
          <div className="liberado" key={alerta.id}>
            <div className="liberado__topo">
              <span className="liberado__selo">LIBERADO</span>
              <span className="liberado__regra">{alerta.regra}</span>
              {alerta.cargaId && (
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={() => onIr(alerta)}
                >
                  Ver carga
                </button>
              )}
            </div>
            <div className="liberado__detalhe">{alerta.detalhe}</div>
            <div className="liberado__just">
              “{liberacao.justificativa}” — {liberacao.por}, {fmtDataHora(liberacao.ts)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (ativos.length === 0) {
    return (
      <Panel numero="!" titulo="Análise da visita">
        {validacao}
        <div className="empty">
          <div style={{ color: 'var(--green)', fontSize: 30, marginBottom: 8 }}>✓</div>
          Nenhuma inconsistência pendente. Todas as regras de consistência passaram.
        </div>
        {liberados}
      </Panel>
    )
  }

  return (
    <Panel
      numero="!"
      titulo="Análise da visita"
      hint="Clique em um cartão para ir direto ao ponto do problema"
    >
      {validacao}
      <div className="resumo-strip">
        <div className="resumo-item">
          <span className="resumo-item__label">Erros</span>
          <span className="resumo-item__valor" style={{ color: 'var(--brand-600)' }}>
            {resumo.erros}
          </span>
        </div>
        <div className="resumo-item">
          <span className="resumo-item__label">Pontos de atenção</span>
          <span className="resumo-item__valor" style={{ color: '#b4470f' }}>
            {resumo.atencoes}
          </span>
        </div>
        <div className="resumo-item">
          <span className="resumo-item__label">Total</span>
          <span className="resumo-item__valor">{resumo.total}</span>
        </div>
      </div>

      <div className="panel__body">
        {erros.length > 0 && (
          <>
            <div className="bloco__head">
              <span className="bloco__titulo">Erros ({erros.length})</span>
              <span className="bloco__sub">
                Bloqueiam a certificação — precisam ser corrigidos
              </span>
            </div>
            <div className="cartoes-alerta">
              {erros.map((a) => (
                <CartaoAlerta key={a.id} alerta={a} visita={visita} onIr={onIr} />
              ))}
            </div>
          </>
        )}

        {atencoes.length > 0 && (
          <div style={{ marginTop: erros.length ? 22 : 0 }}>
            <div className="bloco__head">
              <span className="bloco__titulo">Pontos de atenção ({atencoes.length})</span>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => setVerAtencoes((v) => !v)}
              >
                {verAtencoes ? 'Recolher' : 'Expandir'}
              </button>
            </div>
            {verAtencoes ? (
              <div className="cartoes-alerta">
                {atencoes.map((a) => (
                  <CartaoAlerta key={a.id} alerta={a} visita={visita} onIr={onIr} />
                ))}
              </div>
            ) : (
              <div className="alertas alertas--compacto">
                {atencoes.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="alerta alerta--atencao"
                    onClick={() => onIr(a)}
                  >
                    <span className="alerta__sev">ATENÇÃO</span>
                    <span className="alerta__corpo">
                      <span className="alerta__regra">
                        {veioDoImport(visita, a.id) && (
                          <span className="avisa-import">Avisa Import</span>
                        )}{' '}
                        {a.regra}
                      </span>
                    </span>
                    <span className={`chip chip--responsavel-${a.responsavel}`}>
                      {a.responsavel === 'operacao' ? 'Operação' : 'Analista'}
                    </span>
                    {a.valor && <span className="alerta__valor">{a.valor}</span>}
                    {a.cargaId && <span className="alerta__id mono">carga {a.cargaId}</span>}
                    <span className="alerta__ir">Ir ao ponto →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {liberados}
    </Panel>
  )
}

function veioDoImport(visita: Visita, alertaId: string) {
  return Boolean(visita.avisoImport?.alertaIds.includes(alertaId))
}

function CartaoAlerta({
  alerta,
  visita,
  onIr,
}: {
  alerta: Alerta
  visita: Visita
  onIr: (a: Alerta) => void
}) {
  const importado = veioDoImport(visita, alerta.id)
  return (
    <button
      type="button"
      className={`cartao-alerta cartao-alerta--${alerta.severidade}`}
      onClick={() => onIr(alerta)}
    >
      <span className="cartao-alerta__topo">
        <span className="cartao-alerta__sev">
          <IconAlerta size={14} />
          {alerta.severidade === 'erro' ? 'ERRO' : 'ATENÇÃO'}
        </span>
        {importado && <span className="avisa-import">Avisa Import</span>}
        <span className={`chip chip--responsavel-${alerta.responsavel}`}>
          {alerta.responsavel === 'operacao' ? 'Operação' : 'Analista'}
        </span>
        {alerta.valor && <span className="cartao-alerta__valor">{alerta.valor}</span>}
      </span>

      <span className="cartao-alerta__regra">
        {importado ? `(Avisa Import) ${alerta.regra}` : alerta.regra}
      </span>
      <span className="cartao-alerta__detalhe">{alerta.detalhe}</span>

      <span className="cartao-alerta__rodape">
        {alerta.cargaId ? (
          <span className="cartao-alerta__id mono">carga {alerta.cargaId}</span>
        ) : (
          <span />
        )}
        <span className="cartao-alerta__ir">Ir ao ponto →</span>
      </span>
    </button>
  )
}

/* ================================================================= *
 * Navegação sequencial entre as abas
 * ================================================================= */
function NavegacaoAbas({
  abas,
  atual,
  onIr,
}: {
  abas: { id: AbaId; num: string; label: string }[]
  atual: AbaId
  onIr: (id: AbaId) => void
}) {
  const i = abas.findIndex((a) => a.id === atual)
  const anterior = i > 0 ? abas[i - 1] : null
  const proxima = i < abas.length - 1 ? abas[i + 1] : null

  const ir = (id: AbaId) => {
    onIr(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav className="nav-abas">
      {anterior ? (
        <button className="nav-abas__btn" type="button" onClick={() => ir(anterior.id)}>
          <span className="nav-abas__dir">← Anterior</span>
          <span className="nav-abas__nome">
            {anterior.num}. {anterior.label}
          </span>
        </button>
      ) : (
        <span />
      )}

      {proxima ? (
        <button
          className="nav-abas__btn nav-abas__btn--fim"
          type="button"
          onClick={() => ir(proxima.id)}
        >
          <span className="nav-abas__dir">Próxima →</span>
          <span className="nav-abas__nome">
            {proxima.num}. {proxima.label}
          </span>
        </button>
      ) : (
        <span />
      )}
    </nav>
  )
}

/* ================================================================= *
 * 1. Dados da unidade
 * ================================================================= */
function AbaUnidade({ visita }: { visita: Visita }) {
  const p = visita.pdr
  const observacao = useObservacaoPdr(p.cnpj)
  return (
    <div className="stack">
      {observacao && (
        <div className="alert alert--pdr">
          <IconInfo />
          <span>
            <strong>Observação da unidade:</strong> {observacao}
          </span>
        </div>
      )}
      <Panel numero="1." titulo="Dados da unidade (PDR)" hint="Cadastro vigente na safra 2025/2026">
        <div className="panel__body">
          <div className="kv-grid">
            <KV label="Razão social">{p.nome}</KV>
            <KV label="CNPJ">{p.cnpj}</KV>
            <KV label="Tipo de unidade">{p.tipoUnidade}</KV>
            <KV label="Responsável">{p.responsavel}</KV>
            <KV label="Telefone">{p.telefone}</KV>
            <KV label="Endereço">{p.endereco}</KV>
            <KV label="Cidade / UF">
              {p.cidade}/{p.uf}
            </KV>
            <KV label="Região">{p.regiao}</KV>
            <KV label="Distrito">{p.distrito}</KV>
            <KV label="Capacidade estática">{fmtTon(p.capacidadeEstatica)}</KV>
          </div>
        </div>
      </Panel>

      <Panel numero="1.1" titulo="Recebimento mensal declarado" hint="Últimos 8 meses">
        <div className="panel__body">
          <BarrasMensais visita={visita} />
        </div>
      </Panel>
    </div>
  )
}

function BarrasMensais({ visita }: { visita: Visita }) {
  const max = Math.max(...visita.historico.map((h) => h.toneladas))
  return (
    <div className="bars">
      {visita.historico.map((h) => (
        <div className="bars__col" key={h.mes}>
          <span className="bars__val">{fmtNum(h.toneladas)}</span>
          <div className="bars__bar" style={{ height: `${(h.toneladas / max) * 100}%` }} />
          <span className="bars__label">{h.mes}</span>
        </div>
      ))}
    </div>
  )
}

/* ================================================================= *
 * 2. Dados da visita — questionário
 * ================================================================= */
function AbaDadosVisita({
  visita,
  onAviso,
  podeEditar,
}: {
  visita: Visita
  onAviso: (m: string) => void
  podeEditar: boolean
}) {
  const d = visita.dadosVisita
  const temCargas = visita.cargas.length > 0
  const temAcompanhadas = visita.cargas.some((c) => c.acompanhada)
  const soNaoAcompanhadas = temCargas && !temAcompanhadas
  const recebimentoTravado = temAcompanhadas || soNaoAcompanhadas
  const recebimentoValor: typeof d.recebimentoCargas = temAcompanhadas
    ? 'Sim'
    : soNaoAcompanhadas
      ? 'Não'
      : d.recebimentoCargas
  const set = (patch: Partial<typeof d>) => salvarDadosVisita(visita.cod, patch)

  return (
    <div className="stack">
      <Panel
        numero="2.0"
        titulo="Dados da visita"
        acoes={
          <button
            className="btn btn--primary btn--sm"
            type="button"
            onClick={() => onAviso('Dados da visita gravados.')}
            disabled={!podeEditar}
          >
            Gravar bloco 2
          </button>
        }
      >
        <div className="panel__body">
          <Question
            numero="2.1"
            texto="Visita foi iniciada?"
            hint={
              temCargas ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconCadeado size={13} />
                  Travado em <strong>Sim</strong> — existem {visita.cargas.length} cargas lançadas
                  nesta visita.
                </span>
              ) : (
                'Ao lançar a primeira carga, este campo passa automaticamente para Sim.'
              )
            }
            controle={
              <SimNaoInput
                valor={temCargas ? 'Sim' : d.visitaIniciada}
                disabled={!podeEditar || temCargas}
                onChange={(v) => set({ visitaIniciada: v })}
              />
            }
          />

          <Question
            numero="2.2"
            texto="Houve recebimento de cargas?"
            hint={
              temAcompanhadas ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconCadeado size={13} />
                  Travado em <strong>Sim</strong> — {visita.cargas.filter((c) => c.acompanhada).length}{' '}
                  carga(s) acompanhada(s). Não acompanhadas não contam.
                </span>
              ) : soNaoAcompanhadas ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconCadeado size={13} />
                  Travado em <strong>Não</strong> — só há cargas não acompanhadas.
                </span>
              ) : (
                'Nenhuma carga lançada até o momento. Recebimento vale só para cargas acompanhadas.'
              )
            }
            controle={
              <SimNaoInput
                valor={recebimentoValor}
                onChange={(v) => set({ recebimentoCargas: v })}
                disabled={!podeEditar || recebimentoTravado}
              />
            }
          />

          <Question
            numero="2.3"
            texto="Foram realizados testes?"
            controle={
              <SimNaoInput valor={d.realizouTestes} onChange={(v) => set({ realizouTestes: v })} disabled={!podeEditar} />
            }
          />

          <Question
            numero="2.4"
            texto="Houve realização de reteste?"
            hint="Se sim, informe quem solicitou e o motivo."
            controle={
              <SimNaoInput
                valor={d.houveReteste}
                onChange={(v) =>
                  set(
                    v === 'Não'
                      ? { houveReteste: v, retesteSolicitante: '', retesteMotivo: '' }
                      : { houveReteste: v },
                  )
                }
                disabled={!podeEditar}
              />
            }
            extra={
              d.houveReteste === 'Sim' && (
                <div className="question__extra">
                  <div className="field">
                    <label htmlFor="rt-quem">Quem pediu o reteste?</label>
                    <input
                      id="rt-quem"
                      value={d.retesteSolicitante}
                      onChange={(e) => set({ retesteSolicitante: e.target.value })}
                      placeholder="Ex.: Central de Informações"
                      disabled={!podeEditar}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="rt-motivo">Motivo do reteste</label>
                    <input
                      id="rt-motivo"
                      value={d.retesteMotivo}
                      onChange={(e) => set({ retesteMotivo: e.target.value })}
                      placeholder="Descreva o motivo"
                      disabled={!podeEditar}
                    />
                  </div>
                </div>
              )
            }
          />

          <Question
            numero="2.5"
            texto="Houve ocorrência?"
            hint={
              visita.ocorrencias.length > 0
                ? `${visita.ocorrencias.length} ocorrência(s) registrada(s) na aba 6.`
                : 'Nenhuma ocorrência registrada.'
            }
            controle={
              <SimNaoInput
                valor={d.houveOcorrencia}
                onChange={(v) => set({ houveOcorrencia: v })}
                disabled={!podeEditar}
              />
            }
          />

          <CaixaFitaQuestion
            valor={d.caixaFitaTeste}
            podeEditar={podeEditar}
            onChange={(q) => set({ caixaFitaTeste: q })}
          />

          <Question
            numero="2.7"
            texto="O PDR guarda as fitas testadas de forma associável às cargas?"
            hint="Se não, a Operação precisa revisar o processo de rastreabilidade da unidade."
            controle={
              <SimNaoInput
                valor={d.fitasAssociaveisCargas}
                onChange={(v) => set({ fitasAssociaveisCargas: v })}
                disabled={!podeEditar}
              />
            }
          />
        </div>
      </Panel>
    </div>
  )
}

/** pergunta 2.6 + stepper — faixa configurável em Administração → Parâmetros */
function CaixaFitaQuestion({
  valor,
  onChange,
  podeEditar,
}: {
  valor: number
  onChange: (v: number) => void
  podeEditar: boolean
}) {
  const { caixaFitaMin, caixaFitaMax } = useParametros()
  const limitar = (v: number) =>
    Math.max(caixaFitaMin, Math.min(caixaFitaMax, Number.isFinite(v) ? Math.round(v) : 0))

  return (
    <Question
      numero="2.6"
      texto="Número da caixa de fita teste"
      hint={`Valor permitido de ${caixaFitaMin} a ${caixaFitaMax}.`}
      controle={
        <div className="stepper">
          <button
            type="button"
            onClick={() => onChange(limitar(valor - 1))}
            disabled={!podeEditar || valor <= caixaFitaMin}
            aria-label="Diminuir"
          >
            −
          </button>
          <input
            type="number"
            min={caixaFitaMin}
            max={caixaFitaMax}
            value={valor}
            onChange={(e) => onChange(limitar(Number(e.target.value)))}
            disabled={!podeEditar}
          />
          <button
            type="button"
            onClick={() => onChange(limitar(valor + 1))}
            disabled={!podeEditar || valor >= caixaFitaMax}
            aria-label="Aumentar"
          >
            +
          </button>
          <span className="stepper__faixa">/ {caixaFitaMax}</span>
        </div>
      }
    />
  )
}

/* ================================================================= *
 * 3. Histórico de acumulado
 * ================================================================= */
function AbaAcumulado({
  visita,
  onAviso,
  podeEditar,
}: {
  visita: Visita
  onAviso: (m: string) => void
  podeEditar: boolean
}) {
  const a = visita.acumulado
  const [granularidade, setGranularidade] = useState<'dias' | 'meses'>('dias')

  // a série termina na data da visita: a primeira linha é o dia auditado
  const historico = useMemo(
    () => historicoAcumuladoUnidade(visita.pdr.cnpj, dataParaDate(visita.data)),
    [visita.pdr.cnpj, visita.data],
  )
  const periodos = historico[granularidade]

  // só a origem PDR aceita digitação; RTV e B2B chegam consolidados da base
  const travado = a.origem !== 'PDR'
  const podeDigitar = !travado && a.informadoPeloPdr === 'Sim'

  const setValor = (c: Classificacao, v: number) =>
    salvarAcumulado(visita.cod, { valores: { ...a.valores, [c]: v } })

  return (
    <div className="stack">
      <Panel
        numero="3.1"
        titulo="PDR informou o acumulado?"
        acoes={
          <button
            className="btn btn--primary btn--sm"
            type="button"
            disabled={!podeEditar || !podeDigitar}
            onClick={() => onAviso('Acumulado gravado.')}
          >
            Gravar acumulado
          </button>
        }
      >
        <div className="panel__body">
          <Question
            texto="Origem do acumulado"
            hint="PDR é digitado na visita; RTV e B2B chegam consolidados da base e ficam travados."
            controle={
              <div className="segmented">
                {ORIGENS_ACUMULADO.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={a.origem === o ? 'is-on is-origem' : undefined}
                    style={a.origem === o ? { background: CORES_ORIGEM[o], color: '#fff' } : undefined}
                    onClick={() => salvarAcumulado(visita.cod, { origem: o })}
                    disabled={!podeEditar}
                  >
                    {o}
                  </button>
                ))}
              </div>
            }
          />

          <Question
            texto="O PDR informou o acumulado?"
            hint={
              travado
                ? `Origem ${a.origem}: o acumulado já vem consolidado e a digitação fica bloqueada.`
                : 'Marcando Sim, os campos de acumulado ficam liberados para inserção.'
            }
            controle={
              <SimNaoInput
                valor={a.informadoPeloPdr}
                disabled={!podeEditar || travado}
                onChange={(v) => salvarAcumulado(visita.cod, { informadoPeloPdr: v })}
              />
            }
          />

          {travado && (
            <div className="alert alert--lock">
              <IconCadeado />
              <span>
                <strong>Acumulado via {a.origem}.</strong> Os valores abaixo vêm da base e não
                podem ser digitados nesta tela. Para corrigir, ajuste a origem no sistema de
                origem.
              </span>
            </div>
          )}

          <div className="form-grid" style={{ marginTop: 18 }}>
            {CLASSIFICACOES.map((c) => (
              <div className="field" key={c}>
                <label htmlFor={`ac-${c}`} style={{ color: CORES_CLASSIFICACAO[c] }}>
                  {c} (kg)
                </label>
                <input
                  id={`ac-${c}`}
                  type="number"
                  value={a.valores[c]}
                  disabled={!podeEditar || !podeDigitar}
                  onChange={(e) => setValor(c, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="totals">
          {CLASSIFICACOES.map((c) => (
            <div className="total-box" key={c}>
              <div className="total-box__label" style={{ color: CORES_CLASSIFICACAO[c] }}>
                {c}
              </div>
              <div className="total-box__value">{fmtKg(a.valores[c])}</div>
            </div>
          ))}
          <div className="total-box">
            <div className="total-box__label">Total informado</div>
            <div className="total-box__value">
              {fmtKg(CLASSIFICACOES.reduce((s, c) => s + a.valores[c], 0))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        numero="3.2"
        titulo="Histórico de acumulado da unidade"
        acoes={
          <div className="segmented">
            <button
              type="button"
              className={granularidade === 'dias' ? 'is-on is-origem' : undefined}
              style={granularidade === 'dias' ? { background: 'var(--ink-800)', color: '#fff' } : undefined}
              onClick={() => setGranularidade('dias')}
              disabled={!podeEditar}
            >
              Últimos dias
            </button>
            <button
              type="button"
              className={granularidade === 'meses' ? 'is-on is-origem' : undefined}
              style={granularidade === 'meses' ? { background: 'var(--ink-800)', color: '#fff' } : undefined}
              onClick={() => setGranularidade('meses')}
              disabled={!podeEditar}
            >
              Últimos meses
            </button>
          </div>
        }
      >
        <div className="panel__body" style={{ paddingBottom: 12 }}>
          <span className="cell-muted">
            CNPJ {visita.pdr.cnpj} — {periodos.length}{' '}
            {granularidade === 'dias' ? 'dias' : 'meses'} mais recentes, em kg. A linha da visita
            mostra o acumulado informado no bloco 3.1.
          </span>
        </div>
        <TabelaAcumulado
          periodos={periodos}
          rotulo={granularidade === 'dias' ? 'Dia' : 'Mês'}
          cnpj={visita.pdr.cnpj}
          diaDaVisita={granularidade === 'dias' ? visita.data : undefined}
          acumuladoDaVisita={{
            origem: a.origem,
            negativa: a.valores.Negativa,
            declarada: a.valores.Declarada,
            positiva: a.valores.Positiva,
            participante: a.valores.Participante,
          }}
        />
      </Panel>
    </div>
  )
}

/**
 * Dia Anterior — uma linha por dia que de fato existe: visitas da unidade
 * (incluindo as criadas no importador de acumulado) e os lançamentos já
 * gravados nesta visita. Não se inventa dia de calendário no meio.
 */
function AbaDiaAnterior({
  visita,
  onAviso,
  podeEditar,
}: {
  visita: Visita
  onAviso: (m: string) => void
  podeEditar: boolean
}) {
  const { limiteDiaAnteriorTecnologia: teto } = useParametros()
  const visitas = useVisitas()

  const dias = useMemo(() => {
    const set = new Set<string>([visita.data])
    const limite = dataComparavel(visita.data)
    for (const v of visitas) {
      if (v.pdr.cnpj !== visita.pdr.cnpj) continue
      const n = dataComparavel(v.data)
      if (n && n <= limite) set.add(v.data)
    }
    for (const d of visita.diaAnterior) set.add(d.data)
    return [...set].sort((a, b) => dataComparavel(b) - dataComparavel(a))
  }, [visita.data, visita.pdr.cnpj, visita.diaAnterior, visitas])

  /** visita da unidade naquele dia — é o que torna a linha clicável */
  const visitaDoDia = (data: string) =>
    visitas.find((v) => v.pdr.cnpj === visita.pdr.cnpj && v.data === data)

  const informados = visita.diaAnterior.filter((d) => d.informouDiaAnterior === 'Sim')

  return (
    <div className="stack">
      <Panel
        numero="3.1"
        titulo="Acumulado do dia anterior"
        hint="Informado pelo PDR e digitado pelo auditor — um dia por linha"
      >
        <div className="panel__body" style={{ paddingBottom: 12 }}>
          <span className="cell-muted">
            CNPJ {visita.pdr.cnpj} — só os dias com visita ou lançamento nesta
            unidade, em kg. Sem visita no meio (ex.: 09 e 11), o dia 10 não
            aparece. A linha da visita vem do bloco 3 (Acumulado) e não se edita
            aqui. Cada tecnologia aceita no máximo {fmtKg(teto)}.{' '}
            {informados.length > 0 && `${informados.length} dia(s) informado(s).`}
          </span>
        </div>

        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Origem</th>
                <th>Informou?</th>
                {CLASSIFICACOES.map((c) => (
                  <th key={c} style={{ textAlign: 'right' }}>
                    {c}
                  </th>
                ))}
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((dia) => {
                const daVisita = dia === visita.data
                /**
                 * A linha do dia da visita mostra o acumulado da própria visita
                 * (bloco 3), em leitura: quem edita aquele número é a aba
                 * Acumulado, não esta. Aqui ela serve de referência.
                 */
                const registro = daVisita
                  ? {
                      ...diaAnteriorDe(visita, dia),
                      informouDiaAnterior: visita.acumulado.informadoPeloPdr,
                      valores: visita.acumulado.valores,
                    }
                  : diaAnteriorDe(visita, dia)
                const liberado = !daVisita && registro.informouDiaAnterior === 'Sim'
                const total = CLASSIFICACOES.reduce((s, c) => s + registro.valores[c], 0)
                const alvo = daVisita ? undefined : visitaDoDia(dia)

                return (
                  <tr
                    key={dia}
                    className={
                      daVisita ? 'row-desta-visita' : liberado ? 'row-informado' : undefined
                    }
                  >
                    <td>
                      {daVisita ? (
                        <span className="mono">
                          {dia}
                          <span className="marca-visita">desta visita</span>
                        </span>
                      ) : alvo ? (
                        <a
                          className="link-visita mono"
                          href={`#/visita/${alvo.cod}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Abrir a visita ${alvo.cod} de ${dia} em outra aba`}
                        >
                          {dia} <span className="link-visita__cod">#{alvo.cod} ↗</span>
                        </a>
                      ) : (
                        <span className="mono">{dia}</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          color: CORES_ORIGEM.PDR,
                          borderColor: `${CORES_ORIGEM.PDR}55`,
                          background: `${CORES_ORIGEM.PDR}12`,
                        }}
                      >
                        PDR
                      </span>
                    </td>
                    <td>
                      <SimNaoInput
                        valor={registro.informouDiaAnterior}
                        onChange={(v) => {
                          definirInformouDiaAnterior(visita.cod, dia, v)
                          if (v === 'Não') onAviso(`${dia} voltou a não informado.`)
                        }}
                        disabled={!podeEditar || daVisita}
                      />
                    </td>
                    {CLASSIFICACOES.map((c) => (
                      <td key={c} className="num">
                        <input
                          className="input-num"
                          inputMode="numeric"
                          disabled={!podeEditar || !liberado || daVisita}
                          aria-label={`${c} em ${dia}`}
                          value={
                            registro.valores[c] ? fmtNum(registro.valores[c]) : liberado ? '' : '0'
                          }
                          onChange={(e) =>
                            salvarDiaAnterior(visita.cod, dia, {
                              ...registro.valores,
                              [c]: numeroDigitado(e.target.value),
                            })
                          }
                        />
                        {/* o teto é regra do Dia Anterior; a linha da visita é
                            o acumulado dela, e não responde por essa regra */}
                        {!daVisita && registro.valores[c] > teto && (
                          <div className="celula-erro">acima do teto — 2.9</div>
                        )}
                      </td>
                    ))}
                    <td className="num cell-strong">{fmtKg(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}


function TabelaAcumulado({
  periodos,
  rotulo,
  cnpj,
  diaDaVisita,
  acumuladoDaVisita,
}: {
  periodos: AcumuladoPeriodo[]
  rotulo: string
  cnpj: string
  /** linha correspondente à data da visita, destacada para situar o analista */
  diaDaVisita?: string
  /** valores informados na visita, que substituem os da série naquele dia */
  acumuladoDaVisita?: Pick<
    AcumuladoPeriodo,
    'negativa' | 'declarada' | 'positiva' | 'participante' | 'origem'
  >
}) {
  const visitas = useVisitas()
  const total = (p: AcumuladoPeriodo) => p.negativa + p.declarada + p.positiva + p.participante
  const visitaDoDia = (data: string) => visitas.find((v) => v.pdr.cnpj === cnpj && v.data === data)

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>{rotulo}</th>
            <th>Origem</th>
            <th style={{ textAlign: 'right', color: CORES_CLASSIFICACAO.Positiva }}>Positiva</th>
            <th style={{ textAlign: 'right', color: CORES_CLASSIFICACAO.Declarada }}>Declarada</th>
            <th style={{ textAlign: 'right', color: CORES_CLASSIFICACAO.Negativa }}>Negativa</th>
            <th style={{ textAlign: 'right', color: CORES_CLASSIFICACAO.Participante }}>
              Participante
            </th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {periodos.map((bruto) => {
            const daVisita = bruto.periodo === diaDaVisita
            const outra = !daVisita ? visitaDoDia(bruto.periodo) : undefined
            /**
             * No dia da visita, o que vale é o acumulado informado nela — a
             * série é a base histórica da unidade, e mostrá-la aqui exibiria
             * dois números diferentes para o mesmo dia. O mesmo vale para
             * outro dia que tenha visita nesta unidade, inclusive 0-0-0-0.
             */
            const p =
              daVisita && acumuladoDaVisita
                ? { ...bruto, ...acumuladoDaVisita }
                : outra
                  ? {
                      ...bruto,
                      origem: outra.acumulado.origem,
                      negativa: outra.acumulado.valores.Negativa,
                      declarada: outra.acumulado.valores.Declarada,
                      positiva: outra.acumulado.valores.Positiva,
                      participante: outra.acumulado.valores.Participante,
                    }
                  : bruto
            return (
            <tr key={p.periodo} className={daVisita ? 'row-desta-visita' : undefined}>
              <td className="cell-strong mono">
                {daVisita ? (
                  <>
                    {p.periodo}
                    <span className="marca-visita">desta visita</span>
                  </>
                ) : outra ? (
                  <a
                    className="link-visita"
                    href={`#/visita/${outra.cod}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Abrir a visita ${outra.cod} de ${p.periodo} em outra aba`}
                  >
                    {p.periodo} <span className="link-visita__cod">#{outra.cod} ↗</span>
                  </a>
                ) : (
                  p.periodo
                )}
              </td>
              <td>
                <OrigemChip origem={p.origem} />
              </td>
              <td className="num">{fmtNum(p.positiva)}</td>
              <td className="num">{fmtNum(p.declarada)}</td>
              <td className="num">{fmtNum(p.negativa)}</td>
              <td className="num">{fmtNum(p.participante)}</td>
              <td className="num cell-strong">{fmtNum(total(p))}</td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OrigemChip({ origem }: { origem: OrigemAcumulado }) {
  const cor = CORES_ORIGEM[origem]
  return (
    <span
      className="badge"
      style={{ color: cor, borderColor: `${cor}44`, background: `${cor}12` }}
    >
      {origem}
    </span>
  )
}

/* ================================================================= *
 * 6. Ocorrências
 * ================================================================= */
function AbaOcorrencias({ visita }: { visita: Visita }) {
  const [carga, setCarga] = useState<Carga | null>(null)
  const porId = new Map(visita.cargas.map((c) => [c.id, c]))

  return (
    <>
      <Panel
        numero="6."
        titulo="Ocorrências registradas"
        hint={`${visita.ocorrencias.length} registro(s)`}
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Data</th>
                <th>Tipo</th>
                <th>Gravidade</th>
                <th>Carga vinculada</th>
                <th>Descrição</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visita.ocorrencias.map((o) => {
                const c = o.cargaId ? porId.get(o.cargaId) : undefined
                return (
                  <tr key={o.id}>
                    <td className="cell-strong mono">{o.id}</td>
                    <td className="mono">{o.data}</td>
                    <td>{o.tipo}</td>
                    <td>
                      <span
                        className={
                          o.gravidade === 'Alta'
                            ? 'chip chip--bad'
                            : o.gravidade === 'Média'
                              ? 'chip chip--warn'
                              : 'chip'
                        }
                      >
                        {o.gravidade}
                      </span>
                    </td>
                    <td>
                      {c ? (
                        <>
                          <div className="mono cell-strong">{c.id}</div>
                          <div className="cell-muted">
                            <span className="placa placa--mini">{c.placa}</span> romaneio{' '}
                            {c.romaneio}
                          </div>
                        </>
                      ) : (
                        <span className="cell-muted">—</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 380 }}>{o.descricao}</td>
                    <td>
                      <span className={o.status === 'Resolvida' ? 'chip chip--ok' : 'chip'}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        disabled={!c}
                        onClick={() => c && setCarga(c)}
                      >
                        Ver carga
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {visita.ocorrencias.length === 0 && (
          <div className="empty">Nenhuma ocorrência registrada nesta visita.</div>
        )}
      </Panel>

      {carga && <ModalCarga carga={carga} onClose={() => setCarga(null)} />}
    </>
  )
}

function ModalCarga({ carga, onClose }: { carga: Carga; onClose: () => void }) {
  const pct = percentualDesconto(carga)
  const cor = CORES_CLASSIFICACAO[carga.classificacao]

  return (
    <Modal
      titulo={`Carga ${carga.id}`}
      subtitulo={`Placa ${carga.placa} · romaneio ${carga.romaneio}`}
      onClose={onClose}
    >
      <div className="kv-grid">
        <KV label="Data / hora">
          {carga.data} às {carga.hora}
        </KV>
        <KV label="Placa">
          <span className="placa">{carga.placa}</span>
        </KV>
        <KV label="Produtor">
          {carga.produtor}
          <div className="cell-muted mono">{carga.cpfCnpjProdutor}</div>
        </KV>
        <KV label="Romaneio">{carga.romaneio}</KV>
        <KV label="Peso líquido">{fmtKg(carga.pesoLiquido)}</KV>
        <KV label="Peso com desconto">{fmtKg(carga.pesoComDesconto)}</KV>
        <KV label="Desconto">
          <span className="pct">{fmtPct(pct)}</span>{' '}
          <span className="cell-muted">
            ({fmtKg(carga.pesoLiquido - carga.pesoComDesconto)})
          </span>
        </KV>
        <KV label="Classificação">
          <span
            className="badge"
            style={{ color: cor, borderColor: `${cor}44`, background: `${cor}12` }}
          >
            {carga.classificacao}
          </span>
        </KV>
        <KV label="Rateio">
          {carga.rateio ? (
            <span className="chip chip--rateio">{carga.grupoRateio}</span>
          ) : (
            'Não'
          )}
        </KV>
        <KV label="Acompanhada">{carga.acompanhada ? 'Sim' : 'Não'}</KV>
      </div>
      {carga.observacao && (
        <div className="alert alert--info" style={{ marginTop: 16 }}>
          <IconInfo />
          <span>{carga.observacao}</span>
        </div>
      )}
    </Modal>
  )
}

