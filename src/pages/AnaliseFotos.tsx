import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { IconFotos, IconInfo } from '../components/icons'
import { useFilaFotos } from '../painel'
import {
  lerFilaEmMassa,
  type ItemFilaFoto,
  type ResumoLeituraMassa,
  type StatusConferencia,
} from '../fotos/evidencia'
import { fmtKg, fmtNum } from '../format'

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

export default function AnaliseFotos() {
  const t = useT()
  const fila = useFilaFotos()
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todas')
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const [resumo, setResumo] = useState<ResumoLeituraMassa | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const visivel = useMemo(
    () => (filtro === 'todas' ? fila : fila.filter((i) => i.conferencia.status === filtro)),
    [fila, filtro],
  )

  const chave = (i: ItemFilaFoto) => `${i.visitaCod}-${i.carga.id}`
  const atual = visivel.find((i) => chave(i) === selecionada) ?? visivel[0]
  const nFoto = fila.filter((i) => i.carga.fotoUrl).length
  const lendo = Boolean(andamento)

  async function lerEmMassa() {
    if (lendo || nFoto === 0) return
    setAndamento({ feitos: 0, total: nFoto })
    const r = await lerFilaEmMassa(fila, (feitos, total) => setAndamento({ feitos, total }))
    setAndamento(null)
    setResumo(r)
    if (r.divergente > 0) {
      setFiltro('divergente')
      setSelecionada(null)
    }
    const partes = [
      `${fmtNum(r.lidasLocal)} ${t('lida(s) no navegador')}`,
      `${fmtNum(r.divergente)} ${t('divergente(s)')}`,
    ]
    if (r.pendenteApi > 0) partes.push(`${fmtNum(r.pendenteApi)} ${t('aguardando API de visão')}`)
    setAviso(`${t('Leitura em massa')}: ${partes.join(' · ')}`)
  }

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

      <Panel numero="1" titulo={t('Como validar')} hint={t('A foto é a evidência de campo')}>
        <div className="panel__body fotos-metodo">
          <p>
            Uma leitura puxa da foto o ID, a placa e <strong>todas as NFs do papel</strong>. O
            romaneio lançado só precisa aparecer nessa lista. O botão{' '}
            <strong>{t('Ler em massa')}</strong> percorre a fila inteira das certificadas — não é
            uma carga por vez.
          </p>
          <ul>
            <li>
              <strong>Agora.</strong> Fotos simuladas (SVG) leem no navegador, em lote, sem API.
            </li>
            <li>
              <strong>Produção.</strong> jpeg/png vão em paralelo para um modelo de visão (Gemini
              ou GPT-4o), com limite de concorrência. Safra inteira pode ir no Batch API, fora do
              horário. OCR puro não aguenta galpão nem várias vias no mesmo papel.
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
            {t('Último lote')}: {fmtNum(resumo.lidasLocal)} {t('lida(s) no navegador')} ·{' '}
            {fmtNum(resumo.ok)} {t('conferida(s)')} · {fmtNum(resumo.divergente)}{' '}
            {t('divergente(s)')}
            {resumo.pendenteApi > 0 && (
              <>
                {' '}
                · {fmtNum(resumo.pendenteApi)} {t('aguardando API de visão')}
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

          {atual && <PainelProva item={atual} />}
        </div>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}

function PainelProva({ item }: { item: ItemFilaFoto }) {
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
        {conferencia.fonte === 'svg-mock' && (
          <p className="field__hint" style={{ marginTop: 10 }}>
            {t('Leitura local do mock (sem API).')}
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
          <Link className="btn btn--ghost btn--sm" to={`/visita/${item.visitaCod}`}>
            {t('Abrir visita')} {item.visitaCod} →
          </Link>
        </div>

        <dl className="fotos-kv">
          <div>
            <dt>{t('PDR')}</dt>
            <dd>{item.pdrNome}</dd>
          </div>
          <div>
            <dt>{t('Placa')}</dt>
            <dd className="mono">{carga.placa || '—'}</dd>
          </div>
          <div>
            <dt>{t('Romaneio')}</dt>
            <dd className="mono">{carga.romaneio || '—'}</dd>
          </div>
          <div>
            <dt>{t('Peso líquido')}</dt>
            <dd>{fmtKg(carga.pesoLiquido)}</dd>
          </div>
          <div>
            <dt>{t('Produtor')}</dt>
            <dd>{carga.produtor || '—'}</dd>
          </div>
        </dl>

        {conferencia.checagens.length > 0 && (
          <ul className="fotos-checagens">
            {conferencia.checagens.map((c) => (
              <li
                key={c.campo}
                className={`fotos-checagem fotos-checagem--${c.ok === true ? 'ok' : c.ok === false ? 'div' : 'pendente'}`}
              >
                <div className="fotos-checagem__topo">
                  <strong>{t(c.rotulo)}</strong>
                  <span>
                    {c.ok === true ? t('Bate') : c.ok === false ? t('Não bate') : t('Pendente')}
                  </span>
                </div>
                <div className="fotos-checagem__linhas">
                  <span>
                    {t('Lançado')}: <span className="mono">{c.lancado}</span>
                  </span>
                  <span>
                    {t('Na foto')}: <span className="mono">{c.naFoto}</span>
                  </span>
                </div>
                <p>{c.detalhe}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
