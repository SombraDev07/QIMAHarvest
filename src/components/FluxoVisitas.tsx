import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { situacaoPorId } from '../data/mock'
import type { SituacaoId } from '../types'
import { fmtNum, fmtPct } from '../format'
import type { FluxoQtd } from '../backend/consultas'

type Etapa = {
  chave: string
  situacao: SituacaoId
  rotulo: string
  descricao: string
  /** repetição da mesma fila numa segunda passagem do fluxo */
  repeticao?: boolean
  /** encerra o fluxo */
  saida?: boolean
}

/**
 * Fluxo de tratamento: os próprios cards de situação, ligados na ordem
 * em que a visita percorre as filas até ser cancelada ou certificada.
 */
const ETAPAS: Etapa[] = [
  {
    chave: 'c1',
    situacao: 'central-correcao',
    rotulo: 'Central Correção',
    descricao: 'Primeira triagem da Central de Informações',
  },
  {
    chave: 'o1',
    situacao: 'operacao-correcao',
    rotulo: 'Operação Correção',
    descricao: 'Devolvida ao time de operação em campo',
  },
  {
    chave: 'c2',
    situacao: 'central-correcao',
    rotulo: 'Central Correção',
    descricao: 'Reanálise após o retorno da operação',
    repeticao: true,
  },
  {
    chave: 'o2',
    situacao: 'operacao-correcao',
    rotulo: 'Operação Correção',
    descricao: 'Segunda devolução ao campo, se necessário',
    repeticao: true,
  },
  {
    chave: 'canc',
    situacao: 'cancelada',
    rotulo: 'Cancelada',
    descricao: 'Encerrada com justificativa, sem certificação',
    saida: true,
  },
  {
    chave: 'cert',
    situacao: 'certificada',
    rotulo: 'Certificada',
    descricao: 'Auditada e aprovada — fim do fluxo',
    saida: true,
  },
]

export default function FluxoVisitas({
  qtd,
  total,
}: {
  qtd: FluxoQtd
  total: number
}) {
  const t = useT()
  const quantidade = (e: Etapa) => qtd[e.chave as keyof FluxoQtd] ?? 0
  return (
    <section className="fluxo">
      <div className="fluxo__head">
        <span className="fluxo__titulo">{t('Fluxo de tratamento da visita')}</span>
        <span className="fluxo__hint">
          {t('A visita percorre as filas na ordem abaixo até ser cancelada ou certificada · clique em um card para abrir a lista')}
        </span>
      </div>

      <div className="fluxo__trilha">
        {ETAPAS.map((e, i) => {
          const s = situacaoPorId(e.situacao)
          const qtd = quantidade(e)
          const pct = total ? (qtd / total) * 100 : 0

          return (
            <div className="fluxo__no" key={e.chave}>
              {i > 0 && (
                <span
                  className={`fluxo__elo${e.saida ? ' fluxo__elo--saida' : ''}`}
                  aria-hidden="true"
                >
                  <i />
                </span>
              )}

              <Link
                to={`/visitas/${e.situacao}${e.repeticao ? '?rodada=2' : e.saida ? '' : '?rodada=1'}`}
                className={`fluxo-card${e.repeticao ? ' fluxo-card--rep' : ''}`}
                style={{ ['--c' as string]: s.color }}
              >
                <span className="fluxo-card__passo">
                  {e.saida ? t('saída') : `${t('etapa')} ${i + 1}`}
                </span>
                <span className="fluxo-card__titulo">
                  <i className="fluxo-card__dot" />
                  {t(e.rotulo)}
                  {e.repeticao && <b className="fluxo-card__rep">2ª</b>}
                </span>
                <span className="fluxo-card__desc">{t(e.descricao)}</span>

                <span className="fluxo-card__valor">
                  <b className="fluxo-card__num">{fmtNum(qtd)}</b>
                  <span className="fluxo-card__cta">{t('Abrir lista →')}</span>
                </span>

                <span className="fluxo-card__barra">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className="fluxo-card__rodape">
                  {e.repeticao
                    ? `${t('voltou da Operação')} · ${fmtPct(pct)}`
                    : `${fmtPct(pct)}`}
                </span>
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
