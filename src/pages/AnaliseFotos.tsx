import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { IconFotos, IconInfo, IconRefresh } from '../components/icons'
import { useFilaFotos } from '../painel'
import { garantirVisitasNoCache, marcarFotoConferida, useParametros } from '../store'
import {
  cargaTemFoto,
  chaveFilaFoto,
  conferenciaFoiLida,
  conferirCargaComFoto,
  lerEvidenciaAsync,
  lerFilaEmMassa,
  type ConferenciaFoto,
  type ItemFilaFoto,
  type ResumoLeituraMassa,
  type StatusConferencia,
} from '../fotos/evidencia'
import { configVisaoDe, visaoLigada } from '../fotos/visao'
import { fmtDataHora, fmtKg, fmtNum } from '../format'
import { situacaoPorId } from '../data/mock'

type FiltroFila = 'todas' | 'pendente' | 'divergente' | 'conferida'

const FILTROS: { id: FiltroFila; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'divergente', label: 'Divergentes' },
  { id: 'conferida', label: 'Conferidas' },
]

function rotuloStatus(s: StatusConferencia) {
  if (s === 'conferida') return 'Conferida'
  if (s === 'ok') return 'IA bateu'
  if (s === 'divergente') return 'Divergente'
  if (s === 'pendente') return 'Aguardando visão'
  return 'Sem foto'
}

function noFiltro(item: ItemFilaFoto, filtro: FiltroFila): boolean {
  const s = item.conferencia.status
  if (filtro === 'todas') return true
  if (filtro === 'conferida') return s === 'conferida'
  if (filtro === 'divergente') return s === 'divergente'
  return s === 'pendente' || s === 'ok'
}

function aplicarLeituras(
  base: ItemFilaFoto[],
  leituras: Record<string, ConferenciaFoto>,
): ItemFilaFoto[] {
  if (!Object.keys(leituras).length) return base
  return base.map((i) => {
    const extra = leituras[chaveFilaFoto(i)]
    if (!extra) return i
    return {
      ...i,
      conferencia: {
        ...extra,
        status: i.carga.fotoConferidaEm ? 'conferida' : extra.status,
      },
    }
  })
}

