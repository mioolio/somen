# 4.2.0.11 表情结构研究

边界：安装 DLL 的离线证据，不是已验证的原生调用协议。没有执行未知 ABI，也没有读取账号密钥或聊天数据库。

## 已实现：内置表情目录

`emoji-resources.json` 记录 Qt RCC-v3 资源位置。Qt 资源初始化函数在 RVA `0x1175` 引用三张表：tree `0x87fc080`、names `0x87fab30`、data `0x86ee460`。

152 个资源文件中有 150 个 PNG 和两个 XML。`emojipanel-config.xml` 是当前面板的 109 项顺序；`newemoji-config.xml` 有 45 项 key、中文/英文名、文件名及 eggIndex。当前面板精确对应 69 项经典映射和 40 项新映射。

经典 token 表 RVA `0x98755f0`，中文名表 `0x98774f0`，英文名表 `0x9877840`，各有 105 个指针。初始化代码 `0x3e3d287` 按索引读取 token；`0x3e3d306` 将 index+1 传给 `expression_%1.png` 格式化。由此确定图片映射，不根据面板位置猜图片编号。

这些表情作为文本 token 属于 type 1，与收藏/搜索表情包的 type 47 分开。

## Qt 选择信号

本客户端的 Qt 元数据使用 24 字节 QByteArrayData 字符串项与 revision 8 方法表。

| 类型 | staticMetaObject | qt_static_metacall | 已确定信号 |
| --- | --- | --- | --- |
| `mmui::EmoticonContentView` | `0x915de08` | `0x8d6b00` | `SelectSearchEmoticon()`；`SelectEmoticon(std::shared_ptr<EmoticonWrap>, std::string talker)` |
| `mmui::EmoticonSearchPageBaseView` | `0x915e530` | `0x8d8af0` | `EmoticonPageSelectEmoticon(std::shared_ptr<EmoticonWrap>)` |
| `mmui::LocalEmoticonSearchPageContentView` | `0x915e560` | 无独立方法 | 继承上述搜索页信号 |
| `mmui::FavEmoticonItemView` | `0x915e1c0` | 无独立方法 | 继承 `ExpressionCollectItem` |
| `mmui::SearchEmoticonCollectItemView` | `0x915e1f0` | 无独立方法 | 继承 `ExpressionCollectItem` |

`EmoticonContentView` 的方法 0 `SelectSearchEmoticon()` 没有参数，仅表示打开搜索，不能当作实际表情发送事件。方法 1 是带 talker 的选择信号，方法 2 是省略 talker 的默认参数克隆。

Qt IndexOfMethod 分支精确比较出 `SelectEmoticon` emitter 为 RVA `0x8d71c0`，搜索页选择 emitter 为 `0x8d8bf0`。前者在 activate 返回后析构传入 shared_ptr 副本，不能把借用的存活对象直接当按值参数调用。

## 账号服务与收藏线索

安装 DLL 存在 `EmoticonManager`、`EmoticonService`，以及 `kFavEmoticonOrderTable`、`kCustomEmoticonOrderTable`、`kStoreEmoticonPackageTable`、`kStoreEmoticonFilesTable`、`kStoreEmoticonCaptionsTable`、`kNonStoreEmoticonTable`。

`EmoticonManager` 注册字符串引用位于 `0xed0d5c`。同一路径先调用当前账号 getter `0x47220`，然后调用 `0x384730` 获得账号 owner `+0x28/+0x30` 的 shared_ptr 组件上下文，再调用 `0x6f5f90` 查找或建立相应组件。后者可能建立对象，未经验证不可因“getter”名字就直接调用。

`EmoticonService` 注册路径在 `0xed86af` 调用 `0x45d10` 获取全局宿主，其虚表 `+0x60` 返回一个上下文，再经该上下文虚表 `+0x30` 取得组件注册容器。此处只确认注册路径，尚未据此建立可调用的收藏枚举或发送 ABI。

`kernel::service::EmoticonService::ClearSearchData` 的日志引用位于 `0x20f2c53`，附近构造任务并异步排队，不能直接按普通 C 函数猜参数。

当前账号存在 `db_storage/emoticon/emoticon.db` 及 WAL，主文件头不是明文 SQLite。本研究未解密。资源目录为空不能证明收藏列表为空。

## 在线搜索与排除项

安装 DLL 包含 `/cgi-bin/mmsearch-bin/emojichatsearch` 及 `EmoticonSearchInfo`、表情下载/上传/备份相关 protobuf 名称。仅发现字符串不代表已经掌握认证上下文、请求参数、回调线程或所有权，不据此自行调用搜索接口。

两处名为 `AddEmojiToFav` 的 Qt 元数据属于朋友圈类 `DetailCommentCollect` 与 `TimelineCommentCollect`，参数为 md5 字符串。它们不是已经验证的聊天右键收藏入口，不应混用。

## 本轮补充：MMUI 与共同底层

DLL 明确包含 `/cgi-bin/micromsg-bin/sendemoji`，字符串 RVA `0x9bdd230`。CGI 注册 XML 的 RVA 为 `0x9d79296`，其中请求编号为 68、响应编号为 1000000068、nettype 为 3。此证据确认存在独立表情发送协议，不能用 type 3 图片发送来替代。

该区域的共享对象分配路径在 `0x5c40f1d` 写控制块虚表 `0x9bdd258`，随后在 `0x5c40f32` 调用构造函数 `0x5c53060`。这里只记录关联代码，不据此宣称请求参数或所有权已经验证。

另一条 Qt 元数据来自 `mmui::ChatInputField`：staticMetaObject `0x91561d8`、方法表 `0x9156100`、qt_static_metacall `0x8bbfb0`。其方法名包含 `SendEmoticon`，声明参数名为 `kernel::EmoticonDataInfoPtr`。`mmui::EmoticonUIService` 的 staticMetaObject 为 `0x9167b30`，其本身没有独立 Qt 方法表，不能将类型名称当作可直接调用接口。

已有 Qt `SelectEmoticon` 连接在 `0x21261fd` 装配，并使用接收 lambda dispatcher `0x2129110`。dispatcher 只有 ECX=1 时才读取 R9 的参数数组；ECX=0 是 slot 对象析构，不能解析其 argv。正常调用中 argv[2] 是 talker 字符串，允许为空；捕获对象的当前聊天字符串位于 `+0x308`，长度 `+0x318`、容量 `+0x320`。后续 `0x21295c5` 经捕获对象 `+0x3e0` 的回调虚表 `+0x10` 转发表情与 talker。

本轮动态观察并未证明这些旧 Qt emitter 就是当前 MMUI 主窗口的实际发送路径。观察到 dispatcher 进入也必须先确认其操作码与选定收件人，不能据此采集或调用其他账号/会话对象。

本轮没有验证可复用的 type 47 发送、在线搜索或收藏添加 ABI，对应能力保持未完成。本轮界面测试停止后未再附加进程或执行未知原生调用。
