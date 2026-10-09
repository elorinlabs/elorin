$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class Module24FocusInput {
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);
 [StructLayout(LayoutKind.Sequential)]public struct POINT{public int x,y;}
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 public static void Activate(IntPtr h,int x,int y){POINT p=new POINT{x=x,y=y};if(GetAncestor(WindowFromPoint(p),2)!=h)throw new Exception("Owned focus helper is occluded");SetCursorPos(x,y);mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);}
}
'@
$qaForm=New-Object System.Windows.Forms.Form
$qaForm.Text='Elorin QA focus probe'
$qaForm.StartPosition='Manual'
$qaForm.Location=New-Object System.Drawing.Point(20,40)
$qaForm.Size=New-Object System.Drawing.Size(240,130)
$qaForm.TopMost=$true
$qaActivation=New-Object System.Windows.Forms.Timer
$qaActivation.Interval=300
$qaActivation.Add_Tick({$qaActivation.Stop();[Module24FocusInput]::Activate($qaForm.Handle,120,110)})
$qaClose=New-Object System.Windows.Forms.Timer
$qaClose.Interval=10000
$qaClose.Add_Tick({$qaClose.Stop();$qaForm.Close()})
$qaForm.Add_Shown({[Module24FocusInput]::ShowWindow($qaForm.Handle,5)|Out-Null;$qaActivation.Start();$qaClose.Start()})
try{$qaForm.ShowDialog()|Out-Null}finally{$qaActivation.Dispose();$qaClose.Dispose();$qaForm.Dispose()}
