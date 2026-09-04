# Dicionário pt-BR (Hunspell)

`pt.aff` e `pt.dic` vieram do pacote npm [`dictionary-pt`](https://www.npmjs.com/package/dictionary-pt)
(mantido por wooorm/dictionaries), licença LGPL-3.0 ou MPL-2.0 — ver `LICENSE` nesta pasta.

São carregados em tempo de execução por `src/ortografia.ts` (via `fetch`, direto do navegador —
sem depender do pacote npm, que só funciona em Node) para alimentar o `nspell` e oferecer
correção ortográfica offline nas telas de Ocorrências.

## Como atualizar

```bash
npm install --no-save dictionary-pt
cp node_modules/dictionary-pt/index.aff public/dicionario/pt.aff
cp node_modules/dictionary-pt/index.dic public/dicionario/pt.dic
cp node_modules/dictionary-pt/license public/dicionario/LICENSE
npm uninstall dictionary-pt
```
