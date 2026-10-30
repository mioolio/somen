# 工作微信跟踪

边界：跟踪用户选择的微信进程与账号、保存本地选择、记录运行诊断；不读取联系人或发送消息。

`createWorkspaceMonitor({ scan, directory, intervalMs, onState })` 的 `scan()` 必须返回本次新扫描的规范化快照 `{ instances }`，不能注入旧缓存。默认每 10 秒检查一次，前一检查未完成时不会重叠。

- `await select({ pid, startedAt, accountId })`：重新扫描并核对三项身份，原生创建时间保留全部精度。成功后写本地配置，开始跟踪。
- `getState()`：返回独立快照，包含 `status`、`selected`、`canSend`、`reason`、`lastCheckedAt`、`logStatus`。
- `await checkNow()`：发送前应调用并要求 `status === 'active' && canSend`；收件人授权由发送模块另行验证。
- `await restore()`：读取本地选择，仅在 PID、原生创建时间和账号全部一致时恢复；不会把相同账号的新 PID 自动选为工作微信。
- `trackChild(child, operation)`：监听原生桥接子进程，返回移除监听函数；异常退出立即撤销工作能力，正常请求完成仅记日志。
- `recordEvent(type, details)`：仅接受固定事件名与允许的诊断字段，不传入消息、联系人或原始响应。
- `captureEventScope()`：创建运行组件时捕获不可变的会话引用与选择代次，随后始终传给 `recordEvent(type, details, scope)`。旧组件迟到事件按原会话记录；旧代次写日志失败不会暂停新工作会话，同一微信重新选择也按代次隔离。
- `await stop()`：停止跟踪和工作能力，持久化停止意图。
- `await dispose()`：释放当前宿主资源，保留原选择供重启时重新核对。

状态为 `idle / active / interrupted / stopped`。进程退出、创建时间变化、账号改变、身份不可确认、扫描失败或原生组件异常都会进入 `interrupted`；随后即使账号重新出现，也必须显式重新选择。`interrupted` 仍继续只读轮询，以收集原生组件出错后微信延迟退出及 WER 迟到记录；事件按签名去重，发送能力始终关闭。只有 stop/dispose 结束轮询。进程暂不可见只记录“退出或不可见”，不推断崩溃原因。

本地数据默认放在 `.local/wechat/`，已由仓库忽略规则排除。`workspace.json` 包含用户明确选中的身份，不含联系人与聊天内容。`monitor.jsonl` 及轮转文件仅保留事件、错误代码、数值、匿名会话 HMAC 和源文件行号，最多 5 个、每个约 1 MiB。账号、正文、原始错误消息、命令行和机器路径不写入诊断日志。

宿主使用 `uncaughtExceptionMonitor` 与同步退出日志观察异常，不吞掉 Node 原本的异常/退出行为。原生子进程由 `trackChild` 观察，其监听绑定当前选择代次，不会因旧组件的迟到退出而撤销新工作会话。

检测到工作进程丢失或替换时，`crash-events.mjs` 通过固定的 Windows PowerShell 脚本只读查询该应用启动后的 Application Error 1000 / WER 1001 事件。1000 要求应用名、PID、可用时的创建时间匹配；1001 未提供 PID 时只关联已匹配 1000 的 ReportId，不能凭同名微信归因。对外仅保留 `eventId / code / time / faultModule`，模块只取 basename。查询有 8 秒上限且不读取原始事件消息、用户名或机器路径；无匹配时仍只说明进程退出或不可见。

轮询和系统事件有助于定位异常，不保证捕获强制断电、系统强杀或系统未暴露的崩溃详情。本模块不更改 Windows 设置，也不配置转储。
