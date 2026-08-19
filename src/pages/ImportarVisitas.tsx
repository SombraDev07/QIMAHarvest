import { useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useNavigate } from 'react-router-dom'
import { Breadcrumb, Modal, PageHead, Panel, Toast } from '../components/ui'
import { IconAlerta, IconInfo, IconLixeira, IconPlanilha, IconUpload } from '../components/icons'
import {
  agruparCargas,
  analisarPlanilhaCargas,
  analisarPlanilhaVisitas,
  type CargaImportada,
  type VisitaImportada,
} from '../importacao/planilhaVisitas'
import { limparVisitas, substituirVisitas } from '../store'
import { analisarVisita } from '../analise'
import { fmtKg } from '../format'
import { useKpiSafra } from '../painel'

/** lê .csv/.txt direto e .xlsx pela lib, que entra só quando é preciso */
async function textoDoArquivo(file: File): Promise<string> {
  if (!/\.xlsx?$/i.test(file.name)) return file.text()
  const [XLSX, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' })
}

function CaixaArquivo({
  titulo,
  descricao,
  nome,
  onArquivo,
}: {
  titulo: string
  descricao: string
  nome: string
  onArquivo: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="importar-caixa">
      <div className="importar-caixa__topo">
        <IconPlanilha />
        <div>
          <div className="cell-strong">{titulo}</div>
          <div className="cell-muted">{descricao}</div>
        </div>
      </div>
      <button className="btn btn--ghost btn--sm" type="button" onClick={() => ref.current?.click()}>
        <IconUpload /> Escolher arquivo
      </button>
      <input
        ref={ref}
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onArquivo(f)
        }}
      />
      {nome && <span className="cell-muted mono">{nome}</span>}
    </div>
  )
}

