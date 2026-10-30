# 微信原生工作进程

边界：选中工作微信后，独立持久子进程读取当前联系人，并将文字和普通图片限定到一个已验证联系人。仅 Windows x64，具体版本放在 `../versions/<version>/`，继续使用精确 DLL 散列与原生入口代码校验。

`native-runtime.mjs` 导出异步 `createNativeRuntime({binding,onEvent})`。binding 包含 `pid`、`startedAt`、`accountId`、`version`；账号来自扫描器本次已验证结果。返回 `contacts()`、`bindTarget({id,displayName})`、`sendText({requestId,content})`、`sendImage({requestId,path})`、`status()`、`dispose()`。

联系人仅是当前已加载缓存，`complete:false`，不宣称完整通讯录。绑定目标必须来自此缓存的个人联系人，运行代次内不允许改成另一个目标；新账号或新联系人需要新运行代次。

文字和图片原生 ABI 从用户提供的 WXcc 4.2 参考实现提取，拆为独立上下文、请求校验、文字、图片及 RPC 导出文件。当前精确二进制的文字/图片入口已由参考项目在 2026-10-25 实机验证；SOMEN 的测试结果另记开发日志。没有导入旧宿主、自动聊天、模型、数据库或密钥读取。

每个版本目录独立包含 manifest、身份配置、agents 和静态证据。`agent-sources.mjs` 按版本 manifest 声明的片段读取，无通用硬编码偏移或版本列表。`staticAbiVerified` 是离线结构比对，`nativeValidation` 是实机验证记录，不能互相替代。未启用的新版能力不会自动加载到微信进程。删除或放回版本目录会在下一次新建运行时生效。

`createNativeRuntime` 的 `allowValidation` 默认 false。仅本机工程流程显式传 true 时，允许对应 `staticAbiVerified` 为 true 的功能进行第一次受控验证，并记录 `native.validation-mode` 事件；不会改写 `nativeValidation`。该开关不来自 HTTP 请求，测试仍受选定 PID、账号与唯一联系人绑定约束。

发送接受不等于服务器送达。调用方须在提交前记录持久请求账本，原生内部也检查请求 ID 重复。任何超时或未知结果都禁止盲目重发。日志事件只包含操作类型、请求 ID、状态和故障分类，不包含账号、联系人或正文。

读取、发送的 native callbacks 可能在函数返回后仍由微信持有。2026-10-30 联系人首次验证后，按队列计数归零卸载曾发生微信访问冲突崩溃；计数不能证明所有 C++ vtable/回调引用已销毁。`dispose()` 因此只停止业务操作，返回 `retained:true`，绝不主动卸载脚本或 detach。独立子进程与脚本保持到微信进程自然退出；父宿主异常断开也不卸载、不强杀、不自动重启微信。此更正仍需恢复微信后进行持续稳定性实测，不能把代码修改当作已经证明根因。

父宿主退出后的另一次故障定位到 `frida-agent.dll_unloaded`：只保留 JS 变量或 Frida 监听器不能保证 Node 事件循环继续运行。`worker-host.mjs` 使用明确的 referenced interval 保活，fork 设置 detached/windowsHide；IPC 断开后继续保留原生所有权。stdout/stderr 管道关闭和未处理 JS 故障均进入保留/停止业务状态，不能自然退出释放回调机器码。真实无 Frida 进程回归覆盖：杀掉父进程、IPC 断开、向已关闭父管道写诊断后，stub 子进程仍活；仅模拟目标 process-terminated 后退出。

`native-session.mjs` 与 `observer-session.mjs` 各有模块级 residentOwners Set，attach 后立即保留 session，createScript 后在 load/start 前保留脚本。工厂失败也不释放引用。只有明确 `process-terminated` 才移除 registry；连接断开、device-lost、application-requested 等均不证明目标已死，`dispose()` 仍返回 retained。模拟回归覆盖工厂抛错及各种非终止 detach。

独立的 `observe-stickers.mjs <pid>` 为工程观察入口，只读取面板已经绑定的同 PID/创建时间/账号/唯一联系人；观察器也通过 referenced worker-host 保活。只挂接已静态确认和前缀匹配的函数，不调用未知 native 方法，不触发发送。日志在忽略目录 `.local/wechat/sticker-observation.jsonl`，只记受限结构与匹配标志，不输出账号、联系人、正文、AES key 或令牌。

采样控制文件 `.local/wechat/sticker-observer-control.json` 仅接受 revision、durationMs 和 hook 名称。hook 地址及前缀只从当前版本已审阅的 observer-hooks.json 读取；控制文件不能提供任意路径或地址。durationMs 为 0 且 hooks 为空数组可暂停采样，仍保留所有 callback 代码与 worker，不卸载探针。当前实际 type 47 发送、收藏和在线搜索 API 尚未完成，capability 保持 false。

普通图片发送明确不是 type 47 表情包发送。当前原生能力 `sticker`、`emojiSearch`、`emojiAdd` 均为 false，不能将 GIF 图片发送伪装成表情能力。
