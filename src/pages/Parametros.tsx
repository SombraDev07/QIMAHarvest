import { useMemo, useState } from 'react'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { salvarParametros, useParametros } from '../store'
import { CATALOGO_REGRAS } from '../regras'
import type { ParametrosRegras } from '../types'

export default function Parametros() {
  const parametros = useParametros()
  const [form, setForm] = useState<ParametrosRegras>(parametros)
  const [aviso, setAviso] = useState<string | null>(null)

  const alterado = JSON.stringify(form) !== JSON.stringify(parametros)

  const secoes = useMemo(
    () => [...new Set(CATALOGO_REGRAS.map((r) => r.secao))],
    [],
  )

  function set<K extends keyof ParametrosRegras>(campo: K, valor: ParametrosRegras[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function setRegraAtiva(codigo: string, ativa: boolean) {
    setForm((f) => ({ ...f, regrasAtivas: { ...f.regrasAtivas, [codigo]: ativa } }))
  }

  function alternarSecao(secao: string, ativar: boolean) {
    setForm((f) => {
      const novo = { ...f.regrasAtivas }
      CATALOGO_REGRAS.filter((r) => r.secao === secao).forEach((r) => {
        novo[r.codigo] = ativar
      })
      return { ...f, regrasAtivas: novo }
    })
  }

  function salvar() {
    salvarParametros(form)
    setAviso('Parâmetros salvos — já valem para a próxima análise de visita.')
  }

  function descartar() {
    setForm(parametros)
  }

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: 'Início', to: '/visitas' },
          { label: 'Administração', to: '/administracao' },
          { label: 'Parâmetros' },
        ]}
      />
      <PageHead
        titulo="Parâmetros"
        subtitulo="Regras de análise aplicadas às visitas e a mensagem padrão do chat — o que estiver aqui é o que o sistema usa."
        acoes={
          alterado ? (
            <>
              <button className="btn btn--ghost" type="button" onClick={descartar}>
                Descartar
              </button>
              <button className="btn btn--primary" type="button" onClick={salvar}>
                Salvar parâmetros
              </button>
            </>
          ) : undefined
        }
      />

      <div className="stack">
        <Panel numero="1" titulo="Regras de consistência da visita" hint="Aplicadas na aba Análise de cada visita">
          <div className="panel__body">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="par-desconto">Desconto acima do qual a carga é erro (%)</label>
                <input
                  id="par-desconto"
                  type="number"
                  min={0}
                  max={100}
                  value={form.limiteDescontoErro}
                  onChange={(e) => set('limiteDescontoErro', Number(e.target.value))}
                />
                <span className="field__hint">
                  Hoje: cargas com desconto acima de {form.limiteDescontoErro}% do peso líquido
                  bloqueiam a certificação.
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-placa">Mínimo de caracteres válidos na placa</label>
                <input
                  id="par-placa"
                  type="number"
                  min={1}
                  max={10}
                  value={form.minDigitosPlaca}
                  onChange={(e) => set('minDigitosPlaca', Number(e.target.value))}
                />
                <span className="field__hint">
                  Placas com menos que isso são consideradas digitação incompleta.
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-romaneio">Salto máximo entre romaneios consecutivos</label>
                <input
                  id="par-romaneio"
                  type="number"
                  min={1}
                  value={form.saltoMaxRomaneio}
                  onChange={(e) => set('saltoMaxRomaneio', Number(e.target.value))}
                />
                <span className="field__hint">
                  Saltos maiores que isso entre romaneios da mesma visita geram erro.
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-caixa-min">Caixa de fita teste — mínimo</label>
                <input
                  id="par-caixa-min"
                  type="number"
                  value={form.caixaFitaMin}
                  onChange={(e) => set('caixaFitaMin', Number(e.target.value))}
                />
              </div>

              <div className="field">
                <label htmlFor="par-caixa-max">Caixa de fita teste — máximo</label>
                <input
                  id="par-caixa-max"
                  type="number"
                  value={form.caixaFitaMax}
                  onChange={(e) => set('caixaFitaMax', Number(e.target.value))}
                />
                <span className="field__hint">
                  Faixa usada na pergunta 2.6 (Dados da Visita) e na regra de análise.
                </span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          numero="2"
          titulo="Mensagem padrão — Enviar erros ao chat"
          hint="Usada como cabeçalho quando o analista envia os erros da visita para a Comunicação"
        >
          <div className="panel__body">
            <div className="field">
              <label htmlFor="par-msg">Texto padrão</label>
              <textarea
                id="par-msg"
                value={form.mensagemErroChat}
                onChange={(e) => set('mensagemErroChat', e.target.value)}
                style={{ minHeight: 80 }}
              />
              <span className="field__hint">
                Use <code>{'{quantidade}'}</code> onde deve entrar o número de erros selecionados.
                A lista de erros é adicionada automaticamente abaixo deste texto.
              </span>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="kv__label" style={{ marginBottom: 6 }}>
                Pré-visualização
              </div>
              <div className="msg-sistema" style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                <span className="msg-sistema__texto" style={{ whiteSpace: 'pre-wrap' }}>
                  {form.mensagemErroChat.replace('{quantidade}', '2')}
                  {'\n'}• Carga 30414012 — Desconto acima de 30% (32,10%): ...
                </span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          numero="3"
          titulo="Regras ativas"
          hint={`${Object.values(form.regrasAtivas).filter((v) => v !== false).length}/${CATALOGO_REGRAS.length} ligadas`}
        >
          <div className="panel__body">
            {secoes.map((secao) => {
              const regrasDaSecao = CATALOGO_REGRAS.filter((r) => r.secao === secao)
              const todasAtivas = regrasDaSecao.every((r) => form.regrasAtivas[r.codigo] !== false)
              return (
                <div className="bloco" key={secao} style={{ marginBottom: 20 }}>
                  <div className="bloco__head" style={{ justifyContent: 'space-between' }}>
                    <span className="bloco__titulo">{secao}</span>
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => alternarSecao(secao, !todasAtivas)}
                    >
                      {todasAtivas ? 'Desligar todas' : 'Ligar todas'}
                    </button>
                  </div>
                  <div className="regras-lista">
                    {regrasDaSecao.map((r) => (
                      <label key={r.codigo} className="regra-toggle">
                        <input
                          type="checkbox"
                          checked={form.regrasAtivas[r.codigo] !== false}
                          onChange={(e) => setRegraAtiva(r.codigo, e.target.checked)}
                        />
                        <span className="regra-toggle__codigo mono">{r.codigo}</span>
                        <span className="regra-toggle__label">{r.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}
