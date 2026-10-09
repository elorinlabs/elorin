# Elorin Module 21 — CAD & 3D Engineering Viewer

日期：2026-10-09。仅实施 Module 21；未开始 Module 22。

## 1. 审计结论

检查了 Registry/ViewerHost、Module 17 检测优先级、FileSource/VFS/Archive、Module 18 Binary、图片/SVG/PDF、Module 20 预算、Three.js、Worker、窗口活动与 QA。实际 Module 13 已有 STL/OBJ/PLY/glTF/DXF、场景树、测量、按需 Three 渲染及打包 OCCT。没有建立平行 Viewer 或 CAD 内核。原 `mesh/cad/scene/cad-drawing` priority 110、lazy builtins 和 PDF/图片/Text 路由保留。

缺口：OBJLoader 默认扇形三角化；PLY List 没有解码前预算；glTF BufferView/Sparse 边界不足；部分 DXF OCS 丢失且共享曲线点被重复变换；隐藏/最小化缺少完整取消/释放；重型解码并发与能力声明需要补强。

## 2. 实现清单

增加 OBJ 索引/凹多边形预处理、PLY Property/List 预检、glTF accessor/view/stride/sparse/实际 buffer 长度检查、STL 法线重算和退化计数、DXF OCS/源实体/省略计数、单重型解码门控、隐藏/最小化/关闭 CPU/GPU 释放、Context Lost/Restore、重复尺寸过滤、预算受控 Shaded+Edges、实际结果 capability。保留原相机、树、图层、Inspector、双精度计算的两点测量及现有 UI/Logo。

## 3. 真实格式矩阵

| 优先级/格式 | 真实能力 | 边界 |
| --- | --- | --- |
| P0 STL ASCII/Binary | 网格、法线、bounds、统计、居中/Fit、表面/线框/边线 | Binary 结合计数/长度；坐标非有限拒绝；法线重算；退化面显式计数；未知单位。超既有阈值的首20万面预览明确 Reduced，不称完整 |
| P0 OBJ/MTL | v/vt/vn、正负索引、组/对象、基础材质/授权纹理 | 简单平面凹多边形用 Three ShapeUtils/earcut；自交/重复/零面积/明显非平面拒绝；单 polygon 4096点；缺 MTL/纹理有诊断 |
| P0 glTF2/GLB | 静态 scene/node transform、mesh/primitive、标准索引/多buffer、PBR/texture、层级 | Three GLTFLoader；view/stride/accessor/sparse、实际长度、节点环和预算预检；Draco/Meshopt/KTX2 不支持、不下载；动画/高级材质不称完整 |
| P0 PLY ASCII/LE/BE | Property驱动、颜色、网格/点云 | 解码前 List/类型/索引/展开大小扫描，单List4096；不称任意复杂 PLY 多边形可靠三角化 |
| P0 DXF | 正交2D、基础Line/Polyline/Circle/Arc/Ellipse/Text/MTEXT/Insert/Block/Layer、导航/INSUNITS | OCS适配Circle/Arc/LWPolyline/Insert；Line按WCS；其余非XY OCS明确省略；记录来源类型及省略数量；仅Model space，字体/标注/Spline/Hatch等部分受限 |
| P1 STEP/STP/IGES/IGS | 既有OCCT真实tessellation、assembly/part/body、颜色、face range、质量切换 | 懒载WASM；近似网格测量，非精确B-Rep编辑/曲线测量/完整PMI；mm来自内核归一化 |
| P1 3MF/3DS | 本次未新增真实渲染 | 仅已有检测/兜底，不宣称component/build/material适配 |
| P2 DWG/IFC/FBX/DAE | 本次未新增可靠专业显示/BIM | DWG等保留已有元信息/识别/Hex；没有商业DWG库或云转换 |

结果派生 `engineeringCapabilities` 声明 metadata/mesh/materials/scene_graph/drawing_2d/layers/point_cloud/measurement/camera_presets/external_resources；brep=false，因为输出是离散网格。

## 4. 文件清单

新增应用源码：`src/viewer/plugins/geometry/{obj-preflight.ts,ply-preflight.ts,decode-budget.ts,capabilities.ts}`。

修改：同目录 `{config.ts,geometry-model.ts,parser.worker.ts,adapter.ts,resource-resolver.ts,drawing-parser.ts,render-engine.ts,GeometryViewer.tsx,geometry.css}`。

新增测试：`tests/{module-21.test.ts,module-21-browser-qa.cjs,module-21-native-qa.cjs,module-21-security-qa.cjs,generate-module-21.cjs}`；`test-fixtures/3d/module21/{10000.stl,100000.stl,1000000.stl,concave.obj}`。

文档：本页、`docs/qa/module-21-verification.md`、原Module13文档入口；各runtime JSON、构建/测试日志；隔离QA配置`module-21-tauri.local.json`。

## 5. 依赖、许可证和体积

