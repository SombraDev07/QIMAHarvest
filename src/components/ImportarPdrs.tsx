import { useRef, useState } from 'react'
import { Modal } from './ui'
import { IconDownload, IconPlanilha } from './icons'
import type { PdrCatalogo, SituacaoPdr } from '../types'
import { mascaraCpfCnpj, mascaraProdutor, semAcento } from '../format'

/* Colunas aceitas, na ordem do modelo */
const COLUNAS = ['Nome PDR', 'CPF/CNPJ', 'Situação']

const MODELO = [
  COLUNAS.join(';'),
  'COOPERALFA COOP AGROINDL LTDA;02.595.222/0005-53;Ativo',
  'ARMAZENS GERAIS SANTA RITA ME;88.879.473/0001-51;Ativo',
  'BIANCHI COMERCIO DE GRAOS ME;123.456.789-00;Inativo',
].join('\r\n')

/** o id do cadastro é do sistema; a planilha traz só os dados */
export type PdrDaPlanilha = Omit<PdrCatalogo, 'id'>

export type LinhaPreviewPdr = {
  linha: number
  pdr: PdrDaPlanilha | null
  erros: string[]
  bruto: string[]
}

function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/)[0] ?? ''
  const candidatos = [';', '\t', ','] as const
  return candidatos.reduce(
    (melhor, sep) => (primeira.split(sep).length > primeira.split(melhor).length ? sep : melhor),
    ';',
  )
}

const limpar = (v: string) => (v ?? '').trim().replace(/^"|"$/g, '')

/**
 * A planilha traz "Ativo"/"Inativo", mas na prática vem de tudo: "ATIVO", "S",
 * "1", "sim". Reconhecer as formas comuns evita rejeitar linha boa por causa
 * de digitação, e o que não bate vira erro em vez de virar Ativo no escuro.
 */
function situacaoValida(v: string): SituacaoPdr | null {
  const alvo = semAcento(limpar(v)).toLowerCase()
  if (['ativo', 'a', 's', 'sim', '1', 'true'].includes(alvo)) return 'Ativo'
  if (['inativo', 'i', 'n', 'nao', '0', 'false'].includes(alvo)) return 'Inativo'
  return null
}

/** um CPF tem 11 dígitos, um CNPJ 14 — qualquer outra contagem é digitação incompleta */
const documentoValido = (v: string) => [11, 14].includes(v.replace(/\D/g, '').length)

export function analisarPlanilhaPdrs(texto: string): LinhaPreviewPdr[] {
  const sep = detectarSeparador(texto)
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (linhas.length === 0) return []

  const primeira = linhas[0].toLowerCase()
  const temCabecalho =
    primeira.includes('pdr') || primeira.includes('cnpj') || primeira.includes('situa')
  const dados = temCabecalho ? linhas.slice(1) : linhas

  const vistos = new Set<string>()

  return dados.map((linha, i) => {
    const col = linha.split(sep).map(limpar)
    const erros: string[] = []
    const [nomeRaw, docRaw, situacaoRaw] = col

    const nome = mascaraProdutor(nomeRaw ?? '')
    const cnpj = mascaraCpfCnpj(docRaw ?? '')
    // sem a coluna de situação a linha entra como Ativo, que é o caso comum
    const situacao = situacaoRaw ? situacaoValida(situacaoRaw) : 'Ativo'

    if (col.length < 2) erros.push(`Esperadas ao menos 2 colunas, encontradas ${col.length}.`)
    if (!nome) erros.push('Nome do PDR vazio.')
    if (!docRaw) erros.push('CPF/CNPJ vazio.')
    else if (!documentoValido(cnpj))
      erros.push(`CPF/CNPJ inválido: "${docRaw}" — precisa ter 11 ou 14 dígitos.`)
    if (situacaoRaw && !situacao)
      erros.push(`Situação inválida: "${situacaoRaw}" — use Ativo ou Inativo.`)

    if (cnpj && vistos.has(cnpj)) erros.push(`CPF/CNPJ repetido na planilha: ${cnpj}.`)
    else if (cnpj) vistos.add(cnpj)

    return {
      linha: i + (temCabecalho ? 2 : 1),
      pdr:
        erros.length > 0
          ? null
          : { nome, cnpj, cidade: '', uf: '', situacao: situacao as SituacaoPdr },
      erros,
      bruto: col,
    }
  })
}

