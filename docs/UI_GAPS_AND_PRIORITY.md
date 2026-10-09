# UI 缺口与优先级

本表为只读结论，不授权实施；对应完整矩阵行及UI_AUDIT源码证据。

| 级别 | 缺口 | 处理门禁/验收 |
| --- | --- | --- |
| P0 | Module24当前非一致最终验收快照；原生套件失败、安装历史早于新包 | 保留冻结；恢复授权后定位Theme/CDP失败，重新形成同版本完整结果 |
| P0 | 无.git，分支/未提交差异不可证 | 人工保留冻结哈希，不覆盖；建立可恢复版本基线后再开发 |
| P0 | 独立Focus缺失，main重载/最小化全局清理会跨窗干扰 | 先owner/资源租约/权限设计，再创建顶层窗；PDF第7页跨窗E2E阻断 |
| P1 | App布局未迁移、分类占位、DEV展示与生产入口分离 | 改真实App组合，不复制第二套入口；记录构建身份+原生截图 |
| P1 | 浮层管理分散，Esc/焦点/owner未统一 | 统一Host/stack/anchor/生命周期，迁移现有Dialog等保留语义 |
| P1 | StatusBar有插槽但无provider；各footer重复 | 活动window/tab/generation事件协议，不虚构字段 |
| P1 | Scroll13章新增要求尚未实现 | 保留原native滚动作为回退，虚拟logical mapper单一来源，物理DPI/输入测试 |
| P1 | Settings只Desktop Integration，无真实多分类schema | 逐key追踪消费者与存储；缺能力不能出可操作开关 |
| P1 | 文件操作/导出/分享/PDF编辑等缺后端 | 独立能力审查；无安全服务隐藏或禁用；归档写回另立范围 |
| P1 | 关闭虚拟tab后reopen复用disposed源；幻灯搜索Close不取消扫描；sidebarCollapsed存而未恢复 | 证据与复现用例见UI_AUDIT 4.2；在获准工作区/Viewer批次修复，本轮不动源码 |
| P2 | Home More仅提示、Recents页面占位、Favorites缺失 | 接已有recent与命令；新持久化必须明确授权批次 |
| P2 | Viewer布局和材质/统计/列表/缩略图能力参差 | 复用解析器，按result-derived能力逐类迁移 |
| P2 | 全应用i18n/区域/RTL/可访问性档位缺失 | 不把chrome语言入口当全应用翻译；焦点/高对比/长文案测试 |
| P2 | 新Logo独立资产、字体授权/完整图标未交付 | 不裁概念图或重绘品牌；保留当前资产等待正式素材 |
| 发布阻断 | 旧i5、真实多屏混合DPI、触控板、30分钟周期未测 | Module36必须给实机报告或明确不通过范围，不用4x节流冒充实机 |

Module25–35正式职责表当前未发现；工作包和编号待映射，见UI_IMPLEMENTATION_PLAN。没有改写既定编号或自动开始开发。
