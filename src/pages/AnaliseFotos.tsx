import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { IconFotos, IconInfo } from '../components/icons'
import { useFilaFotos } from '../painel'
import { useParametros } from '../store'
import {
  conferirCargaComFoto,
  lerEvidenciaAsync,
  lerFilaEmMassa,
  type ItemFilaFoto,
  type ResumoLeituraMassa,
  type StatusConferencia,
} from '../fotos/evidencia'
import { configVisaoDe, visaoLigada } from '../fotos/visao'
import { fmtNum } from '../format'

const FILTROS: { id: 'todas' | StatusConferencia; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'divergente', label: 'Divergentes' },
  { id: 'pendente', label: 'Aguardando visão' },
  { id: 'ok', label: 'Conferidas' },
  { id: 'sem-foto', label: 'Sem foto' },
]

function rotuloStatus(s: StatusConferencia) {
  if (s === 'ok') return 'Conferida'
  if (s === 'divergente') return 'Divergente'
  if (s === 'pendente') return 'Aguardando visão'
  return 'Sem foto'
}

function chave(i: ItemFilaFoto) {
  return `${i.visitaCod}-${i.carga.id}`
}

export default function AnaliseFotos() {
  const t = useT()
  const parametros = useParametros()
  const cfg = configVisaoDe(parametros)
  const ligada = visaoLigada(cfg)
  const filaRemota = useFilaFotos()
  const [overlay, setOverlay] = useState<ItemFilaFoto[] | null>(null)
  const fila = overlay ?? filaRemota
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todas')
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const [resumo, setResumo] = useState<ResumoLeituraMassa | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [lendoUma, setLendoUma] = useState(false)

  const visivel = useMemo(
    () => (filtro === 'todas' ? fila : fila.filter((i) => i.conferencia.status === filtro)),
    [fila, filtro],
  )

  const atual = visivel.find((i) => chave(i) === selecionada) ?? visivel[0]
  const nFoto = fila.filter((i) => i.carga.fotoUrl).length
  const lendo = Boolean(andamento)

  function aplicarFila(proxima: ItemFilaFoto[]) {
    setOverlay(proxima)
  }

  async function lerEmMassa() {
    if (lendo || nFoto === 0) return
    setAndamento({ feitos: 0, total: nFoto })
    const r = await lerFilaEmMassa(fila, (feitos, total) => setAndamento({ feitos, total }), cfg)
    setAndamento(null)
    aplicarFila(r.fila)
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
      aplicarFila(fila.map((i) => (chave(i) === chave(item) ? { ...i, conferencia } : i)))
      if (lida.fonte === 'visao-erro') setAviso(lida.erro ?? t('Falha na API de visão.'))
      else if (lida.fonte === 'requer-visao') {
        setAviso(t('Nenhuma API de visão configurada. Vá em Administração → Parâmetros.'))
      }
    } finally {
      setLendoUma(false)
    }
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
        subtitulo={t(
          'Conferência das evidências fotográficas das cargas em visitas certificadas',
        )}
        acoes={
          <button
            className="btn btn--primary"
            type="button"
            disabled={lendo || nFoto === 0}
            onClick={() => void lerEmMassa()}
          >
            <IconFotos /> {lendo ? t('Lendo…') : t('Ler em massa')}
          </button>
        }
      />

      <Panel numero="1" titulo={t('Como validar')} hint={rotuloApi}>
        <div className="panel__body fotos-metodo">
          <p>
            {t(
              'Do lado esquerdo, a foto. Do lado direito, o que está lançado no sistema e o que a leitura tirou do papel. Romaneio pode aparecer como NF, ticket ou outro nome — o lançado só precisa estar entre os números do documento.',
            )}
          </p>
          <ul>
            <li>
              <strong>{t('Agora.')}</strong>{' '}
              {t('Fotos simuladas (SVG) leem no navegador, em lote, sem API.')}
            </li>
            <li>
              <strong>{t('Produção.')}</strong>{' '}
              {ligada
                ? t('jpeg/png vão para a API configurada (Gemini, OpenAI ou webhook).')
                : t(
                    'jpeg/png ficam pendentes até plugar a API em Administração → Parâmetros (ou VITE_VISION_* no .env.local).',
                  )}
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
            {resumo.semFoto > 0 && (
              <>
                {' '}
                · {fmtNum(resumo.semFoto)} {t('Sem foto')}
              </>
            )}
          </span>
        </div>
      )}

      <div className="fotos-filtros">
        {FILTROS.map((f) => {
          const n = f.id === 'todas' ? fila.length : fila.filter((i) => i.conferencia.status === f.id).length
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

      {visivel.length === 0 ? (
        <div className="empty">{t('Nenhuma carga neste recorte.')}</div>
      ) : (
        <div className="fotos-layout">
          <aside className="fotos-fila">
            {visivel.map((item) => {
              const id = chave(item)
              const ativo = atual && chave(atual) === id
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
                    Visita {item.visitaCod} · {item.visitaData} · {item.carga.placa || '—'}
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
}: {
  item: ItemFilaFoto
  lendo: boolean
  podeLerApi: boolean
  onLer: () => void
}) {
  const t = useT()
  const { carga, conferencia } = item
  return (
    <section className="fotos-prova">
      <div className="fotos-prova__foto">
        {carga.fotoUrl ? (
          <img src={carga.fotoUrl} alt={`Evidência da carga ${carga.id}`} />
        ) : (
          <div className="fotos-prova__vazia">
            <IconFotos size={36} />
            <span>{t('Esta carga não tem evidência fotográfica.')}</span>
          </div>
        )}
        {conferencia.fonte === 'requer-visao' && (
          <p className="field__hint" style={{ marginTop: 10 }}>
            {t(
              'Foto real: a leitura automática fica disponível quando houver API de visão configurada.',
            )}
          </p>
        )}
        {conferencia.fonte === 'visao-erro' && conferencia.erro && (
          <p className="field__hint" style={{ marginTop: 10 }}>
            {conferencia.erro}
          </p>
        )}
        {conferencia.fonte === 'svg-mock' && (
          <p className="field__hint" style={{ marginTop: 10 }}>
            {t('Leitura local do mock (sem API).')}
          </p>
        )}
        {conferencia.fonte === 'visao' && (
          <p className="field__hint" style={{ marginTop: 10 }}>
            {t('Leitura pela API de visão.')}
          </p>
        )}
      </div>

      <div className="fotos-prova__dados">
        <div className="fotos-prova__head">
          <h3>
            Carga {carga.id}
            <span className={`fotos-status fotos-status--${conferencia.status}`}>
              {t(rotuloStatus(conferencia.status))}
            </span>
          </h3>
          <div className="fotos-prova__acoes">
            {podeLerApi && (
              <button className="btn btn--ghost btn--sm" type="button" disabled={lendo} onClick={onLer}>
                {lendo ? t('Lendo…') : t('Ler esta foto')}
              </button>
            )}
            <Link className="btn btn--ghost btn--sm" to={`/visita/${item.visitaCod}`}>
              {t('Abrir visita')} {item.visitaCod} →
            </Link>
          </div>
        </div>

        {conferencia.checagens.length > 0 ? (
          <div className="table-scroll fotos-cmp">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('Campo')}</th>
                  <th>{t('No sistema')}</th>
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
                    <td className="mono">{c.lancado}</td>
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
        ) : (
          <p className="field__hint">{t('Esta carga não tem evidência fotográfica.')}</p>
        )}
      </div>
    </section>
  )
}
