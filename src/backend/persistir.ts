import type {
  Acumulado,
  Carga,
  DadosVisita,
  DiaAnterior,
  ErroLiberado,
  LogAlteracao,
  Mensagem,
  Ocorrencia,
  ParametrosRegras,
  Pdr,
  PdrCatalogo,
  Procedimento,
  RecebimentoMes,
  Usuario,
  Visita,
} from '../types'
import { dataBrParaIso, dataIsoParaBr, horaPg } from '../format'
import { supabase } from './cliente'

type LinhaVisita = Record<string, unknown>
type LinhaCarga = Record<string, unknown>

function horaOuNull(v: string): string | null {
  return v && v !== '00:00' ? v : v || null
}

export function visitaParaLinha(v: Visita): LinhaVisita {
  const d = v.dadosVisita
  const a = v.acumulado
  return {
    cod: v.cod,
    data: dataBrParaIso(v.data),
    envio_tablet: dataBrParaIso(v.envioTablet),
    pdr_nome: v.pdr.nome,
    pdr_cnpj: v.pdr.cnpj,
    pdr_cidade: v.pdr.cidade,
    pdr_uf: v.pdr.uf,
    pdr_regiao: v.pdr.regiao,
    pdr_distrito: v.pdr.distrito,
    pdr_endereco: v.pdr.endereco,
    pdr_telefone: v.pdr.telefone,
    pdr_responsavel: v.pdr.responsavel,
    pdr_capacidade_estatica: v.pdr.capacidadeEstatica,
    pdr_tipo_unidade: v.pdr.tipoUnidade,
    numero_visitas: v.numeroVisitas,
    situacao: v.situacao,
    rodada: v.rodada,
    consultor: v.consultor,
    lider: v.lider,
    lider_focal: v.liderFocal,
    supervisor: v.supervisor,
    tipo_visita: v.tipoVisita,
    modalidade: v.modalidade,
    hora_inicio: horaOuNull(v.horaInicio),
    hora_fim: horaOuNull(v.horaFim),
    duracao: v.duracao,
    primeira_visita: v.primeiraVisita,
    pdr_mista: v.pdrMista,
    cinco_estrelas: v.cincoEstrelas,
    motivo: v.motivo ?? null,
    visita_iniciada: d.visitaIniciada,
    recebimento_cargas: d.recebimentoCargas,
    realizou_testes: d.realizouTestes,
    houve_reteste: d.houveReteste,
    reteste_solicitante: d.retesteSolicitante,
    reteste_motivo: d.retesteMotivo,
    houve_ocorrencia: d.houveOcorrencia,
    caixa_fita_teste: d.caixaFitaTeste,
    fitas_associaveis_cargas: d.fitasAssociaveisCargas,
    acumulado_informado_pelo_pdr: a.informadoPeloPdr,
    acumulado_origem: a.origem,
    acumulado_negativa: a.valores.Negativa,
    acumulado_declarada: a.valores.Declarada,
    acumulado_positiva: a.valores.Positiva,
    acumulado_participante: a.valores.Participante,
    ultima_validacao_por: v.ultimaValidacao?.por ?? null,
    ultima_validacao_ts: v.ultimaValidacao ? new Date(v.ultimaValidacao.ts).toISOString() : null,
    ultima_validacao_erros: v.ultimaValidacao?.erros ?? null,
    ultima_validacao_atencoes: v.ultimaValidacao?.atencoes ?? null,
    aviso_import: v.avisoImport ?? null,
  }
}

export function cargaParaLinha(visitaCod: number, c: Carga): LinhaCarga {
  return {
    id: c.id,
    visita_cod: visitaCod,
    data: dataBrParaIso(c.data),
    hora: horaOuNull(c.hora),
    placa: c.placa,
    produtor: c.produtor,
    cpf_cnpj_produtor: c.cpfCnpjProdutor,
    romaneio: c.romaneio,
    peso_liquido: c.pesoLiquido,
    peso_com_desconto: c.pesoComDesconto,
    classificacao: c.classificacao,
    rateio: c.rateio,
    grupo_rateio: c.grupoRateio ?? null,
    observacao: c.observacao ?? null,
    acompanhada: c.acompanhada,
    foto_url: c.fotoUrl ?? null,
    tecnologia_testada: c.tecnologiaTestada ?? null,
    nao_informado: c.naoInformado ?? {},
  }
}

