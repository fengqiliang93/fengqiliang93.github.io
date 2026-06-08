---
title: "OpenClaw Local Chrome Bridge：把远端 Agent 接到你的本机 Chrome"
date: 2026-06-08T16:00:00+08:00
draft: false
tags: ["OpenClaw", "AI Agent", "Browser Automation", "Chrome", "Windows"]
categories: ["技术"]
description: "一个 Windows 便携桥接器：让远端 OpenClaw Agent 通过本机 Chrome 执行浏览器任务，复用登录态、cookie 和缓存，同时保持明确的安全边界。"
---

最近我做了一个小工具：[openclaw-browser-bridge-portable](https://github.com/fengqiliang93/openclaw-browser-bridge-portable)。

它解决的是一个很具体、但在 Agent 自动化里非常常见的问题：Agent 跑在远端环境里，浏览器却需要使用我本机 Chrome 里的登录态。

很多浏览器任务并不是“打开一个公开网页然后抓内容”这么简单。真实场景里，经常会遇到企业后台、内网页面、扫码登录、短信验证、设备信任、证书环境、缓存上下文等问题。远端容器浏览器很干净，也很可控，但它没有我的本机登录态；让它重新登录，又会把原本应该自动化的任务重新拖回人工流程。

OpenClaw Local Chrome Bridge 的目标就是让这件事变得直接一点：远端 OpenClaw Agent 仍然运行在远端，浏览器动作则通过一个本机 Windows 便携程序路由到本机 Chrome。

## 它是什么

OpenClaw Local Chrome Bridge 是一个 Windows 便携桥接器。用户不需要在本机安装完整 OpenClaw，也不需要安装 Node.js 或全局 npm 包，只要运行发布包里的 `OpenClawLocalChromeBridge.exe`，就可以把本机 Chrome 注册成 OpenClaw Gateway 上的一个 browser-capable node。

Agent 侧只需要明确使用：

```text
profile="user", target="node"
```

浏览器工具就会通过 Gateway 转发到本机 Chrome，而不是使用远端默认无头浏览器。

整体链路大致是：

```text
OpenClaw Agent
  -> browser tool: profile="user", target="node"
  -> OpenClaw Gateway
  -> local Windows bridge node
  -> Chrome DevTools Protocol 127.0.0.1:9222
  -> 本机 Chrome 专用 Profile
```

这样做之后，Agent 可以操作的是“你已经登录过的那个浏览器环境”，而不是一个没有上下文的临时浏览器。

## 为什么需要它

远端 Agent 默认使用容器或远端无头浏览器，在开放网页上很好用。但一进入真实工作流，问题就会冒出来：

- 目标网站只在本机 Chrome 里登录过。
- 访问后台系统需要扫码、短信验证码或设备信任。
- 内网页面、公司证书、网络策略只在本机环境里可用。
- 浏览器缓存和 cookie 是任务上下文的一部分。
- 切换多个 OpenClaw 测试实例时，节点批准和 capability 状态容易混乱。

这个项目的核心价值不是“再启动一个浏览器”，而是把本机浏览器作为一个受控能力接入远端 Agent。换句话说，它让 Agent 终于能在合适的时候使用你身边的浏览器。

## 便携化设计

我把本机侧体验尽量压缩成几个动作：

1. 下载或复制 `OpenClawLocalChromeBridge.exe`。
2. 双击打开 GUI。
3. 填写 Gateway Host、Port 和 Token。
4. 点击 `Launch Chrome` 启动专用桥接 Chrome Profile。
5. 点击 `Start Bridge`，等待状态变成 Ready。
6. 在 Agent 提示词里要求使用 `profile="user"`、`target="node"`。

这个 EXE 内置了运行所需的 Node.js、OpenClaw CLI、桥接脚本和 Agent 侧 skill。运行时数据放在用户本机应用数据目录下，项目本身保持便携，不要求污染系统环境。

GUI 也不是一个装饰壳，它承担了很多排障工作：

- 显示 WebSocket URL、Control UI URL、Chrome CDP 状态和 token 指纹。
- 显示当前实例目录和日志尾部。
- 可以一键启动桥接 Chrome。
- 可以运行脱敏诊断。
- 可以打开 Control UI 完成批准。
- 可以判断当前是否真正 Ready，而不是只看进程有没有启动。

## Chrome 136+ 后的处理

Chrome 136+ 对默认用户目录开启远程调试做了限制。直接给日常 Chrome 主 Profile 加 `--remote-debugging-port=9222`，可能会出现进程参数看起来正确，但 `127.0.0.1:9222` 实际不可用的情况。

所以这个项目推荐使用专用桥接 Chrome Profile。

第一次使用时，你在这个专用窗口里登录目标网站；之后 Agent 的浏览器任务会复用这个 Profile 的 cookie 和 cache。这样既保留了登录态，又避免把日常主浏览器 Profile 直接暴露给自动化流程。

## Gateway 侧的关键配置

为了让 Gateway 能识别并路由本机浏览器节点，需要启用 browser 能力，并允许节点命令 `browser.proxy`。推荐的核心配置是：

```json5
{
  browser: {
    enabled: true
  },
  plugins: {
    entries: {
      "admin-http-rpc": { enabled: true }
    }
  },
  gateway: {
    nodes: {
      browser: { mode: "auto" },
      allowCommands: ["browser.proxy"],
      denyCommands: [
        "system.run.prepare",
        "system.run",
        "system.which",
        "dir.fetch",
        "dir.list",
        "file.fetch",
        "file.write"
      ]
    }
  }
}
```

这里有几个设计取舍：

- Gateway 可以继续使用 token auth，不需要切到 password auth。
- `admin-http-rpc` 是显式启用的受控管理通道，用来让桥接器检查和批准 browser capability。
- 只允许 `browser.proxy`，并显式拒绝 system/file 类命令，避免把本机节点变成通用远程命令执行入口。
- `gateway.nodes.browser.mode="auto"` 可以让 Gateway 自动选择已连接且具备 browser capability 的节点。

## 最容易误判的 Ready 状态

OpenClaw 这里有两层批准：

- `device.pair`：批准这台本机设备可以接入 Gateway。
- `node.pair`：批准这个 node 声明的浏览器能力，也就是 `caps=["browser"]` 和 `commands=["browser.proxy"]`。

很多时候用户会在 Control UI 里看到节点已经 `connected=true`、`paired=true`，但 Agent 仍然报：

```text
No connected browser-capable nodes
```

这个状态通常不是 token 或端口问题，而是 node capability 还没真正批准。可用状态必须同时满足：

```text
node connected
caps includes browser
commands includes browser.proxy
Chrome CDP reachable
```

因此 GUI 里的 Ready 不是“进程已启动”的同义词，而是“Agent 真的可以把浏览器任务路由到本机 Chrome”的同义词。

## 安全边界

这个项目的定位很明确：它是浏览器可见页面自动化桥接器，不是本机万能代理。

默认安全边界包括：

- Chrome DevTools 端口只绑定 `127.0.0.1:9222`。
- 不应把 CDP 暴露到 `0.0.0.0` 或公网。
- 日志和诊断只输出 token fingerprint，不输出完整 token。
- 不读取、不输出 cookie、localStorage、sessionStorage、认证 header 等敏感数据。
- Gateway 侧只允许 `browser.proxy`，拒绝 system/file 类节点命令。
- 推荐使用专用桥接 Chrome Profile，而不是日常主浏览器 Profile。

我希望这个工具解决的是“远端 Agent 需要操作本机已登录网页”的问题，而不是扩大本机攻击面。

## 适合谁用

它适合这些场景：

- 你在使用 OpenClaw Agent，并且 Agent 跑在远端。
- 你希望 Agent 操作本机 Chrome 已登录的网站。
- 目标系统需要扫码、短信、设备信任或本机网络环境。
- 你不想在 Windows 本机安装完整 OpenClaw 和 Node.js。
- 你经常切换 OpenClaw 测试实例，希望少填参数、少手动批准、少排障。

它不适合这些场景：

- 只抓取公开网页，不需要本机登录态。
- 需要读取浏览器里的 cookie、token 或认证 header。
- 想把本机 Chrome DevTools 端口暴露给公网。
- 想让远端 Agent 在本机执行任意系统命令。

## 快速开始

项目地址：

[https://github.com/fengqiliang93/openclaw-browser-bridge-portable](https://github.com/fengqiliang93/openclaw-browser-bridge-portable)

本地使用流程：

1. 准备 Windows 10/11 x64 和 Google Chrome。
2. 获取发布包 `OpenClawLocalChromeBridge.exe`。
3. 双击启动 GUI。
4. 填写当前 OpenClaw Gateway 的 Host、Port 和 Token。
5. 点击 `Launch Chrome`，在专用 Chrome Profile 里登录目标网站。
6. 点击 `Start Bridge`。
7. 如果 Control UI 出现批准请求，完成 device 和 browser capability 批准。
8. 等 GUI 显示 Ready。
9. 在 Agent 中明确要求：

```text
请使用 browser 工具，要求：profile="user"，target="node"。打开目标网站并完成后续任务。
```

## 后续计划

这个项目目前的重点是把 Windows 本机 Chrome 桥接体验打磨稳定，尤其是实例切换、token mismatch、capability pending、Chrome 136+ Profile 限制这些容易让人卡住的细节。

后续我会继续围绕三件事迭代：

- 更清晰的 GUI 状态提示，让用户一眼知道卡在 Gateway、Chrome 还是批准流程。
- 更低噪声的自动诊断，让问题能被定位，而不是把用户丢进日志里。
- 更稳的发布包流程，让桥接器真正成为一个“复制、双击、连接”的小工具。

如果你也在做远端 Agent、本机浏览器自动化、OpenClaw Gateway 或需要复用本机登录态的工作流，欢迎试试这个项目，也欢迎在 GitHub 上提 issue 或建议。