export default function ImportarVisitas() {
  const navegar = useNavigate()
  const kpi = useKpiSafra()
  const t = useT()
  const [textoVisitas, setTextoVisitas] = useState('')
  const [textoCargas, setTextoCargas] = useState('')
  const [nomeVisitas, setNomeVisitas] = useState('')
  const [nomeCargas, setNomeCargas] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [zerando, setZerando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null)

  const cargas: CargaImportada[] = useMemo(
    () => (textoCargas ? analisarPlanilhaCargas(textoCargas) : []),
    [textoCargas],
  )

  const visitas: VisitaImportada[] = useMemo(
    () => (textoVisitas ? analisarPlanilhaVisitas(textoVisitas, agruparCargas(cargas)) : []),
    [textoVisitas, cargas],
  )

  const visitasOk = visitas.filter((v) => v.visita)
  const visitasComErro = visitas.filter((v) => v.erros.length > 0)
  const cargasComErro = cargas.filter((c) => c.erros.length > 0)

  /** carga cujo ID de visita não existe na outra planilha fica órfã */
  const codsValidos = new Set(visitasOk.map((v) => v.cod))
  const cargasOrfas = cargas.filter((c) => c.carga && !codsValidos.has(c.codVisita))

  /** prévia do que a análise vai dizer, antes de gravar */
  const previa = useMemo(() => {
    let comErro = 0
    let semErro = 0
    for (const v of visitas) {
      if (!v.visita) continue
      const erros = analisarVisita(v.visita).filter((a) => a.severidade === 'erro').length
      if (erros > 0) comErro++
      else semErro++
    }
    return { comErro, semErro }
  }, [visitas])

  const totalCargasVinculadas = visitasOk.reduce((s, v) => s + v.cargas, 0)
  const noSistema = kpi.total
  const ocupado = Boolean(progresso)

  async function importar() {
    setProgresso({ feitos: 0, total: visitasOk.length })
    try {
      const r = await substituirVisitas(
        visitasOk.map((v) => v.visita!),
        (v) => analisarVisita(v).filter((a) => a.severidade === 'erro').length,
        (feitos, total) => setProgresso({ feitos, total }),
      )
      setConfirmando(false)
      setAviso(
        `${visitasOk.length} visita(s) importada(s): ${r.certificadas} certificada(s) e ${r.paraCorrecao} para a Central de Correção.`,
      )
      setTimeout(() => navegar('/visitas'), 1200)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Falha ao importar.')
    } finally {
      setProgresso(null)
    }
  }

  async function carregar(f: File, destino: 'visitas' | 'cargas') {
    const texto = await textoDoArquivo(f)
    if (destino === 'visitas') {
      setNomeVisitas(f.name)
      setTextoVisitas(texto)
    } else {
      setNomeCargas(f.name)
      setTextoCargas(texto)
    }
  }

  return (
    <main className="page">
      <Breadcrumb
        trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Importar planilha') }]}
      />
      <PageHead
        titulo={t("Importar visitas em lote")}
        subtitulo={t("Planilha de visitas e planilha de cargas — as duas se ligam pelo código da visita")}
        acoes={
          <button
            className="btn btn--ghost"
            type="button"
            disabled={noSistema === 0 || ocupado}
            onClick={() => setZerando(true)}
          >
            <IconLixeira /> Zerar visitas ({noSistema})
          </button>
        }
      />

      <div className="alert alert--lock" style={{ marginBottom: 20 }}>
        <IconAlerta size={14} />
        <span>
          A importação <strong>substitui todas as visitas</strong> que estão no sistema hoje. A
          base de demonstração some e ficam só as visitas da planilha.
        </span>
      </div>

      <Panel numero="1" titulo={t("Arquivos")} hint={t("Aceita .csv, .txt e .xlsx")}>
        <div className="panel__body importar-arquivos">
          <CaixaArquivo
            titulo={t("Planilha de visitas")}
            descricao="Uma linha por visita, com Visit ID, PDR, datas e volumes"
            nome={nomeVisitas}
            onArquivo={(f) => carregar(f, 'visitas')}
          />
          <CaixaArquivo
            titulo={t("Planilha de cargas")}
            descricao="Uma linha por carga, vinculada pelo ID Visita"
            nome={nomeCargas}
            onArquivo={(f) => carregar(f, 'cargas')}
          />
        </div>
      </Panel>

      {visitas.length > 0 && (
        <>
          <Panel numero="2" titulo={t("Conferência")} hint={t("O que será gravado, e o que foi recusado")}>
            <div className="resumo-strip">
              <div className="resumo-item">
                <span className="resumo-item__label">{t('Visitas válidas')}</span>
                <span className="resumo-item__valor">{visitasOk.length}</span>
              </div>
              <div className="resumo-item">
                <span className="resumo-item__label">{t('Visitas com erro')}</span>
                <span className="resumo-item__valor" style={{ color: 'var(--brand)' }}>
                  {visitasComErro.length}
                </span>
              </div>
              <div className="resumo-item">
                <span className="resumo-item__label">{t('Cargas vinculadas')}</span>
                <span className="resumo-item__valor">{totalCargasVinculadas}</span>
              </div>
              <div className="resumo-item">
                <span className="resumo-item__label">{t('Cargas com erro')}</span>
                <span className="resumo-item__valor" style={{ color: 'var(--brand)' }}>
                  {cargasComErro.length}
                </span>
              </div>
              <div className="resumo-item">
                <span className="resumo-item__label">{t('Cargas órfãs')}</span>
                <span className="resumo-item__valor">{cargasOrfas.length}</span>
              </div>
            </div>

            <div className="panel__body">
              <div className="alert alert--info">
                <IconInfo />
                <span>
                  Pela análise, <strong>{previa.semErro}</strong> visita(s) entrariam já
                  certificadas e <strong>{previa.comErro}</strong> iriam para a Central de
                  Correção. A situação da planilha é ignorada — quem decide é a análise.
                </span>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Visit ID</th>
                    <th>PDR</th>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Cargas</th>
                    <th style={{ textAlign: 'right' }}>Acumulado</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {visitas.map((v) => {
                    const total = v.visita
                      ? Object.values(v.visita.acumulado.valores).reduce((s, n) => s + n, 0)
                      : 0
                    return (
                      <tr key={v.linha} className={v.erros.length ? 'row-erro' : undefined}>
                        <td className="mono">{v.linha}</td>
                        <td className="mono">{v.cod || '—'}</td>
                        <td className="cell-strong">{v.visita?.pdr.nome ?? '—'}</td>
                        <td className="mono">{v.visita?.data ?? '—'}</td>
                        <td className="num">{v.cargas}</td>
                        <td className="num">{v.visita ? fmtKg(total) : '—'}</td>
                        <td>
                          {v.erros.length ? (
                            <span className="tag-problema tag-problema--erro">{v.erros[0]}</span>
                          ) : (
                            <span className="cell-muted">OK</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {(cargasComErro.length > 0 || cargasOrfas.length > 0) && (
            <Panel
              numero="3"
              titulo="Cargas recusadas"
              hint="Estas linhas não entram; a visita entra sem elas"
            >
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>ID Visita</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargasComErro.map((c) => (
                      <tr key={`e-${c.linha}`} className="row-erro">
                        <td className="mono">{c.linha}</td>
                        <td className="mono">{c.codVisita || '—'}</td>
                        <td>
                          <span className="tag-problema tag-problema--erro">{c.erros[0]}</span>
                        </td>
                      </tr>
                    ))}
                    {cargasOrfas.map((c) => (
                      <tr key={`o-${c.linha}`}>
                        <td className="mono">{c.linha}</td>
                        <td className="mono">{c.codVisita}</td>
                        <td>
                          <span className="cell-muted">
                            Nenhuma visita válida com este ID na outra planilha.
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              className="btn btn--primary"
              type="button"
              disabled={visitasOk.length === 0 || ocupado}
              onClick={() => setConfirmando(true)}
            >
              {ocupado
                ? `Gravando ${progresso?.feitos ?? 0} de ${progresso?.total ?? 0}…`
                : `Substituir a base por ${visitasOk.length} visita(s)`}
            </button>
          </div>
        </>
      )}

      {confirmando && (
        <Modal
          titulo={t("Substituir todas as visitas")}
          onClose={() => setConfirmando(false)}
          rodape={
            <>
              <span className="spacer" />
              <button className="btn btn--ghost" type="button" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
              <button
                className="btn btn--primary"
                type="button"
                disabled={ocupado}
                onClick={() => void importar()}
              >
                {ocupado ? 'Gravando…' : 'Substituir definitivamente'}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            As visitas atuais do sistema serão descartadas e substituídas por{' '}
            <strong>{visitasOk.length}</strong> visita(s) da planilha, com{' '}
            <strong>{totalCargasVinculadas}</strong> carga(s).
          </p>
          <div className="alert alert--info" style={{ marginTop: 14 }}>
            Para voltar à base de demonstração depois, use{' '}
            <strong>Administração → Restaurar dados originais</strong>.
          </div>
        </Modal>
      )}

      {zerando && (
        <Modal
          titulo={t("Zerar visitas do sistema")}
          onClose={() => setZerando(false)}
          rodape={
            <>
              <span className="spacer" />
              <button className="btn btn--ghost" type="button" onClick={() => setZerando(false)}>
                Cancelar
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  const quantas = noSistema
                  void limparVisitas().then(() => {
                    setZerando(false)
                    setAviso(`${quantas} visita(s) removida(s). O sistema está sem visitas.`)
                  })
                }}
              >
                Zerar definitivamente
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            As <strong>{noSistema}</strong> visita(s) do sistema serão removidas e a
            tela de Visitas fica vazia. Serve para você importar num sistema limpo e ver
            exatamente onde cada visita da planilha vai parar.
          </p>
          <div className="alert alert--info" style={{ marginTop: 14 }}>
            Cadastros de PDR, usuários e parâmetros não são afetados. Para trazer a base de
            demonstração de volta, use <strong>Administração → Restaurar dados originais</strong>.
          </div>
        </Modal>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}
