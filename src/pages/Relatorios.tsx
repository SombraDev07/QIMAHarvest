import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { IconDownload, IconInfo, IconRelatorios, IconVisitas } from '../components/icons'
import { useVisitas } from '../store'
import { situacaoPorId, SITUACOES } from '../data/mock'
import {
  COLUNAS_CARGA,
  COLUNAS_VISITA,
  relatorioCargas,
  relatorioVisitas,
  resumoRelatorio,
} from '../relatorios/planilhas'
import { dataComparavel, dataIsoComparavel, fmtNum } from '../format'
import type { SituacaoId } from '../types'

/** baixa o CSV com BOM, para o Excel abrir com acento certo */
function baixarCsv(conteudo: string, nome: string) {
  // BOM explícito por escape: o caractere literal no fonte é invisível e o lint acusa
  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

const hoje = () => new Date().toISOString().slice(0, 10)

function CardRelatorio({
  icone,
  titulo,
  descricao,
  colunas,
  linhas,
  rotuloLinhas,
  onGerar,
}: {
  icone: React.ReactNode
  titulo: string
  descricao: string
  colunas: number
  linhas: number
  rotuloLinhas: string
  onGerar: () => void
}) {
  const t = useT()
  return (
    <article className="relatorio-card">
      <div className="relatorio-card__icone">{icone}</div>
      <div className="relatorio-card__corpo">
        <h3 className="relatorio-card__titulo">{titulo}</h3>
        <p className="relatorio-card__desc">{descricao}</p>
        <div className="relatorio-card__numeros">
          <span>
            <strong>{fmtNum(linhas)}</strong> {rotuloLinhas}
          </span>
          <span>
            <strong>{colunas}</strong> {t('colunas')}
          </span>
        </div>
      </div>
      <button
        className="btn btn--primary"
        type="button"
        disabled={linhas === 0}
        onClick={onGerar}
      >
        <IconDownload /> {t('Gerar CSV')}
      </button>
    </article>
  )
}

export default function Relatorios() {
  const todas = useVisitas()
  const t = useT()
  const [filtro, setFiltro] = useState<'Todas' | SituacaoId>('Todas')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const visitas = useMemo(() => {
    const inicio = de ? dataIsoComparavel(de) : null
    const fim = ate ? dataIsoComparavel(ate) : null

    return todas.filter((v) => {
      if (filtro !== 'Todas' && v.situacao !== filtro) return false
      const dia = dataComparavel(v.data)
      if (inicio !== null && dia < inicio) return false
      if (fim !== null && dia > fim) return false
      return true
    })
  }, [todas, filtro, de, ate])

  const resumo = useMemo(() => resumoRelatorio(visitas), [visitas])
  const semRecorte = filtro === 'Todas' && !de && !ate

  /** nome do arquivo carrega o recorte, para não confundir dois downloads */
  const sufixo = [filtro === 'Todas' ? 'todas' : filtro, de || null, ate || null]
    .filter(Boolean)
    .join('_')

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Relatórios') }]} />
      <PageHead
        titulo={t("Relatórios")}
        subtitulo={t("Exportação das visitas e das cargas no mesmo formato que a importação lê")}
      />

      <Panel numero="1" titulo={t("Recorte")} hint={t("Vale para os dois relatórios")}>
        <div className="panel__body">
          <div className="filters__grid">
            <div className="field">
              <label htmlFor="rel-de">{t('Data da visita (de)')}</label>
              <input id="rel-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rel-ate">{t('Data da visita (até)')}</label>
              <input id="rel-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              <span className="field__hint">{t('Os dois dias entram no recorte.')}</span>
            </div>
            <div className="field">
              <label htmlFor="rel-situacao">{t('Situação da visita')}</label>
              <select
                id="rel-situacao"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value as 'Todas' | SituacaoId)}
              >
                <option value="Todas">{t('Todas as situações')}</option>
                {SITUACOES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.label)}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                {filtro === 'Todas' ? t('Todas as filas do fluxo.') : t(situacaoPorId(filtro).label)}
              </span>
            </div>
          </div>

          <div className="panel__body" style={{ padding: '10px 0 0' }}>
            <span className="cell-muted">
              {semRecorte
                ? `${fmtNum(todas.length)} visita(s) no sistema — nenhum recorte aplicado.`
                : `${fmtNum(visitas.length)} de ${fmtNum(todas.length)} visita(s) no recorte.`}
            </span>
            {!semRecorte && (
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                style={{ marginLeft: 12 }}
                onClick={() => {
                  setDe('')
                  setAte('')
                  setFiltro('Todas')
                }}
              >
                {t('Limpar recorte')}
              </button>
            )}
          </div>

        </div>
      </Panel>

      <div className="relatorio-grid">
        <CardRelatorio
          icone={<IconVisitas size={26} />}
          titulo={t("Relatório de visitas")}
          descricao="Uma linha por visita, com PDR, horários, respostas do formulário, acumulado da safra e os volumes do dia somados das cargas."
          colunas={COLUNAS_VISITA.length}
          linhas={resumo.visitas}
          rotuloLinhas="visita(s)"
          onGerar={() => {
            baixarCsv(relatorioVisitas(visitas), `visitas-${sufixo}-${hoje()}.csv`)
            setAviso(`Relatório de ${fmtNum(resumo.visitas)} visita(s) gerado.`)
          }}
        />

        <CardRelatorio
          icone={<IconRelatorios size={26} />}
          titulo={t("Relatório de cargas")}
          descricao="Uma linha por carga, vinculada à visita pelo código, com romaneio, pesos, classificação, produtor, placa e rateio."
          colunas={COLUNAS_CARGA.length}
          linhas={resumo.cargas}
          rotuloLinhas="carga(s)"
          onGerar={() => {
            baixarCsv(relatorioCargas(visitas), `cargas-${sufixo}-${hoje()}.csv`)
            setAviso(`Relatório de ${fmtNum(resumo.cargas)} carga(s) gerado.`)
          }}
        />
      </div>

      <div className="alert alert--info" style={{ marginTop: 20 }}>
        <IconInfo />
        <span>
          Os dois arquivos saem com os mesmos cabeçalhos que a tela de{' '}
          <strong>Importar planilha</strong> espera, então o relatório volta para o sistema sem
          ajuste. Três colunas saem em branco por não existirem no modelo: o bloco C e a
          divergência de reteste.
        </span>
      </div>

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}
