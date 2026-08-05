# Analogia Belo Monte — Projeção de Nível

Site estático com a projeção de nível d'água por analogia da estação
**UHE Belo Monte Montante** (rio Xingu, HidroWeb 18821000), alimentado pelo data
lake da ANA via pipeline local agendado 2x/dia.

Projeto derivado do [projecoes-hidrovias](https://github.com/dlpena/projecoes-hidrovias)
— mesma metodologia, aparência e exportações (PDF e memória de cálculo gerados no
navegador refletindo o intervalo ajustado). Particularidade desta estação: **não há
dados no banco HIDRO** — a série é composta integralmente pela telemetria, disponível
desde ago/2014, o que limita o universo de anos análogos a pouco mais de uma década.

## Uso

```bash
python atualizar.py            # rodada incremental + push
python atualizar.py --full     # refaz o cache do zero
python -m pytest tests/ -q     # testes (paridade Python <-> JS)
```

Roda com o venv do "app bancos ANA" (`..\app bancos ANA\.venv`), que tem a conexão
autenticada (Entra ID/MSAL) com o data lake. Agendamento:
`powershell -ExecutionPolicy Bypass -File agendamento\registrar_tarefa.ps1`
(tarefa `AnalogiaBeloMonte-Atualizar`, 10:00 e 14:00, requer usuário logado).

A pasta `docs/` é 100% autocontida (sem CDN) — para internalizar no ambiente da ANA,
basta copiá-la para um servidor interno.
