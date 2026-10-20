# 把 VPS 的备份接到老板的 Google Drive。
# 只给 rclone "drive.file" 权限：它只看得到、只碰得到自己建立的备份档，碰不到 Drive 里的其他东西。
# Google 给的授权会直接经由 ssh 写进 VPS，不会显示在画面上，也不会存在这台电脑里。
# 使用方式：双击同一个资料夹里的 connect-drive.cmd。
$ErrorActionPreference = 'Stop'
$Key = Join-Path $env:USERPROFILE '.ssh\mirai_hostinger_ed25519'
$Server = 'root@187.52.126.211'

function Step($text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }

try {
    Step '1/4 检查这台电脑有没有 rclone ...'
    if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
        Write-Host '   没有，现在用 winget 安装官方的 rclone（大约 1 分钟）...'
        winget install --id Rclone.Rclone -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
        if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
            $found = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue | Select-Object -First 1
            if (-not $found) { throw '装不好 rclone，请把这个视窗拍照给总管。' }
            Set-Alias rclone $found.FullName -Scope Script
        }
    }
    Write-Host '   有了。'

    Step '2/4 等一下会打开浏览器：选你现在用的 Google 帐号，然后按「允许」(Allow)。'
    Write-Host '   浏览器出现 "Success" 之后，回到这个视窗就好。'
    # {"scope":"drive.file"}：只要求"只能碰自己建立的档案"的权限
    $out = (& rclone authorize 'drive' 'eyJzY29wZSI6ImRyaXZlLmZpbGUifQ' 2>$null) -join "`n"
    $match = [regex]::Match($out, '(?s)--->\s*(\S+?)\s*<---')
    if (-not $match.Success) { throw 'Google 没有给授权（可能没按允许，或浏览器被关掉了）。请再执行一次。' }
    $given = $match.Groups[1].Value
    if ($given.StartsWith('{')) {
        $token = $given
    } else {
        # 新版 rclone 给的是 base64 包起来的 {"token": "..."}
        $padded = $given.PadRight($given.Length + (4 - $given.Length % 4) % 4, '=').Replace('-', '+').Replace('_', '/')
        $token = (ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded)))).token
    }
    if (-not $token -or -not $token.StartsWith('{')) { throw '读不懂 Google 给的授权。请把这个视窗拍照给总管（不要拍到浏览器网址）。' }

    Step '3/4 把授权直接送到 VPS（不会显示出来）...'
    $result = $token | & ssh -i $Key -o BatchMode=yes -o ConnectTimeout=20 $Server 'read -r T; rclone config create gdrive drive scope drive.file token "$T" --non-interactive >/dev/null 2>&1 && rclone lsd gdrive: >/dev/null 2>&1 && echo CONNECTED'
    $token = $null
    $out = $null
    if ($result -notmatch 'CONNECTED') { throw 'VPS 没有接上 Google Drive。请把这个视窗拍照给总管。' }

    Step '4/4 完成！VPS 已经接上你的 Google Drive。'
    Write-Host '   现在可以关掉这个视窗，并告诉总管"Drive 接好了"。' -ForegroundColor Green
}
catch {
    Write-Host ''
    Write-Host ("没有完成：" + $_.Exception.Message) -ForegroundColor Red
}
finally {
    Remove-Variable token, out, given, match -ErrorAction SilentlyContinue
}
Write-Host ''
Read-Host '按 Enter 关闭'