function pdrDeLinha(row: LinhaVisita): Pdr {
  return {
    nome: String(row.pdr_nome ?? ''),
    cnpj: String(row.pdr_cnpj ?? ''),
    cidade: String(row.pdr_cidade ?? ''),
    uf: String(row.pdr_uf ?? ''),
    regiao: String(row.pdr_regiao ?? ''),
    distrito: String(row.pdr_distrito ?? ''),
    endereco: String(row.pdr_endereco ?? ''),
    telefone: String(row.pdr_telefone ?? ''),
    responsavel: String(row.pdr_responsavel ?? ''),
    capacidadeEstatica: Number(row.pdr_capacidade_estatica ?? 0),
    tipoUnidade: (row.pdr_tipo_unidade as Pdr['tipoUnidade']) ?? 'ARMAZÉM',
  }
}

function dadosDeLinha(row: LinhaVisita): DadosVisita {
  return {
    visitaIniciada: row.visita_iniciada === 'Sim' ? 'Sim' : 'Não',
    recebimentoCargas: row.recebimento_cargas === 'Sim' ? 'Sim' : 'Não',
    realizouTestes: row.realizou_testes === 'Sim' ? 'Sim' : 'Não',
    houveReteste: row.houve_reteste === 'Sim' ? 'Sim' : 'Não',
    retesteSolicitante: String(row.reteste_solicitante ?? ''),
    retesteMotivo: String(row.reteste_motivo ?? ''),
    houveOcorrencia: row.houve_ocorrencia === 'Sim' ? 'Sim' : 'Não',
    caixaFitaTeste: Number(row.caixa_fita_teste ?? 0),
    fitasAssociaveisCargas: row.fitas_associaveis_cargas === 'Sim' ? 'Sim' : 'Não',
  }
}

function acumuladoDeLinha(row: LinhaVisita): Acumulado {
  const origem = row.acumulado_origem
  return {
    informadoPeloPdr: row.acumulado_informado_pelo_pdr === 'Sim' ? 'Sim' : 'Não',
    origem: origem === 'RTV' || origem === 'B2B' ? origem : 'PDR',
    valores: {
      Negativa: Number(row.acumulado_negativa ?? 0),
      Declarada: Number(row.acumulado_declarada ?? 0),
      Positiva: Number(row.acumulado_positiva ?? 0),
      Participante: Number(row.acumulado_participante ?? 0),
    },
  }
}

function cargaDeLinha(row: LinhaCarga): Carga {
  return {
    id: String(row.id),
    data: row.data ? dataIsoParaBr(String(row.data)) : '',
    hora: horaPg(row.hora as string),
    placa: String(row.placa ?? ''),
    produtor: String(row.produtor ?? ''),
    cpfCnpjProdutor: String(row.cpf_cnpj_produtor ?? ''),
    romaneio: String(row.romaneio ?? ''),
    pesoLiquido: Number(row.peso_liquido ?? 0),
    pesoComDesconto: Number(row.peso_com_desconto ?? 0),
    classificacao: (row.classificacao as Carga['classificacao']) ?? 'Participante',
    rateio: Boolean(row.rateio),
    grupoRateio: (row.grupo_rateio as string | null) ?? undefined,
    observacao: (row.observacao as string | null) ?? undefined,
    acompanhada: row.acompanhada !== false,
    fotoUrl: (row.foto_url as string | null) ?? undefined,
    tecnologiaTestada: (row.tecnologia_testada as boolean | null) ?? undefined,
    naoInformado: (row.nao_informado as Carga['naoInformado']) ?? undefined,
  }
}

