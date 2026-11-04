# Analogia Belo Monte

Site estático (GitHub Pages, `docs/` na main) com a projeção de cota por analogia da estação
**UHE Belo Monte Montante** (HidroWeb 18821000 · equipamento de telemetria 33552200 · rio Xingu),
alimentado por pipeline Python local agendado 2x/dia (10h e 14h, tarefa `AnalogiaBeloMonte-Atualizar`).

Projeto derivado do "Hidrovias Joaquim" (`..\Hidrovias Joaquim`), com a mesma aparência, mesmos
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
  `docs/js/analogia.js`: mudanças de regra nos dois + `tests/test_analogia.py`.
- Front-end HTML+JS puro; Plotly e jsPDF vendorizados (sem CDN). Exportações (PDF do conjunto,
  memória de cálculo e CSV) geradas no navegador com o intervalo ajustado pelo usuário.
- **Mudanças de aparência/algoritmo devem ser mantidas em sincronia com o projeto Hidrovias**
  (os arquivos de `docs/js`, `docs/css` e `pipeline/analogia.py` são cópias).
  `pipeline/analogia.py` e `docs/js/analogia.js` são **idênticos byte a byte** aos do Hidrovias
  (conferir com `cmp`); `grafico.js`/`exportar_pdf.js` seguem o mesmo desenho (datas, horizonte,
  regime), e os de lá têm a mais as séries sintéticas, as datas de toque nos pontos de controle
  e os vários painéis no PDF do conjunto.
- **Curvas destacadas por regime dos análogos** (nov/2026): o regime é decidido pelo conjunto,
  pela data média (circular) do mínimo e do máximo de cada análogo no ciclo de 365 dias centrado
  em D. Próximo extremo médio = mínimo: descida (maior/menor queda); = máximo: subida
  (menor/maior subida). Critério único, sem estado de transição (o usuário rejeitou misturar
  maior queda com maior subida). O delta continua individual, medido até o fim do horizonte.
  Resultado em `regime`, `ciclo`, `ano_inferior/superior`, `criterio_inferior/superior`,
  trajetórias `inferior/superior`.
- **Página de metodologia** (`docs/metodologia.html`) com figuras em `docs/img/metodologia/`,
  geradas à mão por `ferramentas/figuras_metodologia.py` (mesmo script no Hidrovias; números só
  dentro das figuras, calculados pelo `pipeline/analogia.py`). Mudou a regra, regerar as figuras e
  revisar o texto (anti-slop).
- Scripts com `?v=N` no `index.html`: subir N a cada mudança de JS/CSS (cache do navegador).

## Comandos

- Carga completa: `atualizar.py --full`
- Rodada incremental: `atualizar.py` (`--sem-push` para não publicar)
- Testes: `python -m pytest tests/ -q`
- Site local: `python -m http.server 8518 --directory docs`
