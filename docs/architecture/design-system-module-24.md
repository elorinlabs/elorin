# Module 24 — 视觉基础、窗口 Chrome 与滚动系统

本模块是基础设施迁移，不代表 Elorin 整体 UI 重构完成。专业 Viewer、Workspace 业务、多窗口与解析器不在本次重建范围内。

## 1. 修改前审计与迁移清单

| 部位 | 现有实现 | 本轮处理 |
| --- | --- | --- |
| 主题 | `design-system/tokens.ts`、`typography.ts`、`hooks/useTheme.ts`，Light/Dark/System，CSS Variables | 扩展语义 Token，保留旧名称映射和主题 Hook；没有组件树重建 |
| 基础控件 | `components/common/ui.tsx` 的 Button/IconButton/Surface/SearchInput/Tooltip/FileTypeBadge | 扩展现有入口，其余基础控件从同一入口导出 |
| 标题栏 | PrismTitleBar + windowAdapter；已有八向边缘拖动 | 补真实焦点/最大化订阅、异步卸载保护、双击和原生系统菜单 |
| Tauri | 2.12.1，主窗 1440×1000、下限 900×650，**原本即 `decorations:false`** | 保持窗口配置、权限边界、退出确认；仅补 is-focused 和本窗 system-menu 权限 |
| ViewerHost/Session | Registry、Generation、Abort、隐藏/恢复、Inspector | 保留；不另建主题、窗口或滚动服务 |
| Workspace | App、productivity.css、既有标签及文件操作 | 保留业务和结构；仅替换基础颜色、字体、控件与弹层层级 |
| 滚动 | foundation.css 原生 CSS；PDF/文本容器；GridSurface 高度压缩；Hex 分段 BigInt 地址 | 按实际容器选择 Reading/Data；不修改逻辑定位或截获全局 wheel |
| 国际化 | 未发现统一 i18n 框架；既有英文界面、部分中文错误提示 | 基础控件接受调用方文案；增加中英文窗口标签和开发展示。没有宣称全应用翻译完成 |
| DPI | Tauri/Windows 管理 DPI；未发现自行缩放物理坐标的系统 | 不引入自制 DPI 服务；原生菜单坐标来自 Windows |
| 品牌/图标 | public/assets/logo.png、程序图标和现有 sprite | 统一 BrandMark/FileIcon 接口；不更换品牌、不导入 1,230 图标 |
| QA | Vitest、Rust、真实 Edge/WebView2、Module 23 回归/NSIS 安装检查 | 直接复用；另补 Module 24 展示、控件、窗口与滚动验证 |

后续需要逐模块迁移的界面包括首页卡片布局、设置中心分组、标签/文件工具栏、Inspector 各专业布局和 Viewer 内部独立按钮。本模块不把这些全部包装成新组件，以免破坏已有交互。

## 2. 参考稿与品牌资产

用户提供的 11 张 PNG 在 Downloads 路径可访问；未发现它们原先存于仓库。可逐图对照颜色、字体、间距、基础组件及通用壳层。文件清单与 SHA256 见 `docs/qa/module-24/assets.json`。

仓库的现有品牌是浅蓝方形波纹标志，主图 82×82、程序图标另有 512×512 版本。参考稿中的蓝色折叠标志及独立透明/矢量字标**没有独立交付素材**。本轮保留已有资产，BrandMark 在标题栏和侧边栏复用同一图像；`brandAssets` 明确区分主图、图形、小尺寸、标题栏和程序图标用途。界面中的 Elorin 字样仍由文字排版组成，并非从参考稿重绘的官方字标。没有从合成参考图裁出或寻找相似 Logo。

## 3. Design Token 规范

唯一程序来源是 `src/design-system/tokens.ts`，`applyTokens` 在根元素写入 CSS Variables。`colors.light/dark` 保留旧 camelCase 别名，因此既有 Viewer 能继续消费同一套语义值。无 filter/invert。