function montarVisita(
  row: LinhaVisita,
  extras: {
    cargas: Carga[]
    diaAnterior: DiaAnterior[]
    mensagens: Mensagem[]
    ocorrencias: Ocorrencia[]
    errosLiberados: ErroLiberado[]
    logAlteracoes: LogAlteracao[]
    procedimentos: Procedimento[]
    historico: RecebimentoMes[]
  },
): Visita {
  const uv = row.ultima_validacao_ts
    ? {
        por: String(row.ultima_validacao_por ?? ''),
        ts: new Date(String(row.ultima_validacao_ts)).getTime(),
        erros: Number(row.ultima_validacao_erros ?? 0),
        atencoes: Number(row.ultima_validacao_atencoes ?? 0),
      }
    : undefined
  return {
    cod: Number(row.cod),
    data: dataIsoParaBr(String(row.data)),
    envioTablet: row.envio_tablet ? dataIsoParaBr(String(row.envio_tablet)) : dataIsoParaBr(String(row.data)),
    pdr: pdrDeLinha(row),
    numeroVisitas: Number(row.numero_visitas ?? 1),
    situacao: (row.situacao as Visita['situacao']) ?? 'central-correcao',
    rodada: Number(row.rodada ?? 1),
    consultor: String(row.consultor ?? ''),
    lider: String(row.lider ?? ''),
    liderFocal: String(row.lider_focal ?? ''),
    supervisor: String(row.supervisor ?? ''),
    tipoVisita: row.tipo_visita === 'REMOTA' ? 'REMOTA' : 'PRESENCIAL',
    modalidade: (row.modalidade as Visita['modalidade']) ?? '8H',
    horaInicio: horaPg(row.hora_inicio as string) || '00:00',
    horaFim: horaPg(row.hora_fim as string) || '00:00',
    duracao: String(row.duracao ?? ''),
    primeiraVisita: Boolean(row.primeira_visita),
    pdrMista: Boolean(row.pdr_mista),
    cincoEstrelas: Boolean(row.cinco_estrelas),
    dadosVisita: dadosDeLinha(row),
    acumulado: acumuladoDeLinha(row),
    diaAnterior: extras.diaAnterior,
    procedimentos: extras.procedimentos,
    historico: extras.historico,
    cargas: extras.cargas,
    ocorrencias: extras.ocorrencias,
    mensagens: extras.mensagens,
    errosLiberados: extras.errosLiberados,
    ultimaValidacao: uv,
    motivo: (row.motivo as string | null) ?? undefined,
    avisoImport: (row.aviso_import as Visita['avisoImport']) ?? undefined,
    logAlteracoes: extras.logAlteracoes,
  }
}

function erro(acao: string, e: { message?: string } | null): Error {
  return new Error(`${acao}: ${e?.message ?? 'falha desconhecida'}`)
}

/** PostgREST corta em 1000 linhas por request — pagina até trazer o resto */
const TAMANHO_PAGINA = 1000

async function todasAsLinhas(
  sb: NonNullable<ReturnType<typeof supabase>>,
  tabela: string,
): Promise<LinhaVisita[]> {
  const linhas: LinhaVisita[] = []
  let de = 0
  for (;;) {
    const { data, error: e } = await sb
      .from(tabela)
      .select('*')
      .range(de, de + TAMANHO_PAGINA - 1)
    if (e) throw erro(`carregar ${tabela}`, e)
    linhas.push(...((data ?? []) as LinhaVisita[]))
    if (!data || data.length < TAMANHO_PAGINA) break
    de += TAMANHO_PAGINA
  }
  return linhas
}

