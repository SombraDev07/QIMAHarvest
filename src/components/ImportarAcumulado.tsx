import { useRef, useState } from 'react'
import { Modal } from './ui'
import { IconAlerta, IconDownload, IconLixeira, IconPlanilha } from './icons'
import type {
  AcumuladoImportado,
  Classificacao,
  DetalheAcumuladoImportado,
  SeveridadeAcumulado,
} from '../types'
import {
  obterUsuarioLogado,
  acumuladoJaExiste,
  importarAcumulado,
  municipiosDoCnpj,
  registrarRelatorioImportacao,
  ultimoAcumuladoImportado,
  useVisita,
} from '../store'
import { situacaoPorId } from '../data/mock'
import { fmtKg } from '../format'

const COLUNAS = [
  'Nome PDR',
  'cpf/cnpj',
  'UF',
  'Município',
  'dt_lancamento',
  'kg_testada_negativa_acumulado',
  'kg_declarada_acumulado',
  'kg_positiva_acumulado',
  'kg_participante_acumulado',
]

const MODELO = [
  COLUNAS.join(';'),
  'PDR ALEGRETE;02.595.222/0005-53;RS;ALEGRETE;24/04/2026;15000;12000;45000;8000',
  'PDR ROSARIO DO SUL I;88.879.473/0001-51;RS;ROSARIO DO SUL;24/04/2026;22000;18000;55000;12000',
].join('\r\n')

/** limites que definem a severidade de um aumento vs. o acumulado anterior */
const LIMITE_ALERTA = 0.3
const LIMITE_VERMELHO = 0.5

const SEVERIDADE_INFO: Record<SeveridadeAcumulado, { label: string; cor: string; desc: string }> = {
  sucesso: { label: 'Sucesso', cor: '#0e8f6c', desc: 'Acumulado maior que o anterior' },
  alerta: { label: 'Alerta', cor: '#c2410c', desc: 'Repetido, 2+ municípios para o CNPJ, ou aumento entre 30% e 50%' },
  vermelho: { label: 'Vermelho', cor: '#dc2626', desc: 'Abaixo do anterior, ou aumento acima de 50%' },
}

function limpar(v: unknown): string {
  return String(v ?? '').trim().replace(/^"|"$/g, '')
}

function limparCnpj(v: string): string {
  return v.replace(/[^\d./-]/g, '')
}

