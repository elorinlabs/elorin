# 真实运行与数据调用图

日期/边界同 UI_AUDIT.md。所有路径相对 D:/Prism；箭头为已追踪调用，虚线目标不代表现有实现。

```text
index.html
  /src/main.tsx
    styles.css → foundation.css → design-system/system.css
    DEV /__qa/design-system → Showcase（仅开发）
    其他 → app/App.tsx
      PrismTitleBar → services/windowAdapter → Tauri窗控 / window_chrome.rs
      Sidebar → app/routes.ts → Home / IntegrationSettings / Coming later
      fileSelection.select / listenDrop
        → select_path / prism://files-dropped → App.inspect
        → fileLoader → load_file + enhanceDescriptor / detectBrowserFile
        → TauriFileSource / BrowserFileSource → documents[activeFile]
      DocumentSurface（允许编辑才建立DocumentSession）
        → save-service → document_save → Rust指纹校验/安全保存
        → recovery → document_recovery
      ViewerHost → ViewerController.start
        → ViewerRegistry.adapt/resolve → formats/index → adapters
        → builtins lazy plugin.load(context)
        → plugin.render / slots → ViewerShell
        → plugin.inspect / renderInspection
        → context.onCleanup + Abort + generation → plugin.dispose
      viewerCommands(source) → App commands / Palette / ContextMenu
      workspaceManifest → platformIntegration.write → productivity_write
      recentFilesService → productivity recent / 浏览器localStorage
```

## 定位索引

| 功能 | UI事件 → 状态 → 服务/后端 | 证据 |
| --- | --- | --- |
| 标签 | App opened-files onClick/onDrop → activeFile/documents → workspaceManifest | App.tsx、workspace/workspace.ts |
| 关闭 | closeTabs/onCloseRequested → discardDocuments → documentChoice → save/flush/destroy | App.tsx、document/recovery.ts、dialog.tsx |
| 全局命令 | Ctrl+O/P/W/Tab → App handler；Viewer命令 → viewerCommands.register → actions.action | commands/registry.ts、viewer-bridge.ts、ViewerHost.tsx |
| Context menu | document.contextmenu → closest viewer/tab → prism-context-actions/elorin-tab-context-actions → action | components/shell/ContextMenu.tsx |
| 搜索 | App Ctrl+F → Viewer search action 或 SearchSurface → sourceSearchProvider；180ms debounce、Abort、3并发、1000结果 | search/SearchSurface.tsx、providers.ts |
| 对比 | App compare Palette选另一个tab → CompareView → diff.worker / bounded image blob | compare/CompareView.tsx |
| PDF | go/zoom/rotate/setPanel/query → session.metadata pdf* → PdfEngine → pdfjs range/worker | plugins/pdf/PdfViewer.tsx、pdf-engine.ts |
| 文本 | TextViewer search/jump/patch → TextModel → text.worker/source.worker + source.readRange | plugins/text/ |
| Markdown | mode reader/source/split → MarkdownReader/Source → markdown-parser / resources / safe-document | plugins/markdown/ |
| JSON | mode/tree selection/search/copy → JsonModel/worker/search → FileSource | plugins/json/ |
| CSV | select/filter/sort → session csv* → projectRows/searchRows → CsvGrid/rowSource | plugins/csv/ |
| XLSX | switchSheet/search/selection → SpreadsheetModel.sheet → package worker → sparse GridSurface | plugins/spreadsheet/ |
| Archive | navigate/select/open/extract → ArchiveModel/VFS → NativeArchiveBackend archive_* / BrowserArchiveBackend | plugins/archive/、src/vfs/、src-tauri/src/archive/ |
| 子文件 | ArchiveModel.resource → ArchiveFileSource → services.file.openResource → App child tab/parentSource | archive-model.ts、App.tsx |
| Media | toggle/seek/rate/mute → PlaybackController snapshot → HTMLMediaElement → prism-media/VFS lease | plugins/media/PlaybackController.ts、media-source.ts、Rust media/ |
| 3D | pointer/fit/view/wireframe → GeometryRenderEngine → Three/OrbitControls；select→model.selected→Inspector | plugins/geometry/render-engine.ts、GeometryViewer.tsx |
| Hex | BigInt offset → BinaryModel → binary_read/search_* → Rust BinarySessions → local/VFS | plugins/hex/、src-tauri/src/binary/ |
| Theme | App select → useTheme → applyTokens + localStorage prism-theme；System matchMedia | hooks/useTheme.ts、design-system/tokens.ts |
| Settings | route settings → IntegrationSettings → capabilities/defaultApps/associationHealth → Rust productivity | App.tsx、platform/IntegrationSettings.tsx、integration.ts |
| Focus现状 | App focusMode→CSS；PDF等→requestFullscreen | 独立顶层窗创建链缺失 |
| 状态栏现状 | plugin footer / Host label；ViewerSlots.statusBar预留 | 无统一StatusProvider调用链 |

## 桌面安全与资源边界

`tauri.conf.json` 仅 main、decorations=false、min900×650。`src-tauri/src/lib.rs` 注册 URI prism-science/prism-vfs/prism-media、单实例、window-state、受控 sessions。`FileAccess` 授权路径；launch/drop先grant再通知。`capabilities/main.json` 不能自动覆盖未来Focus窗口。

退出全局关闭 binary/scientific；main重载也全局close_all；最小化全局pause_all。当前单窗成立，未来多窗须按 owner 隔离，不能直接复用这些全局清理点。跨窗状态为版本化DTO，不能共享WeakMap/FileSource对象。

## 构建身份检查单（后续发布使用，本轮未构建）

`pnpm build` 只更新dist；`pnpm tauri build` 才更新嵌入exe/安装包。记录 source freeze hash → dist index脚本 → exe SHA256/路径 → app identifier/profile → NSIS SHA256 →安装后exe SHA256。DEV Showcase截图不能作为生产路由替换证明。
