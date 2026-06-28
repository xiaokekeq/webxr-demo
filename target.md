对，你现在主要还在解决**配准问题**。但是你想要的“沉浸式透视效果”，其实是另一条线：

```text
配准线：模型放得准、不漂、不跟着手机跑
可视化线：模型透明、剖切、分层、标签跟随、人在里面走动时视角真实变化
```

你前面这段时间做的是第一条线。没有配准，后面的透视做出来也会像假贴图；但配准整理到现在这个程度，已经可以开始并行做**沉浸式透视最小版本**了。

---

## 你想要的效果靠什么实现？

你说的：

> 我能在虚拟模型里走动，而且模型不变动。

这个不是让模型跟人动，而是：

```text
模型固定在 AR local 世界里
WebXR camera 跟着手机真实移动
用户走动时 camera 变
模型不变
于是看到的角度、远近、内部结构自然变化
```

只要你的 `modelRoot.matrix` 放置后不再每帧重算，并且 WebXR 相机正常更新，就已经具备“人在模型里走”的基础。

现在你要加的是“透视表达”：

```text
1. 模型半透明
2. 堤坝结构分层
3. 剖切面
4. 标签跟随
5. 可选风险区 / 监测点
```

---

## 还要多久？

按你现在代码基础，如果只是做**类似图片那种原型效果**，不追求真实遮挡和复杂数据，大概可以这样排：

### 第 1 天：沉浸式透视 MVP

做出来：

```text
堤坝模型半透明
内部结构 / 分层对象可见
用户走动时模型固定不动
UI 可以切换“实景 / 透视 / 剖切”
```

这个是最关键的效果验证。

### 第 2 天：剖切和图层

做出来：

```text
横断面剖切
水平剖切
透明度滑条
堤顶 / 坝体 / 坝基 / 涵闸 / 监测点图层开关
```

### 第 3 天：标签和现场辅助核查感

做出来：

```text
堤顶、迎水坡、背水坡、坝基、涵闸标签
标签跟随 3D 点移动
点击对象显示属性
拍照 / 记录按钮可以先做假数据
```

所以如果目标是“老师一看就像那个图片的效果”，**2～3 天可以做出可展示版本**。
如果目标是“真实遮挡、Marker 自动精配准、数据联动都稳定”，那就是后续迭代，不是几天能完全稳的。

---

## 现在应该进入什么阶段？

你现在可以把任务拆成两条并行：

```text
A. 配准继续推进：Marker 识别 → Marker 校正 ENU→AR local
B. 可视化开始推进：堤坝结构透视 MVP
```

我建议你现在先做 B，因为你已经问到“沉浸式效果”了，而且这部分能快速看到成果。

---

## 下一步做什么？

下一步不要继续深挖 Marker。先做：

> **AR 透视显示控制器：透明 + 图层 + 剖切入口。**

先让模型像“透视结构体”，而不是普通 glb。

给 Codex 这个提示词：

```text
当前任务：实现堤坝 AR 沉浸式透视 MVP，不改变现有配准逻辑。

当前项目状态：
1. 模型真实米制放置已完成。
2. hit-test 只负责 groundY。
3. modelLocal → ENU 工程控制点层已稳定。
4. ENU → AR local 已显式建模为 ArFromEnuSolution。
5. ManualArSitePose 已明确表示手动 AR 场地位姿校正。
6. RegistrationPanel 已显示配准链路状态。
7. Marker 工程配置和 MarkerLocalization 求解器已完成。
8. 当前任务不要改配准、不要改 placement、不要改 marker 逻辑。

本次目标：
做一个“堤坝结构透视 MVP”，让用户进入 AR 后，模型固定在 AR 世界中，用户走动时可以从不同角度观察堤坝模型，并能切换透明透视和剖切显示。

请实现：

1. 新增可视化控制模块，建议：
src/load-model-ar/runtime/visualization/dike-immersive-visualization.ts

核心能力：
- 设置模型整体透明度
- 开启 / 关闭透视模式
- 开启 / 关闭剖切模式
- 设置剖切高度或剖切方向
- 遍历模型材质并保存原始材质状态，方便恢复

2. 支持三种显示模式：

mode = 'solid'
- 普通实体显示
- opacity = 1
- depthWrite = true

mode = 'xray'
- 半透明透视显示
- opacity 默认 0.25 ~ 0.4
- transparent = true
- depthWrite = false
- 保留 wireframe 或边线增强，如果现有模型支持

mode = 'section'
- 剖切显示
- 启用 renderer.localClippingEnabled = true
- 给模型材质添加 clippingPlanes
- 初版只做一个水平剖切面即可

3. 增加类型：

type DikeVisualizationMode = 'solid' | 'xray' | 'section';

interface DikeVisualizationState {
  mode: DikeVisualizationMode;
  opacity: number;
  sectionEnabled: boolean;
  sectionHeight: number;
}

4. 在 Three.js renderer 初始化处确保：
renderer.localClippingEnabled = true;

但不要影响非剖切模式。

5. 在现有 AR UI 或 RegistrationPanel 附近临时增加一个简单控制区：
- 实体
- 透视
- 剖切
- 透明度滑条
- 剖切高度滑条

如果已有面板结构更合适，可以新增 VisualizationPanel，不要大改现有 UI。

6. 用户走动时模型不动：
确认本次不在动画循环中改 modelRoot.position / rotation / scale。
只更新材质、剖切参数、标签等可视化状态。

7. 不要做：
- 不要改 coarse-registration.ts
- 不要改 engineering-registration.ts
- 不要改 placement/session.ts
- 不要改 MarkerLocalization
- 不要改 ArFromEnuSolution
- 不要接 AR.js
- 不要新增 hit-test 控制点配准
- 不要重新启用 fit-longest-edge / 0.9m
- 不要让 Y 轴重新叠加 GPS / ENU 垂向偏移
- 不要做真实遮挡 depth sensing
- 不要做复杂热力图
- 不要做复杂 UI 重构

8. 日志输出：
[DikeVisualization]
- mode
- opacity
- sectionEnabled
- sectionHeight
- affectedMaterialCount

9. 完成后运行：
npm run build

输出：
- 修改了哪些文件
- 新增了哪些类型 / 函数
- 如何切换 solid / xray / section
- 是否没有改变配准和 placement 行为
- build 是否通过
```

---

## 透视效果和配准的关系

你要记住这条：

```text
配准决定模型在哪里
透视决定模型怎么看
```

现在你已经把“在哪里”整理到了一个可控程度，所以可以开始做“怎么看”。

你最终展示效果应该是：

```text
进入 AR
→ 模型按工程坐标放到堤坝位置
→ 选择“透视模式”
→ 坝体变半透明，内部结构可见
→ 用户走动，WebXR camera 变化，模型固定不动
→ 选择“剖切模式”
→ 可看到坝体内部断面
```

这就是你之前那张图的核心效果。真实遮挡、Marker 自动校正、风险热区可以后面再加。
