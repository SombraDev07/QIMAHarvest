import { useRef, useState } from 'react'
import { Modal } from './ui'
import { IconDownload, IconPlanilha } from './icons'
import { CLASSIFICACOES, PESO_LIQUIDO_MAX, type Carga, type Classificacao } from '../types'
import { proximoIdCarga } from '../data/mock'
import {
  fmtKg,
  mascaraCpfCnpj,
  mascaraPlaca,
  mascaraProdutor,
  mascaraRomaneio,
  normalizarHora,
} from '../format'

/* Colunas aceitas, na ordem do modelo */
const COLUNAS = [
  'Data',
  'Hora',
  'Placa',
  'Produtor',
  'CPF/CNPJ',
  'Romaneio',
  'Peso Líquido',
  'Peso com Desconto',
  'Classificação',
  'Rateio',
  'Grupo Rateio',
  'Observação',
]

const MODELO = [
  COLUNAS.join(';'),
  '15/03/2026;08:30;ABC1D23;Fazenda Boa Esperança;123.456.789-00;150233;42500;41800;Participante;Não;;',
  '15/03/2026;09:10;XYZ4E56;Irmãos Zanella;12.345.678/0001-90;150234;38900;38100;Declarada;Sim;RT-01;Carga rateada',
  '15/03/2026;09:10;QRS7F89;Irmãos Zanella;12.345.678/0001-90;150235;30150;29700;Declarada;Sim;RT-01;Carga rateada',
].join('\r\n')

type LinhaPreview = {
  linha: number
  carga: Carga | null
  erros: string[]
  bruto: string[]
}

function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/)[0] ?? ''
  const candidatos = [';', '\t', ','] as const
  return candidatos.reduce((melhor, sep) =>
    primeira.split(sep).length > primeira.split(melhor).length ? sep : melhor,
  ';')
}

function limpar(v: string): string {
  return (v ?? '').trim().replace(/^"|"$/g, '')
}

/** aceita 42.500,50 · 42500.5 · 42 500 */
function numero(v: string): number {
  const limpo = limpar(v).replace(/\s/g, '')
  if (!limpo) return NaN
  const normalizado =
    limpo.includes(',') && limpo.includes('.')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo.replace(',', '.')
  return Number(normalizado)
}

function classificacaoValida(v: string): Classificacao | null {
  const alvo = limpar(v).toLowerCase()
  return CLASSIFICACOES.find((c) => c.toLowerCase() === alvo) ?? null
}

export function analisarPlanilha(texto: string, dataPadrao: string): LinhaPreview[] {
  const sep = detectarSeparador(texto)
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (linhas.length === 0) return []

  // descarta o cabeçalho quando reconhecido
  const primeira = linhas[0].toLowerCase()
  const temCabecalho = primeira.includes('placa') || primeira.includes('romaneio')
  const dados = temCabecalho ? linhas.slice(1) : linhas

  return dados.map((linha, i) => {
    const col = linha.split(sep).map(limpar)
    const erros: string[] = []

    const [
      data,
      horaRaw,
      placaRaw,
      produtorRaw,
      docRaw,
      romaneioRaw,
      pesoLiquidoCol,
      pesoDescontoCol,
      classRaw,
      rateioRaw,
      grupoRaw,
      obs,
    ] = col

    // mesmas máscaras do formulário de edição, para a planilha não entrar
    // com dado que o app não deixaria digitar
    const hora = normalizarHora(horaRaw ?? '')
    const placa = mascaraPlaca(placaRaw ?? '')
    const produtor = mascaraProdutor(produtorRaw ?? '')
    const romaneio = mascaraRomaneio(romaneioRaw ?? '')
    const doc = mascaraCpfCnpj(docRaw ?? '')

    if (col.length < 8) erros.push(`Esperadas ao menos 8 colunas, encontradas ${col.length}.`)
    if (!placa) erros.push('Placa vazia.')
    if (!produtor) erros.push('Produtor vazio.')
    if (!romaneio) erros.push('Romaneio vazio.')
    if (horaRaw && !hora) erros.push(`Hora inválida: "${horaRaw}".`)

    const pesoLiquidoRaw = limpar(pesoLiquidoCol ?? '')
    const pesoDescontoRaw = limpar(pesoDescontoCol ?? '')
    const liquidoVazio = !pesoLiquidoRaw
    const descontoVazio = !pesoDescontoRaw
    const pesoLiquido = liquidoVazio ? 0 : numero(pesoLiquidoRaw)
    const pesoComDesconto = descontoVazio ? 0 : numero(pesoDescontoRaw)
    if (!liquidoVazio && (!Number.isFinite(pesoLiquido) || pesoLiquido <= 0))
      erros.push('Peso líquido inválido.')
    // peso é valor, não formatação: acima do teto a linha é recusada em vez de truncada
    else if (!liquidoVazio && pesoLiquido > PESO_LIQUIDO_MAX)
      erros.push(`Peso líquido acima do máximo de ${fmtKg(PESO_LIQUIDO_MAX)}.`)
    if (!descontoVazio && (!Number.isFinite(pesoComDesconto) || pesoComDesconto <= 0))
      erros.push('Peso com desconto inválido.')
    if (
      !liquidoVazio &&
      !descontoVazio &&
      Number.isFinite(pesoLiquido) &&
      Number.isFinite(pesoComDesconto) &&
      pesoComDesconto > pesoLiquido
    )
      erros.push('Peso com desconto maior que o líquido.')

    const classificacao = classificacaoValida(classRaw ?? '')
    if (!classificacao)
      erros.push(`Classificação inválida (use ${CLASSIFICACOES.join(', ')}).`)

    const rateio = /^s(im)?$/i.test(rateioRaw ?? '')
    const grupo = limpar(grupoRaw ?? '')
    if (rateio && !grupo) erros.push('Rateio "Sim" exige o identificador do grupo.')

    const carga: Carga | null =
      erros.length > 0
        ? null
        : {
            id: proximoIdCarga(),
            data: data || dataPadrao,
            hora: hora || '00:00',
            placa,
            produtor,
            cpfCnpjProdutor: doc,
            romaneio,
            pesoLiquido,
            pesoComDesconto,
            classificacao: classificacao!,
            rateio,
            grupoRateio: rateio ? grupo : undefined,
            observacao: obs || undefined,
            acompanhada: true,
            ...(liquidoVazio || descontoVazio
              ? {
                  naoInformado: {
                    ...(liquidoVazio ? { pesoLiquido: true as const } : {}),
                    ...(descontoVazio ? { pesoComDesconto: true as const } : {}),
                  },
                }
              : {}),
          }

    return { linha: i + (temCabecalho ? 2 : 1), carga, erros, bruto: col }
  })
}

