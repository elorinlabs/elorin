param([ValidateSet('Sample','Normalize','Restore','Focus','FocusAway','AltF4','AltSpace','Escape','DoubleClick','Drag','Resize')][string]$Action='Sample')
$ErrorActionPreference='Stop'
$qaPid=[int](Get-Content -LiteralPath (Join-Path $PSScriptRoot '../.qa-tools/module24-native.pid'))
$qaProcess=Get-Process -Id $qaPid
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Module24Window {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback,IntPtr data);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder text,int size);
 public static IntPtr OwnedWindow(uint pid){IntPtr result=IntPtr.Zero;EnumWindows((h,data)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==pid){var text=new StringBuilder(512);GetWindowText(h,text,512);if(text.ToString()=="Elorin")result=h;}return true;},IntPtr.Zero);return result;}
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr h);
 [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h,bool altTab);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from,uint to,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 public static string Describe(IntPtr h){uint pid;GetWindowThreadProcessId(h,out pid);var text=new StringBuilder(512);GetWindowText(h,text,512);return h+"/"+pid+"/"+text;}
 public static void FocusOwned(IntPtr h){ShowWindow(h,IsIconic(h)?9:5);System.Threading.Thread.Sleep(200);SetWindowPos(h,new IntPtr(-1),0,0,0,0,0x53);try{POINT point=new POINT();ClientToScreen(h,ref point);point.x+=40;point.y+=80;for(int attempt=0;attempt<10&&GetAncestor(WindowFromPoint(point),2)!=h;attempt++)System.Threading.Thread.Sleep(100);if(GetAncestor(WindowFromPoint(point),2)!=h)throw new Exception("Owned window activation point is occluded: expected="+Describe(h)+", actual="+Describe(GetAncestor(WindowFromPoint(point),2))+", point="+point.x+","+point.y);SetCursorPos(point.x,point.y);Click();System.Threading.Thread.Sleep(150);SetForegroundWindow(h);}finally{SetWindowPos(h,new IntPtr(-2),0,0,0,0,0x13);}}
 [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
 [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls,string title);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll")] public static extern uint MapVirtualKeyW(uint code,uint type);
 public static void Key(byte key,bool up){keybd_event(key,(byte)MapVirtualKeyW(key,0),up?2u:0u,UIntPtr.Zero);}
 public static void Click(){mouse_event(2,0,0,0,UIntPtr.Zero);System.Threading.Thread.Sleep(60);mouse_event(4,0,0,0,UIntPtr.Zero);}
}
'@
$qaHandle=[Module24Window]::OwnedWindow([uint32]$qaPid)
if($qaHandle -eq 0){throw 'Owned Elorin QA window is unavailable'}
$qaRect=New-Object Module24Window+RECT
[Module24Window]::GetWindowRect($qaHandle,[ref]$qaRect)|Out-Null
$qaClient=New-Object Module24Window+RECT
$qaOrigin=New-Object Module24Window+POINT
[Module24Window]::GetClientRect($qaHandle,[ref]$qaClient)|Out-Null
[Module24Window]::ClientToScreen($qaHandle,[ref]$qaOrigin)|Out-Null
if($Action -in @('AltF4','AltSpace','Escape','DoubleClick','Drag','Resize')){
 if([Module24Window]::GetForegroundWindow() -ne $qaHandle){[Module24Window]::FocusOwned($qaHandle)}
 Start-Sleep -Milliseconds 150
 if([Module24Window]::GetForegroundWindow() -ne $qaHandle){
  $qaActivation=New-Object Module24Window+POINT;$qaActivation.x=$qaOrigin.x+100;$qaActivation.y=$qaOrigin.y+18
  if([Module24Window]::GetAncestor([Module24Window]::WindowFromPoint($qaActivation),2) -ne $qaHandle){throw 'QA window could not acquire foreground; refusing to send input to another app'}
  [Module24Window]::SetCursorPos($qaActivation.x,$qaActivation.y)|Out-Null;[Module24Window]::Click();Start-Sleep -Milliseconds 150
  if([Module24Window]::GetForegroundWindow() -ne $qaHandle){throw 'QA window still lacks foreground'}
 }
}
if($Action -eq 'Normalize'){[Module24Window]::ShowWindow($qaHandle,9)|Out-Null;[Module24Window]::SetWindowPos($qaHandle,[IntPtr]::Zero,80,20,1456,1009,0x14)|Out-Null;Start-Sleep -Milliseconds 300}
elseif($Action -eq 'Restore'){[Module24Window]::ShowWindow($qaHandle,9)|Out-Null;Start-Sleep -Milliseconds 700}
elseif($Action -eq 'FocusAway'){[Module24Window]::SetForegroundWindow([Module24Window]::GetShellWindow())|Out-Null}
elseif($Action -eq 'Focus'){[Module24Window]::FocusOwned($qaHandle)}
elseif($Action -in @('AltF4','AltSpace')){
 [Module24Window]::SetForegroundWindow($qaHandle)|Out-Null
 [Module24Window]::Key(0x12,$false);[Module24Window]::Key($(if($Action -eq 'AltF4'){0x73}else{0x20}),$false)
 [Module24Window]::Key($(if($Action -eq 'AltF4'){0x73}else{0x20}),$true);[Module24Window]::Key(0x12,$true)
}elseif($Action -eq 'Escape'){[Module24Window]::Key(0x1B,$false);[Module24Window]::Key(0x1B,$true)}
elseif($Action -eq 'DoubleClick'){
 [Module24Window]::SetForegroundWindow($qaHandle)|Out-Null
 [Module24Window]::SetCursorPos($qaOrigin.x+300,$qaOrigin.y+18)|Out-Null
 [Module24Window]::Click();Start-Sleep -Milliseconds 80;[Module24Window]::Click()
}elseif($Action -in @('Drag','Resize')){
 [Module24Window]::SetForegroundWindow($qaHandle)|Out-Null
 $qaX=if($Action -eq 'Drag'){$qaOrigin.x+300}else{$qaOrigin.x+$qaClient.right-2};$qaY=if($Action -eq 'Drag'){$qaOrigin.y+18}else{$qaOrigin.y+[int]($qaClient.bottom/2)}
 $qaTarget=New-Object Module24Window+POINT;$qaTarget.x=$qaX;$qaTarget.y=$qaY
 if([Module24Window]::GetAncestor([Module24Window]::WindowFromPoint($qaTarget),2) -ne $qaHandle){throw 'Owned QA resize/drag target is occluded'}
 [Module24Window]::SetCursorPos($qaX,$qaY)|Out-Null;[Module24Window]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 for($qaStep=1;$qaStep -le 12;$qaStep++){[Module24Window]::SetCursorPos($qaX+$qaStep*5,$qaY+$qaStep*3)|Out-Null;Start-Sleep -Milliseconds 20}
 [Module24Window]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
Start-Sleep -Milliseconds 250
[Module24Window]::GetWindowRect($qaHandle,[ref]$qaRect)|Out-Null
@{pid=$qaPid;handle=$qaHandle.ToInt64();maximized=[Module24Window]::IsZoomed($qaHandle);minimized=[Module24Window]::IsIconic($qaHandle);focused=[Module24Window]::GetForegroundWindow() -eq $qaHandle;dpi=[Module24Window]::GetDpiForWindow($qaHandle);nativeMenu=[Module24Window]::FindWindow('#32768',$null) -ne [IntPtr]::Zero;bounds=@{x=$qaRect.left;y=$qaRect.top;width=$qaRect.right-$qaRect.left;height=$qaRect.bottom-$qaRect.top}}|ConvertTo-Json -Depth 4 -Compress
