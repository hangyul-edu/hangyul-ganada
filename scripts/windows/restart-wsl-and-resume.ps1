<#
.SYNOPSIS
    Applies a changed .wslconfig by restarting WSL, then reopens Claude Code
    on Hangyul ganada with the previous conversation intact.

.DESCRIPTION
    .wslconfig is read when the WSL virtual machine starts, so a memory, swap
    or processor change does nothing until the VM is shut down. `wsl --shutdown`
    terminates every distribution at once — including whatever Claude session is
    running in it — so this script does the shutdown deliberately and puts the
    session back afterwards.

    Claude Code stores its conversations itself. `claude --continue` reopens the
    most recent one for the directory it is run in, so nothing needs to be
    exported before the restart and no session id has to be written down.

    What it does, in order:

        confirm       show the pending config, ask before killing anything
        shutdown      wsl --shutdown
        restart       start the distro again and wait for it to answer
        verify        report the memory and swap the VM actually came back with
        resume        cd into the project and run claude --continue

.PARAMETER Distro
    Which distribution to restart. Defaults to Ubuntu-24.04.

.PARAMETER ProjectDir
    The project path inside WSL. Defaults to ~/hangyul_ganada.

.PARAMETER Force
    Skip the confirmation prompt.

.PARAMETER NoResume
    Restart and verify, but leave Claude closed.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\windows\restart-wsl-and-resume.ps1
#>

[CmdletBinding()]
param(
    [string] $Distro     = 'Ubuntu-24.04',
    [string] $ProjectDir = '~/hangyul_ganada',
    [switch] $Force,
    [switch] $NoResume
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Warn { param($m) Write-Host "    $m" -ForegroundColor Yellow }

Write-Step "Pending WSL configuration"
$configPath = Join-Path $env:UserProfile '.wslconfig'
if (Test-Path $configPath) {
    Get-Content $configPath | Where-Object { $_ -match '^\s*[a-zA-Z]' } | ForEach-Object { "    $_" }
} else {
    Write-Warn "No .wslconfig at $configPath — the VM will start on WSL's defaults."
}

Write-Step "Current state"
wsl.exe --list --verbose

if (-not $Force) {
    Write-Host ""
    Write-Warn "wsl --shutdown stops every WSL distribution immediately."
    Write-Warn "Anything running inside them — builds, servers, Claude — is terminated."
    Write-Warn "Claude's conversation survives: it is reopened with --continue below."
    $answer = Read-Host "`nRestart WSL now? [y/N]"
    if ($answer -notmatch '^(y|Y)') {
        Write-Host "Cancelled. Nothing was changed." -ForegroundColor Green
        exit 0
    }
}

Write-Step "Shutting WSL down"
wsl.exe --shutdown
# The VM takes a moment to actually disappear; starting too early reuses it and
# the new .wslconfig is silently ignored, which looks exactly like the config
# not working.
Start-Sleep -Seconds 8

Write-Step "Starting $Distro"
wsl.exe -d $Distro -- true
if ($LASTEXITCODE -ne 0) {
    Write-Host "Could not start $Distro. Check 'wsl --list --verbose'." -ForegroundColor Red
    exit 1
}

Write-Step "Verifying the VM came back with the intended resources"
wsl.exe -d $Distro -- bash -lc @'
echo "--- memory and swap ---"
free -h
echo
echo "--- swap devices ---"
swapon --show || echo "(none)"
echo
echo "--- processors ---"
nproc
echo
echo "--- disk ---"
df -h / | tail -1
'@

Write-Step "Checking the project and Claude"
wsl.exe -d $Distro -- bash -lc "cd $ProjectDir && pwd && ls -d apps docs scripts result 2>/dev/null && claude --version"
if ($LASTEXITCODE -ne 0) {
    Write-Warn "The project or Claude could not be reached at $ProjectDir."
    Write-Warn "Open the distro by hand and check before resuming."
    exit 1
}

if ($NoResume) {
    Write-Step "Done. Resume when ready:"
    Write-Host "    wsl -d $Distro" -ForegroundColor Green
    Write-Host "    cd $ProjectDir && npm run claude:resilient" -ForegroundColor Green
    exit 0
}

Write-Step "Resuming Claude on the previous conversation"
Write-Host "    Starting inside tmux, so a closed terminal no longer ends the session." -ForegroundColor Green
# --continue picks up the most recent conversation for this directory. No
# session id is hardcoded, so this keeps working across sessions.
wsl.exe -d $Distro --cd $ProjectDir -- bash -lc 'scripts/claude-resilient.sh || claude --continue'
