import { useEffect, useMemo, useState } from 'react'
import { bancoAtivo } from './backend/cliente'
import {
  consultarFluxo,
  consultarKpiAcumulado,
  consultarKpiSafra,
  FLUXO_VAZIO,
  fluxoDeVisitas,
  KPI_VAZIO,
  kpiDeVisitas,
  listarAcumuladoAuto,
  listarFila,
  listarFilaFotos,
  listarFilaAnaliseFinal,
  resumoDeVisita,
  type FiltroFila,
  type FluxoQtd,
  type ItemAnaliseFinal,
  type KpiAcumulado,
  type KpiSafra,
  type ResultadoFila,
  type VisitaAcumuladoResumo,
  type VisitaResumo,
} from './backend/consultas'
import { filaAnaliseFotos, mesclarFilaFotos, type ItemFilaFoto } from './fotos/evidencia'
import { analisarVisita } from './analise'
import {
  invalidarConsultas,
  obterUsuarioLogado,
  visitaNaAnaliseFinal,
  usePdrsCatalogo,
  useVersaoConsultas,
  useVisitas,
} from './store'

export function useKpiSafra(): KpiSafra {
  const locais = useVisitas()
  const versao = useVersaoConsultas()
  const [remoto, setRemoto] = useState<KpiSafra | null>(null)

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void consultarKpiSafra()
      .then((k) => {
        if (viva) setRemoto(k)
      })
      .catch(() => {
        if (viva) setRemoto(KPI_VAZIO)
      })
    return () => {
      viva = false
    }
  }, [versao])

  return bancoAtivo() ? (remoto ?? KPI_VAZIO) : kpiDeVisitas(locais)
}

export function useFluxoContagens(): { total: number; qtd: FluxoQtd } {
  const locais = useVisitas()
  const versao = useVersaoConsultas()
  const [remoto, setRemoto] = useState<FluxoQtd | null>(null)

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void consultarFluxo()
      .then((k) => {
        if (viva) setRemoto(k)
      })
      .catch(() => {
        if (viva) setRemoto(FLUXO_VAZIO)
      })
    return () => {
      viva = false
    }
  }, [versao])

  if (!bancoAtivo()) {
    return { total: locais.length, qtd: fluxoDeVisitas(locais) }
  }
  const qtd = remoto ?? FLUXO_VAZIO
  return { total: qtd.c1 + qtd.o1 + qtd.c2 + qtd.o2 + qtd.canc + qtd.cert, qtd }
}

