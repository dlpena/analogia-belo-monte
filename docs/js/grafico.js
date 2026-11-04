/* Montagem dos gráficos Plotly, controles de range e export CSV. */
"use strict";

const Grafico = (() => {
  const REGISTRO = new Map();
  let UNIDADE = "cm";      // definidos por montarSecao a partir do JSON
  let GRANDEZA = "Cota"; // slug -> {doc, grafico, resultado atual} p/ o PDF do conjunto
  const CORES = {
    observado: "#1a1a1a",
    inferior: "#D55E00",   // curva de baixo (maior queda ou menor subida)
    superior: "#0072B2",   // curva de cima (menor queda ou maior subida)
    media: "#009E73",
    anoAnalogo: "#b5b5b5",
    anoComum: "#e4e4e4",
    diaD: "#888",
    pontoControle1: "#C0392B",
    pontoControle2: "#E0A526",
  };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
                 "jul", "ago", "set", "out", "nov", "dez"];
  // padrão: ano civil (gráfico jan–dez, projeção até 31/dez); o usuário pode escolher
  // um horizonte de 1 a 12 meses inteiros após o mês do último dado e voltar ao padrão
  const HORIZONTE_PADRAO = null;
  const MESES_JANELA = 12;      // meses inteiros no gráfico, além do mês do último dado

  // ---- janela do gráfico: datas em UTC, sem depender do fuso do navegador ----
  const paraData = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const paraISO = (dt) => dt.toISOString().slice(0, 10);

  /** Datas ISO de `ini` a `fim`, inclusive. */
  function datasEntre(ini, fim) {
    const out = [];
    for (let t = paraData(ini), f = paraData(fim); t <= f; t = new Date(t.getTime() + 864e5)) {
      out.push(paraISO(t));
    }
    return out;
  }

  /** Valor da série integrada numa data ISO (null sem dado ou 29/fev inexistente). */
  function valorEm(doc, iso) {
    const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
    const serie = doc.anos[String(y)];
    if (!serie || (m === 2 && d === 29 && !Analogia.bissexto(y))) return null;
    const v = serie[Analogia.indiceDia(m, d)];
    return v === null || v === undefined ? null : v;
  }

  /** Início do gráfico: dia 1 do mês que deixa MESES_JANELA meses inteiros na tela
   * (observados + projetados), sem contar o mês do último dado. Sem horizonte
   * (regra original), 1º de janeiro do ano corrente. */
  function inicioJanela(r) {
    if (r.horizonte_meses === null || r.horizonte_meses === undefined) return `${r.ano_atual}-01-01`;
    const y = Number(r.dia_d.slice(0, 4)), m = Number(r.dia_d.slice(5, 7));
    return paraISO(new Date(Date.UTC(y, m - 1 - (MESES_JANELA - r.horizonte_meses), 1)));
  }

  /** Datas da janela inteira do gráfico (início do mês até o fim do horizonte). */
  function datasJanela(r) {
    return datasEntre(inicioJanela(r), r.fim_horizonte);
  }

  const rotuloMes = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

  /** datas[i] = "YYYY-MM-DD" do índice i no ano dado (null p/ 29/fev inexistente). */
  function datasDoAno(ano) {
    const datas = new Array(366).fill(null);
    for (let m = 1; m <= 12; m++) {
      const nDias = new Date(ano, m, 0).getDate();
      for (let d = 1; d <= nDias; d++) {
        datas[Analogia.indiceDia(m, d)] =
          `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
    return datas;
  }

  /** Linha a partir de x (datas ISO) e y alinhados. */
  function traceSerie(x, y, nome, cor, largura, visivelHover) {
    return {
      x, y: y.map((v) => (v === undefined ? null : v)), name: nome, mode: "lines",
      line: { color: cor, width: largura },
      hoverinfo: visivelHover ? undefined : "skip",
      hovertemplate: visivelHover ? `${nome}: %{y:.0f} ${UNIDADE}<extra></extra>` : undefined,
      showlegend: false, connectgaps: false,
    };
  }

  function formatarDataBR(iso) {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }

  function numeroBR(v, casas = 1) {
    return v === null || v === undefined ? "" : v.toFixed(casas).replace(".", ",");
  }

  /** Mínimo (valor, data) de uma trajetória alinhada a r.datas_proj (de D ao fim do horizonte). */
  function minimoTrajetoria(serie, datasProj) {
    let min = null, dataMin = null;
    for (let k = 0; k < datasProj.length; k++) {
      if (serie[k] !== null && serie[k] !== undefined) {
        if (min === null || serie[k] < min) { min = serie[k]; dataMin = datasProj[k]; }
      }
    }
    return { min, dataMin };
  }

  /** Máximo (valor, data) de uma trajetória alinhada a r.datas_proj. */
  function maximoTrajetoria(serie, datasProj) {
    let max = null, dataMax = null;
    for (let k = 0; k < datasProj.length; k++) {
      if (serie[k] !== null && serie[k] !== undefined) {
        if (max === null || serie[k] > max) { max = serie[k]; dataMax = datasProj[k]; }
      }
    }
    return { max, dataMax };
  }

  // ---- regime dos análogos e curvas extremas (ver regras em analogia.js) ----
  const NOME_CRITERIO = {
    maior_queda: "Maior queda", menor_queda: "Menor queda",
    menor_subida: "Menor subida", maior_subida: "Maior subida",
  };

  /** Extremo marcado em cada curva: o mínimo nas curvas de queda, o máximo nas de subida;
   * na média, o do regime. */
  const tipoExtremo = (criterio) => (criterio.endsWith("subida") ? "max" : "min");
  const tipoExtremoMedia = (r) => (r.regime === "subida" ? "max" : "min");

  /** Extremo (valor, data) de uma trajetória, mínimo ou máximo. */
  function extremoTrajetoria(serie, datasProj, tipo) {
    if (tipo === "max") {
      const { max, dataMax } = maximoTrajetoria(serie, datasProj);
      return { valor: max, data: dataMax };
    }
    const { min, dataMin } = minimoTrajetoria(serie, datasProj);
    return { valor: min, data: dataMin };
  }

  /** Curvas inferior e superior com nome, ano, cor e extremo marcado. */
  function curvasExtremas(r) {
    const tj = r.trajetorias;
    if (!tj) return [];
    return [
      { chave: "inferior", serie: tj.inferior, interp: tj.inferior_interp, ano: r.ano_inferior,
        criterio: r.criterio_inferior, cor: CORES.inferior },
      { chave: "superior", serie: tj.superior, interp: tj.superior_interp, ano: r.ano_superior,
        criterio: r.criterio_superior, cor: CORES.superior },
    ].map((c) => ({ ...c, nome: NOME_CRITERIO[c.criterio], tipo: tipoExtremo(c.criterio) }));
  }

  const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

  /** Frase do regime para a tela, o CSV e o PDF. */
  function textoRegime(r) {
    if (!r.regime) return "";
    if (!r.ciclo) {
      return `Regime dos análogos: ${r.regime} (nenhum análogo com o ciclo anual completo; ` +
             "curvas de maior e menor queda).";
    }
    const c = r.ciclo;
    const curvas = r.regime === "subida"
      ? "curvas de menor e maior subida (a data média do mínimo já passou)"
      : "curvas de maior e menor queda (a data média do mínimo ainda não chegou)";
    const quais = c.n < r.selecionados.length
      ? `${c.n} análogos com o ciclo anual completo (de ${r.selecionados.length})`
      : `${c.n} análogos`;
    return `Regime dos análogos: ${r.regime}, com ${curvas}. Data média do mínimo dos ` +
           `${quais}: ${dataCurta(c.data_media_min)} (desvio de ${Math.round(c.desvio_min)} dias); ` +
           `data média do máximo: ${dataCurta(c.data_media_max)} (desvio de ${Math.round(c.desvio_max)} dias).`;
  }

  function marcador(x, y, texto, cor, posicao) {
    return {
      x: [x], y: [y], mode: "markers+text", text: [texto],
      textposition: posicao, cliponaxis: false,
      marker: { color: cor, size: 8 },
      textfont: { size: 11, color: cor, family: "Segoe UI, system-ui, sans-serif" },
      hoverinfo: "skip", showlegend: false,
    };
  }

  /** Marcador sem texto embutido — o rótulo vira annotation posicionada em pixels (ver posicionarRotulos). */
  function marcadorSemTexto(x, y, cor) {
    return {
      x: [x], y: [y], mode: "markers", cliponaxis: false,
      marker: { color: cor, size: 8 },
      hoverinfo: "skip", showlegend: false,
    };
  }

  /** Rótulo do delta da curva para a legenda: " · queda 191 cm" ou " · subida 85 cm",
   * conforme o critério que escolheu a curva. */
  function rotuloDelta(r, ano, criterio) {
    const c = r.candidatos.find((c) => c.ano === ano);
    if (!c) return "";
    const subida = criterio.endsWith("subida");
    const v = subida ? c.subida : c.delta;
    if (v === null || v === undefined) return "";
    return ` · ${subida ? "subida" : "queda"} ${Math.round(v)} ${UNIDADE}`;
  }

  /** Amplitude vertical dos dados plotados (para calibrar a anticolisão). */
  function faixaY(doc, r) {
    let min = Infinity, max = -Infinity;
    const varre = (serie) => {
      for (const v of serie) {
        if (v !== null && v !== undefined) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    };
    varre(datasEntre(inicioJanela(r), r.dia_d).map((iso) => valorEm(doc, iso)));
    if (r.trajetorias) {
      Object.values(r.trajetorias.todas).forEach(varre);
      varre(r.trajetorias.inferior);
      varre(r.trajetorias.superior);
    }
    return max > min ? max - min : 1;
  }

  // Rótulo isolado (sem colisão): só desloca em pixels (yshift: +acima/-abaixo), sem
  // linha-guia — não precisa, é óbvio a quem pertence.
  const DESLOCAMENTO_PADRAO = { comSeta: false, xshift: 0, yshift: -14 };

  /**
   * Deslocamento do k-ésimo rótulo (0 = ponto mais alto) de um cluster de `total` pontos que
   * colidiriam entre si. Os extremos vão na vertical AFASTANDO-SE um do outro (o mais alto
   * sobe, o mais baixo desce), sem linha-guia. Os do meio vão na diagonal E ganham uma
   * linha-guia curta até o marcador (ax/ay, convenção do Plotly: ay negativo = acima) — só o
   * deslocamento não bastava: "de lado" cai em cima da linha pontilhada, e longe demais sem
   * guia parece "solto" do ponto.
   */
  function deslocamentoDoCluster(k, total) {
    if (k === 0) return { comSeta: false, xshift: 0, yshift: 18 };           // mais alto: acima
    if (k === total - 1) return { comSeta: false, xshift: 0, yshift: -18 };  // mais baixo: abaixo
    return { comSeta: true, ax: k % 2 === 1 ? 24 : -24, ay: -14 };           // meio: diagonal + guia
  }

  /**
   * Agrupa mínimos que colidiriam visualmente (próximos em data e em valor) e devolve,
   * por índice, o deslocamento em pixels do rótulo — garantindo separação mesmo quando os
   * mínimos praticamente coincidem em x/y (ex.: maior/menor queda e média a poucos cm/m³ e
   * poucos dias um do outro).
   */
  function posicionarRotulos(minimos, amplitudeY) {
    // rótulo isolado: abaixo do mínimo, acima do máximo
    const padrao = (m) => (m.tipo === "max" ? { ...DESLOCAMENTO_PADRAO, yshift: 14 } : DESLOCAMENTO_PADRAO);
    const limY = amplitudeY * 0.07;
    const n = minimos.length;
    const adjacentes = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dDias = Math.abs(new Date(minimos[i].x) - new Date(minimos[j].x)) / 864e5;
        if (dDias < 20 && Math.abs(minimos[i].y - minimos[j].y) < limY) {
          adjacentes[i].push(j);
          adjacentes[j].push(i);
        }
      }
    }
    const deslocamentos = minimos.map(padrao);
    const visitado = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (visitado[i]) continue;
      const cluster = [i];
      visitado[i] = true;
      for (let k = 0; k < cluster.length; k++) {
        for (const viz of adjacentes[cluster[k]]) {
          if (!visitado[viz]) { visitado[viz] = true; cluster.push(viz); }
        }
      }
      if (cluster.length > 1) {
        cluster.sort((a, b) => minimos[b].y - minimos[a].y); // mais alto primeiro
        cluster.forEach((idx, k) => {
          deslocamentos[idx] = deslocamentoDoCluster(k, cluster.length);
        });
      }
    }
    return deslocamentos;
  }

  function montarTraces(doc, r) {
    const datasProj = r.datas_proj;
    const traces = [];
    const anotacoesMinimos = [];

    // trajetórias deslocadas dos anos análogos, apenas após o dia D (fundo)
    if (r.trajetorias) {
      for (const [ano, serie] of Object.entries(r.trajetorias.todas)) {
        const t = traceSerie(datasProj, serie, ano, CORES.anoAnalogo, 1, true);
        t.hovertemplate = `${ano} (análogo): %{y:.0f} ${UNIDADE}<extra></extra>`;
        traces.push(t);
      }
      const tj = r.trajetorias;
      const proj = [
        ...curvasExtremas(r).map((c) => [
          c.serie, `${c.nome} (${c.ano}${rotuloDelta(r, c.ano, c.criterio)})`, c.cor, "solid"]),
        [tj.media, `Média (${r.selecionados.length} anos)`, CORES.media, "dot"],
      ];
      for (const [serie, nome, cor, traco] of proj) {
        const t = traceSerie(datasProj, serie, nome, cor, 2, true);
        t.line.dash = traco;
        t.showlegend = true;
        traces.push(t);
      }
    }

    // observado: do início da janela (pode estar no ano anterior) até o último dado
    const datasObs = datasEntre(inicioJanela(r), r.dia_d);
    const tObs = traceSerie(datasObs, datasObs.map((iso) => valorEm(doc, iso)),
                            "Observado", CORES.observado, 2.5, true);
    tObs.showlegend = true;
    traces.push(tObs);

    // marcadores com valores: último dado e extremo de cada projeção (mínimo nas curvas
    // de queda, máximo nas de subida)
    traces.push(marcador(r.dia_d, r.cota_atual, String(Math.round(r.cota_atual)),
                         CORES.observado, "top center"));
    if (r.trajetorias) {
      const tj = r.trajetorias;
      const minimos = [];
      for (const [serie, cor, tipo] of [
        ...curvasExtremas(r).map((c) => [c.serie, c.cor, c.tipo]),
        [tj.media, CORES.media, tipoExtremoMedia(r)],
      ]) {
        const { valor, data } = extremoTrajetoria(serie, datasProj, tipo);
        if (valor !== null) minimos.push({ x: data, y: valor, cor, tipo });
      }
      const deslocamentos = posicionarRotulos(minimos, faixaY(doc, r));
      minimos.forEach((m, i) => {
        traces.push(marcadorSemTexto(m.x, m.y, m.cor));
        const d = deslocamentos[i];
        anotacoesMinimos.push({
          x: m.x, y: m.y, xref: "x", yref: "y",
          text: String(Math.round(m.y)),
          xanchor: "center", yanchor: "middle",
          font: { size: 11, color: m.cor, family: "Segoe UI, system-ui, sans-serif" },
          ...(d.comSeta
            ? { showarrow: true, ax: d.ax, ay: d.ay, axref: "pixel", ayref: "pixel",
                arrowhead: 0, arrowwidth: 1, arrowcolor: m.cor, standoff: 3 }
            : { showarrow: false, xshift: d.xshift, yshift: d.yshift }),
        });
      });
    }
    return { traces, anotacoesMinimos };
  }

  /** Linhas horizontais e rótulos dos pontos de controle (valores de referência definidos pelo usuário). */
  function shapesPontosControle(pontos) {
    const shapes = [];
    const anotacoes = [];
    const defs = [
      { valor: pontos.pc1, cor: CORES.pontoControle1, nome: "Ponto de controle 1" },
      { valor: pontos.pc2, cor: CORES.pontoControle2, nome: "Ponto de controle 2" },
    ];
    for (const d of defs) {
      if (d.valor === null || d.valor === undefined || !isFinite(d.valor)) continue;
      shapes.push({
        type: "line", xref: "paper", yref: "y",
        x0: 0, x1: 1, y0: d.valor, y1: d.valor,
        line: { color: d.cor, width: 1.5 },
      });
      anotacoes.push({
        x: 1, xref: "paper", y: d.valor, yref: "y",
        text: d.nome, showarrow: false,
        xanchor: "left", yanchor: "middle", xshift: 8,
        font: { size: 11, color: d.cor, family: "Segoe UI, system-ui, sans-serif" },
      });
    }
    return { shapes, anotacoes };
  }

  function layoutBase(doc, r, pontos) {
    const { shapes: shapesPC, anotacoes: anotacoesPC } = shapesPontosControle(pontos || {});
    return {
      margin: { l: 58, r: shapesPC.length ? 150 : 16, t: 8, b: 34 },
      separators: ",.",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Segoe UI, system-ui, sans-serif", size: 12, color: "#555" },
      dragmode: false,   // sem zoom/pan por clique-e-arraste
      xaxis: (() => {
        const ticks = datasJanela(r).filter((iso) => iso.endsWith("-01"));
        return {
          fixedrange: true,
          tickvals: ticks,
          ticktext: semHorizonte(r) ? ticks.map((iso) => MESES[Number(iso.slice(5, 7)) - 1])
                                    : ticks.map(rotuloMes),
          hoverformat: "%d/%m/%Y",
          gridcolor: "#efefec",
          range: [inicioJanela(r), r.fim_horizonte],
        };
      })(),
      yaxis: {
        fixedrange: true,
        title: { text: `${GRANDEZA} (${UNIDADE})`, font: { size: 12 } },
        tickformat: ",d",   // valor inteiro com separador de milhar (sem "k")
        nticks: 14,         // passo menor entre os ticks
        gridcolor: "#efefec",
        zeroline: false,
      },
      legend: {
        orientation: "h", y: 1.02, yanchor: "bottom", x: 0,
        font: { size: 11.5, color: "#1a1a1a" },
      },
      hovermode: "x unified",
      shapes: [{
        type: "line", xref: "x", yref: "paper",
        x0: r.dia_d, x1: r.dia_d, y0: 0, y1: 1,
        line: { color: CORES.diaD, width: 1, dash: "dot" },
      }, ...shapesPC],
      annotations: [{
        x: r.dia_d, xref: "x", y: 1, yref: "paper",
        text: `último dado ${formatarDataBR(r.dia_d)}`,
        showarrow: false, yanchor: "bottom", xanchor: "left",
        font: { size: 10.5, color: "#888" },
      }, ...anotacoesPC],
    };
  }

  const CONFIG = {
    responsive: true,
    displayModeBar: false,   // sem comandos de manipulação (zoom, pan etc.)
    scrollZoom: false,
    doubleClick: false,
  };

  function gerarCSV(doc, r) {
    const L = [];
    const cab = `${doc.nome} (${doc.rio || ""}) · HidroWeb ${doc.codigo_hidroweb} · telemetria ${doc.estcodigo_telemetria}`;
    L.push(`Memória de cálculo — projeção por analogia;${cab}`);
    L.push(`Gerado em;${new Date().toLocaleString("pt-BR")}`);
    L.push(`Dados atualizados em;${formatarDataBR(doc.ultima_data)};fonte do último dado;${doc.fonte_ultimo_dado}`);
    L.push(`Dia D;${formatarDataBR(r.dia_d)};${GRANDEZA} atual (${UNIDADE});${numeroBR(r.cota_atual, 0)}`);
    L.push(`Intervalo (${GRANDEZA.toLowerCase()} atual ±);${numeroBR(r.range_valor)} ${r.modo === "cm" ? UNIDADE : "%"};equivalente em ${UNIDADE};±${numeroBR(r.limite_cm)}`);
    if (r.pc1 !== null && r.pc1 !== undefined) L.push(`Ponto de controle 1 (${UNIDADE});${numeroBR(r.pc1, 0)}`);
    if (r.pc2 !== null && r.pc2 !== undefined) L.push(`Ponto de controle 2 (${UNIDADE});${numeroBR(r.pc2, 0)}`);
    L.push(`Horizonte da projeção;${rotuloHorizonte(r)}`);
    L.push(`Regras;tolerância ±3 dias no dia D;cobertura de D ao fim do horizonte ≥80% e dado nos últimos 10 dias do horizonte`);
    if (r.regime) L.push(`Regime;${textoRegime(r)}`);
    L.push("");
    L.push("BLOCO 1 — Anos candidatos (universo completo e seleção)");
    L.push(`ano;fonte_dos_dados;valor_em_D_${UNIDADE};dias_tolerancia;cobertura_pos_D_%;min_pos_D_${UNIDADE};delta_queda_${UNIDADE};max_pos_D_${UNIDADE};delta_subida_${UNIDADE};dia_do_minimo_do_ciclo;dia_do_maximo_do_ciclo;selecionado;motivo_exclusao`);
    for (const c of r.candidatos) {
      L.push([
        c.ano,
        (doc.fonte_por_ano || {})[String(c.ano)] || "",
        numeroBR(c.cota_em_d, 0),
        c.dias_tolerancia === null ? "" : c.dias_tolerancia,
        c.cobertura === null ? "" : numeroBR(c.cobertura * 100),
        numeroBR(c.min_pos_d, 0),
        numeroBR(c.delta, 0),
        numeroBR(c.max_pos_d, 0),
        numeroBR(c.subida, 0),
        c.dia_min_ciclo === null ? "" : c.dia_min_ciclo,
        c.dia_max_ciclo === null ? "" : c.dia_max_ciclo,
        c.selecionado ? "sim" : "não",
        c.motivo || "",
      ].join(";"));
    }
    L.push("dia_do_minimo_do_ciclo e dia_do_maximo_do_ciclo: dias em relação a D (negativo = antes de D) no ciclo de 365 dias centrado em D");
    L.push("");
    L.push(`BLOCO 2 — Séries do gráfico (dia a dia, ${formatarDataBR(inicioJanela(r))} a ${formatarDataBR(r.fim_horizonte)})`);
    const nomeCol = (crit, padrao) => `proj_${crit || padrao}_${UNIDADE}`;
    L.push(`data;observado_${UNIDADE};${nomeCol(r.criterio_inferior, "inferior")};` +
           `${nomeCol(r.criterio_superior, "superior")};proj_media_${UNIDADE};interpolado`);
    for (const l of linhasSerieDiaria(doc, r)) {
      const linha = [
        formatarDataBR(l.data),
        l.obs === null ? "" : numeroBR(l.obs, 0),
        l.temProj ? numeroBR(l.inferior) : "",
        l.temProj ? numeroBR(l.superior) : "",
        l.temProj ? numeroBR(l.media) : "",
        l.interp ? "sim" : "",
      ];
      if (linha.slice(1).some((v) => v !== "")) L.push(linha.join(";"));
    }
    return L.join("\r\n");
  }

  const semHorizonte = (r) => r.horizonte_meses === null || r.horizonte_meses === undefined;

  /** "6 meses (até 31/05/2027)" ou, no padrão, "ano civil (até 31/12/2026)". */
  function rotuloHorizonte(r) {
    if (semHorizonte(r)) return `ano civil (até ${formatarDataBR(r.fim_horizonte)})`;
    const h = r.horizonte_meses;
    return `${h} ${h === 1 ? "mês" : "meses"} (até ${formatarDataBR(r.fim_horizonte)})`;
  }

  /** Linhas dia a dia da janela do gráfico (usadas no CSV e na memória em PDF). */
  function linhasSerieDiaria(doc, r) {
    const tj = r.trajetorias;
    const k0 = new Map(r.datas_proj.map((iso, k) => [iso, k]));
    return datasJanela(r).map((iso) => {
      const k = k0.has(iso) ? k0.get(iso) : null;
      const temProj = !!tj && k !== null;
      const val = (serie) => (serie[k] === undefined ? null : serie[k]);
      return {
        data: iso,
        obs: iso <= r.dia_d ? valorEm(doc, iso) : null,
        temProj,
        inferior: temProj ? val(tj.inferior) : null,
        superior: temProj ? val(tj.superior) : null,
        media: temProj ? val(tj.media) : null,
        interp: temProj && (tj.inferior_interp[k] || tj.superior_interp[k]),
      };
    });
  }

  function baixarCSV(nomeArquivo, conteudo) {
    const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Cria a seção completa da estação dentro de `main`. */
  function montarSecao(main, doc) {
    UNIDADE = doc.unidade || "cm";
    GRANDEZA = doc.grandeza || "Cota";
    const sec = document.createElement("section");
    sec.className = "estacao";
    sec.id = doc.slug;
    sec.innerHTML = `
      <div class="estacao-cabecalho">
        <h2>${doc.nome}</h2>
        <span class="estacao-codigos">rio ${doc.rio || "—"} · HidroWeb ${doc.codigo_hidroweb} · equip. ${doc.estcodigo_telemetria}</span>
        <span class="estacao-ultimo">Último dado: <strong>${formatarDataBR(doc.ultima_data)}</strong>
          · ${doc.ultimo_valor} ${doc.unidade} (${doc.fonte_ultimo_dado})</span>
      </div>
      <div class="controles">
        <label title="Entram como análogos os anos em que o valor, neste mesmo dia do calendário, estava até esta distância acima ou abaixo do valor atual.">
          Intervalo (${GRANDEZA.toLowerCase()} atual ±)
          <input type="range" min="1" max="500" step="1" value="10" class="ctl-slider">
          <input type="number" min="0.5" max="500" step="0.5" value="10" class="ctl-num">
          <span class="ctl-unidade">${UNIDADE}</span></label>
        <span class="modo">
          <button type="button" class="ctl-cm ativo">± ${UNIDADE}</button>
          <button type="button" class="ctl-pct">± %</button>
        </span>
        <span>Anos análogos: <span class="contagem">–</span></span>
        <span class="acoes">
          <button type="button" class="botao-csv botao-memoria"
             title="Memória de cálculo em PDF com o intervalo ajustado nos controles">Memória de cálculo (PDF)</button>
          <button type="button" class="botao-csv botao-sec" title="Memória de cálculo em CSV com o intervalo ajustado nos controles">CSV</button>
        </span>
      </div>
      <div class="controles-referencia">
        <label title="Padrão: ano civil (gráfico jan–dez, projeção até 31/dez). Ao escolher N meses, a projeção cobre N meses inteiros após o mês do último dado e o gráfico mostra 12 meses inteiros: os demais são os meses observados mais recentes.">
          Horizonte da projeção
          <select class="ctl-horizonte">
            <option value="" selected>jan–dez (padrão)</option>
            ${Array.from({ length: 12 }, (_, i) => i + 1).map((h) =>
              `<option value="${h}">${h} ${h === 1 ? "mês" : "meses"}</option>`).join("")}
          </select>
          <span class="ctl-fim-horizonte"></span></label>
        <button type="button" class="botao-padrao" disabled
                title="Volta o gráfico para o ano civil (jan–dez), com a projeção até 31/dez">Voltar para jan–dez</button>
      </div>
      <div class="controles-referencia">
        <label title="Linha horizontal de referência desenhada no gráfico.">
          ${GRANDEZA} do Ponto de controle 1
          <input type="number" step="1" class="ctl-pc1" placeholder="${UNIDADE}">
          <span>${UNIDADE}</span></label>
        <label title="Linha horizontal de referência desenhada no gráfico.">
          ${GRANDEZA} do Ponto de controle 2
          <input type="number" step="1" class="ctl-pc2" placeholder="${UNIDADE}">
          <span>${UNIDADE}</span></label>
      </div>
      <p class="aviso"></p>
      <p class="regime"></p>
      <div class="grafico"></div>
      <p class="estacao-rodape"></p>`;
    main.appendChild(sec);

    const el = {
      slider: sec.querySelector(".ctl-slider"),
      num: sec.querySelector(".ctl-num"),
      unidade: sec.querySelector(".ctl-unidade"),
      btnCm: sec.querySelector(".ctl-cm"),
      btnPct: sec.querySelector(".ctl-pct"),
      contagem: sec.querySelector(".contagem"),
      aviso: sec.querySelector(".aviso"),
      regime: sec.querySelector(".regime"),
      grafico: sec.querySelector(".grafico"),
      rodape: sec.querySelector(".estacao-rodape"),
      csv: sec.querySelector(".botao-sec"),
      pc1: sec.querySelector(".ctl-pc1"),
      pc2: sec.querySelector(".ctl-pc2"),
      horizonte: sec.querySelector(".ctl-horizonte"),
      fimHorizonte: sec.querySelector(".ctl-fim-horizonte"),
      botaoPadrao: sec.querySelector(".botao-padrao"),
    };
    // intervalo inicial: o menor (≥50 cm) que contém pelo menos 3 anos análogos,
    // calculado no padrão jan–dez (ao trocar o horizonte, o intervalo é mantido)
    const rangeAuto = Analogia.rangeInicial(doc, Analogia.MIN_ANALOGOS, 50.0, HORIZONTE_PADRAO);
    const estado = { range: rangeAuto, modo: "cm", resultado: null, pc1: null, pc2: null,
                     horizonte: HORIZONTE_PADRAO };
    if (rangeAuto > 500) el.slider.max = String(Math.ceil(rangeAuto * 2));
    el.slider.value = String(rangeAuto);
    el.num.value = String(rangeAuto);

    const calcularAtual = () => Analogia.calcular(doc, estado.range, estado.modo, estado.horizonte);

    function render() {
      const r = calcularAtual();
      estado.resultado = r;
      const { traces, anotacoesMinimos } = montarTraces(doc, r);
      const layout = layoutBase(doc, r, { pc1: estado.pc1, pc2: estado.pc2 });
      layout.annotations = layout.annotations.concat(anotacoesMinimos);
      Plotly.react(el.grafico, traces, layout, CONFIG);
      el.contagem.textContent = String(r.selecionados.length);
      el.fimHorizonte.textContent = `até ${formatarDataBR(r.fim_horizonte)}`;
      el.aviso.textContent = r.aviso || "";
      el.regime.textContent = textoRegime(r);
      el.rodape.textContent = r.selecionados.length
        ? `Anos análogos (${GRANDEZA.toLowerCase()} em ${formatarDataBR(r.dia_d).slice(0, 5)} dentro de ±${numeroBR(r.limite_cm)} ${UNIDADE} da atual): ${r.selecionados.join(", ")}.`
        : "";
    }

    let timer = null;
    function agendarRender() {
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    }

    el.slider.addEventListener("input", () => {
      el.num.value = el.slider.value;
      estado.range = Number(el.slider.value);
      agendarRender();
    });
    el.num.addEventListener("input", () => {
      const v = Number(el.num.value);
      if (!isFinite(v) || v <= 0) return;
      estado.range = v;
      el.slider.value = String(Math.min(100, v));
      agendarRender();
    });
    function trocarModo(modo) {
      if (modo === estado.modo) return;
      // mantém o range equivalente ao trocar de unidade (cm <-> % da cota atual)
      const r = estado.resultado || calcularAtual();
      const cota = Math.abs(r.cota_atual) || 1;
      const novo = modo === "pct"
        ? Math.round((estado.range / cota) * 1000) / 10   // cm -> %, 1 casa decimal
        : Math.max(1, Math.round((cota * estado.range) / 100));  // % -> cm
      estado.modo = modo;
      estado.range = novo;
      el.btnCm.classList.toggle("ativo", modo === "cm");
      el.btnPct.classList.toggle("ativo", modo === "pct");
      el.unidade.textContent = modo === "cm" ? UNIDADE : "%";
      el.slider.step = modo === "cm" ? "1" : "0.1";
      el.slider.max = modo === "cm"
        ? String(Math.max(500, Math.ceil(rangeAuto * 2), Math.ceil(novo)))
        : String(Math.max(20, Math.ceil(novo * 2)));
      el.slider.value = String(novo);
      el.num.value = String(novo);
      render();
    }
    el.btnCm.addEventListener("click", () => trocarModo("cm"));
    el.btnPct.addEventListener("click", () => trocarModo("pct"));

    function lerPontoControle(input) {
      const v = Number(input.value);
      return input.value !== "" && isFinite(v) ? v : null;
    }
    el.pc1.addEventListener("input", () => {
      estado.pc1 = lerPontoControle(el.pc1);
      agendarRender();
    });
    el.pc2.addEventListener("input", () => {
      estado.pc2 = lerPontoControle(el.pc2);
      agendarRender();
    });
    function definirHorizonte(valor) {
      estado.horizonte = valor === "" || valor === null ? null : Number(valor);
      el.horizonte.value = estado.horizonte === null ? "" : String(estado.horizonte);
      el.botaoPadrao.disabled = estado.horizonte === null;
      render();
    }
    el.horizonte.addEventListener("change", () => definirHorizonte(el.horizonte.value));
    el.botaoPadrao.addEventListener("click", () => definirHorizonte(null));

    function resultadoComPontosControle() {
      const r = estado.resultado || calcularAtual();
      return { ...r, pc1: estado.pc1, pc2: estado.pc2 };
    }
    sec.querySelector(".botao-memoria").addEventListener("click", () => {
      ExportarPDF.gerarMemoria(doc, resultadoComPontosControle());
    });
    el.csv.addEventListener("click", () => {
      const r = resultadoComPontosControle();
      const sufixo = estado.horizonte === null ? "" : `_${estado.horizonte}m`;
      baixarCSV(`analogia_${doc.slug}_${doc.ultima_data}${sufixo}.csv`, gerarCSV(doc, r));
    });

    REGISTRO.set(doc.slug, {
      doc,
      grafico: el.grafico,
      get resultado() {
        return estado.resultado || calcularAtual();
      },
    });

    render();
  }

  return { montarSecao, datasDoAno, minimoTrajetoria, maximoTrajetoria, extremoTrajetoria,
           curvasExtremas, tipoExtremoMedia, textoRegime, NOME_CRITERIO, linhasSerieDiaria,
           rotuloHorizonte, inicioJanela, registro: REGISTRO };
})();
