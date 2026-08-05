"""Recomposição da série integrada (consistido > bruto > telemetria) e QC.

Como a estação deste projeto é 100% telemetria (sem consistência do HIDRO),
há um controle de qualidade automático: valores diários manifestamente espúrios
(sentinelas/lixo de transmissão, ex. 641172 cm) são descartados por uma cerca
robusta baseada nos quantis do próprio histórico da estação.
"""

from __future__ import annotations

import logging

import pandas as pd

from ana_app import queries

log = logging.getLogger(__name__)


def filtrar_telemetria(df_tele: pd.DataFrame) -> pd.DataFrame:
    """Descarta dias com valor fora da cerca robusta [q0.5% - A/2, q99.5% + A/2],
    onde A é a amplitude entre os quantis 0,5% e 99,5% do histórico da estação.

    O dia descartado vira lacuna (o algoritmo de analogia lida com falhas);
    a cobertura por fonte reflete o descarte.
    """
    if df_tele is None or df_tele.empty:
        return df_tele
    v = df_tele["valor"].astype(float)
    q_baixo, q_alto = v.quantile(0.005), v.quantile(0.995)
    amplitude = q_alto - q_baixo
    lo, hi = q_baixo - 0.5 * amplitude, q_alto + 0.5 * amplitude
    mascara = v.between(lo, hi)
    descartados = int((~mascara).sum())
    if descartados:
        exemplos = sorted(v[~mascara].tolist(), reverse=True)[:5]
        log.warning(
            "QC telemetria: %d dia(s) descartado(s) fora de [%.0f, %.0f] cm (ex.: %s)",
            descartados, lo, hi, ", ".join(f"{x:.0f}" for x in exemplos),
        )
    return df_tele[mascara].reset_index(drop=True)


def serie_integrada(df_hidro: pd.DataFrame, df_tele: pd.DataFrame) -> pd.DataFrame:
    """Série diária integrada. Colunas: data (Timestamp normalizado), valor, fonte."""
    df = queries.compor_serie_integrada(df_hidro, df_tele)
    df = df.rename(columns={"HORDATAHORA": "data"})
    return df.sort_values("data").reset_index(drop=True)
