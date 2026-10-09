param([ValidateSet('short','idle','cycles','extra','sparse','chrome')][string]$Mode='short',[int]$Duration=1800,[ValidateSet('23','24')][string]$Module='23')
$ErrorActionPreference='Stop'
$qaRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $qaRoot
$qaConfig=Join-Path $qaRoot ".qa-tools/module$Module-tauri.json"
New-Item -ItemType Directory -Force -Path (Split-Path $qaConfig) | Out-Null
@{identifier="app.elorin.module$Module.qa";build=@{beforeDevCommand='';devUrl='http://127.0.0.1:1420'}} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $qaConfig -Encoding utf8
# Keep pnpm dev running separately; never attach to a production app or overwrite its data.
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9230'
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $qaRoot ".qa-tools/module$Module-webview"
$env:CARGO_BUILD_JOBS='1'
$env:PRISM_QA_MODULE=$Module
$qaPnpm=if($env:PRISM_PNPM){$env:PRISM_PNPM}else{'pnpm'}
& $qaPnpm tauri build --debug --no-bundle --config $qaConfig
if($LASTEXITCODE -ne 0){throw 'Isolated native build failed'}
$qaApp=Start-Process -FilePath (Join-Path $qaRoot 'src-tauri/target/debug/prism.exe') -WindowStyle Hidden -PassThru
$qaApp.Id | Set-Content -LiteralPath (Join-Path $qaRoot ".qa-tools/module$Module-native.pid")
try {
 Start-Sleep -Seconds 3
 if($Mode -eq 'short'){& node tests/module-23-native-qa.cjs}
 elseif($Mode -eq 'chrome'){if($Module -ne '24'){throw 'Chrome QA requires Module 24'};& node tests/module-24-native-chrome.cjs}
 elseif($Mode -eq 'extra'){& node tests/module-23-native-extra.cjs}
 elseif($Mode -eq 'sparse'){& node tests/module-23-sparse-qa.cjs}
 else {& node tests/module-23-native-qa.cjs "--mode=$Mode" "--duration=$Duration" --close}
 if($LASTEXITCODE -ne 0){throw 'Native regression failed; see JSON report'}
} finally {
 # Only the exact process started by this helper. The suite normally closes it through Tauri.
 if(!$qaApp.HasExited){$qaApp.CloseMainWindow() | Out-Null;if(!$qaApp.WaitForExit(5000)){Stop-Process -Id $qaApp.Id}}
}
