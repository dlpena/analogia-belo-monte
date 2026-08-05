/* Gráficos adicionais da página: comparação anual (anos selecionáveis) e
 * histórico completo com linha média e destaque do ano vigente.
 * Os dados já chegam com o QC do pipeline aplicado (saltos de escala removidos). */
"use strict";

const GraficosExtras = (() => {
  // Okabe-Ito (CVD-safe); cor fixa por ano (índice cronológico), nunca reciclada na sessão
  const PALETA = ["#E69F00", "#56B4E9", "#009E73", "#CC79A7",
                  "#0072B2", "#D55E00", "#B8860B", "#999999"];
  const COR_VIGENTE = "#1a1a1a";
  const COR_MEDIA = "#009E73";
  const COR_FUNDO = "#d9d9d9";
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
                 "jul", "ago", "set", "out", "nov", "dez"];
  const EXTRAS = [];   // páginas para o PDF do conjunto

  function corDoAno(doc, ano) {
    const todos = Object.keys(doc.anos).sort();
    return PALETA[todos.indexOf(String(ano)) % PALETA.length];
  }

  function layoutBase(doc, anoEixo) {
    return {
      margin: { l: 58, r: 16, t: 8, b: 34 },
      separators: ",.",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Segoe UI, system-ui, sans-serif", size: 12, color: "#555" },
      dragmode: false,
      xaxis: {
        fixedrange: true,
        tickvals: MESES.map((_, m) => `${anoEixo}-${String(m + 1).padStart(2, "0")}-01`),
        ticktext: MESES,
        hoverformat: "%d/%m",
        gridcolor: "#efefec",
        range: [`${anoEixo}-01-01`, `${anoEixo}-12-31`],
      },
      yaxis: {
        fixedrange: true,
        title: { text: `${doc.grandeza || "Cota"} (${doc.unidade || "cm"})`, font: { size: 12 } },
        gridcolor: "#efefec",
        zeroline: false,
      },
      legend: {
        orientation: "h", y: 1.02, yanchor: "bottom", x: 0,
        font: { size: 11.5, color: "#1a1a1a" },
      },
      hovermode: "x unified",
    };
  }

  const CONFIG = { responsive: true, displayModeBar: false, scrollZoom: false, doubleClick: false };

  function traceAno(doc, datas, ano, cor, largura, opts = {}) {
    const serie = doc.anos[String(ano)];
    const x = [], y = [];
    for (let i = 0; i < 366; i++) {
      if (datas[i] !== null) {
        x.push(datas[i]);
        y.push(serie && serie[i] !== undefined ? serie[i] : null);
      }
    }
    return {
      x, y, name: String(ano), mode: "lines",
      line: { color: cor, width: largura, dash: opts.dash },
      hovertemplate: opts.semHover ? undefined
        : `${opts.nome || ano}: %{y:.0f} ${doc.unidade || "cm"}<extra></extra>`,
      hoverinfo: opts.semHover ? "skip" : undefined,
      showlegend: opts.legenda !== false,
      connectgaps: false,
    };
  }

  /* ---------------- comparação anual (anos selecionáveis) ---------------- */

  function montarComparacao(main, doc) {
    const anoAtual = parseInt(doc.ultima_data.slice(0, 4), 10);
    const disponiveis = Object.keys(doc.anos).map(Number).sort((a, b) => a - b);
    const selecionados = new Set(
      [anoAtual - 2, anoAtual - 1, anoAtual].filter((a) => disponiveis.includes(a)));

    const sec = document.createElement("section");
    sec.className = "estacao";
    sec.id = "comparacao";
    sec.innerHTML = `
      <div class="estacao-cabecalho">
        <h2>Comparação anual</h2>
        <span class="estacao-codigos">anos sobrepostos no calendário jan–dez</span>
      </div>
      <div class="controles">
        <span class="chips-anos"></span>
        <label>Adicionar ano
          <select class="sel-ano"><option value=""></option></select>
        </label>
      </div>
      <div class="grafico"></div>`;
    main.appendChild(sec);

    const chips = sec.querySelector(".chips-anos");
    const sel = sec.querySelector(".sel-ano");
    const gd = sec.querySelector(".grafico");
    const datas = Grafico.datasDoAno(anoAtual);

    function render() {
      const anos = [...selecionados].sort((a, b) => a - b);
      const traces = anos.map((ano) => ano === anoAtual
        ? traceAno(doc, datas, ano, COR_VIGENTE, 2.5)
        : traceAno(doc, datas, ano, corDoAno(doc, ano), 1.8));
      Plotly.react(gd, traces, layoutBase(doc, anoAtual), CONFIG);

      chips.innerHTML = "";
      for (const ano of anos) {
        const chip = document.createElement("span");
        chip.className = "chip-ano";
        chip.style.borderColor = ano === anoAtual ? COR_VIGENTE : corDoAno(doc, ano);
        chip.innerHTML = `${ano}${ano === anoAtual ? " (vigente)" : ""} <button type="button" aria-label="remover ${ano}">×</button>`;
        chip.querySelector("button").addEventListener("click", () => {
          selecionados.delete(ano);
          render();
        });
        chips.appendChild(chip);
      }
      sel.innerHTML = '<option value="">…</option>' + disponiveis
        .filter((a) => !selecionados.has(a))
        .map((a) => `<option value="${a}">${a}</option>`).join("");
    }
    sel.addEventListener("change", () => {
      if (sel.value) {
        selecionados.add(Number(sel.value));
        render();
      }
    });
    render();
    EXTRAS.push({
      titulo: "Comparação anual",
      get subtitulo() {
        return `${doc.nome} · anos: ${[...selecionados].sort((a, b) => a - b).join(", ")}`;
      },
      grafico: gd,
    });
  }

  /* ---------------- histórico completo + média + ano vigente ---------------- */

  function mediaHistorica(doc, anoAtual) {
    const media = new Array(366).fill(null);
    const anos = Object.keys(doc.anos).filter((a) => Number(a) !== anoAtual);
    for (let i = 0; i < 366; i++) {
      const vals = [];
      for (const a of anos) {
        const v = doc.anos[a][i];
        if (v !== null && v !== undefined) vals.push(v);
      }
      if (vals.length >= 3) media[i] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    return media;
  }

  function montarHistorico(main, doc) {
    const anoAtual = parseInt(doc.ultima_data.slice(0, 4), 10);
    const datas = Grafico.datasDoAno(anoAtual);
    const qc = doc.qc || {};

    const sec = document.createElement("section");
    sec.className = "estacao";
    sec.id = "historico";
    sec.innerHTML = `
      <div class="estacao-cabecalho">
        <h2>Histórico completo</h2>
        <span class="estacao-codigos">todos os anos após o controle de qualidade · linha média · ano vigente em destaque</span>
      </div>
      <div class="grafico"></div>
      <p class="estacao-rodape"></p>`;
    main.appendChild(sec);
    const gd = sec.querySelector(".grafico");

    const traces = [];
    for (const chave of Object.keys(doc.anos).sort()) {
      const ano = Number(chave);
      if (ano === anoAtual) continue;
      const t = traceAno(doc, datas, ano, COR_FUNDO, 1, { legenda: false });
      traces.push(t);
    }
    const media = mediaHistorica(doc, anoAtual);
    const anosHist = Object.keys(doc.anos).filter((a) => Number(a) !== anoAtual);
    const tMedia = traceAno({ ...doc, anos: { media } }, datas, "media", COR_MEDIA, 2.2,
                            { nome: "Média", dash: "dot" });
    tMedia.name = `Média (${anosHist.length} anos)`;
    traces.push(tMedia);
    const tAtual = traceAno(doc, datas, anoAtual, COR_VIGENTE, 2.5,
                            { nome: `Observado ${anoAtual}` });
    tAtual.name = `Observado ${anoAtual}`;
    traces.push(tAtual);
    Plotly.react(gd, traces, layoutBase(doc, anoAtual), CONFIG);

    const rodape = sec.querySelector(".estacao-rodape");
    const nTrechos = (qc.trechos_descartados || []).length;
    rodape.textContent = qc.dias_descartados
      ? `Controle de qualidade do pipeline: ${qc.dias_descartados} dia(s) descartado(s) ` +
        `(${qc.valores_nao_positivos} valores não positivos e ${nTrechos} trecho(s) com salto ` +
        `de escala/erro de curva-chave). Detalhes na memória de cálculo.`
      : "";

    EXTRAS.push({
      titulo: "Histórico completo",
      subtitulo: `${doc.nome} · ${anosHist.length} anos + média + ${anoAtual} em destaque (pós-QC)`,
      grafico: gd,
      rodape: rodape.textContent || undefined,
    });
  }

  return { montarComparacao, montarHistorico, extras: EXTRAS };
})();
