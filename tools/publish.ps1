# Publishes the site: render, commit, push, and run the Pages job on this PC.
#
#   .\tools\publish.ps1                       # after a new app release
#   .\tools\publish.ps1 -Message "FAQ update" # after editing the page itself
#
# The version, the release notes, the download link and the apk all come from
# ..\hinachti-releases\latest.json, which is the same file the installed app
# reads when it checks for an update. Release the app first, then run this.
#
# Why the runner: GitLab's own CI runners need an identity-verified account, so
# this project uses a private project runner ("Hinachti site", tag
# hinachti-pages, shell executor, Windows PowerShell) that is not a service.
# This script starts it for one job and stops it again. Its config.toml lives in
# %USERPROFILE%\.gitlab-runner and holds the runner token: never commit it.
param(
    [string]$Message,
    [switch]$NoPush,
    [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$site = Split-Path -Parent $PSScriptRoot
Set-Location $site

Write-Host 'Rendering the page...'
python tools/build.py
if ($LASTEXITCODE -ne 0) { throw 'build.py failed' }

$latest = Get-Content (Join-Path $site '..\hinachti-releases\latest.json') -Raw | ConvertFrom-Json
$version = $latest.versionName
if (-not $Message) { $Message = "Site for $version" }

# The site is public; commits are not signed with a personal identity.
git -c user.name='Hinachti' -c user.email='noreply@hinachti.gitlab.io' add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host 'Nothing changed.'
    return
}
git -c user.name='Hinachti' -c user.email='noreply@hinachti.gitlab.io' commit -q -m $Message
Write-Host "Committed: $Message"

if ($NoPush) { Write-Host 'Not pushing (-NoPush).'; return }
git push -q
Write-Host 'Pushed.'

# --- run the Pages job on this PC ------------------------------------------

$runnerDir = Join-Path $env:USERPROFILE '.gitlab-runner'
$runner = Join-Path $runnerDir 'gitlab-runner.exe'
$config = Join-Path $runnerDir 'config.toml'
foreach ($f in $runner, $config) {
    if (-not (Test-Path $f)) { throw "missing $f (see README: Publishing)" }
}
Get-Process gitlab-runner -ErrorAction SilentlyContinue | Stop-Process -Force   # never two at once

$logErr = Join-Path $runnerDir 'hinachti-run.err.log'
Remove-Item -LiteralPath $logErr -ErrorAction SilentlyContinue
Write-Host 'Starting the site runner...'
$proc = Start-Process -FilePath $runner -WorkingDirectory $runnerDir -WindowStyle Hidden -PassThru `
    -ArgumentList @('run', '--config', "`"$config`"", '--working-directory', "`"$runnerDir`"") `
    -RedirectStandardOutput (Join-Path $runnerDir 'hinachti-run.out.log') -RedirectStandardError $logErr

try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $done = $null
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        Start-Sleep -Seconds 3
        if ($proc.HasExited) { throw "gitlab-runner exited early (code $($proc.ExitCode)); see $logErr" }
        $lines = @(Get-Content -LiteralPath $logErr -ErrorAction SilentlyContinue)
        $done = $lines | Where-Object { $_ -match 'Job (succeeded|failed)' } | Select-Object -Last 1
        if ($done) {
            # "Job succeeded" is logged BEFORE the runner reports the final state
            # to GitLab. Stopping now would leave the job running and Pages would
            # never deploy, so wait for the submission.
            $wait = [Diagnostics.Stopwatch]::StartNew()
            while ($wait.Elapsed.TotalSeconds -lt 60) {
                Start-Sleep -Seconds 2
                $after = @(Get-Content -LiteralPath $logErr -ErrorAction SilentlyContinue)
                if ($after -match 'Submitting job to coordinator\.\.\.\s*ok' -or
                    $after -match 'Updating job\.\.\..*job-status=(success|failed)') { break }
            }
            Start-Sleep -Seconds 3
            break
        }
    }
    if (-not $done) { throw "no job ran within $TimeoutSeconds seconds; is the runner registered with tag hinachti-pages?" }
    Write-Host ($done -replace '\x1b\[[0-9;]*m', '')
} finally {
    Get-Process gitlab-runner -ErrorAction SilentlyContinue | Stop-Process -Force
}

Write-Host 'Waiting for the site to report the new version...'
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 10
    try {
        $live = Invoke-RestMethod 'https://hinachti.gitlab.io/latest.json' -Headers @{ 'Cache-Control' = 'no-cache' }
        if ($live.versionName -eq $version) {
            Write-Host "Live: https://hinachti.gitlab.io/ is serving $version"
            return
        }
    } catch { }
}
Write-Warning "The site did not report $version yet. Check the pipeline in GitLab."