export default function ImportarCargas({
  dataPadrao,
  onImportar,
  onClose,
}: {
  dataPadrao: string
  onImportar: (cargas: Carga[]) => void
  onClose: () => void
}) {
  const [texto, setTexto] = useState('')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [sobre, setSobre] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const preview = texto ? analisarPlanilha(texto, dataPadrao) : []
  const validas = preview.filter((p) => p.carga).map((p) => p.carga!)
  const invalidas = preview.filter((p) => !p.carga)

  async function lerArquivo(file: File) {
    setNomeArquivo(file.name)
    setTexto(await file.text())
  }

  function baixarModelo() {
    const blob = new Blob(['﻿' + MODELO], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-cargas-harvest.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      titulo="Importar cargas em massa"
      subtitulo="Arquivo CSV/TXT separado por ponto e vírgula, tabulação ou vírgula — o mesmo que o Excel gera em “Salvar como CSV”."
      largo
      onClose={onClose}
      rodape={
        <>
          <button className="btn btn--ghost" type="button" onClick={baixarModelo}>
            <IconDownload /> Baixar modelo
          </button>
          <span className="spacer" />
          {preview.length > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              {validas.length} válida(s) · {invalidas.length} com erro
            </span>
          )}
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={validas.length === 0}
            onClick={() => onImportar(validas)}
          >
            Importar {validas.length || ''} carga{validas.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div
        className={`dropzone${sobre ? ' is-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setSobre(true)
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSobre(false)
          const f = e.dataTransfer.files[0]
          if (f) void lerArquivo(f)
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
          accept=".csv,.txt,.tsv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void lerArquivo(f)
          }}
        />
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="imp-colar">Ou cole as linhas copiadas do Excel</label>
        <textarea
          id="imp-colar"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setNomeArquivo('')
          }}
          placeholder="15/03/2026;08:30;ABC1D23;Fazenda Boa Esperança;;150233;42500;41800;Participante;Não;;"
          style={{ minHeight: 96, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 }}
        />
      </div>

      {preview.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="kv__label" style={{ marginBottom: 8 }}>
            Pré-visualização ({preview.length} linhas)
          </div>
          <div className="preview-table">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Data / hora</th>
                  <th>Placa</th>
                  <th>Produtor</th>
                  <th>Romaneio</th>
                  <th style={{ textAlign: 'right' }}>Peso líq.</th>
                  <th style={{ textAlign: 'right' }}>C/ desconto</th>
                  <th>Classificação</th>
                  <th>Rateio</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.linha} className={p.carga ? undefined : 'row-invalid'}>
                    <td className="cell-muted">{p.linha}</td>
                    <td>
                      {p.carga ? `${p.carga.data} ${p.carga.hora}` : `${p.bruto[0]} ${p.bruto[1]}`}
                    </td>
                    <td className="cell-strong">{p.carga?.placa ?? p.bruto[2]}</td>
                    <td>{p.carga?.produtor ?? p.bruto[3]}</td>
                    <td>{p.carga?.romaneio ?? p.bruto[5]}</td>
                    <td className="num">
                      {p.carga ? fmtKg(p.carga.pesoLiquido) : p.bruto[6]}
                    </td>
                    <td className="num">
                      {p.carga ? fmtKg(p.carga.pesoComDesconto) : p.bruto[7]}
                    </td>
                    <td>{p.carga?.classificacao ?? p.bruto[8]}</td>
                    <td>
                      {p.carga?.rateio ? (
                        <span className="chip chip--rateio">{p.carga.grupoRateio}</span>
                      ) : (
                        'Não'
                      )}
                    </td>
                    <td>
                      {p.carga ? (
                        <span className="chip chip--ok">OK</span>
                      ) : (
                        <span className="err-msg">{p.erros.join(' ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
