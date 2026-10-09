!macro ElorinRequireClosed
  !insertmacro RestartManager_StartSession $R0
  ${If} $R0 != ""
    !insertmacro RestartManager_RegisterFile $R0 "$INSTDIR\prism.exe"
    ${If} $0 = 0
      System::Call 'RSTRTMGR::RmGetList(p R0, *i .r1, *i .r2, p 0, *i .r3) i .r0'
      ${If} $0 = 234
        !insertmacro RestartManager_EndSession $R0
        Abort "Close Elorin and resolve unsaved documents before continuing."
      ${EndIf}
      ${If} $0 != 0
        !insertmacro RestartManager_EndSession $R0
        Abort "Cannot verify running applications safely."
      ${EndIf}
    ${Else}
      !insertmacro RestartManager_EndSession $R0
      Abort "Cannot register application for safe close verification."
    ${EndIf}
    !insertmacro RestartManager_EndSession $R0
  ${Else}
    Abort "Cannot verify Elorin is closed. Close it before continuing."
  ${EndIf}
!macroend
!macro NSIS_HOOK_PREINSTALL
  !insertmacro ElorinRequireClosed
!macroend
!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current
  FileOpen $0 "$INSTDIR\elorin-installed" w
  FileWrite $0 "Elorin installed integration"
  FileClose $0
  WriteRegStr HKCU "Software\Classes\Elorin.File.Scientific" "" "Elorin Scientific"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.3D" "" "Elorin 3D"
  WriteRegStr HKCU "Software\Classes\Elorin.File.3D\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.Documents" "" "Elorin Documents"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.Data" "" "Elorin Data"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Data\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.Code" "" "Elorin Code"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Code\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.Media" "" "Elorin Media"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Media\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.Presentations" "" "Elorin Presentations"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.Images" "" "Elorin Images"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Images\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Elorin.File.Archives" "" "Elorin Archives"
  WriteRegStr HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\.parquet\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".parquet" ""
  WriteRegStr HKCU "Software\Classes\.arrow\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".arrow" ""
  WriteRegStr HKCU "Software\Classes\.feather\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".feather" ""
  WriteRegStr HKCU "Software\Classes\.h5\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".h5" ""
  WriteRegStr HKCU "Software\Classes\.hdf5\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".hdf5" ""
  WriteRegStr HKCU "Software\Classes\.nc\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".nc" ""
  WriteRegStr HKCU "Software\Classes\.netcdf\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".netcdf" ""
  WriteRegStr HKCU "Software\Classes\.mat\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mat" ""
  WriteRegStr HKCU "Software\Classes\.stl\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".stl" ""
  WriteRegStr HKCU "Software\Classes\.obj\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".obj" ""
  WriteRegStr HKCU "Software\Classes\.ply\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ply" ""
  WriteRegStr HKCU "Software\Classes\.gltf\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".gltf" ""
  WriteRegStr HKCU "Software\Classes\.glb\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".glb" ""
  WriteRegStr HKCU "Software\Classes\.step\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".step" ""
  WriteRegStr HKCU "Software\Classes\.stp\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".stp" ""
  WriteRegStr HKCU "Software\Classes\.iges\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".iges" ""
  WriteRegStr HKCU "Software\Classes\.igs\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".igs" ""
  WriteRegStr HKCU "Software\Classes\.jt\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".jt" ""
  WriteRegStr HKCU "Software\Classes\.skp\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".skp" ""
  WriteRegStr HKCU "Software\Classes\.3dm\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".3dm" ""
  WriteRegStr HKCU "Software\Classes\.sldprt\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".sldprt" ""
  WriteRegStr HKCU "Software\Classes\.sldasm\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".sldasm" ""
  WriteRegStr HKCU "Software\Classes\.catpart\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".catpart" ""
  WriteRegStr HKCU "Software\Classes\.catproduct\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".catproduct" ""
  WriteRegStr HKCU "Software\Classes\.fbx\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".fbx" ""
  WriteRegStr HKCU "Software\Classes\.dae\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".dae" ""
  WriteRegStr HKCU "Software\Classes\.usd\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".usd" ""
  WriteRegStr HKCU "Software\Classes\.usda\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".usda" ""
  WriteRegStr HKCU "Software\Classes\.usdc\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".usdc" ""
  WriteRegStr HKCU "Software\Classes\.usdz\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".usdz" ""
  WriteRegStr HKCU "Software\Classes\.3ds\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".3ds" ""
  WriteRegStr HKCU "Software\Classes\.c4d\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".c4d" ""
  WriteRegStr HKCU "Software\Classes\.blend\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".blend" ""
  WriteRegStr HKCU "Software\Classes\.max\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".max" ""
  WriteRegStr HKCU "Software\Classes\.dxf\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".dxf" ""
  WriteRegStr HKCU "Software\Classes\.dwg\OpenWithProgids" "Elorin.File.3D" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".dwg" ""
  WriteRegStr HKCU "Software\Classes\.txt\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".txt" ""
  WriteRegStr HKCU "Software\Classes\.log\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".log" ""
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".markdown" ""
  WriteRegStr HKCU "Software\Classes\.mdown\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mdown" ""
  WriteRegStr HKCU "Software\Classes\.mkd\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mkd" ""
  WriteRegStr HKCU "Software\Classes\.mkdn\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mkdn" ""
  WriteRegStr HKCU "Software\Classes\.json\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".json" ""
  WriteRegStr HKCU "Software\Classes\.geojson\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".geojson" ""
  WriteRegStr HKCU "Software\Classes\.jsonl\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".jsonl" ""
  WriteRegStr HKCU "Software\Classes\.ndjson\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ndjson" ""
  WriteRegStr HKCU "Software\Classes\.yaml\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".yaml" ""
  WriteRegStr HKCU "Software\Classes\.yml\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".yml" ""
  WriteRegStr HKCU "Software\Classes\.xml\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".xml" ""
  WriteRegStr HKCU "Software\Classes\.toml\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".toml" ""
  WriteRegStr HKCU "Software\Classes\.js\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".js" ""
  WriteRegStr HKCU "Software\Classes\.mjs\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mjs" ""
  WriteRegStr HKCU "Software\Classes\.cjs\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".cjs" ""
  WriteRegStr HKCU "Software\Classes\.ts\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ts" ""
  WriteRegStr HKCU "Software\Classes\.mts\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mts" ""
  WriteRegStr HKCU "Software\Classes\.cts\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".cts" ""
  WriteRegStr HKCU "Software\Classes\.jsx\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".jsx" ""
  WriteRegStr HKCU "Software\Classes\.tsx\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".tsx" ""
  WriteRegStr HKCU "Software\Classes\.py\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".py" ""
  WriteRegStr HKCU "Software\Classes\.c\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".c" ""
  WriteRegStr HKCU "Software\Classes\.h\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".h" ""
  WriteRegStr HKCU "Software\Classes\.cpp\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".cpp" ""
  WriteRegStr HKCU "Software\Classes\.cc\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".cc" ""
  WriteRegStr HKCU "Software\Classes\.cxx\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".cxx" ""
  WriteRegStr HKCU "Software\Classes\.hpp\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".hpp" ""
  WriteRegStr HKCU "Software\Classes\.java\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".java" ""
  WriteRegStr HKCU "Software\Classes\.go\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".go" ""
  WriteRegStr HKCU "Software\Classes\.rs\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".rs" ""
  WriteRegStr HKCU "Software\Classes\.htm\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".htm" ""
  WriteRegStr HKCU "Software\Classes\.html\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".html" ""
  WriteRegStr HKCU "Software\Classes\.css\OpenWithProgids" "Elorin.File.Code" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".css" ""
  WriteRegStr HKCU "Software\Classes\.csv\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".csv" ""
  WriteRegStr HKCU "Software\Classes\.tsv\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".tsv" ""
  WriteRegStr HKCU "Software\Classes\.tab\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".tab" ""
  WriteRegStr HKCU "Software\Classes\.mp3\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mp3" ""
  WriteRegStr HKCU "Software\Classes\.wav\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".wav" ""
  WriteRegStr HKCU "Software\Classes\.flac\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".flac" ""
  WriteRegStr HKCU "Software\Classes\.aac\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".aac" ""
  WriteRegStr HKCU "Software\Classes\.m4a\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".m4a" ""
  WriteRegStr HKCU "Software\Classes\.ogg\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ogg" ""
  WriteRegStr HKCU "Software\Classes\.opus\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".opus" ""
  WriteRegStr HKCU "Software\Classes\.wma\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".wma" ""
  WriteRegStr HKCU "Software\Classes\.aiff\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".aiff" ""
  WriteRegStr HKCU "Software\Classes\.aif\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".aif" ""
  WriteRegStr HKCU "Software\Classes\.mp4\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mp4" ""
  WriteRegStr HKCU "Software\Classes\.webm\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".webm" ""
  WriteRegStr HKCU "Software\Classes\.mov\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mov" ""
  WriteRegStr HKCU "Software\Classes\.mkv\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mkv" ""
  WriteRegStr HKCU "Software\Classes\.avi\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".avi" ""
  WriteRegStr HKCU "Software\Classes\.mpeg\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mpeg" ""
  WriteRegStr HKCU "Software\Classes\.mpg\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".mpg" ""
  WriteRegStr HKCU "Software\Classes\.m4v\OpenWithProgids" "Elorin.File.Media" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".m4v" ""
  WriteRegStr HKCU "Software\Classes\.epub\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".epub" ""
  WriteRegStr HKCU "Software\Classes\.eml\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".eml" ""
  WriteRegStr HKCU "Software\Classes\.msg\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".msg" ""
  WriteRegStr HKCU "Software\Classes\.xlsx\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".xlsx" ""
  WriteRegStr HKCU "Software\Classes\.xlsm\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".xlsm" ""
  WriteRegStr HKCU "Software\Classes\.xls\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".xls" ""
  WriteRegStr HKCU "Software\Classes\.xlsb\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".xlsb" ""
  WriteRegStr HKCU "Software\Classes\.ods\OpenWithProgids" "Elorin.File.Data" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ods" ""
  WriteRegStr HKCU "Software\Classes\.pptx\OpenWithProgids" "Elorin.File.Presentations" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".pptx" ""
  WriteRegStr HKCU "Software\Classes\.pptm\OpenWithProgids" "Elorin.File.Presentations" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".pptm" ""
  WriteRegStr HKCU "Software\Classes\.ppsx\OpenWithProgids" "Elorin.File.Presentations" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ppsx" ""
  WriteRegStr HKCU "Software\Classes\.potx\OpenWithProgids" "Elorin.File.Presentations" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".potx" ""
  WriteRegStr HKCU "Software\Classes\.ppt\OpenWithProgids" "Elorin.File.Presentations" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ppt" ""
  WriteRegStr HKCU "Software\Classes\.odp\OpenWithProgids" "Elorin.File.Presentations" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".odp" ""
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\.docx\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".docx" ""
  WriteRegStr HKCU "Software\Classes\.odt\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".odt" ""
  WriteRegStr HKCU "Software\Classes\.rtf\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".rtf" ""
  WriteRegStr HKCU "Software\Classes\.doc\OpenWithProgids" "Elorin.File.Documents" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".doc" ""
  WriteRegStr HKCU "Software\Classes\.png\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".png" ""
  WriteRegStr HKCU "Software\Classes\.jpg\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".jpg" ""
  WriteRegStr HKCU "Software\Classes\.jpeg\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".jpeg" ""
  WriteRegStr HKCU "Software\Classes\.gif\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".gif" ""
  WriteRegStr HKCU "Software\Classes\.webp\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".webp" ""
  WriteRegStr HKCU "Software\Classes\.svg\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".svg" ""
  WriteRegStr HKCU "Software\Classes\.avif\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".avif" ""
  WriteRegStr HKCU "Software\Classes\.bmp\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".bmp" ""
  WriteRegStr HKCU "Software\Classes\.ico\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".ico" ""
  WriteRegStr HKCU "Software\Classes\.tif\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".tif" ""
  WriteRegStr HKCU "Software\Classes\.tiff\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".tiff" ""
  WriteRegStr HKCU "Software\Classes\.heic\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".heic" ""
  WriteRegStr HKCU "Software\Classes\.heif\OpenWithProgids" "Elorin.File.Images" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".heif" ""
  WriteRegStr HKCU "Software\Classes\.zip\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".zip" ""
  WriteRegStr HKCU "Software\Classes\.tar\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".tar" ""
  WriteRegStr HKCU "Software\Classes\.gz\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".gz" ""
  WriteRegStr HKCU "Software\Classes\.tgz\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".tgz" ""
  WriteRegStr HKCU "Software\Classes\.7z\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".7z" ""
  WriteRegStr HKCU "Software\Classes\.rar\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".rar" ""
  WriteRegStr HKCU "Software\Classes\.bz2\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".bz2" ""
  WriteRegStr HKCU "Software\Classes\.xz\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".xz" ""
  WriteRegStr HKCU "Software\Classes\.zst\OpenWithProgids" "Elorin.File.Archives" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".zst" ""
  WriteRegStr HKCU "Software\Classes\.sqlite\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".sqlite" ""
  WriteRegStr HKCU "Software\Classes\.sqlite3\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".sqlite3" ""
  WriteRegStr HKCU "Software\Classes\.db\OpenWithProgids" "Elorin.File.Scientific" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\SupportedTypes" ".db" ""
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe" "FriendlyAppName" "Elorin"
  WriteRegStr HKCU "Software\Classes\Applications\prism.exe\shell\open\command" "" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Elorin\Capabilities" "ApplicationName" "Elorin"
  WriteRegStr HKCU "Software\Elorin\Capabilities" "ApplicationDescription" "Local file viewer"
  WriteRegStr HKCU "Software\RegisteredApplications" "Elorin" "Software\Elorin\Capabilities"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".parquet" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".arrow" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".feather" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".h5" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".hdf5" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".nc" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".netcdf" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mat" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".stl" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".obj" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ply" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".gltf" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".glb" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".step" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".stp" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".iges" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".igs" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".jt" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".skp" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".3dm" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".sldprt" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".sldasm" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".catpart" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".catproduct" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".fbx" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".dae" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".usd" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".usda" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".usdc" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".usdz" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".3ds" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".c4d" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".blend" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".max" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".dxf" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".dwg" "Elorin.File.3D"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".txt" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".log" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".md" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".markdown" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mdown" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mkd" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mkdn" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".json" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".geojson" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".jsonl" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ndjson" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".yaml" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".yml" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".xml" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".toml" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".js" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mjs" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".cjs" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ts" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mts" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".cts" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".jsx" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".tsx" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".py" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".c" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".h" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".cpp" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".cc" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".cxx" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".hpp" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".java" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".go" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".rs" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".htm" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".html" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".css" "Elorin.File.Code"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".csv" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".tsv" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".tab" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mp3" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".wav" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".flac" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".aac" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".m4a" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ogg" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".opus" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".wma" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".aiff" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".aif" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mp4" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".webm" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mov" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mkv" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".avi" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mpeg" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".mpg" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".m4v" "Elorin.File.Media"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".epub" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".eml" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".msg" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".xlsx" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".xlsm" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".xls" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".xlsb" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ods" "Elorin.File.Data"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".pptx" "Elorin.File.Presentations"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".pptm" "Elorin.File.Presentations"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ppsx" "Elorin.File.Presentations"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".potx" "Elorin.File.Presentations"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ppt" "Elorin.File.Presentations"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".odp" "Elorin.File.Presentations"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".pdf" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".docx" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".odt" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".rtf" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".doc" "Elorin.File.Documents"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".png" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".jpg" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".jpeg" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".gif" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".webp" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".svg" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".avif" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".bmp" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".ico" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".tif" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".tiff" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".heic" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".heif" "Elorin.File.Images"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".zip" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".tar" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".gz" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".tgz" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".7z" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".rar" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".bz2" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".xz" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".zst" "Elorin.File.Archives"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".sqlite" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".sqlite3" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities\FileAssociations" ".db" "Elorin.File.Scientific"
  WriteRegStr HKCU "Software\Elorin\Capabilities" "ElorinOwnerCommand" '$\"$INSTDIR\prism.exe$\" $\"%1$\"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro ElorinRequireClosed
  SetShellVarContext current
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.parquet\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.arrow\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.feather\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.h5\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.hdf5\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.nc\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.netcdf\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mat\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.stl\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.obj\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ply\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.gltf\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.glb\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.step\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.stp\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.iges\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.igs\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.jt\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.skp\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.3dm\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.sldprt\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.sldasm\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.catpart\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.catproduct\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.fbx\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.dae\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.usd\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.usda\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.usdc\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.usdz\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.3ds\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.c4d\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.blend\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.max\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.dxf\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.dwg\OpenWithProgids" "Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.txt\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.log\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mdown\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mkd\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mkdn\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.json\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.geojson\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.jsonl\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ndjson\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.yaml\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.yml\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.xml\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.toml\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.js\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mjs\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.cjs\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ts\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mts\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.cts\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.jsx\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.tsx\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.py\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.c\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.h\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.cpp\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.cc\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.cxx\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.hpp\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.java\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.go\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.rs\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.htm\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.html\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.css\OpenWithProgids" "Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.csv\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.tsv\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.tab\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mp3\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.wav\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.flac\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.aac\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.m4a\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ogg\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.opus\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.wma\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.aiff\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.aif\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mp4\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.webm\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mov\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mkv\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.avi\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mpeg\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.mpg\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.m4v\OpenWithProgids" "Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.epub\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.eml\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.msg\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.xlsx\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.xlsm\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.xls\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.xlsb\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ods\OpenWithProgids" "Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.pptx\OpenWithProgids" "Elorin.File.Presentations"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.pptm\OpenWithProgids" "Elorin.File.Presentations"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ppsx\OpenWithProgids" "Elorin.File.Presentations"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.potx\OpenWithProgids" "Elorin.File.Presentations"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ppt\OpenWithProgids" "Elorin.File.Presentations"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.odp\OpenWithProgids" "Elorin.File.Presentations"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.docx\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.odt\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.rtf\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.doc\OpenWithProgids" "Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.png\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.jpg\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.jpeg\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.gif\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.webp\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.svg\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.avif\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.bmp\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.ico\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.tif\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.tiff\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.heic\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.heif\OpenWithProgids" "Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.zip\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.tar\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.gz\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.tgz\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.7z\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.rar\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.bz2\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.xz\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.zst\OpenWithProgids" "Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.sqlite\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.sqlite3\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegValue HKCU "Software\Classes\.db\OpenWithProgids" "Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Scientific\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Scientific"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.3D\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.3D"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Documents\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Documents"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Data\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Data"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Code\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Code"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Media\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Media"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Presentations\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Presentations"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Images\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Images"
  ReadRegStr $0 HKCU "Software\Classes\Elorin.File.Archives\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Elorin.File.Archives"
  ReadRegStr $0 HKCU "Software\Classes\Applications\prism.exe\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\Applications\prism.exe"
  Delete "$INSTDIR\elorin-installed"
  ReadRegStr $1 HKCU "Software\Elorin\Capabilities" "ElorinOwnerCommand"
  StrCmp $1 '$\"$INSTDIR\prism.exe$\" $\"%1$\"' 0 +5
  ReadRegStr $0 HKCU "Software\RegisteredApplications" "Elorin"
  StrCmp $0 "Software\Elorin\Capabilities" 0 +3
  DeleteRegValue HKCU "Software\RegisteredApplications" "Elorin"
  DeleteRegKey HKCU "Software\Elorin\Capabilities"
  DeleteRegKey /ifempty HKCU "Software\Elorin"
!macroend