export async function persistirVisita(v: Visita): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { error: e1 } = await sb.from('visitas').upsert(visitaParaLinha(v))
  if (e1) throw erro(`visita ${v.cod}`, e1)

  const { error: e2 } = await sb.from('cargas').upsert(v.cargas.map((c) => cargaParaLinha(v.cod, c)))
  if (e2) throw erro(`cargas ${v.cod}`, e2)

  const ids = v.cargas.map((c) => c.id)
  if (ids.length === 0) {
    await sb.from('cargas').delete().eq('visita_cod', v.cod)
  } else {
    const { data: atuais } = await sb.from('cargas').select('id').eq('visita_cod', v.cod)
    const sobra = (atuais ?? []).map((r) => r.id as string).filter((id) => !ids.includes(id))
    if (sobra.length) await sb.from('cargas').delete().in('id', sobra)
  }

  await sb.from('dias_anteriores').delete().eq('visita_cod', v.cod)
  if (v.diaAnterior.length) {
    const { error } = await sb.from('dias_anteriores').insert(
      v.diaAnterior.map((d) => ({
        id: d.id,
        visita_cod: v.cod,
        data: dataBrParaIso(d.data),
        informou: d.informouDiaAnterior,
        negativa: d.valores.Negativa,
        declarada: d.valores.Declarada,
        positiva: d.valores.Positiva,
        participante: d.valores.Participante,
      })),
    )
    if (error) throw erro(`dia anterior ${v.cod}`, error)
  }

  await sb.from('mensagens_visita').delete().eq('visita_cod', v.cod)
  if (v.mensagens.length) {
    await sb.from('mensagens_visita').insert(
      v.mensagens.map((m) => ({
        id: m.id,
        visita_cod: v.cod,
        autor: m.autor,
        papel: m.papel,
        texto: m.texto,
        ts: new Date(m.ts).toISOString(),
        tipo: m.tipo,
        responsavel: m.responsavel ?? null,
      })),
    )
  }

  await sb.from('log_alteracoes').delete().eq('visita_cod', v.cod)
  if (v.logAlteracoes.length) {
    await sb.from('log_alteracoes').insert(
      v.logAlteracoes.map((l) => ({
        id: l.id,
        visita_cod: v.cod,
        ts: new Date(l.ts).toISOString(),
        por: l.por,
        origem: l.origem,
        planilha: l.planilha,
        tipo: l.tipo,
        chave: l.chave,
        resumo: l.resumo,
      })),
    )
  }

  await sb.from('erros_liberados').delete().eq('visita_cod', v.cod)
  if (v.errosLiberados.length) {
    await sb.from('erros_liberados').insert(
      v.errosLiberados.map((e) => ({
        visita_cod: v.cod,
        alerta_id: e.alertaId,
        regra: e.regra,
        justificativa: e.justificativa,
        por: e.por,
        ts: new Date(e.ts).toISOString(),
      })),
    )
  }

  await sb.from('ocorrencias').delete().eq('visita_cod', v.cod)
  if (v.ocorrencias.length) {
    await sb.from('ocorrencias').insert(
      v.ocorrencias.map((o) => ({
        id: o.id,
        visita_cod: v.cod,
        tipo: o.tipo,
        gravidade: o.gravidade,
        descricao: o.descricao,
        data: dataBrParaIso(o.data),
        status: o.status,
        carga_id: o.cargaId ?? null,
      })),
    )
  }
}

export async function persistirVisitas(lista: Visita[]): Promise<void> {
  const fila = [...lista]
  const workers = Array.from({ length: Math.min(6, Math.max(1, fila.length)) }, async () => {
    while (fila.length) {
      const v = fila.shift()
      if (v) await persistirVisita(v)
    }
  })
  await Promise.all(workers)
}

export async function apagarTodasVisitas(): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { error } = await sb.from('visitas').delete().gte('cod', 0)
  if (error) throw erro('apagar visitas', error)
}

export async function persistirPdrs(lista: PdrCatalogo[]): Promise<void> {
  const sb = supabase()
  if (!sb || lista.length === 0) return
  const { error } = await sb.from('pdrs').upsert(
    lista.map((p) => ({
      id: p.id,
      nome: p.nome,
      cnpj: p.cnpj,
      cidade: p.cidade,
      uf: p.uf,
      situacao: p.situacao,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      telefone: p.telefone ?? null,
      email: p.email ?? null,
      observacao: p.observacao ?? null,
    })),
  )
  if (error) throw erro('pdrs', error)
}

export async function persistirUsuarios(lista: Usuario[]): Promise<void> {
  const sb = supabase()
  if (!sb || lista.length === 0) return
  const { error } = await sb.from('usuarios').upsert(
    lista.map((u) => ({
      id: u.id,
      nome: u.nome,
      login: u.login,
      senha: u.senha ?? null,
      email: u.email ?? null,
      telefone: u.telefone ?? null,
      cpf: u.cpf ?? null,
      perfil: u.perfil,
      situacao: u.situacao,
    })),
  )
  if (error) throw erro('usuarios', error)

  const { data: atuais } = await sb.from('usuarios').select('id')
  const ids = new Set(lista.map((u) => u.id))
  const sobra = (atuais ?? []).map((r) => r.id as string).filter((id) => !ids.has(id))
  if (sobra.length) await sb.from('usuarios').delete().in('id', sobra)
}

