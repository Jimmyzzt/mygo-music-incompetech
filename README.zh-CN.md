# Incompetech for MyGo Music

[English](README.md)

为 [MyGo Music](https://github.com/egoist/mygo-music) 添加 [Kevin MacLeod / Incompetech](https://incompetech.com/) 免费署名授权配乐音源。支持曲库搜索、流派和情绪筛选、合集浏览，以及按需匹配真实发行专辑封面。

本插件是非官方独立项目，与 Kevin MacLeod 或 Incompetech 无隶属或背书关系。

## 安装

直接使用 MyGo Music 安装链接：

[mygo-music://install-plugin?repo=Jimmyzzt/mygo-music-incompetech](mygo-music://install-plugin?repo=Jimmyzzt/mygo-music-incompetech)

或者打开 **MyGo Music → 设置 → 插件 → + → 从 GitHub 安装**，粘贴仓库地址：

<https://github.com/Jimmyzzt/mygo-music-incompetech>

无需登录、API Key、外部程序或自建服务器。插件需要访问 `incompetech.com` 获取曲库与 MP3，另外访问 `musicbrainz.org`、`coverartarchive.org` 以尝试匹配专辑封面。

也可以在 [Releases](https://github.com/Jimmyzzt/mygo-music-incompetech/releases) 发布后下载插件 ZIP，使用 **设置 → 插件 → + → 从 ZIP 安装**；ZIP 根目录应包含 `plugin.json`、`index.js`。

## 功能

- 按歌曲标题、描述、曲风、情绪、乐器搜索；支持搜索合集、艺人。
- 浏览音乐流派、情绪标签、合集、近期上架作品和经典热门作品。
- 直接从 Incompetech 官方服务器播放 MP3；插件不托管、不内置音频。
- 仅在专辑名称和 Kevin MacLeod 艺人信息准确匹配时，使用 MusicBrainz / Cover Art Archive 提供的**真实发行封面**。
- 使用 MyGo 自带的歌曲缓存；已缓存的曲库索引可在临时断网时回退使用。

暂不支持账号登录、跨平台同步收藏、歌词、无损音频及付费 WAV 下载。部分 Incompetech 内部合集并非正式发行专辑，因此会显示 MyGo 的默认封面，这是有意避免错误匹配。

## 工作原理

插件从 Incompetech [官方机器可读目录](https://incompetech.com/agent-section/)获取 `pieces.json`、`genre.json` 和 `collections.json`，并向播放器提供 `mp3-royaltyfree/` 直链。

仅在打开具体合集页面时，才查询 MusicBrainz 的准确同名发行记录，并向 Cover Art Archive 查询正面封面。**仓库不打包也不二次分发任何封面图片**；图片由 MyGo 播放器自行按需加载。音乐许可并不自动适用于第三方封面。

## 缓存

- **音频文件**：由 MyGo Music 统一管理，受播放器歌曲缓存容量设置控制。
- **封面图片**：由 MyGo 自身在内存中缓存；插件不保存图片二进制文件。
- **曲库索引**：存放在插件 `host.storage` 中，跨插件启动使用 24 小时有效期；刷新失败时回退到最后一次成功的索引。
- **封面匹配元数据**：保存 URL 或「未找到」状态，成功结果缓存 **30 天**，未匹配结果缓存 **7 天**；临时网络错误不会被记为「未找到」。

MyGo 设置里的「清除缓存」当前仅清除歌曲文件，并不会清除插件 `host.storage`。重新启动或更新插件后会依据 TTL 刷新过期的元数据。

## Windows / mihomo 代理

MyGo 使用的 Go 网络客户端不一定自动读取 Windows「系统代理」设置。如果访问 Incompetech 很慢，可以彻底退出 MyGo，再使用 PowerShell 设置 HTTP/Mixed 代理并启动（请替换端口和程序路径）：

```powershell
$env:HTTP_PROXY  = 'http://127.0.0.1:7890'
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
& 'C:\Path\To\MyGo Music.exe'
```

环境变量仅作用于当前 PowerShell 及其启动的子进程；也可以使用正确配置的 TUN 模式。插件网络权限是域名白名单，并非代理配置。

## 版权与署名

Kevin MacLeod 的作品**不是公共领域音乐**。Incompetech 官方目录说明使用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可；在视频、游戏、播客等作品中使用时，应按许可规定署名。请查看[官方 FAQ](https://incompetech.com/music/royalty-free/faq.html)及单曲页面的授权要求。

署名示例（替换歌曲名）：

```text
"[歌曲标题]" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
```

**插件源代码**采用 [MIT 许可证](LICENSE)，这不会改变音频、第三方元数据和专辑封面的授权。仓库不包含任何音频或专辑封面文件。

## 开发

插件本身无需编译，也没有运行时外部依赖。`plugin.json` 和 `index.js` 是主要插件文件；`package.json` 只负责本地测试：

```bash
npm test
```

目前测试基于模拟曲库及封面 API；**尚未在此环境完成真实 Incompetech 接口连通性、MyGo 桌面端播放的端到端验证**。欢迎提交 Issue 反馈问题。
