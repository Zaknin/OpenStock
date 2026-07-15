[CmdletBinding()]
param(
    [string]$ApplicationBaseUrl = 'http://192.168.23.253:3000',
    [string]$SshHost = 'openstock',
    [int]$TestCircuitMs = 180000,
    [int]$DesiredFinalCircuitMs = 60000,
    [int]$ProviderReadyTimeoutSeconds = 300,
    [int]$PhaseReadyTimeoutSeconds = 90,
    [string]$SessionCookie = $env:OPENSTOCK_LIVE_ACCEPTANCE_SESSION_COOKIE,
    [switch]$RunCdpHelperSelfTests,
    [switch]$RunUiStatusHelperSelfTests,
    [switch]$BaselineOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This drives the production SOXL UI in a clean temporary Chromium profile. It
# deliberately does not read browser profiles, cookies, or local storage. Supply
# a current authenticated Cookie header value via
# OPENSTOCK_LIVE_ACCEPTANCE_SESSION_COOKIE; it remains in memory only and is
# never written to the artifact files.

$repoPath = '/opt/openstock'
$serviceName = 'openstock'
$ornithModelsUrl = 'http://127.0.0.1:8080/v1/models'
$ornithModelMarker = 'ornith-1.0-35b-Q4_K_M.gguf'
$ornithLauncher = Join-Path $HOME 'Scripts\Start-Ornith35B.ps1'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$artifactDirectory = Join-Path (Join-Path $PSScriptRoot '..\artifacts') "soxl-live-failover-acceptance-$timestamp"
$summaryPath = Join-Path $artifactDirectory 'summary.txt'
$logPath = Join-Path $artifactDirectory 'openstock.log'
$requestPath = Join-Path $artifactDirectory 'request-result-timestamps.csv'
$assertionPath = Join-Path $artifactDirectory 'assertions.csv'
$browserDiagnosticsPath = Join-Path $artifactDirectory 'browser-diagnostics.csv'

if (-not ($RunCdpHelperSelfTests -or $RunUiStatusHelperSelfTests)) {
    New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
    Set-Content -LiteralPath $logPath -Value '# Sanitized OpenStock provider-routing logs only. No request/response bodies or secrets.'
    Set-Content -LiteralPath $requestPath -Value 'utc,phase,httpStatus,resultStatus,providerId,durationMs'
    Set-Content -LiteralPath $assertionPath -Value 'utc,name,passed,detail'
    Set-Content -LiteralPath $browserDiagnosticsPath -Value 'utc,phase,browser,pageUrl,pageTitle,navigationStatus,authenticatedControls,generateEnabled,resultContainer,statusSource,statusCandidateCount,resultStatus,provider,asOfLabel,sawLoading,providerRequestObserved,routeObserved,clickAttempts,elapsedMs,consoleErrorCount'
}

$assertions = [System.Collections.Generic.List[object]]::new()
$summary = [System.Collections.Generic.List[string]]::new()
$originalCircuitValue = $null
$originalCircuitWasPresent = $false
$initialContainerCircuitValue = $null
$configurationRestored = $false
$circuitWorkflowStarted = $false
$ornithStoppedForTest = $false
$launcherProcess = $null
$browserProcess = $null
$browserSocket = $null
$browserProfileDirectory = Join-Path $env:TEMP "soxl-live-acceptance-browser-$timestamp"
$browserDebugPort = $null
$browserNextCommandId = 0
$browserConsoleErrorCount = 0
$browserExecutable = $null
$testFailure = $null
$cleanupFailure = $null

function Add-Summary([string]$Line) {
    $summary.Add("$(Get-Date -Format o) $Line")
}

function Add-Assertion([string]$Name, [bool]$Passed, [string]$Detail) {
    $safeDetail = $Detail.Replace("`r", ' ').Replace("`n", ' ').Replace(',', ';')
    $record = [pscustomobject]@{
        utc = (Get-Date).ToUniversalTime().ToString('o')
        name = $Name
        passed = $Passed
        detail = $safeDetail
    }
    $assertions.Add($record)
    Add-Content -LiteralPath $assertionPath -Value ('{0},{1},{2},{3}' -f $record.utc, $record.name, $record.passed, $record.detail)
    if (-not $Passed) {
        throw "Assertion failed: $Name ($safeDetail)"
    }
}

function Invoke-RemoteBash([string]$Script) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script))
    $output = & ssh $SshHost "printf %s '$encoded' | base64 -d | bash"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote command failed with exit code $LASTEXITCODE."
    }
    return @($output)
}

