param(
    [string]$ProjectName = "project"
)

$date = Get-Date -Format "yyyy-MM-dd"
Write-Host "Initializing planning files for: $ProjectName"

if (-not (Test-Path "task_plan.md")) {
    Copy-Item "skills/planning-with-files/templates/task_plan.md" "task_plan.md"
    Write-Host "Created task_plan.md"
} else {
    Write-Host "task_plan.md already exists, skipping"
}

if (-not (Test-Path "findings.md")) {
    Copy-Item "skills/planning-with-files/templates/findings.md" "findings.md"
    Write-Host "Created findings.md"
} else {
    Write-Host "findings.md already exists, skipping"
}

if (-not (Test-Path "progress.md")) {
    Copy-Item "skills/planning-with-files/templates/progress.md" "progress.md"
    (Get-Content "progress.md") -replace "\[DATE\]", $date | Set-Content "progress.md"
    Write-Host "Created progress.md"
} else {
    Write-Host "progress.md already exists, skipping"
}

Write-Host "Planning files initialized."

