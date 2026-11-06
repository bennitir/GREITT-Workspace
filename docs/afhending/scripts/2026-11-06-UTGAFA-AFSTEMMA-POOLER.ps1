$ErrorActionPreference = 'Stop'
# Source is the original Windows workspace; release is an already-existing clean worktree.
$sourceRoot = "C:\GL$([char]0x00D6)GGT"
$releaseRoot = 'C:\GLOGGT-LESUTGAFA'
$expectedHead = '779301a'
$expectedBranch = 'utgafa/samstaeda-greining-20261106'
$newBranch = 'utgafa/samstaeda-pooler-20261106'
$paths = @(
  'lib/financial-reconciliation/document-set-service.ts',
  'scripts/visual-document-set.test.cjs',
  'docs/afhending/2026-11-06-AFSTEMMA-SUPABASE-POOLER-LEIDRETTING.md',
  'docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA-POOLER.ps1'
)
$hashes = @{
  'lib/financial-reconciliation/document-set-service.ts' = 'C7F577249F12B7CAB170B7EB97DB479727FF08EF246341E9D03083EBEC665EB4'
  'scripts/visual-document-set.test.cjs' = 'D9A61328F63EE02D0D00E8F135707F61F302AFE19D5A121EBD0B45EB31177302'
}
if (!(Test-Path -LiteralPath $releaseRoot -PathType Container)) {
  throw 'Vantar C:\GLOGGT-LESUTGAFA. Ekkert gert.'
}
foreach ($relative in $paths) {
  $file = Join-Path $sourceRoot $relative
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Vantar main-skra: $relative" }
  if ($hashes.ContainsKey($relative)) {
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    if ($actual -ne $hashes[$relative]) { throw "Skra er ekki samsvarandi pakkanum: $relative" }
  }
}
Set-Location -LiteralPath $releaseRoot
$head = (git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $expectedHead) {
  throw "Ovaent HEAD: $head. A ad vera $expectedHead. Ekki breyta neinu."
}
$current = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $current -ne $expectedBranch) {
  throw "Ovaent grein: $current. A ad vera $expectedBranch."
}
$dirty = @(git status --porcelain)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Utgafumappa er ekki hrein. Ekkert gert.' }
if ((git branch --list $newBranch).Count -gt 0) { throw "Greinin er til: $newBranch" }

git switch -c $newBranch
if ($LASTEXITCODE -ne 0) { throw 'Ekki tokst ad stofna grein.' }
foreach ($relative in $paths) {
  $target = Join-Path $releaseRoot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $target -Force
}
git add -- $paths
if ($LASTEXITCODE -ne 0) { throw 'Git add mistokst.' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Git whitespace-yfirferd mistokst. Ekkert sent.' }
node --test scripts/visual-document-set.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Afmorkud prof mistokust. Ekkert sent.' }

$names = @('DATABASE_URL','DIRECT_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$buildCode = 1
try {
  $env:DATABASE_URL = 'postgresql://blocked:blocked@127.0.0.1:65432/blocked'
  $env:DIRECT_URL = $env:DATABASE_URL
  $env:NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
  $env:SUPABASE_SERVICE_ROLE_KEY = 'build-only-invalid-key'
  npm run build
  $buildCode = $LASTEXITCODE
} finally {
  foreach ($name in $names) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
  }
}
if ($buildCode -ne 0) { throw 'Next/TypeScript bygging mistokst. Ekkert sent.' }

git commit -m 'GLÖGGT: accept approved Supabase pooler host patterns'
if ($LASTEXITCODE -ne 0) { throw 'Git commit mistokst. Ekkert sent.' }
git push -u origin $newBranch
if ($LASTEXITCODE -ne 0) { throw 'GitHub-sending mistokst. Production obreytt.' }
Write-Host 'Lokid: Prof og bygging stodust; greinin er komin a GitHub. Production obreytt.'