export function useFilaVisitas(
  filtros: Omit<FiltroFila, 'usuario'>,
): ResultadoFila & { carregando: boolean } {
  const locais = useVisitas()
  const versao = useVersaoConsultas()
  const usuario = obterUsuarioLogado().nome
  const chave = JSON.stringify({ ...filtros, versao, usuario })
  const [cache, setCache] = useState<{ chave: string; dados: ResultadoFila } | null>(null)

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void listarFila({ ...filtros, usuario })
      .then((r) => {
        if (viva) setCache({ chave, dados: r })
      })
      .catch(() => {
        if (viva)
          setCache({ chave, dados: { itens: [], total: 0, totalFila: 0, atrasadas: 0, comResposta: 0 } })
      })
    return () => {
      viva = false
    }
    // filtros entra via chave (JSON) para não disparar a cada nova referência
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const local = useMemo(() => {
    const base = locais.filter(
      (v) =>
        v.situacao === filtros.situacao &&
        (!filtros.rodada || (filtros.rodada >= 2 ? v.rodada >= 2 : v.rodada <= 1)),
    )
    const de = filtros.de
    const ate = filtros.ate
    const filtradas = base.filter((v) => {
      if (filtros.codigo && !String(v.cod).includes(filtros.codigo.trim())) return false
      if (filtros.pdr) {
        const alvo = filtros.pdr.toLowerCase()
        if (
          !v.pdr.nome.toLowerCase().includes(alvo) &&
          !v.pdr.cnpj.includes(alvo) &&
          !v.pdr.cidade.toLowerCase().includes(alvo)
        )
          return false
      }
      const dia = v.data
      if (de) {
        const [dd, mm, aa] = dia.split('/').map(Number)
        const n = aa * 10000 + mm * 100 + dd
        const [y, m, d] = de.split('-').map(Number)
        if (n < y * 10000 + m * 100 + d) return false
      }
      if (ate) {
        const [dd, mm, aa] = dia.split('/').map(Number)
        const n = aa * 10000 + mm * 100 + dd
        const [y, m, d] = ate.split('-').map(Number)
        if (n > y * 10000 + m * 100 + d) return false
      }
      if (filtros.consultor && v.consultor !== filtros.consultor) return false
      if (filtros.lider && v.lider !== filtros.lider) return false
      if (filtros.liderFocal && v.liderFocal !== filtros.liderFocal) return false
      if (filtros.supervisor && v.supervisor !== filtros.supervisor) return false
      if (filtros.regiao && v.pdr.regiao !== filtros.regiao) return false
      return true
    })
    const itens = filtradas.map((v) => resumoDeVisita(v, usuario))
    const atrasadas = base.filter((v) => resumoDeVisita(v, usuario).atrasada).length
    const comResposta = base.filter((v) => resumoDeVisita(v, usuario).temNovaResposta).length
    const ordenadas = [...itens].sort((a, b) => {
      const key = filtros.ordem
      const va =
        key === 'pdr' ? a.pdr.nome : key === 'cargas' ? a.qtdCargas : (a as unknown as Record<string, unknown>)[key]
      const vb =
        key === 'pdr' ? b.pdr.nome : key === 'cargas' ? b.qtdCargas : (b as unknown as Record<string, unknown>)[key]
      const mult = filtros.dir === 'asc' ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult
      return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR') * mult
    })
    const ini = (filtros.pagina - 1) * filtros.porPagina
    return {
      itens: ordenadas.slice(ini, ini + filtros.porPagina),
      total: filtradas.length,
      totalFila: base.length,
      atrasadas,
      comResposta,
    }
  }, [locais, filtros, usuario])

  if (bancoAtivo()) {
    const dados =
      cache?.chave === chave
        ? cache.dados
        : { itens: [], total: 0, totalFila: 0, atrasadas: 0, comResposta: 0 }
    return { ...dados, carregando: cache?.chave !== chave }
  }
  return { ...local, carregando: false }
}

export function useKpiAcumulado(): KpiAcumulado & { pdrs: number } {
  const locais = useVisitas()
  const pdrs = usePdrsCatalogo()
  const versao = useVersaoConsultas()
  const [remoto, setRemoto] = useState<KpiAcumulado | null>(null)

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void consultarKpiAcumulado()
      .then((k) => {
        if (viva) setRemoto(k)
      })
      .catch(() => {
        if (viva) setRemoto({ registros: 0, negativa: 0, declarada: 0, positiva: 0, participante: 0 })
      })
    return () => {
      viva = false
    }
  }, [versao])

  if (!bancoAtivo()) {
    const auto = locais.filter((v) => v.consultor === 'INSERÇÃO_AUTO')
    return {
      registros: auto.length,
      negativa: auto.reduce((s, v) => s + v.acumulado.valores.Negativa, 0),
      declarada: auto.reduce((s, v) => s + v.acumulado.valores.Declarada, 0),
      positiva: auto.reduce((s, v) => s + v.acumulado.valores.Positiva, 0),
      participante: auto.reduce((s, v) => s + v.acumulado.valores.Participante, 0),
      pdrs: pdrs.length,
    }
  }
  return {
    ...(remoto ?? { registros: 0, negativa: 0, declarada: 0, positiva: 0, participante: 0 }),
    pdrs: pdrs.length,
  }
}

