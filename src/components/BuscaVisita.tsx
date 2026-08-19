import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SituacaoBadge } from './ui'
import { IconLupa, IconX } from './icons'
import type { Visita } from '../types'
import { bancoAtivo } from '../backend/cliente'
import { buscarVisitas, type VisitaBusca } from '../backend/consultas'
import { useVisitas } from '../store'

const MAX_RESULTADOS = 8

function filtrarLocal(visitas: Visita[], termo: string): VisitaBusca[] {
  const t = termo.trim().toLowerCase()
  if (t.length < 2) return []
  const soDigitos = t.replace(/\D/g, '')
  return visitas
    .filter((v) => {
      if (String(v.cod).includes(t)) return true
      if (soDigitos && v.pdr.cnpj.replace(/\D/g, '').includes(soDigitos)) return true
      if (v.pdr.nome.toLowerCase().includes(t)) return true
      if (v.pdr.cidade.toLowerCase().includes(t)) return true
      if (v.consultor.toLowerCase().includes(t)) return true
      return false
    })
    .slice(0, MAX_RESULTADOS)
    .map((v) => ({
      cod: v.cod,
      data: v.data,
      situacao: v.situacao,
      consultor: v.consultor,
      pdr: { nome: v.pdr.nome, cnpj: v.pdr.cnpj, cidade: v.pdr.cidade, uf: v.pdr.uf },
    }))
}

export default function BuscaVisita() {
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [indice, setIndice] = useState(0)
  const [remoto, setRemoto] = useState<VisitaBusca[]>([])
  const caixa = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const locais = useVisitas()

  useEffect(() => {
    if (!bancoAtivo()) return
    const t = termo.trim()
    if (t.length < 2) return
    let viva = true
    const timer = window.setTimeout(() => {
      void buscarVisitas(t, MAX_RESULTADOS)
        .then((r) => {
          if (viva) setRemoto(r)
        })
        .catch(() => {
          if (viva) setRemoto([])
        })
    }, 280)
    return () => {
      viva = false
      window.clearTimeout(timer)
    }
  }, [termo])

  const resultados = useMemo(() => {
    if (termo.trim().length < 2) return []
    return bancoAtivo() ? remoto : filtrarLocal(locais, termo)
  }, [remoto, locais, termo])

  function abrir(cod: number) {
    setAberto(false)
    setTermo('')
    navigate(`/visita/${cod}`)
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (!resultados.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndice((i) => (i + 1) % resultados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndice((i) => (i - 1 + resultados.length) % resultados.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      abrir(resultados[Math.min(indice, resultados.length - 1)].cod)
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  return (
    <div
      className="busca"
      ref={caixa}
      onBlur={(e) => {
        if (!caixa.current?.contains(e.relatedTarget as Node)) setAberto(false)
      }}
    >
      <div className="busca__campo">
        <IconLupa size={17} />
        <input
          value={termo}
          placeholder="Buscar visita por código, PDR, CNPJ, cidade ou consultor…"
          onChange={(e) => {
            setTermo(e.target.value)
            setIndice(0)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
          aria-label="Buscar visita"
        />
        {termo && (
          <button
            type="button"
            className="busca__limpar"
            onClick={() => {
              setTermo('')
              setAberto(false)
            }}
            aria-label="Limpar busca"
          >
            <IconX size={15} />
          </button>
        )}
      </div>

      {aberto && termo.trim().length >= 2 && (
        <div className="busca__lista">
          {resultados.length === 0 ? (
            <div className="busca__vazio">Nenhuma visita encontrada para “{termo}”.</div>
          ) : (
            resultados.map((v, i) => (
              <button
                key={v.cod}
                type="button"
                className={`busca__item${i === indice ? ' is-ativo' : ''}`}
                onMouseEnter={() => setIndice(i)}
                onClick={() => abrir(v.cod)}
              >
                <span className="busca__cod mono">{v.cod}</span>
                <span className="busca__info">
                  <span className="busca__pdr">{v.pdr.nome}</span>
                  <span className="busca__meta">
                    {v.pdr.cidade}/{v.pdr.uf} · CNPJ {v.pdr.cnpj} · {v.data} · {v.consultor}
                  </span>
                </span>
                <SituacaoBadge id={v.situacao} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
