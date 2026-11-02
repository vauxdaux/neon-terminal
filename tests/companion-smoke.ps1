param([Parameter(Mandatory=$true)][string]$Archive)
$ErrorActionPreference = 'Stop'
$testDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('neon-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
Expand-Archive -LiteralPath $Archive -DestinationPath $testDirectory
$root = Join-Path $testDirectory 'NEON-Companion'
$executable = Join-Path $root 'NEON-Companion.exe'
foreach ($file in @('NEON-Companion.exe', 'wwwroot/index.html', 'wwwroot/js/audio-engine.js', 'wwwroot/assets/after-hours.svg', 'wwwroot/assets/electric-garden.svg')) {
    if (!(Test-Path (Join-Path $root $file))) { throw "Packaged file is missing: $file" }
}
# Redirect launch output because the console contains an ephemeral local pairing key.
$process = Start-Process -FilePath $executable -ArgumentList '--no-browser' -WorkingDirectory $testDirectory -PassThru -RedirectStandardOutput (Join-Path $testDirectory 'stdout.txt') -RedirectStandardError (Join-Path $testDirectory 'stderr.txt')
try {
    $baseUrl = 'http://127.0.0.1:8765'
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(40)
    while ([DateTime]::UtcNow -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) { throw "Companion exited during startup with code $($process.ExitCode)." }
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl/" -TimeoutSec 2 -SkipHttpErrorCheck
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw 'The packaged companion did not serve its homepage with HTTP 200.' }
    if ($response.Content -notmatch 'neon / music terminal') { throw 'The homepage did not contain the NEON interface.' }
    $scriptResponse = Invoke-WebRequest -Uri "$baseUrl/js/audio-engine.js" -TimeoutSec 5
    if ($scriptResponse.Content -notmatch 'class AudioEngine' -or $scriptResponse.Content -notmatch 'command\(action') { throw 'The media-control audio adapter was not served.' }
    if ($response.Content -notmatch 'id="autoCover"') { throw 'The new player artwork interface was not included in the package.' }
    foreach ($asset in @('after-hours.svg','electric-garden.svg')) {
        $assetResponse = Invoke-WebRequest -Uri "$baseUrl/assets/$asset" -TimeoutSec 5
        if ($assetResponse.Content -notmatch '<svg') { throw "Invalid cover asset: $asset" }
    }
    $unknown = Invoke-WebRequest -Uri "$baseUrl/not-a-real-neon-path" -SkipHttpErrorCheck -TimeoutSec 5
    if ($unknown.StatusCode -ne 404) { throw 'Unknown routes should return 404.' }
    $foreign = Invoke-WebRequest -Uri "$baseUrl/api/live" -Headers @{ Origin = 'https://example.invalid' } -SkipHttpErrorCheck -TimeoutSec 5
    if ($foreign.StatusCode -ne 403) { throw 'Unrelated browser origins must be rejected.' }
    Write-Host 'Packaged companion smoke test passed: homepage, script, assets, 404 and Origin checks.'
} finally {
    $process.Refresh()
    if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
    # Stop-Process returns before Windows releases the executable and log handles.
    [void]$process.WaitForExit(10000)
    $process.Dispose()
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        try { Remove-Item -LiteralPath $testDirectory -Recurse -Force; break }
        catch {
            if ($attempt -eq 9) { Write-Warning 'Temporary smoke-test files will be cleared when the runner is disposed.' }
            else { Start-Sleep -Milliseconds 250 }
        }
    }
}

