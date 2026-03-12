# React TS Native Calculator

一个把前端体验和原生后端计算组合在一起的示例项目：

- 前端使用 `React + TypeScript`
- 后端使用 `C`
- 四则运算核心使用 `x86_64 Assembly`
- HTTP 服务由 C 程序直接提供

这个项目的目标不是做一个依赖复杂工程链的计算器，而是展示一条非常直接的全栈路径：

- 浏览器负责交互和视觉呈现
- React 负责状态管理和组件渲染
- TypeScript 负责前端代码约束
- C 负责 HTTP 接口和静态资源分发
- 汇编负责最底层的数学运算实现

---

## 项目预览

启动后访问：

```text
http://127.0.0.1:8080
```

你会得到一个带有现代化视觉风格的网页计算器，支持：

- 加法
- 减法
- 乘法
- 除法
- 百分比转换
- 正负号切换
- 删除和清空
- 最近计算历史展示
- 后端健康状态检测

---

## 技术栈

### 前端

- `React 18`
- `ReactDOM 18`
- `TypeScript (TSX)`
- `Babel Standalone`
- 纯 CSS 自定义界面

说明：

- 当前前端没有使用 `Vite`、`Webpack` 或 `npm` 构建流程
- 页面通过 CDN 加载 React 和 Babel
- `react-calculator.tsx` 在浏览器端直接转译并运行

这种方式适合做轻量演示和教学型项目，部署简单，结构也很直接。

### 后端

- `C`
- `Winsock2`
- 原生 HTTP 处理

后端职责：

- 提供网页入口
- 提供 CSS 和 TSX 静态资源
- 提供 `/health` 健康检查接口
- 提供 `/api/calc` 计算接口

### 汇编

- `x86_64 GNU Assembly`
- 使用 SSE2 双精度浮点指令

当前汇编实现了以下函数：

- `asm_add`
- `asm_sub`
- `asm_mul`
- `asm_div`

---

## 项目结构

```text
.
├─ react-calculator.html   # 前端 HTML 入口
├─ react-calculator.css    # 计算器页面样式
├─ react-calculator.tsx    # React + TypeScript 前端逻辑
├─ calc_server.c           # C HTTP 服务
├─ calc_ops.S              # 汇编运算模块
├─ index.html              # 仓库中原有前端练习文件
├─ script.js               # 仓库中原有前端练习文件
├─ styles.css              # 仓库中原有前端练习文件
└─ js-unsafe.html          # 仓库中原有前端练习文件
```

核心实现集中在前五个文件中。

---

## 系统架构

整体调用链如下：

```text
浏览器
  -> React TSX 页面
  -> fetch /api/calc
  -> C HTTP 服务
  -> 汇编函数
  -> 返回 JSON
  -> React 更新显示结果
```

更具体一点：

1. 用户在网页上点击数字和运算符
2. React 组件维护当前输入值、运算状态、显示文本和历史记录
3. 当用户点击 `=` 或连续运算时，前端调用 `/api/calc`
4. `calc_server.c` 解析查询参数 `op`、`a`、`b`
5. C 程序根据运算类型调用对应的汇编函数
6. 汇编函数返回结果给 C
7. C 将结果格式化为 JSON 响应
8. 前端拿到结果后刷新显示区域和历史记录

---

## API 设计

### 1. 健康检查

请求：

```http
GET /health
```

返回示例：

```json
{"ok":true,"service":"calc_server"}
```

用途：

- 前端启动时检测后端是否在线
- 页面右上角会据此显示当前后端状态

### 2. 计算接口

请求格式：

```http
GET /api/calc?op=add&a=12&b=30
```

参数说明：

- `op`：运算类型，可选值为 `add`、`sub`、`mul`、`div`
- `a`：左操作数
- `b`：右操作数

成功返回示例：

```json
{"ok":true,"result":42,"resultText":"42"}
```

失败返回示例：

```json
{"ok":false,"error":"Division by zero"}
```

---

## 前端实现说明

前端核心文件是 `react-calculator.tsx`。

主要状态包括：