export default function AnaliseFotos() {
  const t = useT()
  const parametros = useParametros()
  const cfg = configVisaoDe(parametros)
  const ligada = visaoLigada(cfg)
  const { fila: filaBase, carregando, recarregar } = useFilaFotos()
  const [leituras, setLeituras] = useState<Record<string, ConferenciaFoto>>({})
  const fila = useMemo(() => aplicarLeituras(filaBase, leituras), [filaBase, leituras])
  const [filtro, setFiltro] = useState<FiltroFila>('todas')
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const [resumo, setResumo] = useState<ResumoLeituraMassa | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [lendoUma, setLendoUma] = useState(false)
  const [avisarBusca, setAvisarBusca] = useState(false)

  const visivel = useMemo(() => fila.filter((i) => noFiltro(i, filtro)), [fila, filtro])
  const atual = visivel.find((i) => chaveFilaFoto(i) === selecionada) ?? visivel[0]
  const nFoto = fila.filter((i) => cargaTemFoto(i.carga) && i.carga.fotoUrl).length
  const lendo = Boolean(andamento)

  useEffect(() => {
    if (!avisarBusca || carregando) return
    setAvisarBusca(false)
    setAviso(
      fila.length
        ? `${fmtNum(fila.length)} ${t('carga(s) com foto')}`
        : t('Nenhuma carga com foto anexada.'),
    )
  }, [avisarBusca, carregando, fila.length, t])

  function gravarLeitura(item: ItemFilaFoto, conferencia: ConferenciaFoto) {
    setLeituras((prev) => ({ ...prev, [chaveFilaFoto(item)]: conferencia }))
  }

  async function buscarCargas() {
    if (carregando) return
    setAvisarBusca(true)
    recarregar()
  }

  async function lerEmMassa() {
    if (lendo || nFoto === 0) return
    setAndamento({ feitos: 0, total: nFoto })
    const r = await lerFilaEmMassa(fila, (feitos, total) => setAndamento({ feitos, total }), cfg)
    setAndamento(null)
    const mapa: Record<string, ConferenciaFoto> = {}
    for (const i of r.fila) mapa[chaveFilaFoto(i)] = i.conferencia
    setLeituras(mapa)
    setResumo(r.resumo)
    if (r.resumo.divergente > 0) {
      setFiltro('divergente')
      setSelecionada(null)
    }
    const partes = [
      `${fmtNum(r.resumo.lidasLocal)} ${t('lida(s) no navegador')}`,
      `${fmtNum(r.resumo.lidasApi)} ${t('lida(s) pela API')}`,
      `${fmtNum(r.resumo.divergente)} ${t('divergente(s)')}`,
    ]
    if (r.resumo.pendenteApi > 0) partes.push(`${fmtNum(r.resumo.pendenteApi)} ${t('aguardando API de visão')}`)
    if (r.resumo.falhas > 0) partes.push(`${fmtNum(r.resumo.falhas)} ${t('falha(s) na API')}`)
    setAviso(`${t('Leitura em massa')}: ${partes.join(' · ')}`)
  }

  async function lerUma(item: ItemFilaFoto) {
    if (lendoUma || !item.carga.fotoUrl) return
    setLendoUma(true)
    try {
      const lida = await lerEvidenciaAsync(item.carga.fotoUrl, cfg)
      const conferencia = conferirCargaComFoto(item.carga, lida)
      gravarLeitura(item, conferencia)
      if (lida.fonte === 'visao-erro') setAviso(lida.erro ?? t('Falha na API de visão.'))
      else if (lida.fonte === 'requer-visao') {
        setAviso(t('Nenhuma API de visão configurada. Vá em Administração → Parâmetros.'))
      }
    } finally {
      setLendoUma(false)
    }
  }

  async function finalizarConferida(item: ItemFilaFoto) {
    if (!conferenciaFoiLida(item.conferencia) || item.carga.fotoConferidaEm) return
    await garantirVisitasNoCache([item.visitaCod])
    const { por, ts } = marcarFotoConferida(item.visitaCod, item.carga.id, item.carga)
    gravarLeitura(item, { ...item.conferencia, status: 'conferida' })
    setAviso(
      `${t('Carga')} ${item.carga.id} ${t('marcada como conferida')} (${por} · ${fmtDataHora(ts)}).`,
    )
  }

  const rotuloApi =
    !ligada
      ? t('Nenhuma API ligada')
      : cfg.provedor === 'webhook'
        ? `Webhook · ${cfg.endpoint}`
        : `${cfg.provedor === 'gemini' ? 'Gemini' : 'OpenAI'} · ${cfg.modelo}`

  return (
    <main className="page">
      <Breadcrumb
        trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Análise de Fotos') }]}
      />
      <PageHead
        titulo={t('Análise de Fotos')}
        subtitulo={t('Conferência das evidências fotográficas das cargas com foto anexada')}
        acoes={
          <>
            <button
              className="btn btn--ghost"
              type="button"
              disabled={carregando}
              onClick={() => void buscarCargas()}
            >
              <IconRefresh /> {carregando ? t('Buscando…') : t('Buscar cargas com foto')}
            </button>
            <button
              className="btn btn--primary"
              type="button"
              disabled={lendo || nFoto === 0}
              onClick={() => void lerEmMassa()}
            >
              <IconFotos /> {lendo ? t('Lendo…') : t('Ler em massa')}
            </button>
          </>
        }
      />

      <Panel numero="1" titulo={t('Como validar')} hint={rotuloApi}>
        <div className="panel__body fotos-metodo">
          <p>
            {t(
              'Foto à esquerda, dados lançados no meio, validação da IA à direita. A fila traz toda carga com foto no sistema, em qualquer situação da visita.',
            )}
          </p>
          <ul>
            <li>
              <strong>{t('Validar com IA.')}</strong>{' '}
              {t('Mostra o que a foto contém para conferir se bate com o lançado.')}
            </li>
            <li>
              <strong>{t('Finalizar.')}</strong>{' '}
              {t('Depois de olhar o lado a lado, marque a carga como CONFERIDA.')}
            </li>
          </ul>
        </div>
      </Panel>

      {andamento && (
        <div className="fotos-andamento" role="status">
          <span>
            {t('Lendo fotos')} {fmtNum(andamento.feitos)} / {fmtNum(andamento.total)}
          </span>
          <div className="fotos-andamento__barra">
            <i
              style={{
                width: `${andamento.total ? (andamento.feitos / andamento.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {resumo && !andamento && (
        <div className="alert alert--info">
          <IconInfo />
          <span>
            {t('Último lote')}: {fmtNum(resumo.lidasLocal)} {t('lida(s) no navegador')}
            {resumo.lidasApi > 0 && (
              <>
                {' '}
                · {fmtNum(resumo.lidasApi)} {t('lida(s) pela API')}
              </>
            )}{' '}
            · {fmtNum(resumo.ok)} {t('conferida(s)')} · {fmtNum(resumo.divergente)}{' '}
            {t('divergente(s)')}
            {resumo.pendenteApi > 0 && (
              <>
                {' '}
                · {fmtNum(resumo.pendenteApi)} {t('aguardando API de visão')}
              </>
            )}
            {resumo.falhas > 0 && (
              <>
                {' '}
                · {fmtNum(resumo.falhas)} {t('falha(s) na API')}
              </>
            )}
          </span>
        </div>
      )}

      <div className="fotos-filtros">
        {FILTROS.map((f) => {
          const n = f.id === 'todas' ? fila.length : fila.filter((i) => noFiltro(i, f.id)).length
          return (
            <button
              key={f.id}
              type="button"
              className={`chip${filtro === f.id ? ' chip--ok' : ''}`}
              onClick={() => {
                setFiltro(f.id)
                setSelecionada(null)
              }}
            >
              {t(f.label)} <span className="fotos-filtros__n">{n}</span>
            </button>
          )
        })}
      </div>

      {carregando && fila.length === 0 ? (
        <div className="empty">{t('Buscando cargas com foto…')}</div>
      ) : visivel.length === 0 ? (
        <div className="empty">{t('Nenhuma carga neste recorte.')}</div>
      ) : (
        <div className="fotos-layout">
          <aside className="fotos-fila">
            {visivel.map((item) => {
              const id = chaveFilaFoto(item)
              const ativo = atual && chaveFilaFoto(atual) === id
              const sit = item.visitaSituacao ? situacaoPorId(item.visitaSituacao).label : ''
              return (
                <button
                  key={id}
                  type="button"
                  className={`fotos-item fotos-item--${item.conferencia.status}${ativo ? ' is-active' : ''}`}
                  onClick={() => setSelecionada(id)}
                >
                  <div className="fotos-item__topo">
                    <span className="mono">#{item.carga.id}</span>
                    <span className={`fotos-status fotos-status--${item.conferencia.status}`}>
                      {t(rotuloStatus(item.conferencia.status))}
                    </span>
                  </div>
                  <div className="fotos-item__pdr">{item.pdrNome}</div>
                  <div className="fotos-item__meta">
                    Visita {item.visitaCod} · {item.visitaData}
                    {sit ? ` · ${t(sit)}` : ''} · {item.carga.placa || '—'}
                  </div>
                </button>
              )
            })}
          </aside>

          {atual && (
            <PainelProva
              item={atual}
              lendo={lendoUma}
              podeLerApi={Boolean(atual.carga.fotoUrl)}
              onLer={() => void lerUma(atual)}
              onConferir={() => void finalizarConferida(atual)}
            />
          )}
        </div>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}

function PainelProva({
  item,
  lendo,
  podeLerApi,
  onLer,
  onConferir,
}: {
  item: ItemFilaFoto
  lendo: boolean
  podeLerApi: boolean
  onLer: () => void
  onConferir: () => void
}) {
  const t = useT()
  const { carga, conferencia } = item
  const jaConferida = Boolean(carga.fotoConferidaEm) || conferencia.status === 'conferida'
  const podeConferir = conferenciaFoiLida(conferencia) && !jaConferida
  const sit = item.visitaSituacao ? situacaoPorId(item.visitaSituacao).label : ''

  return (
    <section className="fotos-prova fotos-prova--3">
      <div className="fotos-prova__foto">
        {carga.fotoUrl ? (
          <img src={carga.fotoUrl} alt={`Evidência da carga ${carga.id}`} />
        ) : (
          <div className="fotos-prova__vazia">
            <IconFotos size={36} />
            <span>
              {carga.fotoPath
                ? t('Foto anexada — busque de novo para abrir a imagem.')
                : t('Esta carga não tem evidência fotográfica.')}
            </span>
          </div>
        )}
      </div>

      <div className="fotos-prova__col">
        <div className="fotos-prova__head">
          <h3>
            {t('No sistema')}
            <span className={`fotos-status fotos-status--${conferencia.status}`}>
              {t(rotuloStatus(conferencia.status))}
            </span>
          </h3>
          <Link className="btn btn--ghost btn--sm" to={`/visita/${item.visitaCod}`}>
            {t('Abrir visita')} {item.visitaCod} →
          </Link>
        </div>
        <dl className="fotos-kv">
          <div>
            <dt>{t('Carga')}</dt>
            <dd className="mono">{carga.id}</dd>
          </div>
          <div>
            <dt>{t('Visita')}</dt>
            <dd>
              {item.visitaCod} · {item.visitaData}
            </dd>
          </div>
          <div>
            <dt>{t('PDR')}</dt>
            <dd>{item.pdrNome}</dd>
          </div>
          {sit ? (
            <div>
              <dt>{t('Situação')}</dt>
              <dd>{t(sit)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('Data / hora')}</dt>
            <dd className="mono">{[carga.data, carga.hora].filter(Boolean).join(' ') || '—'}</dd>
          </div>
          <div>
            <dt>{t('Placa')}</dt>
            <dd className="mono">{carga.placa || '—'}</dd>
          </div>
          <div>
            <dt>{t('Produtor')}</dt>
            <dd>{carga.produtor || '—'}</dd>
          </div>
          <div>
            <dt>{t('Romaneio')}</dt>
            <dd className="mono">{carga.romaneio || '—'}</dd>
          </div>
          <div>
            <dt>{t('Peso líquido')}</dt>
            <dd className="mono">{carga.pesoLiquido > 0 ? fmtKg(carga.pesoLiquido) : '—'}</dd>
          </div>
          <div>
            <dt>{t('Peso c/ desconto')}</dt>
            <dd className="mono">{carga.pesoComDesconto > 0 ? fmtKg(carga.pesoComDesconto) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="fotos-prova__col fotos-prova__ia">
        <div className="fotos-prova__head">
          <h3>{t('Leitura da IA')}</h3>
        </div>
        <div className="fotos-prova__acoes">
          {podeLerApi && (
            <button className="btn btn--primary btn--sm" type="button" disabled={lendo} onClick={onLer}>
              {lendo ? t('Lendo…') : t('Validar com IA')}
            </button>
          )}
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={!podeConferir}
            onClick={onConferir}
          >
            {jaConferida ? t('Já conferida') : t('Finalizar — conferida')}
          </button>
        </div>
        {conferencia.fonte === 'requer-visao' && (
          <p className="field__hint">
            {t('Rode a IA para ver o que a foto contém e se os dados batem com o lançado.')}
          </p>
        )}
        {conferencia.fonte === 'visao-erro' && conferencia.erro && (
          <p className="field__hint">{conferencia.erro}</p>
        )}
        {conferencia.fonte === 'svg-mock' && (
          <p className="field__hint">{t('Leitura local do mock (sem API).')}</p>
        )}
        {conferencia.fonte === 'visao' && (
          <p className="field__hint">{t('Leitura pela API de visão.')}</p>
        )}
        {jaConferida && carga.fotoConferidaPor && carga.fotoConferidaEm && (
          <p className="field__hint">
            {t('Conferida por')} {carga.fotoConferidaPor} · {fmtDataHora(carga.fotoConferidaEm)}
          </p>
        )}
        {conferencia.checagens.length > 0 && conferenciaFoiLida(conferencia) ? (
          <div className="table-scroll fotos-cmp">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('Campo')}</th>
                  <th>{t('Na foto')}</th>
                  <th>{t('Conferência')}</th>
                </tr>
              </thead>
              <tbody>
                {conferencia.checagens.map((c) => (
                  <tr
                    key={c.campo}
                    className={
                      c.ok === true
                        ? 'fotos-cmp__ok'
                        : c.ok === false
                          ? 'fotos-cmp__div'
                          : 'fotos-cmp__pendente'
                    }
                  >
                    <td className="cell-strong">{t(c.rotulo)}</td>
                    <td className="mono">{c.naFoto}</td>
                    <td>
                      {c.ok === true ? t('Bate') : c.ok === false ? t('Não bate') : t('Pendente')}
                      <div className="fotos-cmp__detalhe">{c.detalhe}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : conferencia.checagens.length > 0 ? (
          <p className="field__hint">
            {t('Rode a IA para ver o que a foto contém e se os dados batem com o lançado.')}
          </p>
        ) : null}
      </div>
    </section>
  )
}
