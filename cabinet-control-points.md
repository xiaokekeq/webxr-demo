# 三层抽屉柜 — 手工标定控制点数据

> 采集日期：2026-06-25
> 采集方式：卷尺手工测量
> 单位：厘米 (cm)
> 模型坐标系：原点 = 柜前左下角贴地处，X=宽(左→右)，Y=高(地→顶)，Z=深(前→后)

---

## 一、实物尺寸

| 符号 | 含义 | 测量值 (cm) |
|------|------|:----------:|
| W | 柜子总宽度（左→右） | 42 |
| D | 柜子总深度（前→后） | 50 |
| H | 柜子总高度（地面→顶面） | 58 |
| h₁ | 最上层抽屉把手离地高度 | 53 |
| h₂ | 中层抽屉把手离地高度 | 39 |
| h₃ | 最下层抽屉把手离地高度 | 18 |

---

## 二、三维坐标系示意图

```
                     Y (上)
                     ↑
                     │
                     │  ┌─────────────┐
                     │  │   抽屉 1    │  ← h₁=53
                     │  │─────────────│
                     │  │   抽屉 2    │  ← h₂=39
                     │  │─────────────│
                     │  │   抽屉 3    │  ← h₃=18
                     │  │             │
    CP_BASE_FL ──────┴──└─────────────┘──→ X (宽, 0→42)
    (原点 0,0,0)                    CP_BASE_FR (42,0,0)

                     Z (深, 0→50) 指向柜子背面
```

---

## 三、13 个控制点清单

### 8 个角点 — 几何最精确，优先使用

| ID | 在实物上的位置 | 用手摸哪里 | X | Y | Z |
|----|---------------|-----------|:--:|:--:|:--:|
| `CP_BASE_FL` | 前面左下角（**原点**） | 柜前贴地最左边尖角 | 0 | 0 | 0 |
| `CP_BASE_FR` | 前面右下角 | 柜前贴地最右边尖角 | 42 | 0 | 0 |
| `CP_BASE_BL` | 后面左下角 | 柜后贴地最左边尖角 | 0 | 0 | 50 |
| `CP_BASE_BR` | 后面右下角 | 柜后贴地最右边尖角 | 42 | 0 | 50 |
| `CP_TOP_FL` | 顶面前左角 | 柜顶离你最近、最左的角 | 0 | 58 | 0 |
| `CP_TOP_FR` | 顶面前右角 | 柜顶离你最近、最右的角 | 42 | 58 | 0 |
| `CP_TOP_BL` | 顶面后左角 | 柜顶离你最远、最左的角 | 0 | 58 | 50 |
| `CP_TOP_BR` | 顶面后右角 | 柜顶离你最远、最右的角 | 42 | 58 | 50 |

### 1 个面中心点

| ID | 在实物上的位置 | 描述 | X | Y | Z |
|----|---------------|------|:--:|:--:|:--:|
| `CP_TOP_CTR` | 顶面正中心 | 柜顶平面的几何中心 | 21 | 58 | 25 |

### 3 个抽屉把手 — 最显眼的视觉特征

| ID | 把手位置 | 描述 | X | Y | Z |
|----|---------|------|:--:|:--:|:--:|
| `CP_DRAWER_1` | 上层把手 | 最上层抽屉拉手正中心 | 21 | 53 | 0 |
| `CP_DRAWER_2` | 中层把手 | 中间抽屉拉手正中心 | 21 | 39 | 0 |
| `CP_DRAWER_3` | 下层把手 | 最下层抽屉拉手正中心 | 21 | 18 | 0 |

### 1 个棱边中点

| ID | 在实物上的位置 | 描述 | X | Y | Z |
|----|---------------|------|:--:|:--:|:--:|
| `CP_EDGE_L` | 左侧棱中点 | 柜子左侧边缘正中间 | 0 | 29 | 25 |

---

## 四、模型配置文件 (`cabinet.config.json`)