没有新增npm/Cargo、Native DLL、WASM或unsafe FFI。复用three0.186.1（MIT）、dxf-parser1.1.2（MIT）、occt-import-js0.0.23。已有OCCT WASM7,604,031字节，按格式懒载，不在启动时初始化GPU。完整LGPL-2.1与OCCT exception、固定源码及重建说明位于`public/vendor/occt/README.md`和相邻notices。未来商业分发仍须遵循已打包许可义务；本次不是法律认证。没有引入未确认商业兼容性的DWG库。

OCCT独立可终止WASM Worker，不增加Windows C++ DLL ABI、跨线程裸指针或外部解码器下载。它不是OS硬内存沙箱。最终安装包13,478,020字节，比Module20增加8,704字节；懒载geometry chunk600,892字节、parser Worker326,824字节，初始主index472,032字节（Module20日志471.97kB，变化约几十字节）。既有大chunk提示未隐藏。

## 6. 数据流与安全

Registry → GeometryModel job → boundedBytes/Module18 BinaryModel → 已授权BinarySessions或FileSource → preflight → parser/OCCT Worker → validateDocument → transferable TypedArray → RenderEngine/Inspector。

范围每次1MiB、Binary缓存64KiB，借用VFS不误关父源，复用修订检查。全局重型解码1，候选队列最多8，等候可Abort且在分配前排队。OBJ索引预检，PLY list/type/index预检，glTF count/view/stride/sparse/actual length及环验证；最终所有typed array非有限数/索引、重复node/父子关系/环/transform/bounds检查。DXF Block有递归/深度限制。路径复用safeResourcePath，外部网络/JavaScript/遍历URI阻断；纹理magic/pixel/dimension/bytes预检，不用SVG外链绕过，不执行脚本/宏/任意Shader。

## 7. 资源预算

模型CPU数组128MiB、GPU mesh/texture128MiB；源128MiB、CAD源32MiB；继承200万面/点上限；纹理单张16MiB及既有像素/尺寸限制。计费positions/indices/normals/uvs/colors/segmentOwners，缺法线预留生成占用；纹理RGBA+mipmap估算；边线额外估算并按geometry共享。

这些是分配阶段预算，不是进程RSS硬限制。源buffer、JS文本、三角化临时数组、库内部对象、GPU上传/Driver副本另占内存，不能用文件大小代替展开成本。复杂模型可明确拒绝/显式Reduced，用户可Hex。

## 8. 生命周期和调度

隐藏/最小化/非活动/关闭取消job，终止Worker，清理ImageBitmap/URL，自有Binary会话关闭；drop场景TypedArray及ready引用。render effect dispose geometry/material/texture/controls/listeners/renderer/context；共享资源Set只释放一次。恢复重新读和建资源，不复用已关闭位图。只有操作/尺寸/选择/可见性等事件调度，无常驻RAF/阻尼/动画。重复尺寸不resize；ContextLost暂停、Restore事件恢复，不循环初始化。dispose不代表物理显存/总RSS立即归还，见实际测量。

## 9. 测量

两点拾取/bounds/对象坐标计算使用JS双精度；渲染源网格Float32及CADtessellation已有量化/离散，结果明确近似。未知单位使用model units，不推断STL为mm；STEP mm来自内核参数。没有制造公差、B-Rep精确曲线、建模/布尔/约束功能。

## 10. 性能与验证

详见QA记录及原始JSON/日志。10k/100k/1M STL以1000面批次生成，不构建同尺寸巨型JS字符串；已有百万点PLY与标准STEP/IGES/DXF/MTL/VFS/异常夹具复用。记录首屏、parser、GPU setup、renderer资源和桌面进程总工作集/CPU；不以4xCPU降速冒充旧机器。

## 11. 失败及修复

glTF巨count先报range，调整校验顺序保留断言。DXF共享点被重复变换导致圆bounds6而应4，复制坐标后变换；Circle原库漏extrusion，按原始组码索引补回，Z尺寸从0修至4。ContextRestore重置frame计数，QA改为真实事件及重建geometry/triangles断言。WebView2空闲多帧，重复尺寸过滤/布局约束后同一停帧断言通过。CPU隐藏清理补断言；旧构建为纳入最后代码主动中止并重建，不作为交付产物。

## 12. 未完成和限制

矩阵列出的专业格式/压缩扩展/高级动画/完整DXF未实现，不称支持。Sparse和全部材质组合端到端夹具仍可扩展。大型DXF/复杂装配/快速多标签专项新基准、数小时闲置、物理显存高频峰值、实际FPS、2015–2016 i5/8GB/IntelHD与SATA/机械盘实机未全面验证。旧测试文件存在不等于本次执行。CPU/GPU预算不是进程硬沙箱，测量不是制造级精度。

## 13. 停止范围

完成本模块代码、验证和报告后停止，未实施Module22。
