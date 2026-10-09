$ErrorActionPreference='Stop'
$destination='D:\elorin\.qa-tools\installed-elorin'
$setup='D:\elorin\src-tauri\target\release\bundle\nsis\Elorin_0.1.0_x64-setup.exe'
$catalogue=Get-Content 'D:\elorin\src\platform\associations.json' -Raw | ConvertFrom-Json
$foreignCommand='"D:\elorin\.qa-tools\other-install\prism.exe" "%1"'
$checks=[System.Collections.Generic.List[string]]::new()
$report=@{checks=$checks;errors=@()}
$simulated=$false
function Check($name,$value){if(!$value){throw $name};$checks.Add($name)}
try {
  Check 'no existing registered installation' (!(Test-Path 'HKCU:\Software\Elorin\Capabilities'))
  Check 'no existing Code ProgID' (!(Test-Path 'HKCU:\Software\Classes\Elorin.File.Code'))
  $process=Start-Process -FilePath $setup -ArgumentList @('/S',('/D='+$destination)) -WindowStyle Hidden -PassThru -Wait
  Check 'install fixture succeeds' ($process.ExitCode -eq 0)
  $codeKey='HKCU:\Software\Classes\Elorin.File.Code\shell\open\command'
  Set-Item -LiteralPath $codeKey -Value $foreignCommand
  Set-ItemProperty -LiteralPath 'HKCU:\Software\Elorin\Capabilities' -Name ElorinOwnerCommand -Value $foreignCommand
  $simulated=$true
  $process=Start-Process -FilePath (Join-Path $destination 'uninstall.exe') -ArgumentList @('/S',('_?='+$destination)) -WindowStyle Hidden -PassThru -Wait
  Check 'old installation uninstalls' ($process.ExitCode -eq 0)
  Check 'transferred ProgID command survives' ((Get-Item -LiteralPath $codeKey).GetValue('') -eq $foreignCommand)
  foreach($item in $catalogue | Where-Object category -eq Code){
    $key='HKCU:\Software\Classes\.'+$item.extension+'\OpenWithProgids'
    Check ('transferred Open With survives '+$item.extension) ((Get-Item -LiteralPath $key).GetValueNames().Contains('Elorin.File.Code'))
  }
  Check 'transferred capabilities survive' ((Get-Item 'HKCU:\Software\Elorin\Capabilities').GetValue('ElorinOwnerCommand') -eq $foreignCommand)
  Check 'transferred RegisteredApplications survives' ((Get-Item 'HKCU:\Software\RegisteredApplications').GetValue('Elorin') -eq 'Software\Elorin\Capabilities')
  Check 'old owned Documents ProgID removed' (!(Test-Path 'HKCU:\Software\Classes\Elorin.File.Documents'))
}catch{$report.errors=@($_.Exception.Message);throw}finally{
  # Remove only this test's simulated transferred registrations, after checking ownership.
  if($simulated){
    $key='HKCU:\Software\Classes\Elorin.File.Code\shell\open\command'
    if((Test-Path -LiteralPath $key) -and (Get-Item -LiteralPath $key).GetValue('') -eq $foreignCommand){
      foreach($item in $catalogue | Where-Object category -eq Code){Remove-ItemProperty -LiteralPath ('HKCU:\Software\Classes\.'+$item.extension+'\OpenWithProgids') -Name 'Elorin.File.Code' -ErrorAction SilentlyContinue}
      Remove-Item -LiteralPath 'HKCU:\Software\Classes\Elorin.File.Code' -Recurse
    }
    if((Test-Path 'HKCU:\Software\Elorin\Capabilities') -and (Get-Item 'HKCU:\Software\Elorin\Capabilities').GetValue('ElorinOwnerCommand') -eq $foreignCommand){
      if((Get-Item 'HKCU:\Software\RegisteredApplications').GetValue('Elorin') -eq 'Software\Elorin\Capabilities'){Remove-ItemProperty -LiteralPath 'HKCU:\Software\RegisteredApplications' -Name Elorin}
      Remove-Item -LiteralPath 'HKCU:\Software\Elorin\Capabilities' -Recurse
      $root=Get-Item 'HKCU:\Software\Elorin';if($root.SubKeyCount -eq 0 -and $root.ValueCount -eq 0){Remove-Item -LiteralPath 'HKCU:\Software\Elorin'}
    }
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'D:\elorin\docs\qa\module-16-ownership-runtime.json' -Encoding utf8
}
Write-Output ('Ownership checks passed: '+$checks.Count)
