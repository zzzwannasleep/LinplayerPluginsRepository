param(
  [Parameter(Mandatory = $true)]
  [string]$PluginDir,
  [switch]$Scan,
  [switch]$IncludeDocs
)

$pluginDirPath = (Resolve-Path $PluginDir).Path
$manifestPath = Join-Path $pluginDirPath "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found: $manifestPath"
}

$manifestJson = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-RelPath([string]$base, [string]$full) {
  $rel = $full.Substring($base.Length).TrimStart('\', '/')
  return $rel -replace '\\', '/'
}

function Should-IncludeFile([System.IO.FileInfo]$file, [bool]$includeDocs) {
  if ($file.Name -ieq "manifest.json") { return $false }
  if ($file.Name.StartsWith(".")) { return $false }
  if (-not $includeDocs -and $file.Extension -ieq ".md") { return $false }
  return $true
}

if ($Scan) {
  $files = Get-ChildItem -Path $pluginDirPath -Recurse -File | Where-Object {
    Should-IncludeFile $_ $IncludeDocs
  } | Sort-Object FullName | ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 -Path $_.FullName).Hash.ToLowerInvariant()
    [PSCustomObject]@{
      path   = (Get-RelPath $pluginDirPath $_.FullName)
      size   = $_.Length
      sha256 = $hash
    }
  }

  $manifestJson.files = @($files)
} else {
  if (-not $manifestJson.files) {
    throw "manifest.json has no 'files'. Use -Scan to generate."
  }

  $updated = @()
  foreach ($item in $manifestJson.files) {
    if (-not $item.path) { throw "manifest.files[].path missing" }
    $full = Join-Path $pluginDirPath $item.path
    if (-not (Test-Path $full)) { throw "file not found: $($item.path)" }
    $fi = Get-Item -Path $full
    if ($fi.PSIsContainer) { throw "not a file: $($item.path)" }
    $hash = (Get-FileHash -Algorithm SHA256 -Path $full).Hash.ToLowerInvariant()
    $updated += [PSCustomObject]@{
      path   = ($item.path -replace '\\', '/')
      size   = $fi.Length
      sha256 = $hash
    }
  }
  $manifestJson.files = @($updated | Sort-Object path)
}

$out = $manifestJson | ConvertTo-Json -Depth 100
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $out + "`n", $utf8NoBom)
Write-Output "OK: updated $manifestPath"

