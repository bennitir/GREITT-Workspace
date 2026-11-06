# GLÖGGT: the top authorized suggestion is only previewed in the right column.
# No Production deployment, secrets, database or remote state is touched during build.
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$releaseRoot = 'C:\GLOGGT-LESUTGAFA'
$base = '8c2b49b'
$branch = 'utgafa/samstaeda-forskodun-20261106'
$files = @(
  'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx',
  'app/banki/_lib/i18n/visual-reconciliation-text.ts',
  'scripts/visual-auto-preview-suggestion.test.cjs',
  'docs/afhending/2026-11-06-AFSTEMMING-FORSKODUN-TILLOGU.md',
  'docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA-FORSKODUN.ps1'
)
if (-not (Test-Path -LiteralPath $releaseRoot)) { throw 'Hrein utgafumappa fannst ekki.' }
Set-Location -LiteralPath $releaseRoot
$head = (& git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $base) { throw "Rong grunnutgafa: $head. Krafist: $base. Ekkert breytt." }
if (& git status --porcelain) { throw 'Utgafumappan inniheldur breytingar. Ekkert breytt.' }
foreach ($f in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $f))) { throw "Vantar skra i adalmoppu: $f. Ekkert breytt." }
}
& git switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'Ekki tokst ad stofna utgafugrein.' }
foreach ($f in $files) {
  $destination = Join-Path $releaseRoot $f
  $parent = Split-Path -Path $destination -Parent
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Copy-Item -LiteralPath (Join-Path $sourceRoot $f) -Destination $destination -Force
}
& git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Git add mistokst. Ekkert sent.' }
& git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Git diff check mistokst. Ekkert sent.' }
& node --test scripts/visual-auto-preview-suggestion.test.cjs scripts/visual-auto-document-suggestions.test.cjs scripts/visual-document-suggestions.test.cjs scripts/visual-layout-priority.test.cjs scripts/visual-one-click-confirmation.test.cjs scripts/visual-work-queue.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Prof mistokust. Ekkert sent.' }
# Use dummy values for the build; never contact the production database.
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
& git commit -m 'GLOGGT: preview top document suggestion without linking'
if ($LASTEXITCODE -ne 0) { throw 'Git commit mistokst. Ekkert sent.' }
& git push -u origin $branch
if ($LASTEXITCODE -ne 0) { throw 'GitHub-sending mistokst.' }
Write-Host 'Lokid: forskoðun prófuð og byggð; grein send a GitHub. Production obreytt.'