export async function persistirParametros(p: ParametrosRegras): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { error } = await sb.from('parametros').upsert({
    id: 1,
    limite_desconto_erro: p.limiteDescontoErro,
    min_digitos_placa: p.minDigitosPlaca,
    salto_max_romaneio: p.saltoMaxRomaneio,
    limite_dia_anterior_tecnologia: p.limiteDiaAnteriorTecnologia,
    tolerancia_horario_min: p.toleranciaHorarioMin,
    caixa_fita_min: p.caixaFitaMin,
    caixa_fita_max: p.caixaFitaMax,
    mensagem_erro_chat: p.mensagemErroChat,
    regras_ativas: p.regrasAtivas,
  })
  if (error) throw erro('parametros', error)
}

export async function carregarTudo(): Promise<{
  visitas: Visita[]
  pdrs: PdrCatalogo[]
  parametros: ParametrosRegras | null
  usuarios: Usuario[]
}> {
  const sb = supabase()
  if (!sb) return { visitas: [], pdrs: [], parametros: null, usuarios: [] }

  const [vis, cargas, dias, msgs, logs, erros, ocor, pdrsRes, parRes, usuRes] = await Promise.all([
    todasAsLinhas(sb, 'visitas'),
    todasAsLinhas(sb, 'cargas'),
    todasAsLinhas(sb, 'dias_anteriores'),
    todasAsLinhas(sb, 'mensagens_visita'),
    todasAsLinhas(sb, 'log_alteracoes'),
    todasAsLinhas(sb, 'erros_liberados'),
    todasAsLinhas(sb, 'ocorrencias'),
    todasAsLinhas(sb, 'pdrs'),
    sb.from('parametros').select('*').eq('id', 1).maybeSingle(),
    todasAsLinhas(sb, 'usuarios'),
  ])

  if (parRes.error) throw erro('carregar', parRes.error)

  const cargasPor = new Map<number, Carga[]>()
  for (const c of cargas) {
    const lista = cargasPor.get(Number(c.visita_cod)) ?? []
    lista.push(cargaDeLinha(c as LinhaCarga))
    cargasPor.set(Number(c.visita_cod), lista)
  }
  const diasPor = new Map<number, DiaAnterior[]>()
  for (const d of dias) {
    const lista = diasPor.get(Number(d.visita_cod)) ?? []
    lista.push({
      id: String(d.id),
      data: dataIsoParaBr(String(d.data)),
      informouDiaAnterior: d.informou === 'Sim' ? 'Sim' : 'Não',
      valores: {
        Negativa: Number(d.negativa),
        Declarada: Number(d.declarada),
        Positiva: Number(d.positiva),
        Participante: Number(d.participante),
      },
    })
    diasPor.set(Number(d.visita_cod), lista)
  }
  const msgsPor = new Map<number, Mensagem[]>()
  for (const m of msgs) {
    const lista = msgsPor.get(Number(m.visita_cod)) ?? []
    lista.push({
      id: String(m.id),
      autor: String(m.autor ?? ''),
      papel: String(m.papel ?? ''),
      texto: String(m.texto ?? ''),
      ts: new Date(String(m.ts)).getTime(),
      tipo: m.tipo === 'sistema' ? 'sistema' : 'mensagem',
      responsavel: (m.responsavel as string | null) ?? undefined,
    })
    msgsPor.set(Number(m.visita_cod), lista)
  }
  const logsPor = new Map<number, LogAlteracao[]>()
  for (const l of logs) {
    const lista = logsPor.get(Number(l.visita_cod)) ?? []
    lista.push({
      id: String(l.id),
      ts: new Date(String(l.ts)).getTime(),
      por: String(l.por ?? ''),
      origem: l.origem === 'import-correcao' ? 'import-correcao' : 'edicao',
      planilha: String(l.planilha ?? ''),
      tipo: (l.tipo as LogAlteracao['tipo']) ?? 'carga',
      chave: String(l.chave ?? ''),
      resumo: String(l.resumo ?? ''),
    })
    logsPor.set(Number(l.visita_cod), lista)
  }
  const errosPor = new Map<number, ErroLiberado[]>()
  for (const e of erros) {
    const lista = errosPor.get(Number(e.visita_cod)) ?? []
    lista.push({
      alertaId: String(e.alerta_id),
      regra: String(e.regra ?? ''),
      justificativa: String(e.justificativa ?? ''),
      por: String(e.por ?? ''),
      ts: new Date(String(e.ts)).getTime(),
    })
    errosPor.set(Number(e.visita_cod), lista)
  }
  const ocorPor = new Map<number, Ocorrencia[]>()
  for (const o of ocor) {
    const lista = ocorPor.get(Number(o.visita_cod)) ?? []
    lista.push({
      id: String(o.id),
      tipo: String(o.tipo ?? ''),
      gravidade: (o.gravidade as Ocorrencia['gravidade']) ?? 'Média',
      descricao: String(o.descricao ?? ''),
      data: o.data ? dataIsoParaBr(String(o.data)) : '',
      status: (o.status as Ocorrencia['status']) ?? 'Aberta',
      cargaId: (o.carga_id as string | null) ?? undefined,
    })
    ocorPor.set(Number(o.visita_cod), lista)
  }

  const visitas = vis.map((row) => {
    const cod = Number(row.cod)
    return montarVisita(row, {
      cargas: cargasPor.get(cod) ?? [],
      diaAnterior: diasPor.get(cod) ?? [],
      mensagens: msgsPor.get(cod) ?? [],
      ocorrencias: ocorPor.get(cod) ?? [],
      errosLiberados: errosPor.get(cod) ?? [],
      logAlteracoes: logsPor.get(cod) ?? [],
      procedimentos: [],
      historico: [],
    })
  })

  const pdrs: PdrCatalogo[] = pdrsRes.map((p) => ({
    id: String(p.id),
    nome: String(p.nome ?? ''),
    cnpj: String(p.cnpj ?? ''),
    cidade: String(p.cidade ?? ''),
    uf: String(p.uf ?? ''),
    situacao: p.situacao === 'Inativo' ? 'Inativo' : 'Ativo',
    latitude: p.latitude == null ? undefined : String(p.latitude),
    longitude: p.longitude == null ? undefined : String(p.longitude),
    telefone: (p.telefone as string | null) ?? undefined,
    email: (p.email as string | null) ?? undefined,
    observacao: (p.observacao as string | null) ?? undefined,
  }))

  const pr = parRes.data
  const parametros: ParametrosRegras | null = pr
    ? {
        limiteDescontoErro: Number(pr.limite_desconto_erro),
        minDigitosPlaca: Number(pr.min_digitos_placa),
        saltoMaxRomaneio: Number(pr.salto_max_romaneio),
        limiteDiaAnteriorTecnologia: Number(pr.limite_dia_anterior_tecnologia),
        toleranciaHorarioMin: Number(pr.tolerancia_horario_min),
        caixaFitaMin: Number(pr.caixa_fita_min),
        caixaFitaMax: Number(pr.caixa_fita_max),
        mensagemErroChat: String(pr.mensagem_erro_chat),
        regrasAtivas: (pr.regras_ativas as ParametrosRegras['regrasAtivas']) ?? {},
      }
    : null

  const usuarios: Usuario[] = usuRes.map((u) => ({
    id: String(u.id),
    nome: String(u.nome ?? ''),
    login: String(u.login ?? ''),
    senha: (u.senha as string | null) ?? undefined,
    email: (u.email as string | null) ?? undefined,
    telefone: (u.telefone as string | null) ?? undefined,
    cpf: (u.cpf as string | null) ?? undefined,
    perfil: (u.perfil as Usuario['perfil']) ?? 'Support',
    situacao: u.situacao === 'Inativo' ? 'Inativo' : 'Ativo',
  }))

  return { visitas, pdrs, parametros, usuarios }
}
