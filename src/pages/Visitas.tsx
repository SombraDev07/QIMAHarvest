import { contarPorSituacao, useVisitas } from '../store'
import { useT } from '../i18n'
import { Breadcrumb, PageHead } from '../components/ui'
import FluxoVisitas from '../components/FluxoVisitas'
import BuscaVisita from '../components/BuscaVisita'
import { fmtKg, fmtNum, fmtPct } from '../format'

export default function Visitas() {
  const visitas = useVisitas()
  const t = useT()
  const total = visitas.length

  const emCorrecao =
    contarPorSituacao(visitas, 'central-correcao') +
    contarPorSituacao(visitas, 'operacao-correcao')
  const certificadas = contarPorSituacao(visitas, 'certificada')

  const cargas = visitas.flatMap((v) => v.cargas)
  const pesoLiquido = cargas.reduce((s, c) => s + c.pesoLiquido, 0)
  const rateadas = cargas.filter((c) => c.rateio).length

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Visitas') }]} />
      <PageHead
        titulo={t("Visitas")}
        subtitulo={t("Acompanhamento das visitas aos pontos de recebimento na safra 2025/2026")}
      />

      <BuscaVisita visitas={visitas} />

      <div className="kpi-strip">
        <div className="kpi">
          <div className="kpi__label">{t('Total de visitas')}</div>
          <div className="kpi__value">{fmtNum(total)}</div>
          <div className="kpi__sub">{t('safra 2025/2026')}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Taxa de certificação')}</div>
          <div className="kpi__value" style={{ color: 'var(--green)' }}>
            {fmtPct(total ? (certificadas / total) * 100 : 0)}
          </div>
          <div className="kpi__sub">{fmtNum(certificadas)} visitas certificadas</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Aguardando correção')}</div>
          <div className="kpi__value" style={{ color: 'var(--brand)' }}>
            {fmtNum(emCorrecao)}
          </div>
          <div className="kpi__sub">{t('central + operação')}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Cargas acompanhadas')}</div>
          <div className="kpi__value">{fmtNum(cargas.length)}</div>
          <div className="kpi__sub">{fmtNum(rateadas)} em rateio</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">{t('Volume líquido')}</div>
          <div className="kpi__value">{fmtKg(pesoLiquido)}</div>
          <div className="kpi__sub">{t('somatório dos romaneios')}</div>
        </div>
      </div>

      <FluxoVisitas total={total} visitas={visitas}
      />
    </main>
  )
}
