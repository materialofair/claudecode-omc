param(
    [string]$PlanFile = "task_plan.md"
)

if (-not (Test-Path $PlanFile)) {
    Write-Host "ERROR: $PlanFile not found"
    exit 1
}

$content = Get-Content $PlanFile -Raw
$total = ([regex]::Matches($content, "### Phase")).Count
$complete = ([regex]::Matches($content, "\*\*Status:\*\* complete")).Count
$inProgress = ([regex]::Matches($content, "\*\*Status:\*\* in_progress")).Count
$pending = ([regex]::Matches($content, "\*\*Status:\*\* pending")).Count

Write-Host "Total phases: $total"
Write-Host "Complete: $complete"
Write-Host "In progress: $inProgress"
Write-Host "Pending: $pending"

if ($total -gt 0 -and $complete -eq $total) {
    Write-Host "ALL PHASES COMPLETE"
    exit 0
}

Write-Host "TASK NOT COMPLETE"
exit 1

