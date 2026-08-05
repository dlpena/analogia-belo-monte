"""Única fonte da verdade das estações do projeto.

- estcodigo_telemetria: código do equipamento (ESTCODIGO / HORESTACAO em hidroInfoAna).
- codigo_hidroweb: código de 8 dígitos do HidroWeb (EstacaoCodigo nos pivots / ESTCODIGOADICIONAL).

Nota: a estação 18821000 não possui dados no banco HIDRO (nem consistido, nem
bruto) — a série integrada é composta apenas pela telemetria (ago/2014 em diante),
por isso o fetch deste projeto congela também o histórico de telemetria.
"""

ESTACOES = [
    {"slug": "belo-monte-montante", "nome": "UHE BELO MONTE MONTANTE", "rio": "Xingu",
     "estcodigo_telemetria": 33552200, "codigo_hidroweb": 18821000,
     "variavel": "vazao", "grandeza": "Vazão", "unidade": "m³/s"},
]

POR_SLUG = {e["slug"]: e for e in ESTACOES}
