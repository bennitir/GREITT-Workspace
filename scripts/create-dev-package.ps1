$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$OutputDir = Join-Path $ProjectRoot "_dev-package"

Write-Host ""
Write-Host "GLÖGGT - Developer Package"
Write-Host "========================="
Write-Host ""
Write-Host "Project: $ProjectRoot"
Write-Host "Output:  $OutputDir"
Write-Host ""

# Safety check: the output folder must stay inside this project.
if (-not $OutputDir.StartsWith($ProjectRoot)) {
    throw "SAFETY STOP: Output folder is outside the project."
}

Write-Host "Safety checks OK."
Write-Host ""
Write-Host "Nothing has been copied yet."
$ItemsToCopy = @(
    "app",
    "components",
    "lib",
    "prisma",
    "scripts",
    ".gitignore",
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "package.json",
    "package-lock.json",
    "prisma.config.ts",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.mjs",
    "eslint.config.mjs",
    "proxy.ts"
)



Write-Host "Package contents configured."
# Recreate a clean output folder.
if (Test-Path $OutputDir) {
    Remove-Item $OutputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputDir | Out-Null

foreach ($Item in $ItemsToCopy) {
    $Source = Join-Path $ProjectRoot $Item

    if (-not (Test-Path $Source)) {
        Write-Host "SKIP: $Item"
        continue
    }

    $Destination = Join-Path $OutputDir $Item
    $DestinationParent = Split-Path $Destination -Parent

    if (-not (Test-Path $DestinationParent)) {
        New-Item -ItemType Directory -Path $DestinationParent -Force | Out-Null
    }

    Copy-Item $Source $Destination -Recurse -Force
}

Write-Host ""
Write-Host "Code copied to temporary developer package folder."
# Final safety scan before creating any ZIP file.
$ForbiddenFilesFound = Get-ChildItem $OutputDir -Recurse -Force -File |
    Where-Object {
        $_.Name -like "*.db" -or
        $_.Name -eq ".env" -or
        $_.Name -like ".env.*"
    }

$ForbiddenFoldersFound = Get-ChildItem $OutputDir -Recurse -Force -Directory |
    Where-Object {
        $_.FullName -match "[\\/]public[\\/]uploads([\\/]|$)"
    }

if ($ForbiddenFilesFound -or $ForbiddenFoldersFound) {
    Write-Host ""
    Write-Host "SAFETY STOP - forbidden data found in developer package."

    $ForbiddenFilesFound | ForEach-Object {
        Write-Host "FORBIDDEN FILE: $($_.FullName)"
    }

    $ForbiddenFoldersFound | ForEach-Object {
        Write-Host "FORBIDDEN FOLDER: $($_.FullName)"
    }

    throw "Developer package was NOT created."
}

Write-Host ""
Write-Host "Safety scan passed."
Write-Host "No databases, environment files or uploaded customer documents found."
$ZipPath = Join-Path $ProjectRoot "GLOGGT-dev-package.zip"

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Compress-Archive `
    -Path (Join-Path $OutputDir "*") `
    -DestinationPath $ZipPath `
    -Force

Write-Host ""
Write-Host "Developer package created:"
Write-Host $ZipPath
Write-Host ""
Write-Host "DONE"