function Get-RemoteCircuitSetting {
    $output = @(Invoke-RemoteBash @"
set -euo pipefail
cd '$repoPath'
if grep -q '^SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS=' .env; then
  printf 'present=%s\n' "`$(sed -n 's/^SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS=//p' .env | head -n 1)"
else
  printf 'absent\n'
fi
"@)
    if ($output.Count -ne 1) {
        throw 'Could not read a single circuit configuration value.'
    }
    if ($output[0] -eq 'absent') {
        return [pscustomobject]@{ Present = $false; Value = $null }
    }
    if ($output[0] -match '^present=(?<value>[0-9]+)$') {
        return [pscustomobject]@{ Present = $true; Value = [int]$Matches.value }
    }
    throw 'Circuit configuration contained an unexpected non-numeric value.'
}

function Set-RemoteCircuitSetting([Nullable[int]]$Value) {
    $valueLiteral = if ($null -eq $Value) { '__ABSENT__' } else { [string]$Value }
    Invoke-RemoteBash @"
set -euo pipefail
cd '$repoPath'
python3 - '$valueLiteral' <<'PY'
from pathlib import Path
import sys

path = Path('.env')
key = 'SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS'
value = sys.argv[1]
lines = path.read_text(encoding='utf-8').splitlines()
replacement = []
replaced = False
for line in lines:
    if line.startswith(key + '='):
        if value != '__ABSENT__' and not replaced:
            replacement.append(f'{key}={value}')
            replaced = True
    else:
        replacement.append(line)
if value != '__ABSENT__' and not replaced:
    replacement.append(f'{key}={value}')
path.write_text('\n'.join(replacement) + '\n', encoding='utf-8')
PY
"@ | Out-Null
}

function Recreate-OpenStockContainer {
    Invoke-RemoteBash @"
set -euo pipefail
cd '$repoPath'
docker compose up -d --force-recreate --no-deps '$serviceName' >/dev/null
test "`$(docker compose ps --status running --services | grep -Fx '$serviceName')" = '$serviceName'
"@ | Out-Null
}

function Get-ContainerCircuitSetting {
    $output = @(Invoke-RemoteBash @"
set -euo pipefail
cd '$repoPath'
docker compose exec -T '$serviceName' sh -lc 'printf %s "`$SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS"'
"@)
    if ($output.Count -ne 1 -or $output[0] -notmatch '^[0-9]+$') {
        throw 'Could not verify the circuit configuration inside the OpenStock container.'
    }
    return [int]$output[0]
}

function Get-RouteLogs([datetime]$StartUtc, [datetime]$EndUtc, [string]$Phase, [bool]$WriteArtifact = $true) {
    $since = $StartUtc.ToString('o')
    $until = $EndUtc.AddSeconds(2).ToString('o')
    $output = @(Invoke-RemoteBash @"
set -euo pipefail
cd '$repoPath'
docker compose logs --no-color --timestamps --since '$since' --until '$until' '$serviceName' 2>&1 |
  grep -E 'SOXL_AI_(PROVIDER_REQUEST|PRIMARY_SKIPPED|RESPONSE_REJECTED|PROVIDER_HTTP_REJECTED|ROUTE|PROVIDER_FAILED)' || true
"@)
    if ($WriteArtifact) {
        Add-Content -LiteralPath $logPath -Value "`n# $Phase $since .. $until"
        if ($output.Count -gt 0) {
            Add-Content -LiteralPath $logPath -Value $output
        }
    }
    return @($output)
}

function Get-OrnithProcess {
    $matches = @(Get-CimInstance Win32_Process -Filter "Name = 'llama-server.exe'" |
        Where-Object { $_.CommandLine -match [regex]::Escape($ornithModelMarker) })
    if ($matches.Count -gt 1) {
        throw "More than one Ornith llama-server process was found: $($matches.ProcessId -join ', ')."
    }
    if ($matches.Count -eq 1) {
        return $matches[0]
    }
    return $null
}

function Test-OrnithModels {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $ornithModelsUrl -TimeoutSec 10
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-OrnithReady {
    $deadline = (Get-Date).AddSeconds($ProviderReadyTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ((Get-OrnithProcess) -ne $null -and (Test-OrnithModels)) {
            return
        }
        Start-Sleep -Seconds 3
    }
    throw "Ornith did not answer $ornithModelsUrl before the readiness timeout."
}

function Start-Ornith {
    if (-not (Test-Path -LiteralPath $ornithLauncher -PathType Leaf)) {
        throw "Ornith launcher was not found at $ornithLauncher."
    }
    if ((Get-OrnithProcess) -eq $null) {
        $quotedLauncher = '"{0}"' -f $ornithLauncher.Replace('"', '`"')
        $shellCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
        if ($null -eq $shellCommand) {
            $shellCommand = Get-Command powershell.exe -ErrorAction Stop
        }
        $launcherProcess = Start-Process -FilePath $shellCommand.Source `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File $quotedLauncher" -PassThru
        Add-Summary "Started controlled Ornith launcher processId=$($launcherProcess.Id)."
    }
    Wait-OrnithReady
}

function Ensure-OrnithReady {
    if (Test-OrnithModels) {
        return
    }
    $existing = Get-OrnithProcess
    if ($null -ne $existing) {
        Stop-Process -Id $existing.ProcessId -Force
    }
    Start-Ornith
}

function Get-BrowserExecutable {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
    if ($candidates.Count -eq 0) {
        throw 'No installed Chrome or Edge executable was found for browser-level acceptance.'
    }
    return $candidates[0]
}

function Receive-BrowserCdpMessage {
    $buffer = New-Object byte[] 65536
    $stream = [System.IO.MemoryStream]::new()
    do {
        $receiveTask = $browserSocket.ReceiveAsync(
            [System.ArraySegment[byte]]::new($buffer),
            [System.Threading.CancellationToken]::None
        )
        $result = $receiveTask.GetAwaiter().GetResult()
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw 'Browser DevTools connection closed unexpectedly.'
        }
        [void]$stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    $json = [Text.Encoding]::UTF8.GetString($stream.ToArray())
    $message = $json | ConvertFrom-Json -Depth 32
    if ($null -eq $message) {
        throw 'Browser DevTools returned an empty message.'
    }
    return $message
}

function Update-BrowserCdpEventDiagnostics([object]$Message) {
    $methodProperty = $Message.PSObject.Properties['method']
    if ($null -eq $methodProperty) {
        return
    }
    if ($methodProperty.Value -eq 'Runtime.exceptionThrown') {
        $script:browserConsoleErrorCount += 1
    } elseif ($methodProperty.Value -eq 'Log.entryAdded' -and $Message.params.entry.level -in @('error', 'warning')) {
        $script:browserConsoleErrorCount += 1
    }
}

function Receive-CdpCommandResult([int]$CommandId, [scriptblock]$ReceiveMessage, [scriptblock]$OnEvent = {}) {
    [int]$matchingResponseCount = 0
    while ($true) {
        $received = @(& $ReceiveMessage)
        if ($received.Count -ne 1) {
            $types = @($received | ForEach-Object {
                if ($null -eq $_) { 'null' } else { $_.GetType().FullName }
            }) -join ', '
            throw "CDP receive helper emitted $($received.Count) pipeline objects; expected exactly one. Types: $types"
        }
        $message = $received[0]
        if ($null -eq $message) {
            throw 'CDP receive helper returned no message.'
        }
        if ($null -ne $message.PSObject.Properties['method']) {
            [void](& $OnEvent $message)
            continue
        }
        $responseIdProperty = $message.PSObject.Properties['id']
        if ($null -eq $responseIdProperty -or $responseIdProperty.Value -ne $CommandId) {
            continue
        }
        $matchingResponseCount += 1
        if ($matchingResponseCount -ne 1) {
            throw "CDP command $CommandId produced more than one matching response."
        }
        if ($null -ne $message.PSObject.Properties['error']) {
            throw "Browser DevTools command $CommandId returned an error response."
        }
        $resultProperty = $message.PSObject.Properties['result']
        if ($null -eq $resultProperty -or $null -eq $resultProperty.Value) {
            throw "Browser DevTools command $CommandId returned no result object."
        }
        return $resultProperty.Value
    }
}

function Invoke-CdpCommand([string]$Method, [hashtable]$Parameters = @{}) {
    $script:browserNextCommandId += 1
    $id = $script:browserNextCommandId
    $payload = @{
        id = $id
        method = $Method
        params = $Parameters
    } | ConvertTo-Json -Compress -Depth 32
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $sendTask = $browserSocket.SendAsync(
        [System.ArraySegment[byte]]::new($bytes),
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [System.Threading.CancellationToken]::None
    )
    [void]$sendTask.GetAwaiter().GetResult()
    $result = Receive-CdpCommandResult -CommandId $id -ReceiveMessage {
        Receive-BrowserCdpMessage
    } -OnEvent {
        param($message)
        Update-BrowserCdpEventDiagnostics $message
    }
    if ($null -eq $result) {
        throw "Browser DevTools command $Method returned no result object."
    }
    return $result
}

function Assert-CdpNetworkSetCookieSuccess([object]$CookieResult) {
    if ($null -eq $CookieResult) {
        throw 'CDP Network.setCookie returned no result object.'
    }
    $successProperty = $CookieResult.PSObject.Properties['success']
    if ($null -eq $successProperty) {
        $propertyNames = @($CookieResult.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object) -join ', '
        throw "CDP Network.setCookie returned no success field. Returned properties: $propertyNames"
    }
    if ($successProperty.Value -ne $true) {
        throw 'The authenticated browser cookie could not be installed.'
    }
}

function New-CdpTestMessageSource([object[]]$Messages) {
    $queue = [System.Collections.Generic.Queue[object]]::new()
    foreach ($message in $Messages) {
        $queue.Enqueue($message)
    }
    return ({
        if ($queue.Count -eq 0) {
            throw 'CDP self-test message queue was exhausted.'
        }
        return $queue.Dequeue()
    }.GetNewClosure())
}

function Assert-CdpSelfTest([bool]$Condition, [string]$Name) {
    if (-not $Condition) {
        throw "CDP helper self-test failed: $Name"
    }
    $script:cdpSelfTestCount += 1
}

function Invoke-CdpHelperSelfTests {
    $script:cdpSelfTestCount = 0
    $expectedResult = [pscustomobject]@{ success = $true }
    $messageSource = New-CdpTestMessageSource @(
        [pscustomobject]@{ method = 'Runtime.consoleAPICalled'; params = [pscustomobject]@{} },
        [pscustomobject]@{ id = 99; result = [pscustomobject]@{} },
        [pscustomobject]@{ id = 7; result = $expectedResult }
    )
    $commandOutput = @(Receive-CdpCommandResult -CommandId 7 -ReceiveMessage $messageSource)
    Assert-CdpSelfTest ($commandOutput.Count -eq 1) 'matching command emits exactly one result object'
    Assert-CdpSelfTest ([object]::ReferenceEquals($commandOutput[0], $expectedResult)) 'CDP envelope is reduced to response.result'
    Assert-CdpSelfTest ($commandOutput[0].GetType().FullName -ne 'System.Threading.Tasks.VoidTaskResult') 'no infrastructure task result leaks from a normal command'

    $responseErrorThrown = $false
    try {
        $errorSource = New-CdpTestMessageSource @(
            [pscustomobject]@{ id = 8; error = [pscustomobject]@{ code = -32601; message = 'method unavailable' } }
        )
        $null = Receive-CdpCommandResult -CommandId 8 -ReceiveMessage $errorSource
    } catch {
        $responseErrorThrown = $_.Exception.Message -match 'error response'
    }
    Assert-CdpSelfTest $responseErrorThrown 'CDP response error throws'

    $pipelineLeakThrown = $false
    try {
        $leakySource = {
            [System.Threading.Tasks.Task]::CompletedTask.GetAwaiter().GetResult()
            [pscustomobject]@{ id = 9; result = [pscustomobject]@{} }
        }
        $null = Receive-CdpCommandResult -CommandId 9 -ReceiveMessage $leakySource
    } catch {
        $pipelineLeakThrown = $_.Exception.Message -match 'pipeline objects'
    }
    Assert-CdpSelfTest $pipelineLeakThrown 'unexpected infrastructure pipeline output is rejected'

    Assert-CdpNetworkSetCookieSuccess ([pscustomobject]@{ success = $true })
    Assert-CdpSelfTest $true 'Network.setCookie success=true is accepted'

    $missingSuccessThrown = $false
    try {
        Assert-CdpNetworkSetCookieSuccess ([pscustomobject]@{ accepted = $true })
    } catch {
        $missingSuccessThrown = $_.Exception.Message -eq 'CDP Network.setCookie returned no success field. Returned properties: accepted'
    }
    Assert-CdpSelfTest $missingSuccessThrown 'Network.setCookie missing success reports only sanitized property names'

    Write-Host "CDP helper self-tests: passed ($script:cdpSelfTestCount assertions)."
}

function Test-SoxlUiResultReady($State, [bool]$SawLoading) {
    $normalizedStatus = ConvertTo-SoxlUiResultStatus $State.resultStatus
    return (-not $State.loading) `
        -and $State.resultContainerPresent `
        -and -not [string]::IsNullOrWhiteSpace($State.provider) `
        -and $normalizedStatus -ne 'unknown' `
        -and $SawLoading
}

function Invoke-UiStatusHelperSelfTests {
    $script:cdpSelfTestCount = 0
    $script:uiStatusSelfTestCount = 0
    Assert-CdpSelfTest ((ConvertTo-SoxlUiResultStatus 'AVAILABLE') -eq 'available') 'AVAILABLE normalizes to available'
    Assert-CdpSelfTest ((ConvertTo-SoxlUiResultStatus 'Available') -eq 'available') 'mixed-case Available normalizes to available'
    Assert-CdpSelfTest ((ConvertTo-SoxlUiResultStatus 'UNAVAILABLE') -eq 'unavailable') 'UNAVAILABLE normalizes to unavailable'
    Assert-CdpSelfTest ((ConvertTo-SoxlUiResultStatus $null) -eq 'unknown') 'provider detected with an absent status remains unknown'

    $partialRawState = [pscustomobject]@{
        pageUrl = 'http://192.168.23.253:3000/soxl-intelligence'
        pageTitle = 'OpenStock'
        controls = $false
    }
    $normalizedPartialState = New-BrowserState $partialRawState
    $expectedStateProperties = @(
        'pageUrl', 'navigationStatus', 'pageTitle', 'documentReady', 'authenticated', 'generateControlFound', 'clearControlFound', 'generateEnabled', 'clearEnabled',
        'resultContainerPresent', 'loading', 'loadingObserved', 'resultStatus', 'provider', 'asOfLabel', 'resultIdentity',
        'statusSource', 'statusCandidateCount', 'diagnostic'
    )
    Assert-CdpSelfTest (@($expectedStateProperties | Where-Object { $null -eq $normalizedPartialState.PSObject.Properties[$_] }).Count -eq 0) 'complete browser state contains every schema property including navigationStatus'
    Assert-CdpSelfTest ($null -eq $normalizedPartialState.navigationStatus -and $normalizedPartialState.resultStatus -eq 'unknown') 'partial CDP result is normalized to the complete browser-state schema'
    $missingNavigationStatusSafe = $false
    try {
        $null = $normalizedPartialState.navigationStatus
        $missingNavigationStatusSafe = $true
    } catch {}
    Assert-CdpSelfTest $missingNavigationStatusSafe 'missing navigationStatus is strict-mode safe'

    $readyState = New-BrowserState ([pscustomobject]@{
        loading = $false
        resultContainerPresent = $true
        resultStatus = 'available'
        provider = 'ornith-35b-primary'
    })
    $unrelatedPageStatus = New-BrowserState ([pscustomobject]@{
        loading = $false
        resultContainerPresent = $true
        resultStatus = 'unknown'
        provider = 'ornith-35b-primary'
        unrelatedPageText = 'Available'
    })
    Assert-CdpSelfTest (-not (Test-SoxlUiResultReady $unrelatedPageStatus $true)) 'unrelated page text containing available is ignored'

    $splitContainerState = New-BrowserState ([pscustomobject]@{
        loading = $false
        resultContainerPresent = $false
        resultStatus = 'available'
        provider = 'ornith-35b-primary'
    })
    Assert-CdpSelfTest (-not (Test-SoxlUiResultReady $splitContainerState $true)) 'status and provider must come from the same result container'
    Assert-CdpSelfTest (-not (Test-SoxlUiResultReady $readyState $false)) 'stale result without a loading transition is rejected'

    $loadingState = New-BrowserState ([pscustomobject]@{
        loading = $true
        resultContainerPresent = $false
        resultStatus = 'unknown'
        provider = $null
    })
    Assert-CdpSelfTest (-not (Test-SoxlUiResultReady $loadingState $true)) 'loading state waits instead of returning unknown immediately'
    Assert-CdpSelfTest (Test-SoxlUiResultReady $readyState $true) 'fresh completed result is accepted'

    $inPageReactState = New-BrowserState ([pscustomobject]@{
        pageUrl = 'http://192.168.23.253:3000/soxl-intelligence'
        authenticated = $true
        generateControlFound = $true
        clearControlFound = $true
        resultContainerPresent = $true
        loading = $false
        resultStatus = 'available'
        provider = 'ornith-35b-primary'
    })
    Assert-CdpSelfTest (Test-SoxlUiResultReady $inPageReactState $true) 'missing navigationStatus is allowed during an authenticated in-page React update'
    Assert-CdpSelfTest (-not (Test-InitialSoxlPageReady $inPageReactState 'http://192.168.23.253:3000/soxl-intelligence')) 'missing navigationStatus during initial navigation does not silently pass'

    $loginState = New-BrowserState ([pscustomobject]@{
        pageUrl = 'http://192.168.23.253:3000/sign-in'
        navigationStatus = 200
        authenticated = $false
    })
    Assert-CdpSelfTest (Test-SoxlLoginRedirect $loginState) 'login redirect fails authenticated-page validation'

    $postRecreateInvalidState = New-BrowserState ([pscustomobject]@{
        pageUrl = 'http://192.168.23.253:3000/soxl-intelligence'
        documentReady = $false
    })
    Assert-CdpSelfTest (-not (Test-SoxlPhaseReady $postRecreateInvalidState 'http://192.168.23.253:3000/soxl-intelligence')) 'page state is invalidated after container recreation'

    $reloadedReadyState = New-BrowserState ([pscustomobject]@{
        pageUrl = 'http://192.168.23.253:3000/soxl-intelligence'
        navigationStatus = 200
        documentReady = $true
        authenticated = $true
        generateControlFound = $true
        clearControlFound = $true
        generateEnabled = $true
        clearEnabled = $true
    })
    Assert-CdpSelfTest (Test-InitialSoxlPageReady $reloadedReadyState 'http://192.168.23.253:3000/soxl-intelligence') 'reload restores authenticated controls'
    Assert-CdpSelfTest (Test-CanRetryGenerateClick $false $false 1) 'destroyed execution context retries only before provider invocation'
    Assert-CdpSelfTest (-not (Test-CanRetryGenerateClick $true $false 1)) 'provider invocation prevents duplicate click retries'
    Assert-CdpSelfTest (Test-GenerationStartObserved (New-BrowserState ([pscustomobject]@{ generateEnabled = $false })) $false) 'disabled Generate button counts as loading'
    Assert-CdpSelfTest (Test-GenerationStartObserved (New-BrowserState ([pscustomobject]@{ generateEnabled = $true })) $true) 'provider-request marker counts as generation-start evidence'
    Assert-CdpSelfTest (-not (Test-SoxlPhaseCompletion $readyState $true $true $false)) 'completion requires a fresh cleared-to-generated UI result'
    Assert-CdpSelfTest (Test-SoxlPhaseReady $reloadedReadyState 'http://192.168.23.253:3000/soxl-intelligence') 'absent result container after Clear is valid for phase readiness'
    $unknownAfterReload = New-BrowserState ([pscustomobject]@{
        pageUrl = 'http://192.168.23.253:3000/soxl-intelligence'
        navigationStatus = 200
        documentReady = $true
        authenticated = $true
        generateControlFound = $true
        clearControlFound = $true
        resultContainerPresent = $true
        resultStatus = 'unknown'
        provider = $null
    })
    Assert-CdpSelfTest (-not (Test-SoxlPhaseReady $unknownAfterReload 'http://192.168.23.253:3000/soxl-intelligence')) 'unknown result state after reload does not pass'
    $script:uiStatusSelfTestCount = $script:cdpSelfTestCount
    Write-Host "UI status helper self-tests: passed ($script:uiStatusSelfTestCount assertions)."
}

function Invoke-BrowserEvaluation([string]$Expression) {
    $result = Invoke-CdpCommand 'Runtime.evaluate' @{
        expression = $Expression
        returnByValue = $true
        awaitPromise = $true
    }
    if ($result.PSObject.Properties.Name -contains 'exceptionDetails') {
        throw 'Browser evaluation failed.'
    }
    return $result.result.value
}

function Start-AcceptanceBrowser {
    $script:browserExecutable = Get-BrowserExecutable
    New-Item -ItemType Directory -Path $browserProfileDirectory -Force | Out-Null
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    [void]$listener.Start()
    $script:browserDebugPort = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    [void]$listener.Stop()
    $arguments = @(
        '--headless=new',
        "--remote-debugging-port=$browserDebugPort",
        "--user-data-dir=$browserProfileDirectory",
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        'about:blank'
    )
    $script:browserProcess = Start-Process -FilePath $browserExecutable -ArgumentList $arguments -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    $version = $null
    while ((Get-Date) -lt $deadline) {
        try {
            $version = Invoke-RestMethod -Uri "http://127.0.0.1:$browserDebugPort/json/version" -TimeoutSec 3
            break
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if ($null -eq $version) {
        throw 'Chrome DevTools endpoint did not become available.'
    }
    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$browserDebugPort/json/list" -TimeoutSec 10
    $target = @($targets | Where-Object { $_.type -eq 'page' }) | Select-Object -First 1
    if ($null -eq $target) {
        throw 'Chrome did not expose a page target.'
    }
    $script:browserSocket = [System.Net.WebSockets.ClientWebSocket]::new()
    $connectTask = $browserSocket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None)
    [void]$connectTask.GetAwaiter().GetResult()
    Invoke-CdpCommand 'Page.enable' | Out-Null
    Invoke-CdpCommand 'Runtime.enable' | Out-Null
    Invoke-CdpCommand 'Network.enable' | Out-Null
    Invoke-CdpCommand 'Log.enable' | Out-Null

    $cookieMatch = [regex]::Match($SessionCookie, '^better-auth\.session_token=(?<value>[^;\r\n]+)$')
    if (-not $cookieMatch.Success) {
        throw 'OPENSTOCK_LIVE_ACCEPTANCE_SESSION_COOKIE must contain only the better-auth.session_token Cookie entry.'
    }
    $cookieResult = Invoke-CdpCommand 'Network.setCookie' @{
        name = 'better-auth.session_token'
        value = $cookieMatch.Groups['value'].Value
        domain = '192.168.23.253'
        path = '/'
        httpOnly = $true
        secure = $false
        url = 'http://192.168.23.253/'
    }
    Assert-CdpNetworkSetCookieSuccess $cookieResult
}

function Get-OptionalPropertyValue {
    param(
        [object]$Object,
        [string]$Name,
        $Default = $null
    )

    if ($null -eq $Object) {
        return $Default
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $Default
    }
    return $property.Value
}

function ConvertTo-SoxlUiResultStatus([AllowNull()][string]$Value) {
    if ($null -eq $Value) {
        return 'unknown'
    }
    switch ($Value.Trim().ToLowerInvariant()) {
        'available' { return 'available' }
        'unavailable' { return 'unavailable' }
        default { return 'unknown' }
    }
}

function New-BrowserState([object]$RawState = $null) {
    $rawNavigationStatus = Get-OptionalPropertyValue $RawState 'navigationStatus'
    $navigationStatus = $null
    if ($null -ne $rawNavigationStatus) {
        $parsedNavigationStatus = 0
        if ([int]::TryParse([string]$rawNavigationStatus, [ref]$parsedNavigationStatus)) {
            $navigationStatus = $parsedNavigationStatus
        }
    }
    $rawCandidateCount = Get-OptionalPropertyValue $RawState 'statusCandidateCount' 0
    $statusCandidateCount = 0
    if (-not [int]::TryParse([string]$rawCandidateCount, [ref]$statusCandidateCount)) {
        $statusCandidateCount = 0
    }
    $status = ConvertTo-SoxlUiResultStatus (Get-OptionalPropertyValue $RawState 'resultStatus')
    $pageUrl = Get-OptionalPropertyValue $RawState 'pageUrl'
    $generateControlFound = [bool](Get-OptionalPropertyValue $RawState 'generateControlFound' $false)
    $clearControlFound = [bool](Get-OptionalPropertyValue $RawState 'clearControlFound' $false)
    return [pscustomobject][ordered]@{
        pageUrl = if ($null -eq $pageUrl) { $null } else { [string]$pageUrl }
        navigationStatus = $navigationStatus
        pageTitle = Get-OptionalPropertyValue $RawState 'pageTitle'
        documentReady = [bool](Get-OptionalPropertyValue $RawState 'documentReady' $false)
        authenticated = [bool](Get-OptionalPropertyValue $RawState 'authenticated' ($generateControlFound -and $clearControlFound))
        generateControlFound = $generateControlFound
        clearControlFound = $clearControlFound
        generateEnabled = [bool](Get-OptionalPropertyValue $RawState 'generateEnabled' $false)
        clearEnabled = [bool](Get-OptionalPropertyValue $RawState 'clearEnabled' $false)
        resultContainerPresent = [bool](Get-OptionalPropertyValue $RawState 'resultContainerPresent' $false)
        loading = [bool](Get-OptionalPropertyValue $RawState 'loading' $false)
        loadingObserved = [bool](Get-OptionalPropertyValue $RawState 'loadingObserved' $false)
        resultStatus = $status
        provider = Get-OptionalPropertyValue $RawState 'provider'
        asOfLabel = Get-OptionalPropertyValue $RawState 'asOfLabel'
        resultIdentity = Get-OptionalPropertyValue $RawState 'resultIdentity'
        statusSource = Get-OptionalPropertyValue $RawState 'statusSource' 'none'
        statusCandidateCount = $statusCandidateCount
        diagnostic = Get-OptionalPropertyValue $RawState 'diagnostic'
    }
}

function Test-InitialSoxlPageReady($State, [string]$ExpectedPageUrl) {
    return $State.pageUrl -eq $ExpectedPageUrl `
        -and $null -ne $State.navigationStatus `
        -and $State.navigationStatus -ge 200 `
        -and $State.navigationStatus -lt 300 `
        -and $State.documentReady `
        -and $State.authenticated `
        -and $State.generateControlFound `
        -and $State.clearControlFound
}

function Test-SoxlLoginRedirect($State) {
    return $State.pageUrl -match '/(sign-in|login)$'
}

function Test-SoxlPhaseReady($State, [string]$ExpectedPageUrl) {
    if ($State.pageUrl -ne $ExpectedPageUrl `
        -or -not $State.documentReady `
        -or -not $State.authenticated `
        -or -not $State.generateControlFound `
        -or -not $State.clearControlFound `
        -or $State.loading) {
        return $false
    }
    if (-not $State.resultContainerPresent) {
        return $true
    }
    return $State.resultStatus -ne 'unknown' -and -not [string]::IsNullOrWhiteSpace($State.provider)
}

function Test-GenerationStartObserved($State, [bool]$ProviderRequestObserved) {
    return $State.loading -or -not $State.generateEnabled -or $ProviderRequestObserved
}

function Test-CanRetryGenerateClick([bool]$ProviderRequestObserved, [bool]$RouteObserved, [int]$ClickAttempts) {
    return -not $ProviderRequestObserved -and -not $RouteObserved -and $ClickAttempts -lt 2
}

function Test-SoxlPhaseCompletion($State, [bool]$SawGenerationStart, [bool]$RouteObserved, [bool]$ClearedToGenerated) {
    return (Test-SoxlUiResultReady $State $SawGenerationStart) -and $RouteObserved -and $ClearedToGenerated
}

function Get-UiExplanationState {
    $rawState = Invoke-BrowserEvaluation @'
(() => {
  const pageUrl = location.origin + location.pathname;
  const pageTitle = document.title;
  const navigation = performance.getEntriesByType('navigation')[0];
  const base = {
    pageUrl,
    pageTitle,
    navigationStatus: navigation && 'responseStatus' in navigation ? navigation.responseStatus : null,
    documentReady: document.readyState === 'complete',
    authenticated: false,
    generateControlFound: false,
    clearControlFound: false,
    generateEnabled: false,
    clearEnabled: false,
    resultContainerPresent: false,
    loading: false,
    loadingObserved: false,
    resultStatus: 'unknown',
    provider: null,
    asOfLabel: null,
    resultIdentity: null,
    statusSource: 'none',
    statusCandidateCount: 0,
    diagnostic: 'section=missing',
  };
  const section = document.querySelector('[aria-labelledby="grounded-soxl-explanation-heading"]');
  if (!section) return base;
  const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  const normalizeStatus = (value) => {
    const normalized = (value || '').trim().toLowerCase();
    return normalized === 'available' || normalized === 'unavailable' ? normalized : 'unknown';
  };
  const buttonByName = (name) => Array.from(section.querySelectorAll('button')).find((button) => visible(button) && ((button.getAttribute('aria-label') || button.innerText || '').trim() === name));
  const clear = buttonByName('Clear explanation');
  const generate = buttonByName('Generate explanation') || buttonByName('Generating explanation');
  const result = section.querySelector('[data-testid="soxl-explanation-result"]');
  const resultLabels = result ? Array.from(result.querySelectorAll('dt')) : [];
  const detailValue = (label) => resultLabels.find((element) => element.textContent.trim() === label)?.nextElementSibling?.textContent.trim() ?? null;
  const dataStatus = result?.getAttribute('data-status') ?? null;
  const dataProvider = result?.getAttribute('data-provider')?.trim() || null;
  const accessibleStatus = result ? Array.from(result.querySelectorAll('[role="status"],[aria-label]')).map((element) => ({
    value: element.getAttribute('aria-label') || element.textContent,
  })).find((candidate) => normalizeStatus(candidate.value) !== 'unknown') : null;
  const badgeStatus = result ? Array.from(result.querySelectorAll('span')).map((element) => ({
    value: element.textContent,
  })).find((candidate) => normalizeStatus(candidate.value) !== 'unknown') : null;
  const statusSource = normalizeStatus(dataStatus) !== 'unknown'
    ? 'data-status'
    : accessibleStatus
      ? 'accessible-status'
      : badgeStatus
        ? 'status-badge'
        : 'none';
  const statusRaw = statusSource === 'data-status'
    ? dataStatus
    : accessibleStatus
      ? accessibleStatus.value
      : badgeStatus
        ? badgeStatus.value
        : null;
  const provider = dataProvider || detailValue('Provider');
  const asOfLabel = detailValue('As of');
  const busyContainer = section.querySelector('[aria-busy]');
  return {
    ...base,
    authenticated: Boolean(clear && generate),
    generateControlFound: Boolean(generate),
    clearControlFound: Boolean(clear),
    generateEnabled: Boolean(generate && !generate.disabled),
    clearEnabled: Boolean(clear && !clear.disabled),
    resultContainerPresent: Boolean(result),
    loading: Boolean((busyContainer && busyContainer.getAttribute('aria-busy') === 'true') || (generate && (generate.innerText || '').trim() === 'Generating explanation')),
    resultStatus: normalizeStatus(statusRaw),
    provider,
    asOfLabel,
    resultIdentity: result ? `${provider ?? ''}|${asOfLabel ?? ''}|${normalizeStatus(statusRaw)}` : null,
    statusSource,
    statusCandidateCount: result ? result.querySelectorAll('[data-status],[role="status"],[aria-label],span').length : 0,
    diagnostic: result ? `result=present; statusSource=${statusSource}` : 'result=absent',
  };
})()
'@
    return New-BrowserState $rawState
}

function Format-UiSelectorDiagnostics($State) {
    return "resultContainer=$($State.resultContainerPresent); statusSource=$($State.statusSource); statusCandidateCount=$($State.statusCandidateCount); resultStatus=$($State.resultStatus); provider=$($State.provider); asOfLabel=$($State.asOfLabel); diagnostic=$($State.diagnostic)"
}

function ConvertTo-SanitizedCsvField([AllowNull()][string]$Value, [string]$Default = 'unknown') {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $Default
    }
    return $Value.Replace("`r", ' ').Replace("`n", ' ').Replace(',', ';')
}

function Open-SoxlPage {
    $expectedPageUrl = "$ApplicationBaseUrl/soxl-intelligence"
    Invoke-CdpCommand 'Page.navigate' @{ url = $expectedPageUrl } | Out-Null
    $deadline = (Get-Date).AddSeconds(60)
    $navigationObserved = $false
    $state = New-BrowserState
    while ((Get-Date) -lt $deadline) {
        $state = Get-UiExplanationState
        if (Test-SoxlLoginRedirect $state) {
            throw 'The session cookie was rejected: the browser was redirected to login instead of the authenticated SOXL page.'
        }
        if ($state.pageUrl -eq $expectedPageUrl -and $null -ne $state.navigationStatus) {
            $navigationObserved = $true
            if ($state.navigationStatus -lt 200 -or $state.navigationStatus -ge 300) {
                throw "The authenticated SOXL page navigation did not succeed. HTTP status: $($state.navigationStatus)"
            }
            if (Test-InitialSoxlPageReady $state $expectedPageUrl) {
                return $state
            }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $navigationObserved) {
        throw "The initial SOXL navigation did not report a successful HTTP status. Page: $($state.pageUrl); navigation status: $($state.navigationStatus)"
    }
    throw "The authenticated SOXL page did not render its real explanation controls. Page: $($state.pageUrl); navigation status: $($state.navigationStatus); diagnostic: $($state.diagnostic)"
}

function Test-OpenStockPort {
    $uri = [Uri]$ApplicationBaseUrl
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync($uri.Host, $uri.Port)
        $connected = $connectTask.Wait(5000)
        return $connected -and $client.Connected
    } catch {
        return $false
    } finally {
        [void]$client.Dispose()
    }
}

function Wait-ForOpenStockPort {
    $deadline = (Get-Date).AddSeconds($PhaseReadyTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-OpenStockPort) {
            return
        }
        Start-Sleep -Seconds 1
    }
    throw "OpenStock did not accept TCP connections on $ApplicationBaseUrl before the phase-ready timeout."
}

function Wait-ForSoxlPhaseReady([string]$Phase) {
    $expectedPageUrl = "$ApplicationBaseUrl/soxl-intelligence"
    $deadline = (Get-Date).AddSeconds($PhaseReadyTimeoutSeconds)
    $lastError = $null
    while ((Get-Date) -lt $deadline) {
        try {
            $state = Open-SoxlPage
            if (Test-SoxlPhaseReady $state $expectedPageUrl) {
                return $state
            }
        } catch {
            $lastError = $_.Exception.Message
        }
        Start-Sleep -Milliseconds 500
    }
    $detail = if ($null -eq $lastError) { 'no ready browser state was observed' } else { $lastError }
    throw "SOXL phase $Phase did not become ready after application recreation: $detail"
}

function Recreate-OpenStockForBrowserPhase([string]$Phase) {
    Recreate-OpenStockContainer
    Wait-ForOpenStockPort
    $state = Wait-ForSoxlPhaseReady $Phase
    Add-Assertion "$Phase application/browser reacquired after container recreation" $true "page=$($state.pageUrl); navigationStatus=$($state.navigationStatus); authenticated=$($state.authenticated)"
    return $state
}

function Stop-AcceptanceBrowser {
    if ($null -ne $browserSocket) {
        [void]$browserSocket.Dispose()
        $script:browserSocket = $null
    }
    if ($null -ne $browserProcess -and -not $browserProcess.HasExited) {
        Stop-Process -Id $browserProcess.Id -Force
    }
    if (Test-Path -LiteralPath $browserProfileDirectory) {
        Remove-Item -LiteralPath $browserProfileDirectory -Recurse -Force
    }
    if (Test-Path -LiteralPath $browserProfileDirectory) {
        throw 'Temporary authenticated browser profile could not be removed.'
    }
}

function Invoke-GenerateExplanationClick {
    Invoke-BrowserEvaluation @'
(() => {
  const section = document.querySelector('[aria-labelledby="grounded-soxl-explanation-heading"]');
  const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  const generate = Array.from(section?.querySelectorAll('button') ?? []).find((button) => visible(button) && ((button.getAttribute('aria-label') || button.innerText || '').trim() === 'Generate explanation'));
  if (!generate || generate.disabled) throw new Error('Generate explanation button was not ready in the current execution context');
  generate.click();
  return true;
})()
'@ | Out-Null
}

function Invoke-CurrentExplanation([string]$Phase) {
    $initial = Wait-ForSoxlPhaseReady $Phase
    Add-Assertion "$Phase authenticated UI controls" ($initial.authenticated -and $initial.generateControlFound -and $initial.clearControlFound) "page=$($initial.pageUrl)"
    $previousProvider = $initial.provider
    $previousStatus = $initial.resultStatus
    $previousAsOfLabel = $initial.asOfLabel
    Invoke-BrowserEvaluation @'
(() => {
  const section = document.querySelector('[aria-labelledby="grounded-soxl-explanation-heading"]');
  const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  const clear = Array.from(section.querySelectorAll('button')).find((button) => visible(button) && ((button.getAttribute('aria-label') || button.innerText || '').trim() === 'Clear explanation'));
  if (!clear) throw new Error('Clear explanation button was not found');
  clear.click();
  return true;
})()
'@ | Out-Null
    $clearDeadline = (Get-Date).AddSeconds(10)
    do {
        $afterClear = Get-UiExplanationState
        if (-not $afterClear.resultContainerPresent) {
            break
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $clearDeadline)
    Add-Assertion "$Phase cleared prior explanation" (-not $afterClear.resultContainerPresent) 'no prior visible explanation result remains before generation'

    $start = (Get-Date).ToUniversalTime()
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $clickAttempts = 0
    $providerRequestObserved = $false
    $routeObserved = $false
    $markerLines = @()
    do {
        $clickAttempts += 1
        $clickError = $null
        try {
            Invoke-GenerateExplanationClick
        } catch {
            $clickError = $_.Exception.Message
        }
        Start-Sleep -Milliseconds 500
        $state = Get-UiExplanationState
        $markerLines = @(Get-RouteLogs $start (Get-Date).ToUniversalTime() "$Phase generation-start" $false)
        $providerRequestObserved = ($markerLines -join "`n") -match 'SOXL_AI_PROVIDER_REQUEST'
        $routeObserved = ($markerLines -join "`n") -match 'SOXL_AI_ROUTE'
        if (Test-GenerationStartObserved $state $providerRequestObserved) {
            break
        }
        if (-not (Test-CanRetryGenerateClick $providerRequestObserved $routeObserved $clickAttempts)) {
            $reason = if ($null -eq $clickError) { 'no semantic loading signal or bounded provider marker' } else { 'current execution context click failed' }
            throw "Generate explanation did not start for phase $Phase after $clickAttempts attempt(s): $reason"
        }
        Wait-ForSoxlPhaseReady "$Phase click-retry"
    } while ($true)
    $deadline = (Get-Date).AddSeconds(1500)
    $sawLoading = Test-GenerationStartObserved $state $providerRequestObserved
    $clearedToGenerated = $afterClear.resultContainerPresent -eq $false -and $state.resultContainerPresent
    $lastLogPoll = (Get-Date).ToUniversalTime().AddSeconds(-2)
    do {
        Start-Sleep -Milliseconds 200
        $state = Get-UiExplanationState
        if (((Get-Date).ToUniversalTime() - $lastLogPoll).TotalSeconds -ge 1) {
            $markerLines = @(Get-RouteLogs $start (Get-Date).ToUniversalTime() "$Phase progress" $false)
            $providerRequestObserved = $providerRequestObserved -or (($markerLines -join "`n") -match 'SOXL_AI_PROVIDER_REQUEST')
            $routeObserved = $routeObserved -or (($markerLines -join "`n") -match 'SOXL_AI_ROUTE')
            $lastLogPoll = (Get-Date).ToUniversalTime()
        }
        $sawLoading = $sawLoading -or (Test-GenerationStartObserved $state $providerRequestObserved)
        $clearedToGenerated = $clearedToGenerated -or ($afterClear.resultContainerPresent -eq $false -and $state.resultContainerPresent)
        $state.loadingObserved = $sawLoading
    } while ((Get-Date) -lt $deadline -and -not (Test-SoxlPhaseCompletion $state $sawLoading $routeObserved $clearedToGenerated))
    $stopwatch.Stop()
    $end = (Get-Date).ToUniversalTime()
    $resultStatus = ConvertTo-SoxlUiResultStatus $state.resultStatus
    $providerId = if ([string]::IsNullOrWhiteSpace($state.provider)) { 'unknown' } else { $state.provider }
    $freshnessDetail = "sawLoading=$sawLoading; providerRequestObserved=$providerRequestObserved; routeObserved=$routeObserved; clickAttempts=$clickAttempts; clearedToGenerated=$clearedToGenerated; previousProvider=$previousProvider; previousStatus=$previousStatus; previousAsOfLabel=$previousAsOfLabel; currentProvider=$providerId; currentStatus=$resultStatus; currentAsOfLabel=$($state.asOfLabel)"
    Add-Assertion "$Phase observed loading before completed result" $sawLoading $freshnessDetail
    Add-Assertion "$Phase route observed before UI completion" $routeObserved $freshnessDetail
    Add-Assertion "$Phase UI result status resolved" ($resultStatus -ne 'unknown') (Format-UiSelectorDiagnostics $state)
    Add-Content -LiteralPath $requestPath -Value ('{0},{1},{2},{3},{4},{5}' -f $start.ToString('o'), $Phase, $state.navigationStatus, $resultStatus, $providerId, $stopwatch.ElapsedMilliseconds)
    $asOfDiagnostic = ConvertTo-SanitizedCsvField $state.asOfLabel
    $pageTitleDiagnostic = ConvertTo-SanitizedCsvField $state.pageTitle
    Add-Content -LiteralPath $browserDiagnosticsPath -Value ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11},{12},{13},{14},{15},{16},{17},{18},{19}' -f $end.ToString('o'), $Phase, (Split-Path $browserExecutable -Leaf), $state.pageUrl, $pageTitleDiagnostic, $state.navigationStatus, $state.authenticated, $state.generateEnabled, $state.resultContainerPresent, $state.statusSource, $state.statusCandidateCount, $resultStatus, $providerId, $asOfDiagnostic, $sawLoading, $providerRequestObserved, $routeObserved, $clickAttempts, $stopwatch.ElapsedMilliseconds, $browserConsoleErrorCount)
    return [pscustomobject]@{
        StartUtc = $start
        EndUtc = $end
        Status = $resultStatus
        ProviderId = $providerId
        HttpStatus = $state.navigationStatus
        ProviderRequestObserved = $providerRequestObserved
        RouteObserved = $routeObserved
    }
}

function Assert-AvailableResult($Result, [string]$Phase) {
    Add-Assertion "$Phase navigation state" ($null -eq $Result.HttpStatus -or $Result.HttpStatus -eq 200) "status=$($Result.HttpStatus)"
    Add-Assertion "$Phase Available result" ($Result.Status -eq 'available') "resultStatus=$($Result.Status); provider=$($Result.ProviderId)"
}

function Assert-Route($Lines, [string]$Phase, [string]$Provider, [string]$Role, [bool]$FallbackUsed, [string]$Reason) {
    $expected = "SOXL_AI_ROUTE provider=$Provider role=$Role fallbackUsed=$($FallbackUsed.ToString().ToLowerInvariant()) reason=$Reason"
    Add-Assertion "$Phase route" (($Lines -join "`n") -match [regex]::Escape($expected)) $expected
}

function Assert-NoRejectedOutput($Lines, [string]$Phase) {
    $joined = $Lines -join "`n"
    Add-Assertion "$Phase no validator/provider rejection" ($joined -notmatch 'SOXL_AI_RESPONSE_REJECTED|SOXL_AI_PROVIDER_HTTP_REJECTED|evidence_refs_too_many|context_limit') 'no rejected response, HTTP rejection, reference-overflow, or context-limit log line'
}

function Restore-Environment {
    Set-RemoteCircuitSetting ([Nullable[int]]$DesiredFinalCircuitMs)
    Recreate-OpenStockContainer
    Wait-ForOpenStockPort
    $restored = Get-ContainerCircuitSetting
    Add-Assertion 'circuit configuration restored' ($restored -eq $DesiredFinalCircuitMs) "expected=$DesiredFinalCircuitMs; container=$restored"
    $script:configurationRestored = $true
}

if ($RunCdpHelperSelfTests -or $RunUiStatusHelperSelfTests) {
    if ($RunCdpHelperSelfTests) {
        Invoke-CdpHelperSelfTests
    }
    if ($RunUiStatusHelperSelfTests) {
        Invoke-UiStatusHelperSelfTests
    }
    return
}

try {
    Add-Summary "Artifact directory: $artifactDirectory"
    $sshPreflight = @(Invoke-RemoteBash "set -euo pipefail; test -d '$repoPath'; cd '$repoPath'; docker compose ps '$serviceName' >/dev/null; printf ok")
    Add-Assertion 'SSH access and repository' ($sshPreflight -contains 'ok') 'openstock SSH, repository, and compose service are reachable'
    $running = @(Invoke-RemoteBash "set -euo pipefail; cd '$repoPath'; docker compose ps --status running --services | grep -Fx '$serviceName'")
    Add-Assertion 'OpenStock container running' ($running -contains $serviceName) "service=$serviceName"
    $original = Get-RemoteCircuitSetting
    $originalCircuitWasPresent = $original.Present
    $originalCircuitValue = $original.Value
    $initialContainerCircuitValue = Get-ContainerCircuitSetting
    Add-Assertion 'existing circuit setting is readable' ($original.Present) 'SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS is present in .env'
    Add-Summary "Initial circuit values: vm=$originalCircuitValue; container=$initialContainerCircuitValue"
    Add-Assertion 'Ornith launcher exists' (Test-Path -LiteralPath $ornithLauncher -PathType Leaf) $ornithLauncher
    if ([string]::IsNullOrWhiteSpace($SessionCookie)) {
        throw 'OPENSTOCK_LIVE_ACCEPTANCE_SESSION_COOKIE is required. It was not read from a browser profile and will not be saved.'
    }
    Start-AcceptanceBrowser
    Add-Summary "Browser automation started with $(Split-Path $browserExecutable -Leaf) against $ApplicationBaseUrl/soxl-intelligence."

    $script:circuitWorkflowStarted = $true
    Set-RemoteCircuitSetting ([Nullable[int]]$DesiredFinalCircuitMs)
    Recreate-OpenStockForBrowserPhase 'baseline-primary' | Out-Null
    Add-Assertion 'baseline circuit setting applied' ((Get-ContainerCircuitSetting) -eq $DesiredFinalCircuitMs) "container=$DesiredFinalCircuitMs"
    Ensure-OrnithReady
    Add-Assertion 'Ornith model endpoint responds before baseline' (Test-OrnithModels) $ornithModelsUrl
    Add-Assertion 'Ornith llama-server process exists before baseline' ((Get-OrnithProcess) -ne $null) $ornithModelMarker

    $baseline = Invoke-CurrentExplanation 'baseline-primary'
    Assert-AvailableResult $baseline 'baseline primary'
    $baselineLogs = Get-RouteLogs $baseline.StartUtc $baseline.EndUtc 'baseline-primary'
    Assert-Route $baselineLogs 'baseline primary' 'ornith-35b-primary' 'primary' $false 'none'
    Assert-NoRejectedOutput $baselineLogs 'baseline primary'

    if ($BaselineOnly) {
        Add-Summary 'Baseline-only mode completed; fallback and circuit-recovery phases were intentionally skipped.'
    } else {
        Set-RemoteCircuitSetting ([Nullable[int]]$TestCircuitMs)
        Recreate-OpenStockForBrowserPhase 'first-fallback' | Out-Null
        Add-Assertion 'test circuit setting applied' ((Get-ContainerCircuitSetting) -eq $TestCircuitMs) "container=$TestCircuitMs"

        $ornith = Get-OrnithProcess
        Add-Assertion 'targeted Ornith process found before stop' ($null -ne $ornith) $ornithModelMarker
        Stop-Process -Id $ornith.ProcessId -Force
        $ornithStoppedForTest = $true
        Start-Sleep -Seconds 2
        Add-Assertion 'only Ornith model server stopped' (-not (Test-OrnithModels)) 'Ornith /v1/models is unavailable; portproxy/svchost was not targeted'

        $firstFallback = Invoke-CurrentExplanation 'first-fallback'
        Assert-AvailableResult $firstFallback 'first fallback'
        $firstFallbackLogs = Get-RouteLogs $firstFallback.StartUtc $firstFallback.EndUtc 'first-fallback'
        Assert-Route $firstFallbackLogs 'first fallback' 'fin-r1-fallback' 'fallback' $true 'primary_health_unreachable'
        Assert-NoRejectedOutput $firstFallbackLogs 'first fallback'

        $bypass = Invoke-CurrentExplanation 'circuit-open-bypass'
        Assert-AvailableResult $bypass 'circuit-open bypass'
        $bypassLogs = Get-RouteLogs $bypass.StartUtc $bypass.EndUtc 'circuit-open-bypass'
        Assert-Route $bypassLogs 'circuit-open bypass' 'fin-r1-fallback' 'fallback' $true 'primary_circuit_open'
        Add-Assertion 'circuit-open bypass emitted primary-skipped diagnostic' (($bypassLogs -join "`n") -match 'SOXL_AI_PRIMARY_SKIPPED provider=ornith-35b-primary reason=primary_circuit_open') 'primary skipped diagnostic is present inside the bounded invocation logs'
        Add-Assertion 'circuit-open bypass made no primary provider request' (($bypassLogs -join "`n") -notmatch 'SOXL_AI_PROVIDER_REQUEST provider=ornith-35b-primary|SOXL_AI_ROUTE provider=ornith-35b-primary') 'bounded invocation logs contain no primary provider request or route; primary health probes are skipped by the circuit-open router branch'
        Assert-NoRejectedOutput $bypassLogs 'circuit-open bypass'

        Start-Ornith
        $ornithStoppedForTest = $false
        Add-Summary "Waiting $TestCircuitMs ms for the circuit-open interval to expire."
        Start-Sleep -Seconds ([Math]::Ceiling($TestCircuitMs / 1000) + 3)
        $recovery = Invoke-CurrentExplanation 'primary-recovery'
        Assert-AvailableResult $recovery 'primary recovery'
        $recoveryLogs = Get-RouteLogs $recovery.StartUtc $recovery.EndUtc 'primary-recovery'
        Assert-Route $recoveryLogs 'primary recovery' 'ornith-35b-primary' 'primary' $false 'none'
        Assert-NoRejectedOutput $recoveryLogs 'primary recovery'
    }

    Add-Summary 'All acceptance assertions passed before cleanup.'
} catch {
    $testFailure = $_
    Add-Summary "TEST FAILURE: $($_.Exception.Message)"
} finally {
    try {
        Stop-AcceptanceBrowser
        Ensure-OrnithReady
        $ornithStoppedForTest = $false
        Restore-Environment
        Ensure-OrnithReady
        Add-Summary "Cleanup completed. OrnithReady=$(Test-OrnithModels); configurationRestored=$configurationRestored"
    } catch {
        $cleanupFailure = $_
        Add-Summary "CLEANUP FAILURE: $($_.Exception.Message)"
    }
    $summary.Add('')
    $summary.Add('Assertions:')
    foreach ($assertion in $assertions) {
        $summary.Add(('{0} {1}: {2} ({3})' -f $assertion.utc, $assertion.name, $assertion.passed, $assertion.detail))
    }
    $summary.Add("Final Ornith readiness: $(Test-OrnithModels)")
    try {
        $finalCircuitSetting = Get-ContainerCircuitSetting
    } catch {
        $finalCircuitSetting = 'unavailable'
    }
    $summary.Add("Final container circuit setting: $finalCircuitSetting")
    Set-Content -LiteralPath $summaryPath -Value $summary
}

if ($null -ne $testFailure) {
    throw $testFailure
}
if ($null -ne $cleanupFailure) {
    throw $cleanupFailure
}

Write-Host "SOXL live failover acceptance passed. Report: $summaryPath"
