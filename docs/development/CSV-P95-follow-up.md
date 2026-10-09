# CSV P95 独立待修复事项

状态：OPEN。来源 Module 26，独立于 Module 27 工作区开发。

10000 × 32 CSV、1366×768、4× CPU 降速、索引完成后的滚动，P95 ≤33ms 未达标。证据：docs/qa/module-26/before-csv-profile.json、after-csv-profile.json、measurements.md。

后续需分析滚动渲染热点，以相同三轮各180帧轨迹复测；不能把布局读取减少视为总体达标。本轮保留原结果和冻结候选安装包，不重做全格式审计。
