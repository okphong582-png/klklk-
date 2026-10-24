[CmdletBinding()]
param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$SourceRoot = $PSScriptRoot
$Repository = 'https://github.com/okphong582-png/klklk-.git'
$Branch = 'main'
# Deliberately publish only these reviewed files; never stage the parent project.
$PublishFiles = @('reports.cjs','app.cjs','README.md','tests/reports.test.cjs',
    'UP-BOT-LEN-GITHUB.bat','Push-Bot-GitHub.ps1')
$KnownWorkspace = 'C:\Users\A thuy SG\Desktop\New folder (18)'
if (Test-Path -LiteralPath $KnownWorkspace -PathType Container) {
    $Workspace = $KnownWorkspace
} else {
    $Workspace = Split-Path -Parent $SourceRoot
}
$BackupRoot = Join-Path $Workspace 'backups'
$WorkRoot = Join-Path $Workspace 'work'

function Resolve-Program {
    param([string[]]$Candidates, [string]$Name)
    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Leaf)) { return $Candidate }
    }
    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($Command) { return $Command.Source }
    throw "Khong tim thay $Name. Cai Git for Windows va Node.js 22-24, sau do chay lai."
}

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Lenh $([IO.Path]::GetFileName($Program)) khong thanh cong (ma $LASTEXITCODE)." }
}

function Backup-RemoteFiles {
    param([string]$CloneRoot, [string]$Destination, [string]$Commit)
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $Hashes = [ordered]@{}
    $Absent = @()
    $Zip = [IO.Compression.ZipFile]::Open($Destination, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($Relative in $PublishFiles) {
            $File = Join-Path $CloneRoot $Relative
            if (Test-Path -LiteralPath $File -PathType Leaf) {
                $Hashes[$Relative] = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($Zip, $File, $Relative,
                    [IO.Compression.CompressionLevel]::Optimal) | Out-Null
            } else { $Absent += $Relative }
        }
        $Entry = $Zip.CreateEntry('BACKUP-MANIFEST.json')
        $Writer = New-Object IO.StreamWriter($Entry.Open())
        try {
            $Writer.Write((@{ repository=$Repository; beforeCommit=$Commit; files=$Hashes; previouslyAbsent=$Absent } |
                ConvertTo-Json -Depth 6))
        } finally { $Writer.Dispose() }
    } finally { $Zip.Dispose() }
    $Zip = [IO.Compression.ZipFile]::OpenRead($Destination)
    try {
        foreach ($Relative in $Hashes.Keys) {
            $Entry = $Zip.GetEntry($Relative)
            if (-not $Entry) { throw "Backup thieu file: $Relative" }
            $Stream = $Entry.Open()
            $Hasher = [Security.Cryptography.SHA256]::Create()
            try { $Actual = [BitConverter]::ToString($Hasher.ComputeHash($Stream)).Replace('-','') }
            finally { $Stream.Dispose(); $Hasher.Dispose() }
            if ($Actual -ne $Hashes[$Relative]) { throw "Backup khong khop: $Relative" }
        }
    } finally { $Zip.Dispose() }
}

