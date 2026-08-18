import { describe, expect, it } from 'vitest'
import { traduzir, IDIOMAS } from './index'
import { EN } from './dicionario'
import { SITUACOES } from '../data/mock'
import { CATALOGO_REGRAS } from '../regras'

describe('tradução', () => {
  it('em português devolve o próprio texto', () => {
    expect(traduzir('Visitas', 'pt')).toBe('Visitas')
    expect(traduzir('qualquer coisa nova', 'pt')).toBe('qualquer coisa nova')
  })

  it('em inglês usa o dicionário', () => {
    expect(traduzir('Visitas', 'en')).toBe('Visits')
    expect(traduzir('Relatórios', 'en')).toBe('Reports')
    expect(traduzir('Importar planilha', 'en')).toBe('Import spreadsheet')
  })

  /**
   * O ponto do desenho: chave é a própria frase em português. Texto ainda não
   * traduzido aparece em português na tela — nunca como chave crua nem vazio.
   */
  it('sem tradução, volta em português em vez de quebrar', () => {
    expect(traduzir('Frase que ninguém traduziu ainda', 'en')).toBe(
      'Frase que ninguém traduziu ainda',
    )
    expect(traduzir('', 'en')).toBe('')
  })

  it('oferece exatamente PT e EN', () => {
    expect(IDIOMAS.map((i) => i.id)).toEqual(['pt', 'en'])
    expect(IDIOMAS.map((i) => i.sigla)).toEqual(['PT', 'EN'])
  })
})

describe('cobertura do dicionário', () => {
  it('traduz as quatro situações do fluxo, rótulo e descrição', () => {
    for (const s of SITUACOES) {
      expect(EN[s.label], `label ${s.label}`).toBeDefined()
      expect(EN[s.descricao], `descrição de ${s.label}`).toBeDefined()
    }
  })

  it('traduz os itens da navegação principal', () => {
    const navegacao = [
      'Administração',
      'Visitas',
      'Acumulado',
      'Rotas',
      'Ocorrências',
      'Relatórios',
      'Análise de Fotos',
      'Solicitações',
      'Importar planilha',
    ]
    for (const item of navegacao) expect(EN[item], item).toBeDefined()
  })

  it('traduz as abas da visita', () => {
    const abas = [
      'Análise',
      'Dados da Unidade',
      'Dados da Visita',
      'Histórico de Acumulado',
      'Dia Anterior',
      'Acompanhamento de Cargas',
      'Divergências',
      'Cargas não Acompanhadas',
      'Ocorrências',
      'Comunicação',
    ]
    for (const aba of abas) expect(EN[aba], aba).toBeDefined()
  })

  /**
   * A tela de Parâmetros lista o catálogo inteiro. Regra nova sem tradução
   * apareceria em português no meio da lista em inglês — este teste cobra.
   */
  it('traduz todas as regras do catálogo e as seções', () => {
    for (const r of CATALOGO_REGRAS) {
      expect(EN[r.label], `${r.codigo} — ${r.label}`).toBeDefined()
      expect(EN[r.secao], `seção ${r.secao}`).toBeDefined()
    }
  })

  it('usa a tradução combinada com o usuário para a regra 3.1.1', () => {
    expect(traduzir('Horário da carga dentro da janela da visita (com tolerância)', 'en')).toBe(
      'Loading time within the visit window (with tolerance)',
    )
  })

  /**
   * Entrada igual nos dois idiomas precisa ser proposital. Se aparecer uma
   * nova aqui, ou é palavra que não muda mesmo — e entra nesta lista — ou é
   * tradução esquecida que foi copiada por engano.
   */
  it('só repete o português nas palavras que não mudam', () => {
    const IGUAIS_DE_PROPOSITO = ['Supervisor', 'Login', 'Latitude', 'Longitude', 'Total', 'Use', 'Log']
    const iguais = Object.entries(EN)
      .filter(([pt, en]) => pt === en)
      .map(([pt]) => pt)

    expect(iguais.sort()).toEqual([...IGUAIS_DE_PROPOSITO].sort())
  })

  it('não tem tradução vazia', () => {
    const vazias = Object.entries(EN).filter(([, en]) => !en.trim())
    expect(vazias).toEqual([])
  })
})