| Token | Light | Dark |
| --- | --- | --- |
| app-background | #F8FAFC | #101827 |
| surface-primary | #FFFFFF | #172235 |
| surface-secondary | #F0F7FF | #1D2B42 |
| surface-raised | #FFFFFF | #22324A |
| surface-hover / active | #EAF3FF / #DCEBFF | #293D59 / #284972 |
| accent-primary / hover / subtle | #0B66F5 / #0754CF / #E5F0FF | #8CBDFF / #B1D3FF / #233F65 |
| text-primary / secondary / muted | #0B1538 / #52658A / #58698C | #F0F5FF / #BDCBE2 / #ABBBD4 |
| border-default / subtle | #DCE6F3 / #EAF0F8 | #405470 / #2B3D57 |
| focus-ring | #0B66F5 | #8CBDFF |
| success / warning / danger | #087A59 / #926000 / #C32C40 | #6DD9B1 / #F6CE78 / #FF9AA8 |
| on-accent | #FFFFFF | #101827 |

文本/状态文字对 surface-primary、按钮 on-accent 对 accent-primary 以 WCAG 相对亮度公式自动验证至少 4.5:1。此项不替代整页屏幕阅读器人工验收。

字体优先本机 Inter，其次 Segoe UI、Microsoft YaHei UI、PingFang SC、系统 sans-serif；没有捆绑来源不明的字体。Code 使用 Cascadia Code/Consolas/中文回退。Display 40/48/700、Heading 28/36/700、Subheading 20/28/600、Body 14/22/400、Caption 12/18/400、Code 13/20/400、Metadata 12/18/400（字号/行高/字重）。旧 Viewer 内容字号仍由原模块控制。

间距：4/8/12/16/20/24/32/40/48/64 px。圆角 xs=4、sm=6、md=8、lg=12、xl=16、pill=999 px。标准阴影使用语义 shadow-color；没有给整窗添加 backdrop blur。过渡为 120/180 ms，减少动态效果时禁用动画、过渡与平滑滚动；Skeleton 默认静态。

层级：content=0、sticky=10、toolbar=20、dropdown=40、popover=50、modal=60、tooltip=70、notification=80、window-overlay=90。旧 layer-* 映射到该表；文档确认、命令面板、通知和拖放覆盖层消费命名变量，不再使用 10000。专业 Viewer 局部内部层级本轮不全量重构。

## 4. 组件边界

`components/common/ui.tsx` 是兼容入口；`controls.tsx` 提供 Input、Select、Dropdown、Checkbox、Radio、Switch、Tabs、SegmentedControl、Badge、Separator、Progress、Skeleton、Card、Panel、EmptyState、ScrollArea。原 Button/IconButton/SearchInput/Tooltip/Surface 保持现有调用接口。

按钮支持 primary/secondary/tertiary/danger，加载时禁用并设置 aria-busy。输入错误设置 aria-invalid，业务错误文案由调用方提供。Checkbox/Radio/Select 使用原生表单行为；Switch 用原生 button 处理 Enter/Space。Tabs 使用 roving tabIndex，方向键/Home/End 跳过禁用项。Dropdown 用原生按钮、Portal、有限生命周期的外部点击/resize 监听；Escape 恢复触发器焦点。Tooltip Portal 避免侧边栏裁切，焦点和悬停均可显示，Escape/滚动/resize 可关闭。

组件不执行文件写入等业务；由调用方提供动作。展示页的演示按钮只改变公开计数，明确说明不修改文件，没有伪装成已经执行保存/导出的按钮。

`/__qa/design-system` 仅在 `import.meta.env.DEV` 分支加载。生产构建移除该路由、Showcase 和 synthetic Grid fixture；生产主页继续是既有 App。

## 5. Window Chrome 选型

| 方案 | 优点 | 代价/风险 |
| --- | --- | --- |
| A 原生装饰 | 最完整原生 caption、系统菜单、Windows 11 Snap 悬停、系统辅助功能与 DPI 行为 | 原生标题栏与参考稿的统一视觉差距较大；本项目原已无边框 |
| B 纯自绘 | 外观最可控，Tauri 原生窗口 API 可负责拖动/最小化/最大化/还原/关闭 | 不能假装 DOM 最大化按钮具备 HTMAXBUTTON；需要处理系统菜单、状态和原生边缘功能 |
| C 自绘外观 + 原生窗口能力 | 复用现有 B，状态/尺寸由 OS 管理，系统菜单由 OS 呈现，保留关闭确认 | Windows 11 最大化按钮悬停 Snap flyout 尚未实现原生命中测试；多显示器/更多系统组合仍需实测 |

