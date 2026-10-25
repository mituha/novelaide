<#
.SYNOPSIS
    novelaide のバージョンタグ作成およびリモートリポジトリへのプッシュを一括実行するリリーススクリプト

.DESCRIPTION
    package.json のバージョンを読み取り、vX.Y.Z 形式のタグを作成して、
    指定または自動検出されたリモートリポジトリ（github, origin等）へブランチとタグをプッシュします。

.PARAMETER Remote
    プッシュ先のリモート名（省略時は現在のブランチのトラッキングリモート、または github / origin を自動検出）

.PARAMETER Branch
    プッシュ対象のブランチ名（省略時は現在のブランチ）

.PARAMETER DryRun
    実際のタグ作成やプッシュを行わず、実行内容のプレビューのみ表示

.PARAMETER Force
    同名タグが既に存在する場合に上書きしてタグを作成
#>

param(
    [string]$Remote,
    [string]$Branch,
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# リポジトリルートへ移動
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "=== novelaide リリース自動化スクリプト ===" -ForegroundColor Cyan

# 1. 未コミットの変更がないか確認
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Error "エラー: 作業ツリーに未コミットの変更があります。コミットまたはスタッシュしてから再実行してください。"
}

# 2. package.json からバージョンを取得
if (-not (Test-Path "$RepoRoot\package.json")) {
    Write-Error "エラー: package.json が見つかりません。"
}
$packageJson = Get-Content "$RepoRoot\package.json" -Raw | ConvertFrom-Json
$version = $packageJson.version
if (-not $version) {
    Write-Error "エラー: package.json からバージョンを取得できませんでした。"
}

$tagName = "v$version"
Write-Host "検出バージョン: $version (タグ: $tagName)" -ForegroundColor Green

# 3. ブランチの判定
if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
}
Write-Host "対象ブランチ: $Branch" -ForegroundColor Gray

# 4. リモートリポジトリの判定
if (-not $Remote) {
    # トラッキングリモートの取得を試みる
    $trackingRemote = (git config "branch.$Branch.remote")
    if ($trackingRemote) {
        $Remote = $trackingRemote.Trim()
    } else {
        # 利用可能なリモート一覧を取得
        $remotes = (git remote).Split("`r`n") | Where-Object { $_ -ne "" }
        if ("github" -in $remotes) {
            $Remote = "github"
        } elseif ("origin" -in $remotes) {
            $Remote = "origin"
        } elseif ($remotes.Count -gt 0) {
            $Remote = $remotes[0].Trim()
        } else {
            Write-Error "エラー: リモートリポジトリが設定されていません。"
        }
    }
}

# リモートURLの確認
$remoteUrl = (git remote get-url $Remote).Trim()
Write-Host "プッシュ先リモート: $Remote ($remoteUrl)" -ForegroundColor Yellow

# 5. タグの既存チェック
$existingTag = git tag -l $tagName
if ($existingTag) {
    if ($Force) {
        Write-Host "警告: タグ $tagName は既に存在します。-Force により再作成します。" -ForegroundColor Yellow
        if (-not $DryRun) {
            git tag -d $tagName | Out-Null
        }
    } else {
        Write-Error "エラー: タグ $tagName は既に存在します。上書きする場合は -Force を指定してください。"
    }
}

if ($DryRun) {
    Write-Host "`n[DryRun モード] 以下のコマンドが実行されます:" -ForegroundColor Magenta
    Write-Host "1. git tag -a $tagName -m `"Release $tagName`""
    Write-Host "2. git push $Remote $Branch"
    Write-Host "3. git push $Remote $tagName"
    Write-Host "`n実際のプッシュは行われませんでした。"
    exit 0
}

# 6. タグの作成
Write-Host "タグ $tagName を作成中..." -ForegroundColor Cyan
git tag -a $tagName -m "Release $tagName"

# 7. リモートへのプッシュ
Write-Host "$Remote/$Branch をプッシュ中..." -ForegroundColor Cyan
git push $Remote $Branch

Write-Host "タグ $tagName を $Remote へプッシュ中..." -ForegroundColor Cyan
git push $Remote $tagName

Write-Host "`n✓ リリース処理が完了しました！ 🎉" -ForegroundColor Green
Write-Host "GitHub Actions のリリースワークフローが起動しました。" -ForegroundColor Gray
Write-Host "進捗および成果物は以下で確認できます:" -ForegroundColor Gray
Write-Host "https://github.com/mituha/novelaide/actions" -ForegroundColor Cyan
Write-Host "https://github.com/mituha/novelaide/releases" -ForegroundColor Cyan