try {
    Write-Host 'MIZZE - UPLOAD BAN BAO CAO BOT LEN GITHUB' -ForegroundColor Cyan
    Write-Host "Repo: $Repository"
    Write-Host "Nhanh: $Branch"
    $Git = Resolve-Program -Name 'git.exe' -Candidates @(
        (Join-Path $env:ProgramFiles 'Git\bin\git.exe'),
        (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'))
    $Node = Resolve-Program -Name 'node.exe' -Candidates @()
    $GitVersion = @(& $Git --version)
    if ($LASTEXITCODE -ne 0 -or ($GitVersion -join '') -notmatch '^git version ') { throw 'Git chua chay duoc. Sua/cai lai Git for Windows.' }
    $Major = @(& $Node -p 'parseInt(process.versions.node)')
    if ($LASTEXITCODE -ne 0 -or ($Major -join '') -notmatch '^\d+$') { throw 'Node.js chua chay duoc.' }
    if ([int]($Major -join '') -lt 22 -or [int]($Major -join '') -gt 24) { throw 'Du an nay can Node.js 22, 23 hoac 24.' }
    foreach ($Relative in $PublishFiles) {
        $File = Join-Path $SourceRoot $Relative
        if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw "Goi upload thieu file: $Relative" }
        $Body = [IO.File]::ReadAllText($File)
        if ($Body -match '-----BEGIN (RSA )?PRIVATE KEY-----' -or
            $Body -match '"type"\s*:\s*"service_account"' -or
            $Body -match '\b\d{6,12}:[A-Za-z0-9_-]{30,}\b') {
            throw "File $Relative co dau hieu chua thong tin bi mat. Khong upload."
        }
        if ($Relative.EndsWith('.cjs')) { Invoke-Checked $Node @('--check', $File) }
    }
    $ParseErrors = $null; $ParseTokens = $null
    [Management.Automation.Language.Parser]::ParseFile($PSCommandPath, [ref]$ParseTokens, [ref]$ParseErrors) | Out-Null
    if ($ParseErrors.Count) { throw 'Script PowerShell co loi cu phap.' }
    if ($CheckOnly) {
        Write-Host 'CHECK OK: Git, Node va 6 file upload hop le. Chua clone, cai thu vien, commit hay push.' -ForegroundColor Green
        exit 0
    }

    New-Item -ItemType Directory -Force -Path $BackupRoot,$WorkRoot | Out-Null
    $Stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6)
    $Clone = Join-Path $WorkRoot ('bot-github-upload-' + $Stamp)
    Write-Host '[1/5] Lay ban moi nhat tu GitHub...'
    Invoke-Checked $Git @('clone','--single-branch','--branch',$Branch,$Repository,$Clone)
    $Head = @(& $Git -C $Clone rev-parse HEAD)
    if ($LASTEXITCODE -ne 0) { throw 'Khong doc duoc commit hien tai.' }
    $Head = ($Head -join '').Trim()
    $Backup = Join-Path $BackupRoot ('Mizze-Bot-before-GitHub-upload-' + $Stamp + '.zip')
    Write-Host '[2/5] Backup cac file tren GitHub truoc khi thay...'
    Backup-RemoteFiles -CloneRoot $Clone -Destination $Backup -Commit $Head
    Write-Host "Backup da kiem tra: $Backup" -ForegroundColor Green
    foreach ($Relative in $PublishFiles) {
        $Destination = Join-Path $Clone $Relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
        Copy-Item -LiteralPath (Join-Path $SourceRoot $Relative) -Destination $Destination
    }
    Write-Host '[3/5] Cai thu vien va chay kiem tra bot...'
    $Npm = Resolve-Program -Name 'npm.cmd' -Candidates @((Join-Path (Split-Path -Parent $Node) 'npm.cmd'))
    Push-Location -LiteralPath $Clone
    try {
        Invoke-Checked $Npm @('ci','--ignore-scripts','--no-audit','--no-fund')
        $TestFiles = @(Get-ChildItem -LiteralPath (Join-Path $Clone 'tests') -Filter '*.test.cjs' -File |
            ForEach-Object { $_.FullName })
        if (-not $TestFiles.Count) { throw 'Khong tim thay bai kiem tra bot.' }
        Invoke-Checked $Node (@('--test') + $TestFiles)
    } finally { Pop-Location }
    Write-Host '[4/5] Tao commit cho dung cac file da chon...'
    Invoke-Checked $Git (@('-C',$Clone,'add','--') + $PublishFiles)
    & $Git -C $Clone diff --cached --quiet
    $DiffCode = $LASTEXITCODE
    if ($DiffCode -eq 0) {
        Write-Host 'GitHub da co dung ban nay. Khong can commit/push them.' -ForegroundColor Green
        exit 0
    }
    if ($DiffCode -ne 1) { throw 'Khong kiem tra duoc cac file se commit.' }
    $Identity = @(& $Git -C $Clone config user.name)
    if (-not ($Identity -join '').Trim()) { Invoke-Checked $Git @('-C',$Clone,'config','user.name','okphong582-png') }
    $Identity = @(& $Git -C $Clone config user.email)
    if (-not ($Identity -join '').Trim()) { Invoke-Checked $Git @('-C',$Clone,'config','user.email','okphong582-png@users.noreply.github.com') }
    Invoke-Checked $Git @('-C',$Clone,'commit','-m','Improve daily key report layout, summaries and Windows uploader')
    Write-Host '[5/5] Push len GitHub. Dang nhap tai khoan co quyen ghi neu Git yeu cau.'
    Invoke-Checked $Git @('-C',$Clone,'push','origin',('HEAD:refs/heads/' + $Branch))
    Write-Host 'UPLOAD THANH CONG.' -ForegroundColor Green
    Write-Host 'Actions: https://github.com/okphong582-png/klklk-/actions'
    Write-Host 'Workflow push se chay. Worker dang giu lease co the tiep tuc den luot doi phien.'
    Write-Host "Thu muc lam viec va commit duoc giu tai: $Clone"
    exit 0
} catch {
    Write-Host ''
    Write-Host ('UPLOAD CHUA HOAN TAT: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Neu GitHub bao 403: dang nhap tai khoan co quyen ghi repo klklk- roi chay lai BAT.'
    Write-Host 'Script khong force-push va khong thay doi Secrets cua bot.'
    exit 1
}