```json
{
  "modelId": "cabinet-3drawer-01",
  "siteFrame": {
    "origin": { "lat": 0, "lon": 0, "alt": 0 },
    "axes": "enu"
  },
  "anchor": { "lat": 0, "lon": 0, "alt": 0 },
  "yaw": 0,
  "scale": 0.01,
  "registration": {
    "mode": "similarity",
    "minControlPoints": 4
  },
  "controlPoints": {
    "CP_BASE_FL":   { "modelLocal": { "x": 0,  "y": 0,  "z": 0  } },
    "CP_BASE_FR":   { "modelLocal": { "x": 42, "y": 0,  "z": 0  } },
    "CP_BASE_BL":   { "modelLocal": { "x": 0,  "y": 0,  "z": 50 } },
    "CP_BASE_BR":   { "modelLocal": { "x": 42, "y": 0,  "z": 50 } },
    "CP_TOP_FL":    { "modelLocal": { "x": 0,  "y": 58, "z": 0  } },
    "CP_TOP_FR":    { "modelLocal": { "x": 42, "y": 58, "z": 0  } },
    "CP_TOP_BL":    { "modelLocal": { "x": 0,  "y": 58, "z": 50 } },
    "CP_TOP_BR":    { "modelLocal": { "x": 42, "y": 58, "z": 50 } },
    "CP_TOP_CTR":   { "modelLocal": { "x": 21, "y": 58, "z": 25 } },
    "CP_DRAWER_1":  { "modelLocal": { "x": 21, "y": 53, "z": 0  } },
    "CP_DRAWER_2":  { "modelLocal": { "x": 21, "y": 39, "z": 0  } },
    "CP_DRAWER_3":  { "modelLocal": { "x": 21, "y": 18, "z": 0  } },
    "CP_EDGE_L":    { "modelLocal": { "x": 0,  "y": 29, "z": 25 } }
  }
}
```

> `scale: 0.01` 将厘米转为米（Three.js 单位是米）。模型 42×50×58cm → 场景中 0.42×0.50×0.58m。

---

## 五、模型目录条目（追加到 `models.json`）

```json
{
  "id": "cabinet-3drawer-01",
  "name": "三层抽屉柜（手工标定）",
  "modelUrl": "/pipe-viewer/cabinet-3drawer.glb",
  "configUrl": "/pipe-viewer/cabinet.config.json",
  "pipesUrl": "/pipe-viewer/cabinet-pipes.json"
}
```

---

## 六、构件属性数据 (`cabinet-pipes.json`)

```json
{
  "pipes": [
    {
      "name": "cabinet-body",
      "type": "cabinet-body",
      "diameter": "42×50×58cm",
      "material": "wood",
      "depth": "58cm（顶面）",
      "status": "normal",
      "remark": "三层抽屉柜主体框架"
    },
    {
      "name": "drawer-1",
      "type": "drawer",
      "diameter": "把手高度 53cm",
      "material": "wood",
      "depth": "顶层",
      "status": "normal",
      "remark": "最上层抽屉，把手位于前面板正中"
    },
    {
      "name": "drawer-2",
      "type": "drawer",
      "diameter": "把手高度 39cm",
      "material": "wood",
      "depth": "中层",
      "status": "normal",
      "remark": "中间层抽屉，把手位于前面板正中"
    },
    {
      "name": "drawer-3",
      "type": "drawer",
      "diameter": "把手高度 18cm",
      "material": "wood",
      "depth": "底层",
      "status": "normal",
      "remark": "最下层抽屉，把手位于前面板正中"
    }
  ]
}
```

---

## 七、Blender 建模指南（5 分钟）

### 参数速查

| 部件 | 形状 | 尺寸 (cm) | 位置 |
|------|------|-----------|------|
| 柜体 | Cube | 42 × 58 × 50 | 中心 (21, 29, 25) |
| 抽屉1前面板 | Cube | 40 × 15 × 1 | 前面偏上 |
| 抽屉2前面板 | Cube | 40 × 15 × 1 | 前面中间 |
| 抽屉3前面板 | Cube | 40 × 15 × 1 | 前面偏下 |
| 把手1 | Cylinder | 半径 0.5 × 长 8 | 抽屉1前面板正中，y=53 |
| 把手2 | Cylinder | 半径 0.5 × 长 8 | 抽屉2前面板正中，y=39 |
| 把手3 | Cylinder | 半径 0.5 × 长 8 | 抽屉3前面板正中，y=18 |

### 步骤

1. 删掉默认 Cube
2. `Add → Mesh → Cube`：尺寸 42×58×50，位置 (21, 29, 25) → **柜体**
3. `Add → Mesh → Cube`：尺寸 40×15×1，分别放到 y=50, y=35, y=14 位置 → **三块抽屉面板**
4. `Add → Mesh → Cylinder`：半径 0.5，长度 8，X 轴旋转 90°，放到 y=53, y=39, y=18 位置 → **三根把手**
5. 全选 → `Object → Join` (Ctrl+J)
6. `File → Export → glTF 2.0 (.glb)` → 命名 `cabinet-3drawer.glb`
7. 放到 `public/pipe-viewer/` 目录下

---

## 八、精度评估

| 指标 | 值 |
|------|-----|
| 测量工具 | 卷尺 |
| 测量精度 | ±2mm（估计） |
| 控制点数 | 13 |
| 建议最少使用 | 4 点（Horn 方法下限） |
| 推荐使用 | 6-8 点（角点优先，把手作为校验） |
| 单位换算 | 厘米 → 米：×0.01 (`scale: 0.01`) |
