$ErrorActionPreference = 'Stop'
$sourceRoot = "C:\GL$([char]0x00D6)GGT"
$releaseRoot = 'C:\GLOGGT-LESUTGAFA'
$expected = '36c2cb1'
$branch = 'utgafa/samstaeda-greining-20261106'
$paths = @(
  'lib/financial-reconciliation/document-set-service.ts',
  'app/banki/[id]/afstemming/page.tsx',
  'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx',
  'app/banki/_lib/i18n/visual-reconciliation-text.ts',
  'scripts/visual-document-set.test.cjs',
  'docs/afhending/2026-11-06-AFSTEMMA-ORUGG-GREINING-LAESINGAR.md',
  'docs/afhending/scripts/2026-11-06-GREINA-AFSTEMMA-LAESINGU.ps1'
)
foreach ($relative in $paths) {
  if (!(Test-Path -LiteralPath (Join-Path $sourceRoot $relative))) { throw "Vantar skra i main: $relative" }
}
Set-Location -LiteralPath $releaseRoot
$head = (git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $expected) { throw "Utgafugrein er ekki a graunninum $expected (er $head). Ekki haldid afram." }
$dirty = (git status --porcelain)
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Utgafumappa ekki hrein. Ekki haldid afram.' }
$localExists = (git branch --list $branch)
if ($localExists) { throw "Grein er til fyrir: $branch" }
# Ensure source files exist before creating a new branch.
git switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'Ekki tokst ad bua til grein.' }
foreach ($relative in $paths) {
  $source = Join-Path $sourceRoot $relative
  $target = Join-Path $releaseRoot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}
git add -- $paths
if ($LASTEXITCODE -ne 0) { throw 'Git add mistokst.' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Git diff check mistokst.' }
node --test scripts/visual-document-set.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Afmorkud prof mistokust, ekkert sent.' }
$env:DATABASE_URL = 'postgresql://blocked:blocked@127.0.0.1:65432/blocked'
$env:DIRECT_URL = $env:DATABASE_URL
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
$env:SUPABASE_SERVICE_ROLE_KEY = 'build-only-invalid-key'
try {
  npm run build
  $buildCode = $LASTEXITCODE
} finally {
  Remove-Item Env:DATABASE_URL,Env:DIRECT_URL,Env:NEXT_PUBLIC_SUPABASE_URL,Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}
if ($buildCode -ne 0) { throw 'Bygging mistokst, ekkert sent.' }
git commit -m 'GLÖGGT: show safe one-click reconciliation lock reason'
if ($LASTEXITCODE -ne 0) { throw 'Git commit mistokst.' }
git push -u origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Git push mistokst.' }
Write-Host 'Ready: Greiningargrein send til GitHub. Production er obreytt.'
