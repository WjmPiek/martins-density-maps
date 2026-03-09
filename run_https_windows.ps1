param()

$ErrorActionPreference = "Stop"

Write-Host "Martins Density Map - HTTPS local server" -ForegroundColor Cyan
Write-Host ""

# Check for Python
$python = $null
try { $python = (Get-Command python).Source } catch {}
if (-not $python) {
  Write-Host "Python was not found. Install Python 3, then re-run." -ForegroundColor Red
  exit 1
}

# Generate self-signed cert if missing
$cert = "localhost.pem"
$key  = "localhost-key.pem"

if (-not (Test-Path $cert) -or -not (Test-Path $key)) {
  Write-Host "Generating self-signed certificate (localhost)..." -ForegroundColor Yellow

  # Prefer OpenSSL if available
  $openssl = $null
  try { $openssl = (Get-Command openssl).Source } catch {}
  if (-not $openssl) {
    Write-Host ""
    Write-Host "OpenSSL not found." -ForegroundColor Red
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1) Install OpenSSL, then re-run this script"
    Write-Host "  2) Or install mkcert (recommended), generate certs, then rename to:"
    Write-Host "     localhost.pem and localhost-key.pem"
    Write-Host ""
    Write-Host "mkcert quick steps (if installed):"
    Write-Host "  mkcert -install"
    Write-Host "  mkcert localhost 127.0.0.1"
    Write-Host "Then rename the generated .pem files to match."
    exit 1
  }

  & $openssl req -x509 -newkey rsa:2048 -nodes `
    -keyout $key -out $cert -days 365 -subj "/CN=localhost" | Out-Null

  Write-Host "Certificate generated: $cert / $key" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting server: https://localhost:8443/heatmap.html" -ForegroundColor Green
Write-Host "First time you may need to click Advanced -> Proceed (self-signed cert)." -ForegroundColor Yellow
Write-Host ""

python .\serve_https.py
