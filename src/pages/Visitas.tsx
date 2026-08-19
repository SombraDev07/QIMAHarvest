import { useT } from '../i18n'
import { Breadcrumb, PageHead } from '../components/ui'
import FluxoVisitas from '../components/FluxoVisitas'
import BuscaVisita from '../components/BuscaVisita'
import { fmtKg, fmtNum, fmtPct } from '../format'
import { useFluxoContagens, useKpiSafra } from '../painel'

export default function Visitas() {
  const kpi = useKpiSafra()
  const fluxo = useFluxoContagens()
  const t = useT()
  const total = kpi.total

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Visitas') }]} />
      <PageHead
        titulo={t("Visitas")}
        subtitulo={t("Acompanhamento das visitas aos pontos de recebimento na safra 2025/2026")}
      />

      <BuscaVisita />

      <div className="kpi-strip">
        <div className="kpi">
          <div className="kpi__label">{t('Total de visitas')}</div>
          <div className="kpi__value">{fmtNum(total)}</div>
          <div className="kpi__sub">{t('safra 2025/2026')}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Taxa de certificação')}</div>
          <div className="kpi__value" style={{ color: 'var(--green)' }}>
            {fmtPct(total ? (kpi.certificadas / total) * 100 : 0)}
          </div>
          <div className="kpi__sub">{fmtNum(kpi.certificadas)} visitas certificadas</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Aguardando correção')}</div>
          <div className="kpi__value" style={{ color: 'var(--brand)' }}>
            {fmtNum(kpi.emCorrecao)}
          </div>
          <div className="kpi__sub">{t('central + operação')}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Cargas acompanhadas')}</div>
          <div className="kpi__value">{fmtNum(kpi.acompanhadas)}</div>
          <div className="kpi__sub">{fmtNum(kpi.rateadas)} em rateio</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Volume líquido')}</div>
          <div className="kpi__value">{fmtKg(kpi.volumeKg)}</div>
          <div className="kpi__sub">{t('somatório dos romaneios')}</div>
        </div>
      </div>

      <FluxoVisitas total={fluxo.total} qtd={fluxo.qtd} />
    </main>
  )
}