- `display`：当前显示值
- `storedValue`：已暂存的左操作数
- `pendingOperation`：当前待执行运算
- `replaceDisplay`：下一次输入是否覆盖当前显示
- `history`：最近计算历史
- `apiStatus`：后端在线状态
- `notice`：界面提示信息

前端行为特性：

- 首次加载会调用 `/health`
- 输入数字时支持小数点控制
- 支持百分比换算
- 支持正负号切换
- 支持删除一位和清空全部
- 连续点击运算符时会自动触发上一轮运算
- 计算结果会记录到历史列表中

界面设计上采用了：

- 深色渐变背景
- 半透明玻璃感面板
- 橙红色高亮操作键
- 大号数字显示区
- 移动端自适应布局

---

## 后端实现说明

后端核心文件是 `calc_server.c`。

后端没有依赖第三方 Web 框架，而是直接使用 `Winsock2`：

- `socket`
- `bind`
- `listen`
- `accept`
- `recv`
- `send`

已实现能力：

- 基础 HTTP 响应头拼装
- 静态文件读取和返回
- 路由分发
- 简单查询字符串解析
- JSON 错误返回
- 除零保护
- 非有限结果保护

当前路由：

- `/`
- `/index.html`
- `/react-calculator.css`
- `/react-calculator.tsx`
- `/health`
- `/api/calc`

---

## 汇编实现说明

汇编文件为 `calc_ops.S`，采用 GNU 汇编语法。

示例：

```asm
.globl asm_add
asm_add:
    addsd xmm0, xmm1
    ret
```

设计思路：

- `xmm0` 存放第一个双精度参数
- `xmm1` 存放第二个双精度参数
- 运算后结果返回到 `xmm0`

这样 C 层只需要声明函数原型即可直接调用。

---

## 本地运行环境

当前项目已在以下环境思路下实现：

- 操作系统：`Windows x64`
- Shell：`PowerShell`
- 编译器：`MinGW-w64 GCC`

如果你本机有 `gcc`，可以直接编译运行。

---

## 编译与运行

### 1. 编译

在项目根目录执行：

```powershell
gcc calc_server.c calc_ops.S -lws2_32 -o calc_server.exe
```

### 2. 启动

```powershell
.\calc_server.exe
```

如果你想在后台启动：

```powershell
cmd /c start "" /b calc_server.exe
```

### 3. 访问页面

```text
http://127.0.0.1:8080
```

---

## 手动测试接口

### 健康检查

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8080/health" -UseBasicParsing
```

### 乘法示例

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8080/api/calc?op=mul&a=12&b=3.5" -UseBasicParsing
```

预期结果：

```json
{"ok":true,"result":42,"resultText":"42"}
```

---

## 已知限制

当前版本是一个非常直接的原型实现，也保留了一些明确限制：

- 前端依赖 CDN，不适合离线生产部署
- 没有使用正式的打包工具链
- 后端 HTTP 解析是简化实现，不适合直接用于公网生产环境
- 目前只支持 `GET` 请求
- 计算能力仅限基础四则运算
- 汇编文件使用 GNU 语法，不适用于 `MSVC + ml64`

如果你使用的是 `MSVC` 工具链，需要将 `calc_ops.S` 改写为 `MASM` 版本。

---

## 后续可扩展方向

如果继续完善，这个项目可以沿着下面几个方向升级：

- 改造成 `Vite + React + TypeScript` 标准工程
- 将前端静态资源构建后再由 C 服务托管
- 增加键盘输入支持
- 增加科学计算功能
- 使用 `POST + JSON` 替代查询字符串
- 增加单元测试和接口测试
- 支持 Linux 下的 socket 实现
- 同时提供 GNU ASM 和 MASM 两套汇编版本

---

## 适合谁看

这个项目比较适合以下场景：

- 想同时练前端和底层编程的人
- 想理解浏览器到原生后端的完整调用链的人
- 想把 `React`、`C`、`Assembly` 串起来做一个直观作品的人
- 想做课程作业、演示项目或技术展示的人

---

## 许可

当前仓库未附带单独许可证文件。

如果后续需要公开分发，建议补充一个明确的开源许可证，例如 `MIT`。