export default function ImportarPdrs({
  onImportar,
  onClose,
}: {
  onImportar: (novos: PdrDaPlanilha[]) => void
  onClose: () => void
}) {
  const [linhas, setLinhas] = useState<LinhaPreviewPdr[]>([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [texto, setTexto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const validos = linhas.filter((l): l is LinhaPreviewPdr & { pdr: PdrDaPlanilha } => !!l.pdr)
  const invalidos = linhas.filter((l) => l.erros.length > 0)

  function processar(conteudo: string, arquivo = '') {
    setNomeArquivo(arquivo)
    setTexto(conteudo)
    setLinhas(analisarPlanilhaPdrs(conteudo))
  }

  /**
   * A biblioteca de planilha é grande e só serve aqui: entra por import
   * dinâmico para não pesar no carregamento de quem nunca importa .xlsx.
   */
  async function lerArquivo(file: File) {
    if (/\.xlsx?$/i.test(file.name)) {
      const [XLSX, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' })
      processar(csv, file.name)
    } else {
      processar(await file.text(), file.name)
    }
  }

  function baixarModelo() {
    const url = URL.createObjectURL(new Blob([MODELO], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-pdrs.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      titulo="Importar PDRs"
      subtitulo="Planilha com nome do PDR, CPF/CNPJ e situação. O CPF/CNPJ é a chave: linha de PDR já cadastrado atualiza o registro."
      largo
      onClose={onClose}
      rodape={
        <>
          {linhas.length > 0 && (
            <span className="cell-muted">
              {validos.length} válida(s) · {invalidos.length} com erro
            </span>
          )}
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={validos.length === 0}
            onClick={() => onImportar(validos.map((l) => l.pdr))}
          >
            Importar {validos.length > 0 ? `${validos.length} PDR(s)` : ''}
          </button>
        </>
      }
    >
      <div className="stack">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn--ghost btn--sm" type="button" onClick={baixarModelo}>
            <IconDownload /> Baixar modelo
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            <IconPlanilha /> Escolher arquivo
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) lerArquivo(f)
            }}
          />
          {nomeArquivo && <span className="cell-muted">{nomeArquivo}</span>}
        </div>

        <div className="field">
          <label htmlFor="pdr-colar">Ou cole o conteúdo da planilha</label>
          <textarea
            id="pdr-colar"
            value={texto}
            rows={5}
            onChange={(e) => processar(e.target.value)}
            placeholder={`Nome PDR;CPF/CNPJ;Situação\nCOOPERALFA LTDA;02.595.222/0005-53;Ativo`}
          />
          <span className="field__hint">
            Aceita separador <strong>;</strong>, tabulação ou vírgula. Cabeçalho é reconhecido e
            descartado. Sem a coluna de situação, a linha entra como Ativo.
          </span>
        </div>

        {linhas.length > 0 && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Nome PDR</th>
                  <th>CPF/CNPJ</th>
                  <th>Situação</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.linha} className={l.erros.length ? 'row-erro' : undefined}>
                    <td className="mono">{l.linha}</td>
                    <td className="cell-strong">{l.pdr?.nome ?? l.bruto[0]}</td>
                    <td className="mono">{l.pdr?.cnpj ?? l.bruto[1]}</td>
                    <td>{l.pdr?.situacao ?? l.bruto[2]}</td>
                    <td>
                      {l.erros.length ? (
                        <span className="tag-problema tag-problema--erro">{l.erros[0]}</span>
                      ) : (
                        <span className="cell-muted">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
