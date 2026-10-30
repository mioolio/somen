# 内置表情

边界：从当前工作微信安装目录只读解析官方客户端内置资源，不注入进程，不读取账号数据库，不执行发送。

`readBuiltinCatalog({ binding: { version, executablePath }, query })` 返回 `{ items, total, complete, source }`。调用方必须从已验证工作绑定传入版本和程序路径，不能将浏览器提供的路径直接转交。也可使用 `await createBuiltinCatalog(binding)` 后调用 `catalog.list(query)`。

仅支持已有独立配置的版本。目前为 4.2.0.11；DLL 的 SHA-256 必须与所属版本 manifest 一致。版本目录中的 `emoji-resources.json` 只保存 Qt 资源布局及文字映射位置，不包含官方 PNG 文件。

实机校验得到 109 个当前面板项，顺序来自客户端 XML。69 项使用客户端经典 token/中文/英文指针表与 index+1 图片编号；40 项使用新表情 XML 的精确 key、中文名和文件名。其他未出现在当前面板的历史资源不会冒充当前面板目录。

每项返回 `id / title / english / token / kind:'emoji' / previewUrl`。支持中文、英文和 token 的本地搜索。PNG 仅运行时从安装目录读取并转换为 data URL，不提交或发布微信素材。成功结果以内存缓存按安装文件大小和修改时间复用。

这些内置表情通过文字 token 发送属于正常 type 1 消息。收藏表情包属于独立的 type 47 能力，本模块不实现也不声称支持收藏表情发送或在线表情搜索。
