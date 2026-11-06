# GLÖGGT: only publish the scoped, read-only document-suggestion UI.
# Run after extracting this package into the original main workspace.
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$releaseRoot = 'C:\GLOGGT-LESUTGAFA'
$base = '90901a7'
$branch = 'utgafa/samstaeda-skjalatillogur-20261106'
$files = @(
    'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx',
    'app/banki/_lib/i18n/visual-reconciliation-text.ts',
    'app/banki/_lib/visual-document-suggestions.ts',
    'scripts/visual-document-suggestions.test.cjs',
    'docs/afhending/2026-11-06-AFSTEMMA-SKJALATILLOGUR.md',
    'docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA-TILLOGUR.ps1'
)
if (-not (Test-Path -LiteralPath $releaseRoot)) { throw 'Hrein utgafumappa fannst ekki.' }
Set-Location -LiteralPath $releaseRoot
$head = (& git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $base) { throw "Rong grunnutgafa: $head. Krafist: $base. Ekkert gert." }
if ((& git status --porcelain --untracked-files=no)) { throw 'Utgafumappan hefur otruddan koda. Engu breytt.' }
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $f))) { throw "Vantar i adalmoppu: $f" }
}
& git switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'Gat ekki stofnad utgafugrein.' }
foreach ($f in $files) {
    $dest = Join-Path $releaseRoot $f
    $destDir = Split-Path -Path $dest -Parent
    if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
    Copy-Item -LiteralPath (Join-Path $sourceRoot $f) -Destination $dest -Force
}
& git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Ekki tokst ad setja afmarkadar skrar i Git.' }
& git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Git diff check mistokst. Ekkert sent.' }
& node --test scripts/visual-document-suggestions.test.cjs scripts/visual-work-queue.test.cjs scripts/visual-one-click-confirmation.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Profun mistokst. Ekkert sent.' }
# Dummy values only for this process. Build must not connect to Production.
$names = @('DATABASE_URL', 'DIRECT_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$env:DATABASE_URL = 'postgresql://blocked:blocked@127.0.0.1:65432/blocked'
$env:DIRECT_URL = $env:DATABASE_URL
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
$env:SUPABASE_SERVICE_ROLE_KEY = 'build-only-invalid-key'
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Bygging mistokst. Ekkert sent.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
& git commit -m 'GLOGGT: suggest likely documents when bank description is clicked'
if ($LASTEXITCODE -ne 0) { throw 'Git commit mistokst.' }
& git push -u origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Git push mistokst.' }
Write-Host 'Lokid: skjala-tillogur profadar, byggdar og sendar i nyja grein. Production obreytt.'
