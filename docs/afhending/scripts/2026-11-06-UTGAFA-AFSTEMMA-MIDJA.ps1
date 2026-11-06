# Scope: layout-only correction. Run only after extracting into C:\GLÖGGT.
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$releaseRoot = 'C:\GLOGGT-LESUTGAFA'
$base = 'daf72c8'
$branch = 'utgafa/samstaeda-midja-fyrst-20261106'
$files = @(
  'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx',
  'scripts/visual-layout-priority.test.cjs',
  'docs/afhending/2026-11-06-AFSTEMMA-MIDJUDALKUR-FYRST.md',
  'docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA-MIDJA.ps1'
)
if (-not (Test-Path -LiteralPath $releaseRoot)) { throw 'Hrein utgafumappa fannst ekki.' }
Set-Location -LiteralPath $releaseRoot
$head = (& git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $base) { throw "Rong grunnutgafa: $head. Krafist: $base. Engu breytt." }
if (& git status --porcelain) { throw 'Utgafumappan inniheldur breytingar. Engu breytt.' }
foreach ($f in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $f))) { throw "Vantar i adalmoppu: $f. Engu breytt." }
}
& git switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'Ekki tokst ad stofna grein.' }
foreach ($f in $files) {
  $dest = Join-Path $releaseRoot $f
  $parent = Split-Path -Path $dest -Parent
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Copy-Item -LiteralPath (Join-Path $sourceRoot $f) -Destination $dest -Force
}
& git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Git add mistokst. Engu sent.' }
& git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Git diff check mistokst. Engu sent.' }
& node --test scripts/visual-layout-priority.test.cjs scripts/visual-document-suggestions.test.cjs scripts/visual-one-click-confirmation.test.cjs scripts/visual-work-queue.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Prof mistokust. Engu sent.' }
$names = @('DATABASE_URL', 'DIRECT_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$env:DATABASE_URL = 'postgresql://blocked:blocked@127.0.0.1:65432/blocked'
$env:DIRECT_URL = $env:DATABASE_URL
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
$env:SUPABASE_SERVICE_ROLE_KEY = 'build-only-invalid-key'
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Bygging mistokst. Engu sent.' }
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
& git commit -m 'GLOGGT: keep comparison visible above document suggestions'
if ($LASTEXITCODE -ne 0) { throw 'Git commit mistokst.' }
& git push -u origin $branch
if ($LASTEXITCODE -ne 0) { throw 'GitHub sending mistokst.' }
Write-Host 'Lokid: midjudalkur lagfaerdur; prof og bygging stodust; grein send a GitHub. Production obreytt.'
