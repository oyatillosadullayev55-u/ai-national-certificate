# AI National Certificate - development muhitini bitta buyruq bilan ishga tushirish (Windows)
# Kerak: Node.js 20+. Ixtiyoriy: Python 3.10+ (AI Tutor), Flutter (mobil ilova Chrome'da).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Say($t, $c = 'Cyan') { Write-Host "`n==> $t" -ForegroundColor $c }
function Fail($t) { Write-Host "`nXATO: $t" -ForegroundColor Red; Read-Host "Yopish uchun Enter"; exit 1 }
function Run([scriptblock]$b, $what) { & $b; if ($LASTEXITCODE -ne 0) { Fail "$what muvaffaqiyatsiz (kod $LASTEXITCODE). Yuqoridagi xabarni o'qing." } }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Secret { $b = New-Object byte[] 36; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) -replace '[+/=]', 'x' }
function Window($title, $dir, $cmd) {
  Start-Process powershell -WorkingDirectory $dir -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', "`$host.UI.RawUI.WindowTitle='$title'; $cmd"
}
function WaitPort($port, $sec) {
  for ($i = 0; $i -lt $sec; $i++) {
    try { $c = New-Object Net.Sockets.TcpClient; if ($c.ConnectAsync('127.0.0.1', $port).Wait(800)) { $c.Close(); return $true } } catch {}
    Start-Sleep -Seconds 1
  }
  return $false
}

# ---------- 0. Tekshiruv ----------
if (-not (Has node)) { Fail "Node.js topilmadi. https://nodejs.org dan LTS versiyani o'rnating va skriptni qayta ishga tushiring." }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { Fail "Node.js 20+ kerak (sizda $(node -v))." }

$flutter = $null
if (Has flutter) { $flutter = 'flutter' }
else {
  $guess = Join-Path $env:USERPROFILE 'Downloads\flutter_windows_3.47.5-stable\flutter\bin\flutter.bat'
  if (Test-Path $guess) { $flutter = $guess }
}
$python = $null
foreach ($p in 'python', 'py') { if (-not $python -and (Has $p)) { try { & $p --version *> $null; if ($LASTEXITCODE -eq 0) { $python = $p } } catch {} } }

Write-Host "Node: $(node -v)   Flutter: $(if ($flutter) { 'bor' } else { 'yoq' })   Python: $(if ($python) { 'bor' } else { 'yoq' })"

# ---------- 1. Sozlamalar (.env) ----------
$aiKey = $null
$apiEnv = Join-Path $root 'apps\api\.env'
if (-not (Test-Path $apiEnv)) {
  Say 'Sozlamalar yaratilmoqda (apps/api/.env)'
  $aiKey = Secret
  @"
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://anc:anc@localhost:5433/anc?schema=public
JWT_ACCESS_SECRET=$(Secret)
JWT_VERIFICATION_SECRET=$(Secret)
OTP_SECRET=$(Secret)
OTP_DEV_ECHO=true
AI_ENGINE_URL=http://localhost:8000
AI_INTERNAL_KEY=$aiKey
AI_DAILY_LIMIT_FREE=50
SEED_ADMIN_PHONE=+998900000000
SEED_ADMIN_PASSWORD=ChangeMe123!
"@ | Set-Content -Path $apiEnv -Encoding ASCII
} else {
  $line = Select-String -Path $apiEnv -Pattern '^AI_INTERNAL_KEY=(.*)$' | Select-Object -First 1
  if ($line) { $aiKey = $line.Matches[0].Groups[1].Value }
}
$aiEnv = Join-Path $root 'services\ai-engine\.env'
if (-not (Test-Path $aiEnv)) { "INTERNAL_API_KEY=$aiKey`nLLM_PROVIDER=mock" | Set-Content -Path $aiEnv -Encoding ASCII }

# ---------- 2. PostgreSQL ----------
Say "PostgreSQL (o'rnatishsiz, port 5433)"
Push-Location (Join-Path $root 'ops\dev')
if (-not (Test-Path node_modules)) { Run { npm install --no-audit --no-fund } 'PostgreSQL paketini yuklash' }
Pop-Location
if (-not (WaitPort 5433 1)) {
  Window 'ANC - PostgreSQL' (Join-Path $root 'ops\dev') 'node db.mjs'
  if (-not (WaitPort 5433 120)) { Fail "PostgreSQL ishga tushmadi. 'ANC - PostgreSQL' oynasidagi xabarni ko'ring." }
}

