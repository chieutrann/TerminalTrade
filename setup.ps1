param(
  [ValidateSet("run", "both", "setup", "frontend", "backend", "dev")]
  [string]$Command = "run"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8080" }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "3000" }
$script:BackendProcess = $null
$script:FrontendProcess = $null

function Write-Info {
  param([string]$Message)
  Write-Host "[INFO]  $Message"
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[WARN]  $Message"
}

function Stop-WithError {
  param([string]$Message)
  Write-Host "[ERROR] $Message" -ForegroundColor Red
  exit 1
}

function Get-RequiredCommand {
  param([string[]]$Names)

  foreach ($Name in $Names) {
    $CommandInfo = Get-Command $Name -ErrorAction SilentlyContinue
    if ($CommandInfo) {
      return $CommandInfo.Source
    }
  }

  Stop-WithError "$($Names -join ' or ') is required but not found."
}

function Invoke-Capture {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  $Output = & $FilePath @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "Command failed: $FilePath $($Arguments -join ' ')`n$($Output -join [Environment]::NewLine)"
  }

  return ($Output -join [Environment]::NewLine).Trim()
}

function Invoke-Step {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "Command failed: $FilePath $($Arguments -join ' ')"
  }
}

function Get-NodeMajorVersion {
  $VersionText = & node --version
  if ($VersionText -notmatch "^v(\d+)") {
    Stop-WithError "Unable to determine Node.js version. Found: $VersionText"
  }

  return [int]$Matches[1]
}

function Get-WorkingPython {
  $Candidates = @()

  if ($env:PYTHON) {
    $Candidates += $env:PYTHON
  }

  foreach ($Name in @("python", "py", "python3")) {
    $CommandInfo = Get-Command $Name -ErrorAction SilentlyContinue
    if ($CommandInfo) {
      $Candidates += $CommandInfo.Source
    }
  }

  foreach ($Candidate in ($Candidates | Select-Object -Unique)) {
    & $Candidate --version *> $null
    if ($LASTEXITCODE -eq 0) {
      return $Candidate
    }
  }

  Stop-WithError "Python is required but no working Python executable was found. Install Python 3, or set the PYTHON environment variable."
}

function Test-Prerequisites {
  param([switch]$RequirePython)

  Write-Info "Checking prerequisites..."

  Get-RequiredCommand @("node") | Out-Null
  $script:Pnpm = Get-RequiredCommand @("pnpm.cmd", "pnpm")

  $NodeMajor = Get-NodeMajorVersion
  if ($NodeMajor -lt 20) {
    Stop-WithError "Node.js 20+ required. Found: $(& node --version)"
  }

  $PnpmVersion = Invoke-Capture $script:Pnpm @("--version")
  $Message = "Prerequisites OK (node $(& node --version), pnpm $PnpmVersion"

  if ($RequirePython) {
    $script:Python = Get-WorkingPython
    $PythonVersion = Invoke-Capture $script:Python @("--version")
    $Message += ", python $PythonVersion"
  }

  Write-Info "$Message)."
}

function Get-PythonTools {
  if ($env:PYTHON) {
    $script:Python = $env:PYTHON
  }
  elseif (-not $script:Python) {
    $script:Python = Get-WorkingPython
  }

  if ($env:PIP) {
    $script:Pip = $env:PIP
  }
  else {
    $PipCommand = Get-Command pip -ErrorAction SilentlyContinue
    if ($PipCommand) {
      $script:Pip = $PipCommand.Source
    }
    else {
      $script:Pip = $script:Python
      $script:PipUsesModule = $true
    }
  }

  Write-Info "Using Python: $script:Python"
}

function Install-Frontend {
  Write-Info "Installing frontend dependencies (pnpm install)..."
  Set-Location $ProjectRoot
  Invoke-Step $script:Pnpm @("install")
  Write-Info "Frontend dependencies installed."
}

function Install-Backend {
  Write-Info "Installing backend dependencies (pip install)..."
  Set-Location $ProjectRoot
  Get-PythonTools

  if ($script:PipUsesModule) {
    Invoke-Step $script:Pip @("-m", "pip", "install", "-r", "backend/requirements.txt")
  }
  else {
    Invoke-Step $script:Pip @("install", "-r", "backend/requirements.txt")
  }

  Write-Info "Backend dependencies installed."
}

