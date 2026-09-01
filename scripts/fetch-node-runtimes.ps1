param(
  [string]$Version = "24.20.0",
  [string]$OutputRoot = "dist/release-tools"
)

$ErrorActionPreference = "Stop"
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\$OutputRoot"))
$baseUrl = "https://nodejs.org/dist/v$Version"
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$checksumPath = Join-Path $outputPath "SHASUMS256.txt"
Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -OutFile $checksumPath

foreach ($architecture in @("x64", "arm64")) {
  $archiveName = "node-v$Version-win-$architecture.zip"
  $archivePath = Join-Path $outputPath $archiveName
  Invoke-WebRequest "$baseUrl/$archiveName" -OutFile $archivePath

  $checksumLine = Get-Content $checksumPath |
    Where-Object { $_ -match "  $([regex]::Escape($archiveName))$" }
  if (-not $checksumLine) {
    throw "No official checksum found for $archiveName"
  }
  $expected = ($checksumLine -split "\s+")[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Checksum mismatch for $archiveName (expected $expected, got $actual)"
  }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $outputPath -Force
  Write-Host "Verified $archiveName ($actual)"
}