# ---------- 3. API ----------
Say "API: paketlar, baza sxemasi, boshlang'ich ma'lumotlar"
Push-Location (Join-Path $root 'apps\api')
if (-not (Test-Path node_modules)) { Run { npm install --no-audit --no-fund } 'API paketlarini o''rnatish' }
Run { npx prisma generate } 'Prisma client'
if (-not (Test-Path 'prisma\migrations')) { Run { npx prisma migrate dev --name init --skip-seed } 'Birinchi migratsiya' }
else { Run { npx prisma migrate deploy } 'Migratsiyalar' }
Run { npm run seed } 'Seed'
Pop-Location
if (-not (WaitPort 3000 1)) { Window 'ANC - API :3000' (Join-Path $root 'apps\api') 'npm run start:dev' }

# ---------- 4. AI Engine (ixtiyoriy) ----------
if ($python) {
  Say 'AI Engine (mock rejim)'
  $ai = Join-Path $root 'services\ai-engine'
  if (-not (Test-Path (Join-Path $ai '.venv'))) {
    Push-Location $ai
    Run { & $python -m venv .venv } 'Python venv'
    Run { & .\.venv\Scripts\python.exe -m pip install -q -r requirements.txt } 'AI Engine paketlari'
    Pop-Location
  }
  if (-not (WaitPort 8000 1)) { Window 'ANC - AI Engine :8000' $ai '.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000' }
} else { Say "Python topilmadi - AI Tutor ishlamaydi (qolgan hammasi ishlaydi)" 'Yellow' }

# ---------- 5. Admin panel ----------
Say 'Admin panel'
$admin = Join-Path $root 'apps\admin'
if (-not (Test-Path (Join-Path $admin 'node_modules'))) { Push-Location $admin; Run { npm install --no-audit --no-fund } 'Admin paketlari'; Pop-Location }
if (-not (WaitPort 5173 1)) { Window 'ANC - Admin :5173' $admin 'npm run dev' }

# ---------- 6. API tayyor bo'lishini kutish ----------
Say 'API ishga tushishini kutyapman (1-2 daqiqa)'
$ok = $false
for ($i = 0; $i -lt 180; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:3000/api/v1/health').StatusCode -eq 200) { $ok = $true; break } } catch {}
  Start-Sleep -Seconds 1
}
if (-not $ok) { Fail "API javob bermadi. 'ANC - API' oynasidagi xatoni ko'ring." }
WaitPort 5173 60 | Out-Null

# ---------- 7. Chrome ----------
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
function OpenUrl($u) { if ($chrome) { Start-Process $chrome $u } else { Start-Process $u } }
OpenUrl 'http://localhost:5173'
OpenUrl 'http://localhost:3000/api/docs'

# ---------- 8. Flutter ilova Chrome'da ----------
if ($flutter) {
  Say "Flutter ilova Chrome'da ochilmoqda (birinchi marta 2-4 daqiqa)"
  $mobile = Join-Path $root 'apps\mobile'
  Push-Location $mobile
  if (-not (Test-Path 'web')) { Run { & $flutter create --platforms=web,android,ios --org uz.anc --project-name anc_mobile . } 'flutter create' }
  Run { & $flutter pub get } 'flutter pub get'
  Pop-Location
  Window 'ANC - Flutter (Chrome)' $mobile "& '$flutter' run -d chrome --web-port 5180 --dart-define=API_URL=http://localhost:3000/api/v1"
} else { Say "Flutter topilmadi - mobil ilova ochilmadi" 'Yellow' }

Write-Host ""
Write-Host "==================== TAYYOR ====================" -ForegroundColor Green
Write-Host " Admin panel : http://localhost:5173"
Write-Host "   login     : +998900000000   parol: ChangeMe123!"
Write-Host " Flutter app : http://localhost:5180  (yangi o'quvchi sifatida ro'yxatdan o'ting;"
Write-Host "               SMS kod ekranda chiqadi - OTP_DEV_ECHO)"
Write-Host " API docs    : http://localhost:3000/api/docs"
Write-Host " To'xtatish  : 'ANC - ...' oynalarini yoping"
Write-Host "================================================" -ForegroundColor Green
Read-Host "Bu oynani yopish uchun Enter"
