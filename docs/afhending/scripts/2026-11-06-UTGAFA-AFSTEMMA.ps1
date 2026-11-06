# GLÖGGT, 6 Nov 2026. Builds and pushes only the listed reconciliation files.
# Does not modify Supabase/Vercel or Production and never opens write permissions.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$sourceRoot = 'C:\GLÖGGT'
$releaseRoot = 'C:\GLOGGT-LESUTGAFA'
$baseCommit = '24fdd8b'
$newBranch = 'utgafa/samstaeda-einsmellur-20261106'

$paths = @(
    'lib/financial-reconciliation/document-set-service.ts'
    'lib/financial-reconciliation/existing-confirmed-bank-documents.ts'
    'lib/financial-reconciliation/visual-confirmed-document-links.ts'
    'app/banki/[id]/afstemming/page.tsx'
    'app/banki/[id]/afstemming/document-set-actions.ts'
    'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx'
    'app/banki/_lib/i18n/visual-reconciliation-text.ts'
    'app/banki/_lib/visual-work-queue.ts'
    'scripts/visual-document-set-readiness.test.cjs'
    'scripts/visual-existing-confirmed.test.cjs'
    'scripts/visual-confirmed-status.test.cjs'
    'scripts/visual-one-click-confirmation.test.cjs'
    'scripts/visual-work-queue.test.cjs'
    'scripts/visual-document-set-legacy-role-guards.test.cjs'
    'docs/afhending/2026-11-06-AFSTEMMA-VIRKJUN-OG-ELDRI-TENGINGAR.md'
    'docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA.ps1'
)

if (!(Test-Path -LiteralPath $releaseRoot)) { throw "Vantar útgáfumöppu: $releaseRoot" }
foreach ($p in $paths) {
    if (!(Test-Path -LiteralPath (Join-Path $sourceRoot $p))) { throw "Vantar skrá, ekkert sent: $p" }
}
Set-Location -LiteralPath $releaseRoot
$head = (git rev-parse --short HEAD)
if ($LASTEXITCODE -ne 0 -or $head.Trim() -ne $baseCommit) {
    throw "Röng útgáfa: $head. Búist við $baseCommit. Ekkert sent."
}
$status = @(git status --porcelain)
if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) {
    throw 'Óvistaðar breytingar eru í útgáfumöppunni. Ekkert sent.'
}
$existing = @(git branch --list $newBranch)
if ($LASTEXITCODE -ne 0 -or $existing.Count -gt 0) {
    throw "Greinin $newBranch er þegar til. Ekkert sent."
}

& git switch -c $newBranch
if ($LASTEXITCODE -ne 0) { throw 'Mistókst að stofna útgáfugrein.' }
foreach ($p in $paths) {
    $src = Join-Path $sourceRoot $p
    $dest = Join-Path $releaseRoot $p
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item -LiteralPath $src -Destination $dest -Force
}
& git add -- $paths
if ($LASTEXITCODE -ne 0) { throw 'Mistókst að velja skrár.' }
& git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Sniðvilla í breytingum. Engu ýtt út.' }
& git --no-pager diff --cached --stat
if ($LASTEXITCODE -ne 0) { throw 'Ekki tókst að lesa breytingar.' }

# Build is intentionally disconnected from the production database.
$env:DATABASE_URL = 'postgresql://blocked:blocked@127.0.0.1:65432/blocked'
$env:DIRECT_URL = $env:DATABASE_URL
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
$env:SUPABASE_SERVICE_ROLE_KEY = 'build-only-invalid-key'
try {
    & npm run build
    $buildExit = $LASTEXITCODE
}
finally {
    Remove-Item Env:DATABASE_URL,Env:DIRECT_URL,Env:NEXT_PUBLIC_SUPABASE_URL,Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}
if ($buildExit -ne 0) { throw 'Bygging mistókst. Engu ýtt á GitHub.' }

& git commit -m 'GLÖGGT: ein afstemming og eldri tengingar varðar gegn tvítengingu'
if ($LASTEXITCODE -ne 0) { throw 'Ekki tókst að vista commit. Engu ýtt út.' }
& git push -u origin $newBranch
if ($LASTEXITCODE -ne 0) { throw 'GitHub-sending mistókst; staðbundna commit er varðveitt.' }
Write-Host "Tilbúið á GitHub: $newBranch" -ForegroundColor Green
Write-Host 'Production og gagnagrunnur voru ekki breytt; virkjun skrifa er enn læst.'