function numero(v: unknown): number {
  const s = limpar(v).replace(/\s/g, '')
  if (!s) return 0
  const n = s.includes(',') && s.includes('.')
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : Number(s.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : 0
}

function parseData(valor: unknown): string {
  if (typeof valor === 'number') {
    const d = new Date((valor - 25569) * 86400000)
    if (isNaN(d.getTime())) return limpar(valor)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  const s = limpar(valor)
  const num = Number(s)
  if (Number.isFinite(num) && num > 20000 && num < 80000 && !s.includes('/') && !s.includes('-')) {
    const d = new Date((num - 25569) * 86400000)
    if (!isNaN(d.getTime())) {
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    }
  }
  return s
}

function lerArquivo(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * A biblioteca de planilha é grande e só serve aqui, então entra por import
 * dinâmico: quem nunca importa um .xlsx não paga o download dela.
 */
async function parseXlsx(file: File): Promise<Record<string, unknown>[]> {
  const [XLSX, buffer] = await Promise.all([import('xlsx'), lerArquivo(file)])
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
}

function parseCsv(texto: string): Record<string, unknown>[] {
  const sep = texto.includes(';') ? ';' : texto.includes('\t') ? '\t' : ','
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (linhas.length === 0) return []

  const cab = linhas[0].split(sep).map((c) => limpar(c).toLowerCase())
  const temCabecalho = cab.some((c) => c.includes('pdr') || c.includes('cnpj') || c.includes('lancamento'))
  const dados = temCabecalho ? linhas.slice(1) : linhas

  return dados.map((linha) => {
    const cols = linha.split(sep)
    const obj: Record<string, unknown> = {}
    if (temCabecalho) {
      cab.forEach((c, i) => { obj[c] = cols[i] })
    } else {
      obj['Nome PDR'] = cols[0]
      obj['cpf/cnpj'] = cols[1]
      obj['UF'] = cols[2]
      obj['Município'] = cols[3]
      obj['dt_lancamento'] = cols[4]
      obj['kg_testada_negativa_acumulado'] = cols[5]
      obj['kg_declarada_acumulado'] = cols[6]
      obj['kg_positiva_acumulado'] = cols[7]
      obj['kg_participante_acumulado'] = cols[8]
    }
    return obj
  })
}

type LinhaPreview = {
  indice: number
  item: AcumuladoImportado | null
  erro?: string
  jaExiste?: boolean
  municipiosConflito?: string[]
  ultimoValor?: { data: string; valores: Record<Classificacao, number> }
  comparacao?: 'acima' | 'abaixo' | 'igual' | 'novo'
  /** maior variação percentual entre as 4 classificações vs. o acumulado anterior */
  variacaoMax?: number
  severidade?: SeveridadeAcumulado
}

/** frase curta explicando por que a linha caiu em cada severidade */
function motivoDaLinha(l: LinhaPreview): string {
  const variacaoPct = Math.round((l.variacaoMax ?? 0) * 100)
  if (l.comparacao === 'abaixo') return 'Valor menor que o acumulado anterior'
  if ((l.variacaoMax ?? 0) > LIMITE_VERMELHO) return `Valor muito alto — aumento de ${variacaoPct}% vs. anterior`
  if (l.jaExiste) return 'Registro já existente — será substituído'
  if (l.municipiosConflito) return `Município "${l.item?.municipio}" divergente dos já registrados para este CNPJ`
  if ((l.variacaoMax ?? 0) > LIMITE_ALERTA) return `Aumento de ${variacaoPct}% vs. anterior`
  if (l.comparacao === 'novo') return 'Primeiro lançamento para este CNPJ'
  return 'Acumulado maior que o anterior'
}

async function analisarArquivo(arquivo: File): Promise<LinhaPreview[]> {
  const nome = arquivo.name.toLowerCase()
  let rows: Record<string, unknown>[]

  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    rows = await parseXlsx(arquivo)
  } else {
    const texto = await arquivo.text()
    rows = parseCsv(texto)
  }

  return rows.map((row, i): LinhaPreview => {
    const nomePdr = limpar(row['nome pdr'] ?? row['Nome PDR'] ?? row['NOME PDR'] ?? '')
    const cnpj = limparCnpj(limpar(row['cpf/cnpj'] ?? row['CPF/CNPJ'] ?? row['cnpj'] ?? row['CNPJ'] ?? ''))
    const uf = limpar(row['uf'] ?? row['UF'] ?? '').toUpperCase()
    const municipio = limpar(row['município'] ?? row['municipio'] ?? row['Município'] ?? row['MUNICÍPIO'] ?? '')
    const dtLancamentoRaw = row['dt_lancamento'] ?? row['DT_LANCAMENTO'] ?? ''
    const dtLancamento = parseData(dtLancamentoRaw)
    const kgNegativa = numero(row['kg_testada_negativa_acumulado'] ?? row['KG_TESTADA_NEGATIVA_ACUMULADO'] ?? 0)
    const kgDeclarada = numero(row['kg_declarada_acumulado'] ?? row['KG_DECLARADA_ACUMULADO'] ?? 0)
    const kgPositiva = numero(row['kg_positiva_acumulado'] ?? row['KG_POSITIVA_ACUMULADO'] ?? 0)
    const kgParticipante = numero(row['kg_participante_acumulado'] ?? row['KG_PARTICIPANTE_ACUMULADO'] ?? 0)

    if (!cnpj) {
      return { indice: i + 1, item: null, erro: 'CNPJ vazio ou inválido.' }
    }

    if (!dtLancamento) {
      return { indice: i + 1, item: null, erro: 'Data de lançamento vazia.' }
    }

    const jaExiste = !!acumuladoJaExiste(cnpj, dtLancamento)
    const municipios = municipiosDoCnpj(cnpj)
    const temConflito = municipio && municipios.length > 0 && !municipios.includes(municipio.toUpperCase())
    // restringe a comparação ao município informado — um CNPJ com unidades em
    // cidades diferentes não deve ter os acumulados misturados
    const ultimoValor = ultimoAcumuladoImportado(cnpj, municipio)

    // compara o total e a maior variação percentual entre as classificações
    let comparacao: LinhaPreview['comparacao'] = 'novo'
    let variacaoMax = 0

    if (ultimoValor) {
      const totalAntigo =
        ultimoValor.valores.Negativa + ultimoValor.valores.Declarada + ultimoValor.valores.Positiva + ultimoValor.valores.Participante
      const totalNovo = kgNegativa + kgDeclarada + kgPositiva + kgParticipante

      comparacao = totalNovo > totalAntigo ? 'acima' : totalNovo < totalAntigo ? 'abaixo' : 'igual'

      const novoVals: Record<Classificacao, number> = {
        Negativa: kgNegativa,
        Declarada: kgDeclarada,
        Positiva: kgPositiva,
        Participante: kgParticipante,
      }
      ;(['Negativa', 'Declarada', 'Positiva', 'Participante'] as Classificacao[]).forEach((c) => {
        if (ultimoValor.valores[c] === 0) return
        const variacao = (novoVals[c] - ultimoValor.valores[c]) / ultimoValor.valores[c]
        if (variacao > variacaoMax) variacaoMax = variacao
      })
    }

    // CNPJ com 2+ municípios sempre exige revisão manual — no mínimo alerta,
    // mesmo que o valor em si não tenha disparado nenhuma outra regra
    const severidade: SeveridadeAcumulado =
      comparacao === 'abaixo' || variacaoMax > LIMITE_VERMELHO
        ? 'vermelho'
        : jaExiste || variacaoMax > LIMITE_ALERTA || temConflito
          ? 'alerta'
          : 'sucesso'

    return {
      indice: i + 1,
      item: { nomePdr, cnpj, uf, municipio, dtLancamento, kgNegativa, kgDeclarada, kgPositiva, kgParticipante },
      jaExiste,
      municipiosConflito: temConflito ? municipios : undefined,
      ultimoValor,
      comparacao,
      variacaoMax,
      severidade,
    }
  })
}

/** ordem de prioridade para escolher a aba inicial — o mais urgente primeiro */
const ORDEM_SEVERIDADE: SeveridadeAcumulado[] = ['vermelho', 'alerta', 'sucesso']

export default function ImportarAcumulado({ onClose }: { onClose: () => void }) {
  const [linhas, setLinhas] = useState<LinhaPreview[]>([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [sobre, setSobre] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<Record<SeveridadeAcumulado, DetalheAcumuladoImportado[]> | null>(null)
  // chave por índice da linha — cada lançamento resolve seu município independentemente
  const [municipiosEscolhidos, setMunicipiosEscolhidos] = useState<Record<number, string>>({})
  /** linhas marcadas para entrar no lote de importação — alerta/vermelho começam de fora */
  const [incluidos, setIncluidos] = useState<Set<number>>(new Set())
  const [abaPreview, setAbaPreview] = useState<SeveridadeAcumulado>('sucesso')
  const [gerandoMensagem, setGerandoMensagem] = useState<LinhaPreview | null>(null)
  const [gerandoConsolidado, setGerandoConsolidado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validas = linhas.filter((l): l is LinhaPreview & { item: AcumuladoImportado } => !!l.item)
  const invalidas = linhas.filter((l) => l.erro)
  const temConflitos = validas.some((l) => l.municipiosConflito && l.municipiosConflito.length > 0)
  const aImportar = validas.filter((l) => incluidos.has(l.indice))
  const pendentes = validas.filter((l) => l.severidade !== 'sucesso')

  const porSeveridade = (sev: SeveridadeAcumulado) => validas.filter((l) => l.severidade === sev)

  // ao carregar um novo arquivo, abre direto na categoria mais urgente. Ajustar
  // durante o render evita o piscar de mostrar a aba antiga vazia antes do efeito
  const [linhasDaAba, setLinhasDaAba] = useState(linhas)
  if (linhas !== linhasDaAba) {
    setLinhasDaAba(linhas)
    const primeira = ORDEM_SEVERIDADE.find((sev) => porSeveridade(sev).length > 0)
    if (primeira) setAbaPreview(primeira)
  }

  const visiveis = porSeveridade(abaPreview)

  async function processarArquivo(file: File) {
    setNomeArquivo(file.name)
    setResultado(null)
    const preview = await analisarArquivo(file)
    setLinhas(preview)
    // sucesso entra marcado por padrão; alerta/vermelho ficam de fora até revisão manual
    setIncluidos(new Set(preview.filter((l) => l.item && l.severidade === 'sucesso').map((l) => l.indice)))
  }

  function baixarModelo() {
    const blob = new Blob(['﻿' + MODELO], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-acumulado-harvest.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function escolherMunicipio(indice: number, municipio: string) {
    setMunicipiosEscolhidos((prev) => ({ ...prev, [indice]: municipio }))
  }

  function toggleIncluido(indice: number) {
    setIncluidos((prev) => {
      const novo = new Set(prev)
      if (novo.has(indice)) novo.delete(indice); else novo.add(indice)
      return novo
    })
  }

  function toggleIncluidosDaAba() {
    const indices = visiveis.map((l) => l.indice)
    const todosIncluidos = indices.length > 0 && indices.every((i) => incluidos.has(i))
    setIncluidos((prev) => {
      const novo = new Set(prev)
      indices.forEach((i) => (todosIncluidos ? novo.delete(i) : novo.add(i)))
      return novo
    })
  }

  function removerLinha(indice: number) {
    setLinhas((prev) => prev.filter((l) => l.indice !== indice))
    setIncluidos((prev) => {
      const novo = new Set(prev)
      novo.delete(indice)
      return novo
    })
  }

  async function executarImportacao() {
    setImportando(true)
    const resultados: Record<SeveridadeAcumulado, DetalheAcumuladoImportado[]> = {
      sucesso: [],
      alerta: [],
      vermelho: [],
    }

    for (const linha of aImportar) {
      const r = importarAcumulado(linha.item, municipiosEscolhidos[linha.indice] ?? undefined)
      resultados[linha.severidade ?? 'sucesso'].push({
        item: linha.item,
        cod: r.cod,
        motivo: motivoDaLinha(linha),
        criouRegistro: r.acao === 'criado',
      })
    }

    registrarRelatorioImportacao(nomeArquivo, resultados.sucesso, resultados.alerta, resultados.vermelho)
    setResultado(resultados)
    setImportando(false)
  }

  const totalResultado = resultado
    ? resultado.sucesso.length + resultado.alerta.length + resultado.vermelho.length
    : 0
  const naoIncluidas = validas.length - aImportar.length

  return (
    <Modal
      titulo="Importar Acumulado"
      subtitulo="Selecione uma planilha Excel (.xlsx) ou CSV com os dados de acumulado por CNPJ."
      largo
      onClose={onClose}
      rodape={
        resultado ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {totalResultado} registro(s) importado(s)
              {naoIncluidas > 0 && ` · ${naoIncluidas} deixado(s) de fora para revisão`}
            </span>
            <span className="spacer" />
            <button className="btn btn--primary" type="button" onClick={onClose}>
              Concluir
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--ghost" type="button" onClick={baixarModelo}>
              <IconDownload /> Baixar modelo
            </button>
            {pendentes.length > 0 && (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setGerandoConsolidado(true)}
              >
                <IconAlerta size={14} /> Gerar mensagem ({pendentes.length})
              </button>
            )}
            <span className="spacer" />
            {validas.length > 0 && (
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {validas.length} válida(s) · {aImportar.length} incluída(s)
                {invalidas.length > 0 && ` · ${invalidas.length} com erro`}
              </span>
            )}
            <button className="btn btn--ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn btn--primary"
              type="button"
              disabled={aImportar.length === 0 || importando}
              onClick={executarImportacao}
            >
              {importando ? 'Importando...' : `Importar ${aImportar.length} registro(s)`}
            </button>
          </>
        )
      }
    >
      {!resultado && (
        <>
          <div
            className={`dropzone${sobre ? ' is-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setSobre(true) }}
            onDragLeave={() => setSobre(false)}
            onDrop={(e) => {
              e.preventDefault()
              setSobre(false)
              const f = e.dataTransfer.files[0]
              if (f) void processarArquivo(f)
            }}
          >
            <div style={{ color: 'var(--brand)' }}>
              <IconPlanilha />
            </div>
            <div className="dropzone__title">
              {nomeArquivo || 'Arraste a planilha aqui ou clique para selecionar'}
            </div>
            <div className="dropzone__hint">
              Colunas esperadas: {COLUNAS.join(' · ')}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,.tsv,.xlsx,.xls"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void processarArquivo(f)
              }}
            />
          </div>

          {temConflitos && (
            <div className="acc-aviso">
              Atenção: alguns CNPJs possuem mais de um município nos registros existentes. Selecione
              abaixo para onde vai cada acumulado.
            </div>
          )}

          {invalidas.length > 0 && <LinhasInvalidas invalidas={invalidas} />}

          {validas.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="acc-legenda">
                {ORDEM_SEVERIDADE.map((sev) => (
                  <span className="acc-legenda__item" key={sev}>
                    <i className="acc-legenda__dot" style={{ background: SEVERIDADE_INFO[sev].cor }} />
                    <strong>{SEVERIDADE_INFO[sev].label}:</strong> {SEVERIDADE_INFO[sev].desc}
                  </span>
                ))}
              </div>

              <div className="tabs" style={{ marginBottom: 12 }}>
                {ORDEM_SEVERIDADE.map((sev) => {
                  const info = SEVERIDADE_INFO[sev]
                  const lista = porSeveridade(sev)
                  return (
                    <button
                      key={sev}
                      type="button"
                      className={`tabs__btn${abaPreview === sev ? ' is-active' : ''}`}
                      style={abaPreview === sev ? { background: info.cor, borderColor: info.cor, boxShadow: `0 3px 10px ${info.cor}44` } : undefined}
                      onClick={() => setAbaPreview(sev)}
                    >
                      <span className="tabs__count">{lista.length}</span>
                      {info.label}
                    </button>
                  )
                })}
              </div>

              {visiveis.length > 0 ? (
                <>
                  <label className="acc-selecionar-todos">
                    <input
                      type="checkbox"
                      checked={visiveis.every((l) => incluidos.has(l.indice))}
                      onChange={toggleIncluidosDaAba}
                    />
                    Incluir todas as {visiveis.length} linha(s) desta categoria na importação
                  </label>

                  <div className="acc-lista">
                    {visiveis.map((l) => (
                      <LinhaCard
                        key={l.indice}
                        l={l}
                        incluido={incluidos.has(l.indice)}
                        onToggleIncluido={() => toggleIncluido(l.indice)}
                        onRemover={() => removerLinha(l.indice)}
                        onGerarMensagem={() => setGerandoMensagem(l)}
                        municipioEscolhido={municipiosEscolhidos[l.indice]}
                        onEscolherMunicipio={(m) => escolherMunicipio(l.indice, m)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty">Nenhuma linha nesta categoria.</div>
              )}
            </div>
          )}
        </>
      )}

      {resultado && (
        <ResultadoTabs resultado={resultado} naoIncluidas={naoIncluidas} importadoPor={obterUsuarioLogado().nome} />
      )}

      {gerandoMensagem && (
        <ModalMensagem
          titulo="Gerar mensagem"
          subtitulo={`CNPJ ${gerandoMensagem.item?.cnpj} — ${gerandoMensagem.item?.nomePdr || 'PDR não informado'}`}
          texto={gerarTextoMensagem(gerandoMensagem, incluidos.has(gerandoMensagem.indice))}
          onClose={() => setGerandoMensagem(null)}
        />
      )}

      {gerandoConsolidado && (
        <ModalMensagem
          titulo="Gerar mensagem — alertas e vermelhos"
          subtitulo={`${pendentes.length} lançamento(s) em alerta ou vermelho nesta planilha`}
          texto={gerarTextoConsolidado(pendentes, incluidos)}
          onClose={() => setGerandoConsolidado(false)}
        />
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function LinhasInvalidas({ invalidas }: { invalidas: LinhaPreview[] }) {
  const [expandido, setExpandido] = useState(false)

  return (
    <div className="acc-invalidas">
      <button type="button" className="acc-invalidas__topo" onClick={() => setExpandido((v) => !v)}>
        <strong>{invalidas.length}</strong> linha(s) com erro — não serão importadas
        <span>{expandido ? 'Recolher' : 'Ver detalhes'}</span>
      </button>
      {expandido && (
        <div className="acc-invalidas__lista">
          {invalidas.map((l) => (
            <div key={l.indice}>
              Linha {l.indice}: {l.erro}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function LinhaCard({
  l,
  incluido,
  onToggleIncluido,
  onRemover,
  onGerarMensagem,
  municipioEscolhido,
  onEscolherMunicipio,
}: {
  l: LinhaPreview
  incluido: boolean
  onToggleIncluido: () => void
  onRemover: () => void
  onGerarMensagem: () => void
  municipioEscolhido?: string
  onEscolherMunicipio: (municipio: string) => void
}) {
  const item = l.item!
  const severidade = l.severidade ?? 'sucesso'
  const info = SEVERIDADE_INFO[severidade]

  return (
    <div className={`acc-row${incluido ? '' : ' is-excluido'}`} style={{ borderLeftColor: info.cor }}>
      <label className="acc-row__check" title={incluido ? 'Incluída na importação' : 'Fora desta importação'}>
        <input type="checkbox" checked={incluido} onChange={onToggleIncluido} />
      </label>
      <div className="acc-row__main">
        <div className="acc-row__topo">
          <span className="acc-row__pdr">{item.nomePdr || 'PDR não informado'}</span>
          <span className="acc-row__cnpj mono">{item.cnpj}</span>
          <span className="acc-row__local">{item.uf}/{item.municipio}</span>
        </div>

        <div className="acc-row__periodo">
          <span className="acc-row__periodo-label">Lançamento — {item.dtLancamento}</span>
          <span className="acc-row__kg">
            Negativa {fmtKg(item.kgNegativa)} · Declarada {fmtKg(item.kgDeclarada)} · Positiva{' '}
            {fmtKg(item.kgPositiva)} · Participante {fmtKg(item.kgParticipante)}
          </span>
        </div>

        {l.ultimoValor ? (
          <div className="acc-row__periodo acc-row__periodo--anterior">
            <span className="acc-row__periodo-label">Anterior — {l.ultimoValor.data}</span>
            <span className="acc-row__kg">
              Negativa {fmtKg(l.ultimoValor.valores.Negativa)} · Declarada{' '}
              {fmtKg(l.ultimoValor.valores.Declarada)} · Positiva {fmtKg(l.ultimoValor.valores.Positiva)} ·{' '}
              Participante {fmtKg(l.ultimoValor.valores.Participante)}
            </span>
          </div>
        ) : (
          <div className="acc-row__semanterior">
            Nenhum acumulado anterior no sistema para {item.uf}/{item.municipio} — sem base de
            comparação.
          </div>
        )}

        <div className="acc-row__acao">
          {l.jaExiste ? (
            <span className="acc-row__acao-tag acc-row__acao-tag--atualiza">Atualiza registro existente</span>
          ) : (
            <span className="acc-row__acao-tag acc-row__acao-tag--cria">
              + Cria uma nova visita (fake) no sistema
            </span>
          )}
          {!incluido && (
            <span className="acc-row__acao-tag acc-row__acao-tag--fora">Fora desta importação</span>
          )}
        </div>

        {l.municipiosConflito && (
          <div className="acc-row__municipio">
            <select
              className="field-select"
              value={municipioEscolhido ?? item.municipio}
              onChange={(e) => onEscolherMunicipio(e.target.value)}
              style={{ fontSize: 12, padding: '2px 6px', borderColor: 'var(--amber)' }}
            >
              {[...new Set([item.municipio, ...l.municipiosConflito])].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="acc-row__lado">
        <span className="acc-row__status" style={{ color: info.cor }}>
          {motivoDaLinha(l)}
        </span>
        <div className="acc-row__botoes">
          {severidade !== 'sucesso' && (
            <button className="btn btn--ghost btn--sm" type="button" onClick={onGerarMensagem}>
              Gerar mensagem
            </button>
          )}
          <button
            className="btn btn--ghost btn--sm btn--icon"
            type="button"
            title="Remover da lista"
            onClick={onRemover}
          >
            <IconLixeira size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/** mensagem pronta para avisar sobre o motivo de uma linha em alerta/vermelho */
function gerarTextoMensagem(l: LinhaPreview, incluido: boolean): string {
  const item = l.item!
  const motivo = motivoDaLinha(l)
  const pdr = item.nomePdr || 'PDR não informado'

  const situacao = incluido
    ? `incluído manualmente nesta importação apesar do alerta (${motivo.toLowerCase()})`
    : `não foi inserido automaticamente, devido a: ${motivo.toLowerCase()}`

  return [
    `CNPJ ${item.cnpj} — ${pdr}`,
    `Lançamento de ${item.dtLancamento} ${situacao}.`,
    `Valores informados: Negativa ${fmtKg(item.kgNegativa)} · Declarada ${fmtKg(item.kgDeclarada)} · Positiva ${fmtKg(item.kgPositiva)} · Participante ${fmtKg(item.kgParticipante)}.`,
    incluido
      ? 'Revise novamente caso os valores não estejam corretos.'
      : 'Verifique os valores antes de incluir manualmente esta linha na importação.',
  ].join('\n')
}

/** mensagem única consolidando todos os lançamentos em alerta/vermelho de uma vez */
function gerarTextoConsolidado(linhas: LinhaPreview[], incluidos: Set<number>): string {
  if (linhas.length === 0) return 'Nenhum lançamento em alerta ou vermelho nesta planilha.'

  const itens = linhas.map((l) => {
    const item = l.item!
    const situacao = incluidos.has(l.indice) ? 'incluído manualmente' : 'não inserido automaticamente'
    return `• CNPJ ${item.cnpj} — ${item.nomePdr || 'PDR não informado'} (${item.dtLancamento}, ${item.uf}/${item.municipio}): ${situacao} — ${motivoDaLinha(l)}.`
  })

  return [`⚠️ ${linhas.length} lançamento(s) de acumulado exigem revisão nesta importação:`, ...itens].join('\n')
}

function ModalMensagem({
  titulo,
  subtitulo,
  texto,
  onClose,
}: {
  titulo: string
  subtitulo?: string
  texto: string
  onClose: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // clipboard indisponível neste ambiente — o texto continua selecionável na caixa
    }
  }

  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
      largo
      onClose={onClose}
      rodape={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Fechar
          </button>
          <button className="btn btn--primary" type="button" onClick={copiar}>
            {copiado ? 'Copiado!' : 'Copiar mensagem'}
          </button>
        </>
      }
    >
      <textarea
        readOnly
        value={texto}
        onFocus={(e) => e.target.select()}
        style={{ width: '100%', minHeight: 160, fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5 }}
      />
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
export function ResultadoTabs({
  resultado,
  naoIncluidas,
  importadoPor,
}: {
  resultado: Record<SeveridadeAcumulado, DetalheAcumuladoImportado[]>
  /** linhas válidas que ficaram de fora deste lote (alerta/vermelho não confirmados) */
  naoIncluidas?: number
  /** quem executou esta importação */
  importadoPor?: string
}) {
  const [aba, setAba] = useState<SeveridadeAcumulado>(
    ORDEM_SEVERIDADE.find((sev) => resultado[sev].length > 0) ?? 'sucesso',
  )

  const lista = resultado[aba]
  const total = resultado.sucesso.length + resultado.alerta.length + resultado.vermelho.length

  return (
    <div>
      <div style={{ padding: '4px 0 8px', fontSize: 14, fontWeight: 700 }}>
        Importação concluída
        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: 13 }}>
          {total} registro{total !== 1 ? 's' : ''}
          {!!naoIncluidas && ` · ${naoIncluidas} deixado(s) de fora para revisão`}
          {importadoPor && ` · importado por ${importadoPor}`}
        </span>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {ORDEM_SEVERIDADE.map((sev) => {
          const info = SEVERIDADE_INFO[sev]
          return (
            <button
              key={sev}
              type="button"
              className={`tabs__btn${aba === sev ? ' is-active' : ''}`}
              style={aba === sev ? { background: info.cor, borderColor: info.cor, boxShadow: `0 3px 10px ${info.cor}44` } : undefined}
              onClick={() => setAba(sev)}
            >
              <span className="tabs__count">{resultado[sev].length}</span>
              {info.label}
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', alignSelf: 'center', paddingRight: 10 }}>
          {SEVERIDADE_INFO[aba].desc}
        </span>
      </div>

      {lista.length > 0 ? (
        <div className="preview-table" style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="data" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Cód</th>
                <th>CNPJ</th>
                <th>PDR</th>
                <th>Município</th>
                <th>Data</th>
                <th style={{ textAlign: 'right' }}>Negativa</th>
                <th style={{ textAlign: 'right' }}>Declarada</th>
                <th style={{ textAlign: 'right' }}>Positiva</th>
                <th style={{ textAlign: 'right' }}>Participante</th>
                <th>Motivo</th>
                <th>Registro</th>
                <th>Situação atual</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.cod}>
                  <td className="mono">{d.cod}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{d.item.cnpj}</td>
                  <td className="cell-strong">{d.item.nomePdr}</td>
                  <td>{d.item.uf}/{d.item.municipio}</td>
                  <td>{d.item.dtLancamento}</td>
                  <td className="num">{fmtKg(d.item.kgNegativa)}</td>
                  <td className="num">{fmtKg(d.item.kgDeclarada)}</td>
                  <td className="num">{fmtKg(d.item.kgPositiva)}</td>
                  <td className="num">{fmtKg(d.item.kgParticipante)}</td>
                  <td style={{ color: SEVERIDADE_INFO[aba].cor, fontSize: 12, fontWeight: 600 }}>
                    {d.motivo}
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {d.criouRegistro ? 'Novo (fake)' : 'Atualizado'}
                  </td>
                  <td>
                    <SituacaoAtual cod={d.cod} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
          Nenhum registro nesta categoria.
        </div>
      )}
    </div>
  )
}

/** situação atual (em tempo real) da visita gerada/atualizada por esta importação */
export function SituacaoAtual({ cod }: { cod: number }) {
  const visita = useVisita(cod)
  if (!visita) return <span className="cell-muted">—</span>

  const meta = situacaoPorId(visita.situacao)
  return (
    <span className="badge" style={{ color: meta.color, borderColor: `${meta.color}44`, background: `${meta.color}12` }}>
      {meta.short}
    </span>
  )
}
