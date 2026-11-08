# Incompetech for MyGo Music

[English](README.md)

在 [MyGo Music](https://github.com/egoist/mygo-music) 中播放 [Kevin MacLeod / Incompetech](https://incompetech.com/) 的免版税配乐，支持曲风、情绪、合集浏览和可选的专辑封面。

本插件为非官方独立项目，与 Kevin MacLeod 或 Incompetech 无隶属或背书关系。

## 安装

[在 MyGo Music 中安装](mygo-music://install-plugin?repo=Jimmyzzt/mygo-music-incompetech)

或者在 **设置 → 插件 → + → 从 GitHub 安装** 中粘贴[仓库地址](https://github.com/Jimmyzzt/mygo-music-incompetech)。

无需账号、API Key 或额外程序。

## 功能

- 搜索歌曲、合集和艺人，按曲风与情绪浏览。
- 浏览近期上架和精选作品。
- 直接播放 Incompetech 官方 MP3。
- 优先利用 Incompetech 官方提供的 Apple Music 链接获取真实发行封面；合集页面仍可尝试 MusicBrainz / Cover Art Archive 精确匹配。
- 使用 MyGo Music 自带的歌曲缓存。

部分合集没有匹配的封面。暂不支持账号登录、同步收藏、歌词、无损音频及付费 WAV 下载。

## 数据来源与缓存

插件从 Incompetech 的[官方机器可读曲库](https://incompetech.com/agent-section/)获取音频直链，并将官方给出的 Apple Music 发行 ID 批量交给 iTunes Lookup API 查询封面。Incompetech 的主题合集不一定是正式专辑，部分歌曲仍可能没有封面。曲库元数据通过 `host.storage` 缓存 **24 小时**；封面匹配结果缓存 **30 天**，未匹配结果缓存 **7 天**。

歌曲和封面图片的缓存由 MyGo Music 负责；本仓库不打包或二次分发任何音频及封面图片。

## 授权与署名

音乐受版权保护，通常采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可，**并非公共领域作品**。使用前请查阅[官方 FAQ](https://incompetech.com/music/royalty-free/faq.html)及具体曲目的授权条款。署名示例：

```text
"[歌曲标题]" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
```

插件源码采用 [MIT 许可证](LICENSE)；第三方专辑封面可能适用不同的版权条款。

## 开发

插件使用原生 JavaScript，无需构建。运行 `npm test` 可执行模拟接口测试。

本环境尚未完成真实 API 与 MyGo Music 客户端播放的端到端验证，欢迎提交 Issue。