本轮采用增量 C：保持已有 `decorations:false`，不改变窗口创建和退出架构。windowAdapter 负责 Tauri API；onResized/onFocusChanged 同步真实状态，revision 抛弃陈旧结果，异步注册晚于卸载也会立即解除；不轮询。交互节点排除拖动，只有标题栏空白区域和指定边缘可启动原生移动/缩放。

新增 `window_system_menu` 仅允许当前 `main` WebviewWindow，不接受外部 HWND、路径或任意系统命令。复用现有 windows-sys，只开启 WindowsAndMessaging feature，没有新增 crate。菜单在主线程由 GetSystemMenu/TrackPopupMenu 显示，按真实最大化状态启用/禁用项，选择后发送 Windows WM_SYSCOMMAND；Close 继续走既有 CloseRequested/文档确认。使用单个原子标志拒绝重入，弹出期间等待用户选择，关闭菜单后释放等待；没有常驻菜单后台服务。

Windows 11 悬停最大化按钮弹出 Snap Layouts **不是本轮已实现能力**。不要把 Tauri toggleMaximize 或浏览器模拟按钮测试称为该功能验证。原生 DPI、边缘吸附、多显示器、Alt+F4 等逐项实测状态见验收报告。

## 6. Scroll System

优先原生 CSS scrollbar，没有 overlay thumb、全局 wheel listener、长度轮询或常驻 requestAnimationFrame。

| 类型 | 宽度 | 位置可见性 | 应用 |
| --- | --- | --- | --- |
| Minimal | 6 px | hover/focus-within 增强；固定轨道尺寸 | sidebar、Dropdown、菜单及显式 ScrollArea |
| Reading | 8 px | 正常状态保留 thumb | PDF viewport、Markdown reader/source、Text、Office、EPUB m11-reading |
| Data | 10 px（两个方向） | 正常状态保留 thumb | CSV/Scientific `.csv-grid`、XLSX `.m10-grid`、Hex、Archive list |

新 ScrollArea 保留原生 overflow:auto、默认可键盘聚焦，并使用 stable gutter 避免悬停改变内容宽度；旧专业容器不替换结构。WebView2/Chromium 使用 ::-webkit-scrollbar，其他引擎采用标准 thin/color 降级。系统强制高对比度使用系统色与可见边框。

GridSurface 的 16,000,000 px 映射仍由原模块的 scaleForHeight 管理；Hex 的 u64/BigInt 地址和分段基址不变。滚动条长度只对应当前 CSS/分段窗口，不能据此推断文件总长度。DEV fixture 复用真正 GridSurface，按函数生成 2^31 行，测试末行及 Ctrl+Home，避免创建 2^31 元素/数组；实际 8 GiB sparse NPY 另用现有原生随机读取回归验证。

## 7. 明确的视觉差异与边界

1. 参考折叠 Logo 与现有浅蓝方形 Logo 不同，独立素材缺失，未替换。
2. Windows 控件置于右侧，未照搬参考图左上角 macOS 三色窗口按钮。
3. 字体采用本机授权字体与系统回退，没有捆绑参考图的 Inter 文件和字标。
4. 首页仍保留原有纸张背景、文案和卡片结构；没有改成参考首页的大型文件拖放卡片布局。
5. 侧边栏保留现有 Home/Recents/Library 和分类路由，没有伪造参考图中尚未对应业务的入口。
6. 专业 Viewer 工具栏、缩略图、Inspector、设置中心未按参考稿逐页重排；它们仅消费新的基础 Token 和滚动外观。
7. 明暗组件图、主窗图是真实程序截图；参考图仅用于对照，不作为运行证据。

测试命令、实际日志、环境、性能、截图、安装器与未验证项统一见 `docs/qa/module-24-verification.md`。
