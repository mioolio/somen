# 微信原生工作进程

边界：选中工作微信后，独立持久子进程读取当前联系人，并将文字和普通图片限定到一个已验证联系人。仅 Windows x64，具体版本放在 `../versions/<version>/`，继续使用精确 DLL 散列与原生入口代码校验。

`native-runtime.mjs` 导出异步 `createNativeRuntime({binding,onEvent})`。binding 包含 `pid`、`startedAt`、`accountId`、`version`；账号来自扫描器本次已验证结果。返回 `contacts()`、`bindTarget({id,displayName})`、`sendText({requestId,content})`、`sendImage({requestId,path})`、`status()`、`dispose()`。

联系人仅是当前已加载缓存，`complete:false`，不宣称完整通讯录。绑定目标必须来自此缓存的个人联系人，运行代次内不允许改成另一个目标；新账号或新联系人需要新运行代次。

文字和图片原生 ABI 从用户提供的 WXcc 4.2 参考实现提取，拆为独立上下文、请求校验、文字、图片及 RPC 导出文件。当前精确二进制的文字/图片入口已由参考项目在 2026-10-25 实机验证；SOMEN 的测试结果另记开发日志。没有导入旧宿主、自动聊天、模型、数据库或密钥读取。

每个版本目录独立包含 manifest、身份配置、agents 和静态证据。`agent-sources.mjs` 按版本 manifest 声明的片段读取，无通用硬编码偏移或版本列表。`staticAbiVerified` 是离线结构比对，`nativeValidation` 是实机验证记录，不能互相替代。未启用的新版能力不会自动加载到微信进程。删除或放回版本目录会在下一次新建运行时生效。

`createNativeRuntime` 的 `allowValidation` 默认 false。仅本机工程流程显式传 true 时，允许对应 `staticAbiVerified` 为 true 的功能进行第一次受控验证，并记录 `native.validation-mode` 事件；不会改写 `nativeValidation`。该开关不来自 HTTP 请求，测试仍受选定 PID、账号与唯一联系人绑定约束。

发送接受不等于服务器送达。调用方须在提交前记录持久请求账本，原生内部也检查请求 ID 重复。任何超时或未知结果都禁止盲目重发。日志事件只包含操作类型、请求 ID、状态和故障分类，不包含账号、联系人或正文。

读取、发送的 native callbacks 可能在函数返回后仍由微信持有。2026-10-30 联系人首次验证后，按队列计数归零卸载曾发生微信访问冲突崩溃；计数不能证明所有 C++ vtable/回调引用已销毁。`dispose()` 因此只停止业务操作，返回 `retained:true`，绝不主动卸载脚本或 detach。独立子进程与脚本保持到微信进程自然退出；父宿主异常断开也不卸载、不强杀、不自动重启微信。此更正仍需恢复微信后进行持续稳定性实测，不能把代码修改当作已经证明根因。

普通图片发送明确不是 type 47 表情包发送。当前原生能力 `sticker`、`emojiSearch`、`emojiAdd` 均为 false，不能将 GIF 图片发送伪装成表情能力。
