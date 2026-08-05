# Analogia Belo Monte

Site estático (GitHub Pages, `docs/` na main) com a projeção de cota por analogia da estação
**UHE Belo Monte Montante** (HidroWeb 18821000 · equipamento de telemetria 33552200 · rio Xingu),
alimentado por pipeline Python local agendado 2x/dia (10h e 14h, tarefa `AnalogiaBeloMonte-Atualizar`).

Projeto derivado do "Hidrovias Joaquim" (`..\Hidrovias Joaquim`) — mesma aparência, mesmos
elementos e mesmo algoritmo. Diferenças:

- **A estação 18821000 não tem dados no banco HIDRO** (nem consistido, nem bruto): a série
  integrada é 100% telemetria, disponível desde ago/2014 (~11 anos de universo de analogia).
- Por isso o `pipeline/fetch.py` daqui congela TAMBÉM o histórico de telemetria
  (`{slug}_telemetria.parquet`, fronteira = 31/dez de dois anos atrás), além do parquet do HIDRO.

## Regras (herdadas do projeto Hidrovias)

- **Nunca reimplementar a conexão com o data lake da ANA.** Reusar `ana_datalake` e
  `ana_app.queries` do projeto `..\app bancos ANA` (o `pipeline/__init__.py` faz o
  `sys.path.insert`). Rodar sempre com o venv de lá: `..\app bancos ANA\.venv\Scripts\python.exe`.
- Cota em **cm**. Algoritmo de analogia espelhado em `pipeline/analogia.py` e
  `docs/js/analogia.js` — mudanças de regra nos dois + `tests/test_analogia.py`.
- Front-end HTML+JS puro; Plotly e jsPDF vendorizados (sem CDN). Exportações (PDF do conjunto,
  memória de cálculo e CSV) geradas no navegador com o intervalo ajustado pelo usuário.
- **Mudanças de aparência/algoritmo devem ser mantidas em sincronia com o projeto Hidrovias**
  (os arquivos de `docs/js`, `docs/css` e `pipeline/analogia.py` são cópias).

## Comandos

- Carga completa: `atualizar.py --full`
- Rodada incremental: `atualizar.py` (`--sem-push` para não publicar)
- Testes: `python -m pytest tests/ -q`
- Site local: `python -m http.server 8518 --directory docs`
