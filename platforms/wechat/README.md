# 微信平台插件

**仅支持 WINDOWS**，提供本机微信识别、工作账号与受限发送。

- 区分已确认客户端实例与底层辅助进程，支持多个独立主进程。
- 显示账号 ID、主 PID、关联 PID、版本、窗口、程序路径及识别依据。
- 手动刷新，按需开启每 15 秒自动刷新；页面不可见时暂停轮询。
- 无法确认的进程与账号保留可见，提示版本、访问权限或账号尚未就绪。

账号 ID 是微信内部账号标识（通常是 `wxid_...`），不等于昵称或用户自定义的微信号。本轮未读取昵称。

## 支持范围

| 客户端 | 进程识别 | 确认账号 ID |
| --- | --- | --- |
| Weixin 4.2.0.7 x64，匹配已验证 DLL 散列 | 支持 | 支持，只读当前账号指针 |
| Weixin 4.2.0.11 x64，匹配已验证 DLL 散列 | 支持 | 支持，独立身份偏移和代码校验 |
| 其他 Weixin 4.x / WeChat 3.x | 进程枚举及保守角色归类 | 待补充独立版本适配；可能显示未验证目录线索 |

客户端名称使用 `Weixin.exe` 和 `WeChat.exe`。辅助角色来自明确的 `--type` 参数；未知角色和失去父进程的辅助项单独保留，但不算已确认客户端。父子归组检查创建时间和程序路径，减少 PID 重用及不同安装混淆。

账号读取必须匹配精确版本及 DLL SHA-256，并检查当前账号 getter、对象类型、共享指针、字符串和两次读取一致性。不匹配即待识别，不尝试套用其他版本偏移。更多实现证据见 [native/README.md](native/README.md)。

## 模块职责

```text
manifest.json                 本插件身份与启用状态
server/register.mjs           本插件 API 注册
server/scan-service.mjs        请求合并、短期缓存、生命周期
server/normalize-snapshot.mjs  实例归组与账号证据判定
server/probe.mjs               Windows 子进程桥接、超时、取消
native/                       进程、只读账号和目录线索适配
panel/register.js             本插件前端注册
panel/routes.js               本插件独立路由
panel/pages/                  微信页面组合
panel/components/             单一职责界面组件
panel/api/                    请求协议
panel/composables/             页面状态与轮询
panel/styles/                 平台内部样式
panel/utils/                  只读格式化
```

移出整个目录或设置 manifest 的 `enabled: false` 后重启，宿主继续工作；放回后重启即可恢复。无需修改全局路由表。

## API

工作页 `/wechat/workspace` 支持选择工作实例、读取当前缓存联系人，以及向用户授权的唯一普通联系人发送文字/图片。原生接受不等于服务端确认，界面区分已提交与结果未知，不自动重发。`4.2.0.11` 内置表情目录按客户端真实资源解析，共 109 项，支持中文、英文和 token 本地搜索；不将普通 GIF 图片冒充 type 47 表情包。

版本文件在 `versions/<version>/`，每个版本独立目录并记录验证范围。`monitor/`、`runtime/`、`emoticons/` 分别管理跟踪、原生生命周期和内置表情资源。系统崩溃事件、宿主异常与工作进程退出会写入 `.local/wechat/monitor*.jsonl`；工作账号绑定 PID、创建时间及已确认身份，不自动换号。

`GET /api/wechat/instances` 返回本次扫描时间、耗时、底层进程数、实例项数、已确认实例数、已识别数、实例数组和诊断。`instanceCount` 包含待确认项，`confirmedInstanceCount` 才是确认主进程数量。身份候选保留证据与 `verified` 标记，只有确认身份才能出现在 `account`。

并发请求共用一次扫描，成功快照缓存 2 秒。扫描最多 20 秒，失败显式返回错误；插件停止取消扫描。结果仅在进程内存，不持久化。真实账号不会进入测试或提交。

## 环境

使用 Windows 自带 64 位 Windows PowerShell、.NET 和系统 API，无需安装 C++ 工具链。原生桥接由 `Add-Type` 在运行时加载，`npm run dev` 无需预先打包。如当前权限无法读取微信进程，展示待识别；程序不自动提权或更改系统设置。
