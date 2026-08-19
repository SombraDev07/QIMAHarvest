import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { IconDownload, IconInfo, IconRelatorios, IconVisitas } from '../components/icons'
import { useVersaoConsultas, useVisitas } from '../store'
import { situacaoPorId, SITUACOES } from '../data/mock'
import {
  COLUNAS_CARGA,
  COLUNAS_VISITA,
  relatorioCargas,
  relatorioVisitas,
  resumoRelatorio,
} from '../relatorios/planilhas'
import { dataComparavel, dataIsoComparavel, fmtDataHora, fmtNum } from '../format'
import type { SituacaoId } from '../types'
import { bancoAtivo } from '../backend/cliente'
import {
  baixarRelatorioSafra,
  consultarRelatoriosSafra,
  csvRelatorioCargas,
  csvRelatorioVisitas,
  dispararGeracaoSafra,
  resumoExportacao,
  type RelatorioSafra,
} from '../backend/consultas'

function baixarCsv(conteudo: string, nome: string) {
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
  gerando,
  rotuloBotao,
  desabilitado,
  onGerar,
}: {
  icone: ReactNode
  titulo: string
  descricao: string
  colunas: number
  linhas: number
  rotuloLinhas: string
  gerando?: boolean
  rotuloBotao?: string
  desabilitado?: boolean
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
        disabled={desabilitado || linhas === 0 || gerando}
        onClick={onGerar}
      >
        <IconDownload /> {gerando ? t('Gerando…') : (rotuloBotao ?? t('Gerar CSV'))}
      </button>
    </article>
  )
}

