$ErrorActionPreference='Stop'
$destination='D:\elorin\.qa-tools\installed-elorin'
$target=Join-Path $destination 'prism.exe'
$setup='D:\elorin\src-tauri\target\release\bundle\nsis\Elorin_0.1.0_x64-setup.exe'
$checks=[System.Collections.Generic.List[string]]::new()
$report=@{checks=$checks;errors=@()}
function Check($name,$value){if(!$value){throw $name};$checks.Add($name)}
$helper=$null
try{
  Check 'private fixture directory' ($destination -eq 'D:\elorin\.qa-tools\installed-elorin')
  Check 'no installed application replaced' (!(Test-Path -LiteralPath $target))
  Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\cmd.exe') -Destination $target
  $hash=(Get-FileHash -LiteralPath $target).Hash
  # A disposable console process holds the same image path; no user document is involved.
  $helper=Start-Process -FilePath $target -ArgumentList @('/c','ping -n 60 127.0.0.1 > NUL') -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 350
  Check 'fixture process running' (!$helper.HasExited)
  $installer=Start-Process -FilePath $setup -ArgumentList @('/S',('/D='+$destination)) -WindowStyle Hidden -PassThru -Wait
  $report.installExitCode=$installer.ExitCode
  $helper.Refresh()
  Check 'installer leaves running process alive' (!$helper.HasExited)
  Check 'installer leaves running image intact' ((Get-FileHash -LiteralPath $target).Hash -eq $hash)
  Check 'blocked install writes no integration marker' (!(Test-Path -LiteralPath (Join-Path $destination 'elorin-installed')))
  $uninstaller=Start-Process -FilePath (Join-Path $destination 'uninstall.exe') -ArgumentList @('/S',('_?='+$destination)) -WindowStyle Hidden -PassThru -Wait
  $report.uninstallExitCode=$uninstaller.ExitCode
  $helper.Refresh()
  Check 'uninstaller leaves running process alive' (!$helper.HasExited)
  Check 'uninstaller leaves running image intact' ((Get-FileHash -LiteralPath $target).Hash -eq $hash)
}catch{$report.errors=@($_.Exception.Message);throw}finally{
  if($helper -and !$helper.HasExited){
    $children=Get-CimInstance Win32_Process | Where-Object ParentProcessId -eq $helper.Id
    foreach($child in $children){Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue}
    Stop-Process -Id $helper.Id -ErrorAction SilentlyContinue
    $helper.WaitForExit()
  }
  if((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target).Hash -eq $hash){Remove-Item -LiteralPath $target}
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'D:\elorin\docs\qa\module-16-running-guard-runtime.json' -Encoding utf8
}
Write-Output ('Running guard checks passed: '+$checks.Count)
