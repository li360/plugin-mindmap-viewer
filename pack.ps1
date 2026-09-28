<#
.SYNOPSIS
    构建并打包 JS 功能插件（Windows PowerShell 5.1+ / PowerShell 7+）

.DESCRIPTION
    1. 执行 npm run build，产出 dist/index.js 与 dist/manifest.json
    2. 将两个产物打成 dist/gewu-plugin.zip（文件位于 ZIP 根目录）
    3. 计算 ZIP 的 SHA256
    4. 生成 dist/update.json（GitHub Release 自更新约定文件）

    发布流程：
      pack.ps1 -Version 0.1.0 -DownloadUrl "https://github.com/<owner>/<repo>/releases/latest/download/gewu-plugin.zip"
    然后在 GitHub Release（latest）中上传 dist 下的两个文件：
      - gewu-plugin.zip   插件包
      - update.json       更新清单

.PARAMETER Version
    本次发布的语义化版本号，必须与 manifest.json 中的 version 保持一致

.PARAMETER DownloadUrl
    gewu-plugin.zip 的最终下载地址（通常是 GitHub Release latest 直链）

.PARAMETER MinAppVersion
    最低主程序版本要求，可选项（缺省取 manifest.json）

.PARAMETER Notes
    更新说明，可选项

.PARAMETER SkipBuild
    跳过 npm run build（默认不跳过）
#>
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$DownloadUrl,
    [string]$MinAppVersion = "",
    [string]$Notes = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# 脚本所在目录 — 保证从任意位置调用时路径正确
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $Root "dist"
$ZipPath = Join-Path $DistDir "gewu-plugin.zip"
$ManifestPath = Join-Path $Root "manifest.json"
$UpdateJsonPath = Join-Path $DistDir "update.json"

if (-not (Test-Path $ManifestPath)) {
    throw "缺少必备文件: $ManifestPath"
}

# 读取 manifest.json — 版本号唯一来源，-Version 必须与其一致
$manifest = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne $Version) {
    throw "manifest.json 的 version ($($manifest.version)) 与 -Version ($Version) 不一致，请先更新 manifest.json"
}

# 1. 构建（esbuild 会先清空 dist）
if (-not $SkipBuild) {
    Push-Location $Root
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build 失败" }
    }
    finally { Pop-Location }
}

$JsPath = Join-Path $DistDir "index.js"
$DistManifest = Join-Path $DistDir "manifest.json"
foreach ($f in @($JsPath, $DistManifest)) {
    if (-not (Test-Path $f)) { throw "构建产物缺失: $f" }
}

# 2. 删除旧 ZIP 并重新打包（仅 index.js + manifest.json，扁平结构）
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path $JsPath, $DistManifest -DestinationPath $ZipPath -Force

# 3. 计算 SHA256
$hash = (Get-FileHash $ZipPath -Algorithm SHA256).Hash.ToLower()

# 4. 组装 update.json
$update = [ordered]@{
    version     = $Version
    downloadUrl = $DownloadUrl
    checksum    = "sha256:$hash"
    id          = $manifest.id
    name        = $manifest.name
    description = $manifest.description
    author      = $manifest.author
}
if ($MinAppVersion) { $update["minAppVersion"] = $MinAppVersion }
elseif ($manifest.minAppVersion) { $update["minAppVersion"] = $manifest.minAppVersion }
if ($Notes) { $update["notes"] = $Notes }

$updateJson = $update | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($UpdateJsonPath, $updateJson, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "打包完成："
Write-Host "  ZIP:         $ZipPath"
Write-Host "  update.json: $UpdateJsonPath"
Write-Host "  SHA256:      $hash"
