# Registra as tarefas agendadas de atualização (10:00 e 14:00, diárias).
# Rode uma vez, num PowerShell comum (não precisa de administrador):
#   powershell -ExecutionPolicy Bypass -File agendamento\registrar_tarefa.ps1

$raiz = Split-Path -Parent $PSScriptRoot
$python = Join-Path (Split-Path -Parent $raiz) "app bancos ANA\.venv\Scripts\python.exe"
$script = Join-Path $raiz "atualizar.py"

if (-not (Test-Path $python)) { Write-Error "Python não encontrado: $python"; exit 1 }
if (-not (Test-Path $script)) { Write-Error "Script não encontrado: $script"; exit 1 }

$acao = New-ScheduledTaskAction -Execute $python -Argument "`"$script`"" -WorkingDirectory $raiz
$gatilhos = @(
    (New-ScheduledTaskTrigger -Daily -At "10:00"),
    (New-ScheduledTaskTrigger -Daily -At "14:00")
)
# StartWhenAvailable: roda assim que possível se a máquina estava desligada no horário.
# Limita a execução a quando o usuário está logado (token MSAL fica no perfil do usuário).
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName "AnalogiaBeloMonte-Atualizar" `
    -Action $acao -Trigger $gatilhos -Settings $config -Force

Write-Host "Tarefa 'AnalogiaBeloMonte-Atualizar' registrada (10:00 e 14:00, diária)."
Write-Host "Teste com: Start-ScheduledTask -TaskName 'AnalogiaBeloMonte-Atualizar'"
Write-Host "Logs em: $raiz\logs\"
