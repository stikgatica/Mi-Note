# Mi Note X10 — inicialización ÚNICA y segura de firma de futuras APK.
# Ejecutar desde PowerShell local, con JDK (keytool) y GitHub CLI (gh) autenticado.
# El archivo PKCS12 NUNCA se sube al repositorio; solo GitHub Secrets.
param(
 [string]$Repositorio = 'stikgatica/Mi-Note',
 [string]$RutaClave = (Join-Path $env:USERPROFILE 'MiNote_Firma_Privada\minote-x10-release.p12')
)
$ErrorActionPreference='Stop'
$aliasClave='minote-x10'
function Exigir($nombre) {
 if (-not (Get-Command $nombre -ErrorAction SilentlyContinue)) {
   throw "No se encontró $nombre. Instálelo antes de configurar la firma."
 }
}
Exigir keytool
Exigir gh
# Enviar secretos por stdin SIN salto de línea y SIN argumentos visibles.
function Registrar-Secreto([string]$Nombre,[string]$Valor) {
 $psi=New-Object System.Diagnostics.ProcessStartInfo
 $psi.FileName=(Get-Command gh).Source
 $psi.Arguments="secret set $Nombre -R $Repositorio"
 $psi.UseShellExecute=$false
 $psi.RedirectStandardInput=$true
 $psi.RedirectStandardError=$true
 $psi.CreateNoWindow=$true
 $process=[System.Diagnostics.Process]::Start($psi)
 try {
  $process.StandardInput.Write($Valor)
  $process.StandardInput.Close()
  $errorText=$process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if($process.ExitCode -ne 0) { throw "Error configurando $Nombre: $errorText" }
 } finally { $process.Dispose() }
}
& gh auth status 1>$null
if ($LASTEXITCODE -ne 0) { throw 'Primero ejecute gh auth login en este equipo.' }
$carpeta=Split-Path $RutaClave -Parent
if (-not (Test-Path -LiteralPath $carpeta)) {
 New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
}
Write-Host 'La clave privada quedará exclusivamente en:' $RutaClave
if (-not (Test-Path -LiteralPath $RutaClave)) {
 Write-Host 'Se creará UNA sola clave, con contraseña solicitada interactivamente por keytool.'
 & keytool -genkeypair -noprompt -keyalg RSA -keysize 3072 -validity 10000 `
   -alias $aliasClave -dname 'CN=Mi Note X10, OU=Release, O=Mi Note' `
   -keystore $RutaClave -storetype PKCS12
 if ($LASTEXITCODE -ne 0) { throw 'No se creó la clave. No se configuró GitHub.' }
} else {
 Write-Host 'Se reutilizará la clave existente; jamás se reemplaza automáticamente.'
}
# PKCS12 utiliza normalmente la misma contraseña del almacén para la clave.
$secure=Read-Host 'Contraseña de la clave PKCS12' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $pass=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($pass) -or $pass.Length -lt 8) { throw 'Contraseña inválida; mínimo 8 caracteres.' }
try {
 $env:MINOTE_RELEASE_STORE_PASSWORD=$pass
 $out=& keytool -list -v -storetype PKCS12 -keystore $RutaClave `
   -alias $aliasClave -storepass:env MINOTE_RELEASE_STORE_PASSWORD 2>&1
 if ($LASTEXITCODE -ne 0) { throw 'La contraseña o clave PKCS12 no coinciden.' }
 $joined=$out -join "`n"
 if ($joined -notmatch 'SHA256:\s*([A-Fa-f0-9:]{64,95})') { throw 'No se leyó el SHA256 del certificado.' }
 $fingerprint=($Matches[1] -replace ':','').ToLowerInvariant()
 if ($fingerprint.Length -ne 64) { throw 'Huella SHA256 inválida.' }
 Write-Host 'Registrando secretos cifrados en GitHub. No se mostrará la clave.'
 Registrar-Secreto 'MINOTE_RELEASE_KEYSTORE_BASE64' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($RutaClave)))
 Registrar-Secreto 'MINOTE_RELEASE_STORE_PASSWORD' $pass
 Registrar-Secreto 'MINOTE_RELEASE_KEY_PASSWORD' $pass
 Registrar-Secreto 'MINOTE_RELEASE_KEY_ALIAS' $aliasClave
 & gh variable set MINOTE_RELEASE_CERT_SHA256 -R $Repositorio --body $fingerprint
 if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar la huella pública.' }
 Write-Host 'Firma permanente configurada. Conserve el archivo .p12 y su contraseña fuera del repositorio.'
 Write-Host 'Huella SHA-256 pública:' $fingerprint
 Write-Host 'IMPORTANTE: no desinstale versiones anteriores sin exportar y comprobar todos sus cuadernos.'
} finally {
 Remove-Item Env:\MINOTE_RELEASE_STORE_PASSWORD -ErrorAction SilentlyContinue
 $pass=$null
 $secure=$null
}