function Invoke-Codegen {
  Write-Info "Running OpenAPI client codegen..."
  Set-Location $ProjectRoot
  Invoke-Step $script:Pnpm @("--filter", "@workspace/api-spec", "run", "codegen")
  Write-Info "Codegen complete."
}

function Invoke-Typecheck {
  Write-Info "Running TypeScript typecheck..."
  Set-Location $ProjectRoot
  Invoke-Step $script:Pnpm @("run", "typecheck")
  Write-Info "Typecheck passed."
}

function Start-Backend {
  Write-Info "Starting backend (port $BackendPort)..."
  Set-Location $ProjectRoot
  Get-PythonTools
  $env:PORT = $BackendPort
  Invoke-Step $script:Python @("backend/run.py")
}

function Start-Frontend {
  Write-Info "Starting frontend (port $FrontendPort)..."
  Set-Location $ProjectRoot
  $env:PORT = $FrontendPort
  $env:BACKEND_PORT = $BackendPort
  $env:BASE_PATH = if ($env:BASE_PATH) { $env:BASE_PATH } else { "/" }
  Invoke-Step $script:Pnpm @("--filter", "@workspace/trading-app", "run", "dev")
}

function Start-Both {
  Write-Info "Starting both services..."
  Set-Location $ProjectRoot
  Get-PythonTools

  $OriginalPort = $env:PORT
  $env:PORT = $BackendPort
  $script:BackendProcess = Start-Process -FilePath $script:Python -ArgumentList @("backend/run.py") -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow
  Write-Info "Backend started (PID: $($script:BackendProcess.Id)) on port $BackendPort"

  for ($i = 1; $i -le 30; $i++) {
    try {
      Invoke-WebRequest -Uri "http://localhost:$BackendPort/" -UseBasicParsing -TimeoutSec 1 | Out-Null
      Write-Info "Backend is ready."
      break
    }
    catch {
      Start-Sleep -Seconds 1
    }
  }

  $env:PORT = $FrontendPort
  $env:BACKEND_PORT = $BackendPort
  $env:BASE_PATH = if ($env:BASE_PATH) { $env:BASE_PATH } else { "/" }
  $script:FrontendProcess = Start-Process -FilePath $script:Pnpm -ArgumentList @("--filter", "@workspace/trading-app", "run", "dev") -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow
  $env:PORT = $OriginalPort
  Write-Info "Frontend started (PID: $($script:FrontendProcess.Id)) on port $FrontendPort"

  Write-Info ""
  Write-Info "========================================"
  Write-Info "  Backend API: http://localhost:$BackendPort"
  Write-Info "  Frontend:    http://localhost:$FrontendPort"
  Write-Info "========================================"
  Write-Info ""
  Write-Info "Press Ctrl+C to stop both services."

  try {
    while (-not $script:BackendProcess.HasExited -and -not $script:FrontendProcess.HasExited) {
      Start-Sleep -Seconds 1
    }
  }
  finally {
    Stop-Services
  }
}

function Stop-Services {
  Write-Info "Shutting down..."

  foreach ($Process in @($script:BackendProcess, $script:FrontendProcess)) {
    if ($Process -and -not $Process.HasExited) {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  switch ($Command) {
    "setup" {
      Test-Prerequisites -RequirePython
      Install-Frontend
      Install-Backend
      Invoke-Codegen
      Invoke-Typecheck
    }
    "frontend" {
      Test-Prerequisites
      Start-Frontend
    }
    "backend" {
      Test-Prerequisites -RequirePython
      Start-Backend
    }
    "dev" {
      Test-Prerequisites -RequirePython
      Start-Both
    }
    default {
      Test-Prerequisites -RequirePython
      Install-Frontend
      Install-Backend
      Invoke-Codegen
      Invoke-Typecheck
      Start-Both
    }
  }
}
catch {
  Stop-Services
  Stop-WithError $_.Exception.Message
}
