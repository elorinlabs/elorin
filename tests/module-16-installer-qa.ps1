$ErrorActionPreference = 'Stop'
$workspace = 'D:\elorin'
$destination = Join-Path $workspace '.qa-tools\installed-elorin'
$setup = Join-Path $workspace 'src-tauri\target\release\bundle\nsis\Elorin_0.1.0_x64-setup.exe'
$catalogue = Get-Content (Join-Path $workspace 'src\platform\associations.json') -Raw | ConvertFrom-Json
$checks = [System.Collections.Generic.List[string]]::new()
function Check($name, $value) { if (!$value) { throw $name }; $checks.Add($name) }
function DefaultsSnapshot {
  $values = foreach ($item in $catalogue) {
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.' + $item.extension + '\UserChoice'
    if (Test-Path -LiteralPath $key) { [string]$item.extension + ':' + ((Get-ItemProperty -LiteralPath $key | Select-Object ProgId,Hash | ConvertTo-Json -Compress)) }
  }
  return ($values -join "`n")
}
$report = @{ checks=$checks; errors=@() }
try {
  Check 'isolated installation destination' ($destination.StartsWith($workspace + '\.qa-tools\'))
  Check 'no existing Elorin uninstall registration' (!(Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Elorin'))
  Check 'no existing Elorin capability registration' (!(Test-Path 'HKCU:\Software\Elorin\Capabilities'))
  Check 'no existing application registration' (!(Test-Path 'HKCU:\Software\Classes\Applications\prism.exe'))
  foreach ($category in ($catalogue.category | Sort-Object -Unique)) { Check ('no prior ProgID ' + $category) (!(Test-Path ('HKCU:\Software\Classes\Elorin.File.'+$category))) }
  $before = DefaultsSnapshot
  $installer = Start-Process -FilePath $setup -ArgumentList @('/S',('/D='+$destination)) -WindowStyle Hidden -PassThru -Wait
  Check 'silent per-user installer succeeds' ($installer.ExitCode -eq 0)
  Check 'installed marker exists' (Test-Path -LiteralPath (Join-Path $destination 'elorin-installed'))
  foreach ($item in $catalogue) {
    $id='Elorin.File.'+$item.category
    $key='HKCU:\Software\Classes\.'+$item.extension+'\OpenWithProgids'
    Check ('Open With '+$item.extension) ((Get-Item -LiteralPath $key).GetValueNames().Contains($id))
    $command=(Get-Item -LiteralPath ('HKCU:\Software\Classes\'+$id+'\shell\open\command')).GetValue('')
    Check ('quoted command '+$item.extension) ($command -eq ('"'+$destination+'\prism.exe" "%1"'))
  }
  Check 'registered application capabilities' ((Get-Item 'HKCU:\Software\RegisteredApplications').GetValue('Elorin') -eq 'Software\Elorin\Capabilities')
  Check 'installation preserves UserChoice' ((DefaultsSnapshot) -ceq $before)
  $uninstaller=Join-Path $destination 'uninstall.exe'
  Check 'uninstaller exists' (Test-Path -LiteralPath $uninstaller)
  $process=Start-Process -FilePath $uninstaller -ArgumentList @('/S',('_?='+$destination)) -WindowStyle Hidden -PassThru -Wait
  Check 'silent uninstaller succeeds' ($process.ExitCode -eq 0)
  foreach ($item in $catalogue) {
    $key='HKCU:\Software\Classes\.'+$item.extension+'\OpenWithProgids'
    Check ('Open With removed '+$item.extension) (!(Test-Path -LiteralPath $key) -or !((Get-Item -LiteralPath $key).GetValueNames().Contains('Elorin.File.'+$item.category)))
  }
  Check 'own ProgID removed' (!(Test-Path 'HKCU:\Software\Classes\Elorin.File.Documents'))
  Check 'own application removed' (!(Test-Path 'HKCU:\Software\Classes\Applications\prism.exe'))
  Check 'registered application removed' ($null -eq (Get-Item 'HKCU:\Software\RegisteredApplications').GetValue('Elorin'))
  Check 'uninstallation preserves UserChoice' ((DefaultsSnapshot) -ceq $before)
} catch { $report.errors=@($_.Exception.Message); throw } finally {
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $workspace 'docs\qa\module-16-installer-runtime.json') -Encoding utf8
}
Write-Output ('Installer checks passed: '+$checks.Count)
