import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Toast } from '../components/ui'
import { IconInfo, IconLista } from '../components/icons'
import { useFilaAnaliseFinal } from '../painel'
import {
  marcarAnaliseFinal,
  useVisita,
  useVisitaCarregando,
} from '../store'
import { aplicarLiberacoes, analisarVisita } from '../analise'
import { fmtDataHora, fmtNum } from '../format'

const FILTROS = [
  { id: 'pendente', label: 'Pendentes' },
  { id: 'conferida', label: 'Já conferidas' },
  { id: 'todas', label: 'Todas' },
] as const

export default function AnaliseFinal() {
  const t = useT()
  const fila = useFilaAnaliseFinal()
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('pendente')
  const [selecionada, setSelecionada] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const visivel = useMemo(() => {
    if (filtro === 'pendente') return fila.filter((i) => !i.conferida)
    if (filtro === 'conferida') return fila.filter((i) => i.conferida)
    return fila
  }, [fila, filtro])

  const atual = visivel.find((i) => i.cod === selecionada) ?? visivel[0]

  return (
    <main className="page">
      <Breadcrumb
        trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Análise Final') }]}
      />
      <PageHead
        titulo={t('Análise Final')}
        subtitulo={t(
          'Garimpo das visitas já certificadas que ainda têm erro ou atenção — a certificação não muda',
        )}
      />

      <div className="alert alert--info" style={{ marginBottom: 16 }}>
        <IconInfo />
        <span>
          Só entram visitas <strong>certificadas</strong> com erro ou atenção. O analista daqui
          confere o que foi liberado, lê a justificativa da certificação e marca o check. A visita
          continua certificada.
        </span>
      </div>

      <div className="fotos-filtros">
        {FILTROS.map((f) => {
          const n =
            f.id === 'todas'
              ? fila.length
              : f.id === 'pendente'
                ? fila.filter((i) => !i.conferida).length
                : fila.filter((i) => i.conferida).length
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
        <div className="empty">{t('Nenhuma visita neste recorte.')}</div>
      ) : (
        <div className="fotos-layout">
          <aside className="fotos-fila">
            {visivel.map((item) => (
              <button
                key={item.cod}
                type="button"
                className={`fotos-item${item.conferida ? ' fotos-item--ok' : ' fotos-item--pendente'}${atual?.cod === item.cod ? ' is-active' : ''}`}
                onClick={() => setSelecionada(item.cod)}
              >
                <div className="fotos-item__topo">
                  <span className="mono">#{item.cod}</span>
                  <span className={`fotos-status ${item.conferida ? 'fotos-status--ok' : 'fotos-status--pendente'}`}>
                    {item.conferida ? t('Conferida') : t('Pendente')}
                  </span>
                </div>
                <div className="fotos-item__pdr">{item.pdrNome}</div>
                <div className="fotos-item__meta">
                  {item.data} · {item.consultor} · {fmtNum(item.erros)} erro(s) · {fmtNum(item.atencoes)}{' '}
                  atenção(ões)
                </div>
              </button>
            ))}
          </aside>

          {atual && (
            <PainelFinal
              cod={atual.cod}
              onConferida={() => setAviso('Análise final marcada. A visita continua certificada.')}
            />
          )}
        </div>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}

function PainelFinal({ cod, onConferida }: { cod: number; onConferida: () => void }) {
  const t = useT()
  const visita = useVisita(cod)
  const carregando = useVisitaCarregando(cod)
  const [obs, setObs] = useState('')
  const [check, setCheck] = useState(false)

  if (carregando || !visita) {
    return (
      <section className="fotos-prova">
        <div className="fotos-prova__vazia">
          <IconLista size={36} />
          <span>Carregando visita {cod}…</span>
        </div>
      </section>
    )
  }

  const alertas = analisarVisita(visita)
  const { ativos, perdoados } = aplicarLiberacoes(alertas, visita.errosLiberados)
  const certMsg = [...visita.mensagens]
    .filter((m) => m.tipo === 'sistema' && /certificada/i.test(m.texto))
    .sort((a, b) => b.ts - a.ts)[0]
  const ja = visita.analiseFinal

  function confirmar() {
    if (!check || ja) return
    marcarAnaliseFinal(visita!.cod, obs)
    setCheck(false)
    setObs('')
    onConferida()
  }

  return (
    <section className="fotos-prova" style={{ alignContent: 'start' }}>
      <div className="fotos-prova__dados" style={{ gridColumn: '1 / -1' }}>
        <div className="fotos-prova__head">
          <h3>
            Visita {visita.cod}
            <span className={`fotos-status ${ja ? 'fotos-status--ok' : 'fotos-status--pendente'}`}>
              {ja ? t('Conferida') : t('Pendente')}
            </span>
          </h3>
          <Link className="btn btn--ghost btn--sm" to={`/visita/${visita.cod}`}>
            {t('Abrir visita')} {visita.cod} →
          </Link>
        </div>

        <dl className="fotos-kv">
          <div>
            <dt>{t('PDR')}</dt>
            <dd>{visita.pdr.nome}</dd>
          </div>
          <div>
            <dt>{t('Data')}</dt>
            <dd>{visita.data}</dd>
          </div>
          <div>
            <dt>{t('Inspetor')}</dt>
            <dd>{visita.consultor}</dd>
          </div>
          <div>
            <dt>{t('Situação')}</dt>
            <dd>Certificada</dd>
          </div>
        </dl>

        {certMsg && (
          <div className="alert alert--info" style={{ marginTop: 16 }}>
            <IconInfo />
            <span>
              <strong>{fmtDataHora(certMsg.ts)}.</strong> {certMsg.texto}
            </span>
          </div>
        )}

        {perdoados.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 className="bloco__titulo" style={{ margin: '0 0 8px' }}>
              Erros liberados na certificação ({perdoados.length})
            </h4>
            <ul className="fotos-checagens">
              {perdoados.map(({ alerta, liberacao }) => (
                <li key={alerta.id} className="fotos-checagem fotos-checagem--ok">
                  <div className="fotos-checagem__topo">
                    <strong>{alerta.regra}</strong>
                    <span>{liberacao.por}</span>
                  </div>
                  <p>{alerta.detalhe}</p>
                  <p>
                    <strong>Justificativa:</strong> {liberacao.justificativa}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ativos.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 className="bloco__titulo" style={{ margin: '0 0 8px' }}>
              Ainda visíveis na análise ({ativos.length})
            </h4>
            <ul className="fotos-checagens">
              {ativos.map((a) => (
                <li
                  key={a.id}
                  className={`fotos-checagem ${a.severidade === 'erro' ? 'fotos-checagem--div' : 'fotos-checagem--pendente'}`}
                >
                  <div className="fotos-checagem__topo">
                    <strong>{a.regra}</strong>
                    <span>{a.severidade === 'erro' ? 'ERRO' : 'ATENÇÃO'}</span>
                  </div>
                  <p>{a.detalhe}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ja ? (
          <div className="alert alert--info" style={{ marginTop: 20 }}>
            <IconInfo />
            <span>
              Conferida por <strong>{ja.por}</strong> em {fmtDataHora(ja.ts)}
              {ja.obs ? `. ${ja.obs}` : '.'}
            </span>
          </div>
        ) : (
          <div className="field" style={{ marginTop: 20 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={check} onChange={(e) => setCheck(e.target.checked)} />
              {t('Conferido — os pontos estão corretos')}
            </label>
            <label htmlFor="af-obs" style={{ marginTop: 12 }}>
              Observação (opcional)
            </label>
            <textarea
              id="af-obs"
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: conferi as justificativas da certificação e o romaneio bate."
            />
            <button
              className="btn btn--primary"
              type="button"
              style={{ marginTop: 12, width: 'fit-content' }}
              disabled={!check}
              onClick={confirmar}
            >
              {t('Marcar análise final')}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
