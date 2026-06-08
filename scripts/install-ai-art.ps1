# =========================================================================
#  install-ai-art.ps1
#  ダウンロードした AI画像を 512x512 PNG にリサイズして assets/monsters/ に配置
#  ・透過PNGはそのまま保ち、JPEG等も PNG に変換
#  ・サイズが極端に大きい(>2048)場合は事前に縮小
#  ・正方形でない場合は アスペクト維持の中央パディング（透過背景）で 1:1 化
#  ・ファイル名が <種族ID>.png でないと取り込めない（命名規則ガイドあり）
#
#  使い方:
#    1. AIで生成した画像を C:\Users\81806\ゲーム\assets\monsters\raw\ に入れる
#       ファイル名は <種族ID>.png / .jpg / .webp（例: sla1.png, dra5.jpg）
#    2. PowerShell で:
#         cd C:\Users\81806\ゲーム
#         .\scripts\install-ai-art.ps1
#       または scripts\install-ai-art.bat をダブルクリック
#    3. 自動で assets\monsters\<id>.png として最適化配置される
#    4. オプションで git add/commit/push まで自動化
# =========================================================================

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# プロジェクトルート（このスクリプトの親）
$Root = Split-Path -Parent $PSScriptRoot
$RawDir = Join-Path $Root 'assets\monsters\raw'
$OutDir = Join-Path $Root 'assets\monsters'

if (-not (Test-Path $RawDir)) {
    New-Item -ItemType Directory -Path $RawDir -Force | Out-Null
    Write-Host "[作成] raw/ フォルダ: $RawDir" -ForegroundColor Green
}

# 有効な種族IDセット（簡易検証）
$ValidIds = @()
# 28系統 × 5ティア
$Families = @('sla','bea','bir','pla','bug','und','aqu','dra','dev','mat',
              'ifr','ice','thu','lig','uni','mus','gho','roc','win','ser',
              'dmn','fay','tur','cat','stb','anu','mtl','jwl')
foreach ($f in $Families) {
    for ($t = 1; $t -le 5; $t++) {
        $ValidIds += "$f$t"
    }
}
# 属性神 / 巨神 / オリジン
foreach ($e in @('fire','water','grass','wind','earth','thunder','light','dark')) {
    $ValidIds += "god_$e"
    $ValidIds += "titan_$e"
}
$ValidIds += 'origin'
$ValidSet = $ValidIds | ForEach-Object { $_.ToLower() }

# ----- 処理 -----
$files = Get-ChildItem $RawDir -File | Where-Object { $_.Extension -match '\.(png|jpg|jpeg|webp|bmp)$' }
if ($files.Count -eq 0) {
    Write-Host "raw/ フォルダに画像が ありません。" -ForegroundColor Yellow
    Write-Host "AI で生成した画像を $RawDir に置いて 再実行してください。" -ForegroundColor Yellow
    exit 0
}

Write-Host "==== $($files.Count) 個の画像を 処理します ====" -ForegroundColor Cyan
$ok = 0
$skipped = 0
foreach ($f in $files) {
    $id = [System.IO.Path]::GetFileNameWithoutExtension($f.Name).ToLower()
    if ($ValidSet -notcontains $id) {
        Write-Host "  ⚠ スキップ: $($f.Name) — '$id' は 有効な種族IDで ありません" -ForegroundColor Yellow
        Write-Host "    例: sla1.png, dra5.png, god_fire.png, titan_dark.png, origin.png" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    try {
        $img = [System.Drawing.Image]::FromFile($f.FullName)
        # 透過対応 32bit ARGB
        $resized = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($resized)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        # アスペクト維持で内接 → 余白透過
        $srcAspect = [double]$img.Width / [double]$img.Height
        if ($srcAspect -ge 1) {
            # 横長 → 幅512基準
            $newW = 512
            $newH = [int][Math]::Round(512 / $srcAspect)
        } else {
            $newH = 512
            $newW = [int][Math]::Round(512 * $srcAspect)
        }
        $offX = [int](512 - $newW) / 2
        $offY = [int](512 - $newH) / 2
        $g.DrawImage($img, $offX, $offY, $newW, $newH)
        $g.Dispose()
        $img.Dispose()

        $outPath = Join-Path $OutDir "$id.png"
        $resized.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $resized.Dispose()
        Write-Host "  ✓ $id.png" -ForegroundColor Green
        $ok++

        # 原本を _done に移動（保管）
        $doneDir = Join-Path $RawDir '_done'
        if (-not (Test-Path $doneDir)) { New-Item -ItemType Directory -Path $doneDir -Force | Out-Null }
        Move-Item $f.FullName (Join-Path $doneDir $f.Name) -Force
    } catch {
        Write-Host "  ✗ エラー $($f.Name): $_" -ForegroundColor Red
        $skipped++
    }
}

Write-Host ""
Write-Host "==== 完了 ====" -ForegroundColor Cyan
Write-Host "  処理成功: $ok" -ForegroundColor Green
if ($skipped -gt 0) {
    Write-Host "  スキップ: $skipped" -ForegroundColor Yellow
}

# manifest.json も更新（高速化）
$manifestPath = Join-Path $OutDir 'manifest.json'
$existing = Get-ChildItem $OutDir -Filter '*.png' -File | ForEach-Object {
    [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
} | Sort-Object
$manifest = @{
    comment = 'ここに置いた <種族ID>.png のリストを species 配列に書くと、ゲーム起動時に即座に存在を認識できます。'
    species = @($existing)
} | ConvertTo-Json -Depth 3
Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
Write-Host "  manifest.json を更新（$($existing.Count) 種登録）" -ForegroundColor DarkGray

# git push する？
if ($ok -gt 0) {
    Write-Host ""
    $ans = Read-Host "GitHub に push して 公開しますか？ [y/N]"
    if ($ans -match '^[Yy]') {
        Push-Location $Root
        try {
            git add assets/monsters/
            git commit -m "art: AI画像 $ok 種を追加・更新"
            git push
            Write-Host ""
            Write-Host "✨ push 完了！ 1〜2分で https://minaiiiiiiiiii0310-beep.github.io/monster-fusion-world/ に反映" -ForegroundColor Green
        } catch {
            Write-Host "git push でエラー: $_" -ForegroundColor Red
        }
        Pop-Location
    } else {
        Write-Host "  （手動で 'git add assets/monsters/ && git commit && git push' してください）" -ForegroundColor DarkGray
    }
}