export function useAcumuladoLista(termo: string): VisitaAcumuladoResumo[] {
  const locais = useVisitas()
  const versao = useVersaoConsultas()
  const [remoto, setRemoto] = useState<VisitaAcumuladoResumo[]>([])

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void listarAcumuladoAuto(termo)
      .then((r) => {
        if (viva) setRemoto(r)
      })
      .catch(() => {
        if (viva) setRemoto([])
      })
    return () => {
      viva = false
    }
  }, [versao, termo])

  if (bancoAtivo()) return remoto
  const b = termo.trim().toLowerCase()
  return locais
    .filter((v) => v.consultor === 'INSERÇÃO_AUTO')
    .filter((v) => {
      if (!b) return true
      return (
        v.pdr.nome.toLowerCase().includes(b) ||
        v.pdr.cnpj.includes(b) ||
        v.pdr.cidade.toLowerCase().includes(b) ||
        String(v.cod).includes(b)
      )
    })
    .map((v) => ({
      cod: v.cod,
      data: v.data,
      pdr: { nome: v.pdr.nome, cnpj: v.pdr.cnpj, cidade: v.pdr.cidade, uf: v.pdr.uf },
      valores: v.acumulado.valores,
    }))
}

export function useFilaFotos(): {
  fila: ItemFilaFoto[]
  carregando: boolean
  recarregar: () => void
} {
  const locais = useVisitas()
  const versao = useVersaoConsultas()
  const [remoto, setRemoto] = useState<ItemFilaFoto[]>([])
  const [pedido, setPedido] = useState(0)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    setCarregando(true)
    void listarFilaFotos()
      .then((r) => {
        if (viva) setRemoto(r)
      })
      .catch(() => {
        if (viva) setRemoto([])
      })
      .finally(() => {
        if (viva) setCarregando(false)
      })
    return () => {
      viva = false
    }
  }, [versao, pedido])

  const recarregar = () => {
    setPedido((n) => n + 1)
    invalidarConsultas()
  }

  const fila = bancoAtivo() ? mesclarFilaFotos(remoto, locais) : filaAnaliseFotos(locais)
  return { fila, carregando: bancoAtivo() ? carregando : false, recarregar }
}

export function filaAnaliseFinalLocal(visitas: ReturnType<typeof useVisitas>): ItemAnaliseFinal[] {
  return visitas
    .filter((v) => v.situacao === 'certificada')
    .map((v) => {
      const alertas = visitaNaAnaliseFinal(v) ? null : analisarVisita(v)
      if (!visitaNaAnaliseFinal(v) && !alertas?.length) return null
      const lista = alertas ?? []
      return {
        cod: v.cod,
        data: v.data,
        pdrNome: v.pdr.nome,
        consultor: v.consultor,
        erros: v.ultimaValidacao?.erros ?? lista.filter((a) => a.severidade === 'erro').length,
        atencoes: v.ultimaValidacao?.atencoes ?? lista.filter((a) => a.severidade === 'atencao').length,
        conferida: Boolean(v.analiseFinal),
        conferidaPor: v.analiseFinal?.por ?? '',
        conferidaEm: v.analiseFinal?.ts ?? null,
        obs: v.analiseFinal?.obs ?? '',
      }
    })
    .filter((x): x is ItemAnaliseFinal => x !== null)
}

export function useFilaAnaliseFinal(): ItemAnaliseFinal[] {
  const locais = useVisitas()
  const versao = useVersaoConsultas()
  const [remoto, setRemoto] = useState<ItemAnaliseFinal[]>([])

  useEffect(() => {
    if (!bancoAtivo()) return
    let viva = true
    void listarFilaAnaliseFinal()
      .then((r) => {
        if (viva) setRemoto(r)
      })
      .catch(() => {
        if (viva) setRemoto([])
      })
    return () => {
      viva = false
    }
  }, [versao])

  return bancoAtivo() ? remoto : filaAnaliseFinalLocal(locais)
}

export type { VisitaResumo, FluxoQtd, KpiSafra }
