import { useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Breadcrumb, Modal, PageHead, Panel, Toast } from '../components/ui'
import { IconAlerta, IconDownload, IconEditar, IconPlanilha, IconUpload } from '../components/icons'
import {
  analisarCorrecaoAcumulado,
  analisarCorrecaoCargas,
  analisarCorrecaoDiaAnterior,
  conferirAcumulado,
  conferirCargas,
  conferirDiaAnterior,
  MODELO_CORRECAO_ACUMULADO,
  MODELO_CORRECAO_CARGAS,
  MODELO_CORRECAO_DIA_ANTERIOR,
  rotuloPatchCarga,
  rotuloPatchVolumes,
  type LinhaCorrecao,
  type PatchCarga,
  type PatchVolumes,
} from '../importacao/correcao'
import { aplicarCorrecoesEmMassa, useVisitas } from '../store'
import { analisarVisita } from '../analise'

async function textoDoArquivo(file: File): Promise<string> {
  if (!/\.xlsx?$/i.test(file.name)) return file.text()
  const [XLSX, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' })
}

function baixarCsv(conteudo: string, nome: string) {
  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

function CaixaArquivo({
  titulo,
  descricao,
  nome,
  modelo,
  nomeModelo,
  onArquivo,
}: {
  titulo: string
  descricao: string
  nome: string
  modelo: string
  nomeModelo: string
  onArquivo: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const t = useT()
  return (
    <div className="importar-caixa">
      <div className="importar-caixa__topo">
        <IconPlanilha />
        <div>
          <div className="cell-strong">{titulo}</div>
          <div className="cell-muted">{descricao}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => baixarCsv(modelo, nomeModelo)}>
          <IconDownload /> {t('Baixar modelo')}
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => ref.current?.click()}>
          <IconUpload /> {t('Escolher arquivo')}
        </button>
      </div>
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

function TabelaPreview<T>({
  linhas,
  colunas,
}: {
  linhas: LinhaCorrecao<T>[]
  colunas: { rotulo: string; valor: (l: LinhaCorrecao<T>) => string }[]
}) {
  if (linhas.length === 0) return null
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Linha</th>
            {colunas.map((c) => (
              <th key={c.rotulo}>{c.rotulo}</th>
            ))}
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.linha} className={l.erros.length ? 'row-erro' : undefined}>
              <td className="mono">{l.linha}</td>
              {colunas.map((c) => (
                <td key={c.rotulo}>{c.valor(l)}</td>
              ))}
              <td>
                {l.erros.length ? (
                  <span className="tag-problema tag-problema--erro">{l.erros.join(' · ')}</span>
                ) : (
                  <span className="cell-muted">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CorrigirVisitas() {
  const t = useT()
  const visitas = useVisitas()
  const [textoCargas, setTextoCargas] = useState('')
  const [textoDia, setTextoDia] = useState('')
  const [textoAcumulado, setTextoAcumulado] = useState('')
  const [nomeCargas, setNomeCargas] = useState('')
  const [nomeDia, setNomeDia] = useState('')
  const [nomeAcumulado, setNomeAcumulado] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargas = useMemo(
    () => (textoCargas ? conferirCargas(analisarCorrecaoCargas(textoCargas), visitas) : []),
    [textoCargas, visitas],
  )
  const dias = useMemo(
    () =>
      textoDia ? conferirDiaAnterior(analisarCorrecaoDiaAnterior(textoDia), visitas) : [],
    [textoDia, visitas],
  )
  const acumulados = useMemo(
    () =>
      textoAcumulado ? conferirAcumulado(analisarCorrecaoAcumulado(textoAcumulado), visitas) : [],
    [textoAcumulado, visitas],
  )

  const cargasOk = cargas.filter(
    (l): l is LinhaCorrecao<PatchCarga> & { patch: PatchCarga } => !!l.patch && l.erros.length === 0,
  )
  const diasOk = dias.filter(
    (l): l is LinhaCorrecao<PatchVolumes> & { patch: PatchVolumes } =>
      !!l.patch && l.erros.length === 0,
  )
  const acumuladosOk = acumulados.filter(
    (l): l is LinhaCorrecao<PatchVolumes> & { patch: PatchVolumes } =>
      !!l.patch && l.erros.length === 0,
  )
  const totalOk = cargasOk.length + diasOk.length + acumuladosOk.length
  const totalErro =
    cargas.filter((l) => l.erros.length).length +
    dias.filter((l) => l.erros.length).length +
    acumulados.filter((l) => l.erros.length).length

  const recusadas = [
    ...cargas.filter((l) => l.erros.length).map((l) => ({
      origem: t('Cargas'),
      linha: l.linha,
      chave: l.patch?.id ?? '—',
      erros: l.erros,
    })),
    ...dias.filter((l) => l.erros.length).map((l) => ({
      origem: t('Dia anterior'),
      linha: l.linha,
      chave: l.patch ? `${l.patch.cod} · ${l.patch.dia}` : '—',
      erros: l.erros,
    })),
    ...acumulados.filter((l) => l.erros.length).map((l) => ({
      origem: t('Acumulado'),
      linha: l.linha,
      chave: l.patch ? `${l.patch.cod} · ${l.patch.dia}` : '—',
      erros: l.erros,
    })),
  ]

  async function carregar(f: File, destino: 'cargas' | 'dia' | 'acumulado') {
    const texto = await textoDoArquivo(f)
    if (destino === 'cargas') {
      setNomeCargas(f.name)
      setTextoCargas(texto)
    } else if (destino === 'dia') {
      setNomeDia(f.name)
      setTextoDia(texto)
    } else {
      setNomeAcumulado(f.name)
      setTextoAcumulado(texto)
    }
  }

  function aplicar() {
    const r = aplicarCorrecoesEmMassa(
      {
        cargas: cargasOk.map((l) => l.patch),
        diasAnteriores: diasOk.map((l) => l.patch),
        acumulados: acumuladosOk.map((l) => l.patch),
      },
      {
        arquivos: {
          cargas: nomeCargas || undefined,
          diaAnterior: nomeDia || undefined,
          acumulado: nomeAcumulado || undefined,
        },
        alertasDe: (v) =>
          analisarVisita(v)
            .filter((a) => a.severidade === 'erro')
            .map((a) => ({ id: a.id, regra: a.regra, detalhe: a.detalhe })),
      },
    )
    setConfirmando(false)
    const reabertas =
      r.reabertas.length > 0
        ? ` ${r.reabertas.length} visita(s) voltaram à Central de Correção (1ª passagem).`
        : ''
    setAviso(
      `${r.cargas} carga(s), ${r.diasAnteriores} dia(s) anterior(es) e ${r.acumulados} acumulado(s) atualizados.${reabertas}`,
    )
  }

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: t('Início'), to: '/visitas' },
          { label: t('Administração'), to: '/administracao' },
          { label: t('Corrigir em lote') },
        ]}
      />
      <PageHead
        titulo={t('Corrigir visitas em lote')}
        subtitulo={t('Atualiza cargas, dia anterior e acumulado que já existem — não cria visita nova')}
      />

      <div className="alert alert--lock" style={{ marginBottom: 20 }}>
        <IconAlerta size={14} />
        <span>
          Célula vazia <strong>não altera</strong> o campo. A carga casa pelo <strong>ID</strong>;
          dia anterior e acumulado casam por <strong>Visit ID + dia</strong>. No acumulado o dia
          precisa ser o da visita. Use “Não informado” para zerar produtor, romaneio ou peso.
        </span>
      </div>

      <Panel numero="1" titulo={t('Arquivos')} hint={t('Aceita .csv, .txt e .xlsx')}>
        <div className="panel__body importar-arquivos">
          <CaixaArquivo
            titulo={t('Cargas')}
            descricao={t('ID da carga · produtor, romaneio, pesos, tecnologia, data e hora')}
            nome={nomeCargas}
            modelo={MODELO_CORRECAO_CARGAS}
            nomeModelo="modelo-correcao-cargas.csv"
            onArquivo={(f) => carregar(f, 'cargas')}
          />
          <CaixaArquivo
            titulo={t('Dia anterior')}
            descricao={t('Visit ID + dia · negativa, declarada, positiva, participante')}
            nome={nomeDia}
            modelo={MODELO_CORRECAO_DIA_ANTERIOR}
            nomeModelo="modelo-correcao-dia-anterior.csv"
            onArquivo={(f) => carregar(f, 'dia')}
          />
          <CaixaArquivo
            titulo={t('Acumulado')}
            descricao={t('Visit ID + dia da visita · volumes por tecnologia')}
            nome={nomeAcumulado}
            modelo={MODELO_CORRECAO_ACUMULADO}
            nomeModelo="modelo-correcao-acumulado.csv"
            onArquivo={(f) => carregar(f, 'acumulado')}
          />
        </div>
      </Panel>

      {(cargas.length > 0 || dias.length > 0 || acumulados.length > 0) && (
        <Panel numero="2" titulo={t('Conferência')} hint={t('O que será gravado, e o que foi recusado')}>
          <div className="resumo-strip">
            <div className="resumo-item">
              <span className="resumo-item__label">{t('Linhas válidas')}</span>
              <span className="resumo-item__valor">{totalOk}</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-item__label">{t('Linhas com erro')}</span>
              <span className="resumo-item__valor" style={{ color: 'var(--brand)' }}>
                {totalErro}
              </span>
            </div>
          </div>

          {recusadas.length > 0 && (
            <div className="panel__body">
              <div className="alert alert--lock">
                <IconAlerta size={14} />
                <span>
                  <strong>
                    {recusadas.length} {t('linha(s) não vão subir')}
                  </strong>
                  {t(' — confira os erros abaixo. Só as linhas válidas serão gravadas.')}
                </span>
              </div>
              <ul className="lista-recusa">
                {recusadas.map((r) => (
                  <li key={`${r.origem}-${r.linha}`}>
                    <span className="cell-strong">
                      {r.origem} · {t('Linha')} {r.linha}
                    </span>
                    <span className="mono"> {r.chave}</span>
                    <div className="cell-muted">{r.erros.join(' · ')}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cargas.length > 0 && (
            <>
              <div className="panel__body">
                <div className="cell-strong">{t('Cargas')}</div>
              </div>
              <TabelaPreview
                linhas={cargas}
                colunas={[
                  { rotulo: 'ID', valor: (l) => l.patch?.id ?? '—' },
                  { rotulo: 'Visita', valor: (l) => (l.visitaCod ? `#${l.visitaCod}` : '—') },
                  { rotulo: 'Campos', valor: (l) => (l.patch ? rotuloPatchCarga(l.patch) : '—') },
                ]}
              />
            </>
          )}

          {dias.length > 0 && (
            <>
              <div className="panel__body">
                <div className="cell-strong">{t('Dia anterior')}</div>
              </div>
              <TabelaPreview
                linhas={dias}
                colunas={[
                  { rotulo: 'Visit ID', valor: (l) => String(l.patch?.cod ?? '—') },
                  { rotulo: 'Dia', valor: (l) => l.patch?.dia ?? '—' },
                  { rotulo: 'Volumes', valor: (l) => (l.patch ? rotuloPatchVolumes(l.patch) : '—') },
                ]}
              />
            </>
          )}

          {acumulados.length > 0 && (
            <>
              <div className="panel__body">
                <div className="cell-strong">{t('Acumulado')}</div>
              </div>
              <TabelaPreview
                linhas={acumulados}
                colunas={[
                  { rotulo: 'Visit ID', valor: (l) => String(l.patch?.cod ?? '—') },
                  { rotulo: 'Dia', valor: (l) => l.patch?.dia ?? '—' },
                  { rotulo: 'Volumes', valor: (l) => (l.patch ? rotuloPatchVolumes(l.patch) : '—') },
                ]}
              />
            </>
          )}

          <div className="panel__body" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn--primary"
              type="button"
              disabled={totalOk === 0}
              onClick={() => setConfirmando(true)}
            >
              <IconEditar /> {t('Aplicar correções')} ({totalOk})
            </button>
          </div>
        </Panel>
      )}

      {confirmando && (
        <Modal
          titulo={t('Aplicar correções')}
          subtitulo={t('Só as linhas válidas serão gravadas. Linhas com erro ficam de fora.')}
          onClose={() => setConfirmando(false)}
          rodape={
            <>
              <button className="btn btn--ghost" type="button" onClick={() => setConfirmando(false)}>
                {t('Cancelar')}
              </button>
              <button className="btn btn--primary" type="button" onClick={aplicar}>
                {t('Aplicar')} {totalOk} {t('linha(s)')}
              </button>
            </>
          }
        >
          <p>
            {cargasOk.length} {t('carga(s)')}, {diasOk.length} {t('dia(s) anterior(es)')},{' '}
            {acumuladosOk.length} {t('acumulado(s)')}.
            {recusadas.length > 0 && (
              <>
                {' '}
                {recusadas.length} {t('linha(s) não vão subir')}.
              </>
            )}
          </p>
        </Modal>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}
