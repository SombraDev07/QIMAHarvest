import { useMemo, useState } from 'react'
import { Modal } from './ui'
import { IconInfo } from './icons'
import {
  CLASSIFICACOES,
  PESO_LIQUIDO_MAX,
  campoNaoInformado,
  type CampoCargaNaoInformado,
  type Carga,
  type Classificacao,
  type GrupoRateio,
} from '../types'
import { proximoIdCarga } from '../data/mock'
import {
  fmtKg,
  fmtNum,
  fmtPct,
  horaValida,
  mascaraCpfCnpj,
  mascaraHora,
  mascaraPlaca,
  mascaraProdutor,
  mascaraRomaneio,
  numeroDigitado,
} from '../format'

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

  /** peso líquido trava no teto e puxa o peso com desconto junto, para não passar dele */
  const setPesoLiquido = (texto: string) =>
    setForm((f) => {
      const pesoLiquido = Math.min(numeroDigitado(texto), PESO_LIQUIDO_MAX)
      return { ...f, pesoLiquido, pesoComDesconto: Math.min(f.pesoComDesconto, pesoLiquido) }
    })

  /** desconto nunca ultrapassa o líquido — enquanto o líquido é zero, aceita livre */
  const setPesoComDesconto = (texto: string) =>
    setForm((f) => {
      const digitado = numeroDigitado(texto)
      return {
        ...f,
        pesoComDesconto: f.pesoLiquido > 0 ? Math.min(digitado, f.pesoLiquido) : digitado,
      }
    })

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
  const setNI = (campo: CampoCargaNaoInformado, marcado: boolean) =>
    setForm((f) => {
      const naoInformado = { ...f.naoInformado, [campo]: marcado || undefined }
      if (!marcado) return { ...f, naoInformado }
      if (campo === 'pesoLiquido') return { ...f, naoInformado, pesoLiquido: 0 }
      if (campo === 'pesoComDesconto') return { ...f, naoInformado, pesoComDesconto: 0 }
      if (campo === 'placa') return { ...f, naoInformado, placa: '' }
      if (campo === 'romaneio') return { ...f, naoInformado, romaneio: '' }
      if (campo === 'produtor') return { ...f, naoInformado, produtor: '' }
      return { ...f, naoInformado, cpfCnpjProdutor: '' }
    })

  const erros: string[] = []
  if (!horaValida(form.hora)) erros.push('Hora inválida — use hh:mm entre 00:00 e 23:59.')
  if (!campoNaoInformado(form, 'placa') && !form.placa.trim()) erros.push('Informe a placa.')
  if (!campoNaoInformado(form, 'produtor') && !form.produtor.trim()) erros.push('Informe o produtor.')
  if (!campoNaoInformado(form, 'romaneio') && !form.romaneio.trim()) erros.push('Informe o romaneio.')
  if (!campoNaoInformado(form, 'pesoLiquido') && form.pesoLiquido <= 0)
    erros.push('Peso líquido deve ser maior que zero.')
  if (
    !campoNaoInformado(form, 'pesoLiquido') &&
    !campoNaoInformado(form, 'pesoComDesconto') &&
    form.pesoComDesconto > form.pesoLiquido
  )
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
            inputMode="numeric"
            maxLength={5}
            onChange={(e) => set('hora', mascaraHora(e.target.value))}
            placeholder="hh:mm"
          />
        </div>
        <div className="field">
          <label htmlFor="c-placa">Placa</label>
          <input
            id="c-placa"
            value={form.placa}
            disabled={herdando || campoNaoInformado(form, 'placa')}
            maxLength={7}
            onChange={(e) => set('placa', mascaraPlaca(e.target.value))}
            placeholder="ABC1D23"
          />
          {form.rateio ? (
            <span className="field__hint">Compartilhada por todo o grupo de rateio.</span>
          ) : (
            <span className="field__hint">Até 7 caracteres, sem espaço ou traço.</span>
          )}
          <NaoInformado marcado={campoNaoInformado(form, 'placa')} onChange={(v) => setNI('placa', v)} />
        </div>
        <div className="field">
          <label htmlFor="c-romaneio">Romaneio</label>
          <input
            id="c-romaneio"
            value={form.romaneio}
            disabled={campoNaoInformado(form, 'romaneio')}
            onChange={(e) => set('romaneio', mascaraRomaneio(e.target.value))}
          />
          <span className="field__hint">Sem traço, pontuação ou espaço duplo.</span>
          <NaoInformado
            marcado={campoNaoInformado(form, 'romaneio')}
            onChange={(v) => setNI('romaneio', v)}
          />
        </div>
        <div className="field span-2">
          <label htmlFor="c-produtor">Produtor</label>
          <input
            id="c-produtor"
            value={form.produtor}
            disabled={campoNaoInformado(form, 'produtor')}
            onChange={(e) => set('produtor', mascaraProdutor(e.target.value))}
          />
          <span className="field__hint">Caixa alta, sem acento e sem espaço duplo.</span>
          <NaoInformado
            marcado={campoNaoInformado(form, 'produtor')}
            onChange={(v) => setNI('produtor', v)}
          />
        </div>
        <div className="field">
          <label htmlFor="c-doc">CPF / CNPJ do produtor</label>
          <input
            id="c-doc"
            value={form.cpfCnpjProdutor}
            disabled={campoNaoInformado(form, 'cpfCnpjProdutor')}
            inputMode="numeric"
            maxLength={18}
            onChange={(e) => set('cpfCnpjProdutor', mascaraCpfCnpj(e.target.value))}
            placeholder="000.000.000-00"
          />
          <NaoInformado
            marcado={campoNaoInformado(form, 'cpfCnpjProdutor')}
            onChange={(v) => setNI('cpfCnpjProdutor', v)}
          />
        </div>
        <div className="field">
          <label htmlFor="c-pl">Peso líquido (kg)</label>
          <input
            id="c-pl"
            inputMode="numeric"
            value={form.pesoLiquido ? fmtNum(form.pesoLiquido) : ''}
            disabled={campoNaoInformado(form, 'pesoLiquido')}
            onChange={(e) => setPesoLiquido(e.target.value)}
          />
          <span className="field__hint">Máximo {fmtKg(PESO_LIQUIDO_MAX)}.</span>
          <NaoInformado
            marcado={campoNaoInformado(form, 'pesoLiquido')}
            onChange={(v) => setNI('pesoLiquido', v)}
          />
        </div>
        <div className="field">
          <label htmlFor="c-pd">Peso com desconto (kg)</label>
          <input
            id="c-pd"
            inputMode="numeric"
            value={form.pesoComDesconto ? fmtNum(form.pesoComDesconto) : ''}
            disabled={campoNaoInformado(form, 'pesoComDesconto')}
            onChange={(e) => setPesoComDesconto(e.target.value)}
          />
          <span className="field__hint">
            Desconto calculado: <strong>{fmtPct(pct)}</strong> ·{' '}
            {fmtKg(Math.max(0, form.pesoLiquido - form.pesoComDesconto))}
          </span>
          <NaoInformado
            marcado={campoNaoInformado(form, 'pesoComDesconto')}
            onChange={(v) => setNI('pesoComDesconto', v)}
          />
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

function NaoInformado({
  marcado,
  onChange,
}: {
  marcado: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="field__ni">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      Não informado
    </label>
  )
}
