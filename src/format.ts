export const fmtNum = (n: number) => n.toLocaleString('pt-BR')
export const fmtKg = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} kg`
export const fmtTon = (n: number) => `${n.toLocaleString('pt-BR')} t`
const pad = (n: number) => String(n).padStart(2, '0')

export const fmtDataHora = (ts: number) => {
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fmtPct = (n: number) =>
  `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
