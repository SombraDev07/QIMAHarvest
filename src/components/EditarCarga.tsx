import { useMemo, useState } from 'react'
import { Modal } from './ui'
import { IconInfo } from './icons'
import { CLASSIFICACOES, type Carga, type Classificacao, type GrupoRateio } from '../types'
import { proximoIdCarga } from '../data/mock'
import { fmtKg, fmtPct } from '../format'

const NOVO_GRUPO = '__novo__'

export function criarCargaVazia(data: string): Carga {
  return {
    id: proximoIdCarga(),
    data,
    hora: '08:00',
    placa: '',
    produtor: '',
    cpfCnpjProdutor: '',
    romaneio: '',
    pesoLiquido: 0,
    pesoComDesconto: 0,
    classificacao: 'Declarada',
    rateio: false,
    observacao: '',
    acompanhada: true,
  }
}

export default function EditarCarga({
  carga,
  grupos,
  novoGrupoId,
  onSalvar,
  onClose,
}: {
  carga: Carga
  grupos: GrupoRateio[]
  novoGrupoId: string
  onSalvar: (c: Carga) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Carga>(carga)
  const [grupoSel, setGrupoSel] = useState<string>(carga.grupoRateio ?? NOVO_GRUPO)

  const set = <K extends keyof Carga>(campo: K, valor: Carga[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  const pct = useMemo(
    () =>
      form.pesoLiquido > 0
        ? ((form.pesoLiquido - form.pesoComDesconto) / form.pesoLiquido) * 100
        : 0,
    [form.pesoLiquido, form.pesoComDesconto],
  )

  const grupoAtivo = grupos.find((g) => g.id === grupoSel)
  /** entrando num grupo diferente: os campos compartilhados virão do grupo destino */
  const entrandoEmOutroGrupo =
    form.rateio && grupoSel !== NOVO_GRUPO && grupoSel !== carga.grupoRateio && Boolean(grupoAtivo)
  /** já é membro do grupo: pode editar, mas a alteração propaga para os demais */
  const grupoAtual = form.rateio && grupoSel === carga.grupoRateio ? grupoAtivo : undefined
  const herdando = entrandoEmOutroGrupo

  const erros: string[] = []
  if (!form.placa.trim()) erros.push('Informe a placa.')
  if (!form.produtor.trim()) erros.push('Informe o produtor.')
  if (!form.romaneio.trim()) erros.push('Informe o romaneio.')
  if (form.pesoLiquido <= 0) erros.push('Peso líquido deve ser maior que zero.')
  if (form.pesoComDesconto > form.pesoLiquido)
    erros.push('Peso com desconto não pode ser maior que o peso líquido.')

  function salvar() {
    if (erros.length) return
    let final: Carga = { ...form }

    if (form.rateio) {
      const id = grupoSel === NOVO_GRUPO ? novoGrupoId : grupoSel
      final = { ...final, grupoRateio: id }
      // ao entrar num grupo existente, herda data, hora e classificação
      if (grupoAtivo && entrandoEmOutroGrupo) {
        final = {
          ...final,
          data: grupoAtivo.data,
          hora: grupoAtivo.hora,
          placa: grupoAtivo.placa,
          classificacao: grupoAtivo.classificacao,
        }
      }
    } else {
      final = { ...final, grupoRateio: undefined }
    }

    onSalvar(final)
  }

  return (
    <Modal
      titulo={carga.placa ? `Editar carga ${carga.id}` : 'Nova carga'}
      subtitulo="Placa, data, hora e classificação são compartilhadas entre as cargas de um mesmo rateio."
      largo
      onClose={onClose}
      rodape={
        <>
          {erros.length > 0 && <span className="err-msg">{erros[0]}</span>}
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={salvar}
            disabled={erros.length > 0}
          >
            Salvar carga
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="c-data">Data</label>
          <input
            id="c-data"
            value={form.data}
            disabled={herdando}
            onChange={(e) => set('data', e.target.value)}
            placeholder="dd/mm/aaaa"
          />
        </div>
        <div className="field">
          <label htmlFor="c-hora">Hora</label>
          <input
            id="c-hora"
            value={form.hora}
            disabled={herdando}
            onChange={(e) => set('hora', e.target.value)}
            placeholder="hh:mm"
          />
        </div>
        <div className="field">
          <label htmlFor="c-placa">Placa</label>
          <input
            id="c-placa"
            value={form.placa}
            disabled={herdando}
            onChange={(e) => set('placa', e.target.value.toUpperCase())}
          />
          {form.rateio && (
            <span className="field__hint">Compartilhada por todo o grupo de rateio.</span>
          )}
        </div>
        <div className="field">
          <label htmlFor="c-romaneio">Romaneio</label>
          <input
            id="c-romaneio"
            value={form.romaneio}
            onChange={(e) => set('romaneio', e.target.value)}
          />
        </div>
        <div className="field span-2">
          <label htmlFor="c-produtor">Produtor</label>
          <input
            id="c-produtor"
            value={form.produtor}
            onChange={(e) => set('produtor', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="c-doc">CPF / CNPJ do produtor</label>
          <input
            id="c-doc"
            value={form.cpfCnpjProdutor}
            onChange={(e) => set('cpfCnpjProdutor', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="c-pl">Peso líquido (kg)</label>
          <input
            id="c-pl"
            type="number"
            value={form.pesoLiquido || ''}
            onChange={(e) => set('pesoLiquido', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="c-pd">Peso com desconto (kg)</label>
          <input
            id="c-pd"
            type="number"
            value={form.pesoComDesconto || ''}
            onChange={(e) => set('pesoComDesconto', Number(e.target.value))}
          />
          <span className="field__hint">
            Desconto calculado: <strong>{fmtPct(pct)}</strong> ·{' '}
            {fmtKg(Math.max(0, form.pesoLiquido - form.pesoComDesconto))}
          </span>
        </div>
        <div className="field">
          <label htmlFor="c-class">Classificação</label>
          <select
            id="c-class"
            value={form.classificacao}
            disabled={herdando}
            onChange={(e) => set('classificacao', e.target.value as Classificacao)}
          >
            {CLASSIFICACOES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-acomp">Acompanhada pelo consultor</label>
          <select
            id="c-acomp"
            value={form.acompanhada ? 'Sim' : 'Não'}
            onChange={(e) => set('acompanhada', e.target.value === 'Sim')}
          >
            <option>Sim</option>
            <option>Não</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-rateio">Rateio</label>
          <select
            id="c-rateio"
            value={form.rateio ? 'Sim' : 'Não'}
            onChange={(e) => set('rateio', e.target.value === 'Sim')}
          >
            <option>Não</option>
            <option>Sim</option>
          </select>
        </div>
        {form.rateio && (
          <div className="field">
            <label htmlFor="c-grupo">Grupo de rateio</label>
            <select id="c-grupo" value={grupoSel} onChange={(e) => setGrupoSel(e.target.value)}>
              <option value={NOVO_GRUPO}>+ Novo grupo ({novoGrupoId})</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id} — {g.cargas.length} cargas · {g.data} {g.hora} · {g.classificacao}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field span-2">
          <label htmlFor="c-obs">Observação</label>
          <textarea
            id="c-obs"
            value={form.observacao ?? ''}
            onChange={(e) => set('observacao', e.target.value)}
            placeholder="Anotações do consultor sobre esta carga…"
          />
        </div>
      </div>

      {entrandoEmOutroGrupo && grupoAtivo && (
        <div className="alert alert--lock" style={{ marginTop: 16 }}>
          <IconInfo />
          <span>
            Ao entrar no rateio <strong>{grupoAtivo.id}</strong>, esta carga herda a placa{' '}
            <strong>{grupoAtivo.placa}</strong>, a data <strong>{grupoAtivo.data}</strong>, a hora{' '}
            <strong>{grupoAtivo.hora}</strong> e a classificação{' '}
            <strong>{grupoAtivo.classificacao}</strong> do grupo.
          </span>
        </div>
      )}

      {grupoAtual && (
        <div className="alert alert--info" style={{ marginTop: 16 }}>
          <IconInfo />
          <span>
            Carga do rateio <strong>{grupoAtual.id}</strong>. Alterar placa, data, hora ou
            classificação aqui atualiza as <strong>{grupoAtual.cargas.length} cargas</strong> do
            grupo.
          </span>
        </div>
      )}
    </Modal>
  )
}
