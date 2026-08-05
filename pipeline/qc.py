"""Controle de qualidade da série de telemetria (vazão diária).

Falhas observadas nesta estação (18821000): anos inteiros em escala errada
(2018 ~80x), meses de lixo (jan/2019, dez/2017), zeros (2015) e picos isolados.
Secas reais (ex.: jan/2016) desviam muito da mediana sazonal mas evoluem de
forma CONTÍNUA — por isso o QC não corta por desvio pontual, e sim por
segmentos delimitados por descontinuidades:

1. Descarta valores <= 0 (vazão nula não é física neste rio).
2. Monta a referência sazonal: mediana, por dia do calendário, entre os anos
   (em log), suavizada com janela circular de ±7 dias.
3. Segmenta a série contínua nas descontinuidades: salto dia-a-dia com razão
   > SALTO_RAZAO ou lacuna > LACUNA_DIAS.
4. Descarta o segmento inteiro se a mediana de |v/referência| do segmento
   estiver fora de [1/SEGMENTO_RAZAO, SEGMENTO_RAZAO] — assinatura de erro de
   curva-chave/escala. Segmentos coerentes (mesmo em seca extrema) permanecem.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

SALTO_RAZAO = 2.5      # razão dia-a-dia que caracteriza descontinuidade
LACUNA_DIAS = 3        # lacuna que também inicia novo segmento
SEGMENTO_RAZAO = 4.0   # desvio mediano do segmento vs referência para descartar
SUAVIZACAO_DIAS = 7    # meia-janela da suavização circular da referência

OFFSETS_MES = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]


def _indice_dia(ts: pd.Timestamp) -> int:
    return OFFSETS_MES[ts.month - 1] + ts.day - 1


def _referencia_sazonal(idx_dia: np.ndarray, logv: np.ndarray) -> np.ndarray:
    """Mediana de log(v) por dia do calendário, suavizada circularmente."""
    ref = np.full(366, np.nan)
    for i in range(366):
        vals = logv[idx_dia == i]
        if len(vals):
            ref[i] = np.median(vals)
    suave = np.full(366, np.nan)
    for i in range(366):
        janela = [(i + d) % 366 for d in range(-SUAVIZACAO_DIAS, SUAVIZACAO_DIAS + 1)]
        vals = ref[janela]
        vals = vals[~np.isnan(vals)]
        if len(vals):
            suave[i] = np.median(vals)
    return suave


def qc_telemetria(df_tele: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Retorna (df_limpo, relatorio). relatorio vai para o JSON (auditoria)."""
    rel = {"valores_nao_positivos": 0, "trechos_descartados": [], "dias_descartados": 0}
    if df_tele is None or df_tele.empty:
        return df_tele, rel

    df = df_tele.sort_values("HORDATAHORA").reset_index(drop=True).copy()
    positivos = df["valor"] > 0
    rel["valores_nao_positivos"] = int((~positivos).sum())
    df = df[positivos].reset_index(drop=True)
    if df.empty:
        rel["dias_descartados"] = rel["valores_nao_positivos"]
        return df, rel

    idx_dia = df["HORDATAHORA"].map(_indice_dia).to_numpy()
    logv = np.log(df["valor"].astype(float).to_numpy())
    ref = _referencia_sazonal(idx_dia, logv)

    dias = df["HORDATAHORA"].dt.normalize()
    lacuna = dias.diff().dt.days.fillna(1).to_numpy()
    salto = np.abs(np.diff(logv, prepend=logv[0]))
    novo_segmento = (lacuna > LACUNA_DIAS) | (salto > np.log(SALTO_RAZAO))
    segmento = np.cumsum(novo_segmento)

    desvio = logv - ref[idx_dia]
    manter = np.ones(len(df), dtype=bool)
    for s in np.unique(segmento):
        sel = segmento == s
        dev = desvio[sel]
        dev = dev[~np.isnan(dev)]
        if len(dev) == 0:
            continue
        med = float(np.median(dev))
        if abs(med) > np.log(SEGMENTO_RAZAO):
            manter[sel] = False
            datas_seg = df.loc[sel, "HORDATAHORA"]
            rel["trechos_descartados"].append({
                "inicio": datas_seg.min().date().isoformat(),
                "fim": datas_seg.max().date().isoformat(),
                "dias": int(sel.sum()),
                "razao_mediana_vs_referencia": round(float(np.exp(med)), 2),
            })

    rel["dias_descartados"] = rel["valores_nao_positivos"] + int((~manter).sum())
    if rel["dias_descartados"]:
        log.warning(
            "QC telemetria: %d dia(s) descartado(s) — %d não positivos, %d em %d trecho(s) "
            "com salto de escala (ex.: %s)",
            rel["dias_descartados"], rel["valores_nao_positivos"], int((~manter).sum()),
            len(rel["trechos_descartados"]),
            "; ".join(f"{t['inicio']}..{t['fim']} ({t['razao_mediana_vs_referencia']}x)"
                      for t in rel["trechos_descartados"][:4]),
        )
    return df[manter].reset_index(drop=True), rel
