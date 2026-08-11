/** usuário logado — substituir pela sessão real quando houver autenticação */
export const USUARIO = {
  nome: 'Bruno de Souza Ferreira',
  papel: 'Central de Informações',
}

export function iniciais(nome: string): string {
  const partes = nome.split(' ').filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/** cor estável por nome, para os avatares da conversa */
export function corDoNome(nome: string): string {
  const cores = ['#1d4ed8', '#0e8f6c', '#6d28d9', '#c2410c', '#b45309', '#0f766e', '#9d174d']
  const soma = nome.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return cores[soma % cores.length]
}