export default function Relatorios() {
  const todas = useVisitas()
  const versao = useVersaoConsultas()
  const t = useT()
  const [filtro, setFiltro] = useState<'Todas' | SituacaoId>('Todas')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [remoto, setRemoto] = useState<{ visitas: number; cargas: number } | null>(null)
  const [gerando, setGerando] = useState<'visitas' | 'cargas' | 'safra' | null>(null)
  const [safra, setSafra] = useState<RelatorioSafra[]>([])

  const semRecorte = filtro === 'Todas' && !de && !ate
  const usaSafraPronta = bancoAtivo() && semRecorte

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void resumoExportacao(de, ate, filtro)
      .then((r) => {
        if (viva) setRemoto(r)
      })
      .catch(() => {
        if (viva) setRemoto({ visitas: 0, cargas: 0 })
      })
    return () => {
      viva = false
    }
  }, [de, ate, filtro, versao])

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void consultarRelatoriosSafra()
      .then((r) => {
        if (viva) setSafra(r)
      })
      .catch(() => {
        if (viva) setSafra([])
      })
    return () => {
      viva = false
    }
  }, [versao, gerando])

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

  const resumoLocal = useMemo(() => resumoRelatorio(visitas), [visitas])
  const resumo = bancoAtivo() ? (remoto ?? { visitas: 0, cargas: 0 }) : resumoLocal
  const totalSistema = bancoAtivo() ? (remoto?.visitas ?? 0) : todas.length
  const metaVisitas = safra.find((s) => s.tipo === 'visitas')
  const metaCargas = safra.find((s) => s.tipo === 'cargas')

  const sufixo = [filtro === 'Todas' ? 'todas' : filtro, de || null, ate || null]
    .filter(Boolean)
    .join('_')

  async function gerar(tipo: 'visitas' | 'cargas') {
    setGerando(tipo)
    try {
      if (usaSafraPronta) {
        const csv = await baixarRelatorioSafra(tipo)
        if (!csv) throw new Error('Ainda não há arquivo da safra. Use “Atualizar agora”.')
        const n = tipo === 'visitas' ? (metaVisitas?.linhas ?? 0) : (metaCargas?.linhas ?? 0)
        baixarCsv(csv, `${tipo}-safra-${hoje()}.csv`)
        setAviso(`Relatório de ${fmtNum(n)} ${tipo === 'visitas' ? 'visita(s)' : 'carga(s)'} baixado.`)
        return
      }
      const csv = bancoAtivo()
        ? tipo === 'visitas'
          ? await csvRelatorioVisitas(de, ate, filtro)
          : await csvRelatorioCargas(de, ate, filtro)
        : tipo === 'visitas'
          ? relatorioVisitas(visitas)
          : relatorioCargas(visitas)
      const n = tipo === 'visitas' ? resumo.visitas : resumo.cargas
      baixarCsv(csv, `${tipo}-${sufixo}-${hoje()}.csv`)
      setAviso(`Relatório de ${fmtNum(n)} ${tipo === 'visitas' ? 'visita(s)' : 'carga(s)'} gerado.`)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível gerar o relatório.')
    } finally {
      setGerando(null)
    }
  }

  async function atualizarSafra() {
    setGerando('safra')
    try {
      await dispararGeracaoSafra()
      setAviso('Pedido enviado. O servidor monta os arquivos e libera o download.')
      const limite = Date.now() + 14 * 60 * 1000
      while (Date.now() < limite) {
        await new Promise((r) => setTimeout(r, 4000))
        const r = await consultarRelatoriosSafra()
        setSafra(r)
        if (r.length > 0 && r.every((s) => !s.gerando)) {
          if (r.some((s) => s.erro)) {
            setAviso(`Falha ao gerar: ${r.find((s) => s.erro)?.erro}`)
          } else {
            setAviso('Safra atualizada no servidor. Já pode baixar.')
          }
          return
        }
      }
      setAviso('Ainda gerando no servidor. Atualize a página em alguns minutos.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível atualizar a safra.')
    } finally {
      setGerando(null)
    }
  }

  const gerandoSafra = Boolean(metaVisitas?.gerando || metaCargas?.gerando || gerando === 'safra')

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Relatórios') }]} />
      <PageHead
        titulo={t("Relatórios")}
        subtitulo={t("Exportação das visitas e das cargas no mesmo formato que a importação lê")}
      />

      {bancoAtivo() && (
        <Panel
          numero="0"
          titulo={t('Safra atual')}
          hint={t('O Postgres gera os dois CSVs no início de cada hora')}
        >
          <div className="panel__body">
            <p className="cell-muted" style={{ margin: '0 0 12px' }}>
              {metaVisitas?.geradoEm
                ? `Última geração ${fmtDataHora(metaVisitas.geradoEm)} · ${fmtNum(metaVisitas.linhas)} visita(s) e ${fmtNum(metaCargas?.linhas ?? 0)} carga(s).`
                : 'Ainda não há arquivo. Clique em Atualizar agora (ou espere a virada da hora).'}
              {metaVisitas?.erro ? ` Falha: ${metaVisitas.erro}` : ''}
            </p>
            <button
              className="btn btn--ghost"
              type="button"
              disabled={gerandoSafra}
              onClick={() => void atualizarSafra()}
            >
              {gerandoSafra ? 'Gerando no servidor…' : 'Atualizar agora'}
            </button>
          </div>
        </Panel>
      )}

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
                ? `${fmtNum(totalSistema)} visita(s) no sistema — nenhum recorte aplicado.`
                : `${fmtNum(resumo.visitas)} visita(s) no recorte.`}
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
          linhas={usaSafraPronta ? (metaVisitas?.linhas ?? 0) : resumo.visitas}
          rotuloLinhas="visita(s)"
          gerando={gerando === 'visitas' || gerandoSafra}
          rotuloBotao={usaSafraPronta ? t('Baixar CSV') : t('Gerar CSV')}
          desabilitado={usaSafraPronta && (metaVisitas?.linhas ?? 0) === 0}
          onGerar={() => void gerar('visitas')}
        />

        <CardRelatorio
          icone={<IconRelatorios size={26} />}
          titulo={t("Relatório de cargas")}
          descricao="Uma linha por carga, vinculada à visita pelo código, com romaneio, pesos, classificação, produtor, placa e rateio."
          colunas={COLUNAS_CARGA.length}
          linhas={usaSafraPronta ? (metaCargas?.linhas ?? 0) : resumo.cargas}
          rotuloLinhas="carga(s)"
          gerando={gerando === 'cargas' || gerandoSafra}
          rotuloBotao={usaSafraPronta ? t('Baixar CSV') : t('Gerar CSV')}
          desabilitado={usaSafraPronta && (metaCargas?.linhas ?? 0) === 0}
          onGerar={() => void gerar('cargas')}
        />
      </div>

      <div className="alert alert--info" style={{ marginTop: 20 }}>
        <IconInfo />
        <span>
          Os dois arquivos saem com os mesmos cabeçalhos que a tela de{' '}
          <strong>Importar planilha</strong> espera, então o relatório volta para o sistema sem
          ajuste. Sem recorte, o download é o arquivo que o servidor atualiza a cada hora. Recorte
          de data ou situação ainda gera na hora.
        </span>
      </div>

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}
