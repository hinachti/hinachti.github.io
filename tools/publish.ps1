# Publishes the site: render, commit, push. GitHub Pages does the rest.
#
#   .	ools\publish.ps1                       # after a new app release
#   .	ools\publish.ps1 -Message "FAQ update" # after editing the page itself
#
# The version, the release notes, the download link and the apk all come from
# ..\hinachti-releases\latest.json, which is the same file the installed app
# reads when it checks for an update. Release the app first, then run this.
#
# Pushing to main triggers .github/workflows/pages.yml, which uploads public/
# to GitHub Pages. Nothing is built in the cloud and no runner lives on this PC.
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

# The site is public; commits never carry a personal identity.
$who = @('-c', 'user.name=Hinachti', '-c', 'user.email=noreply@hinachti.github.io')
git @who add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host 'Nothing changed.'
    return
}
git @who commit -q -m $Message
Write-Host "Committed: $Message"

if ($NoPush) { Write-Host 'Not pushing (-NoPush).'; return }
git push -q
Write-Host 'Pushed. GitHub Pages is deploying.'

Write-Host 'Waiting for the site to report the new version...'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 10
    try {
        $live = Invoke-RestMethod 'https://hinachti.github.io/latest.json' -Headers @{ 'Cache-Control' = 'no-cache' }
        if ($live.versionName -eq $version) {
            Write-Host "Live: https://hinachti.github.io/ is serving $version"
            return
        }
    } catch { }
}
Write-Warning "The site did not report $version yet. Check the Actions tab on GitHub."
