# Incompetech for MyGo Music

[简体中文](README.zh-CN.md)

Browse and play [Kevin MacLeod](https://incompetech.com/)'s royalty-free music catalog in [MyGo Music](https://github.com/egoist/mygo-music). Search tracks, explore genres and moods, and discover collections with optional album artwork.

This is an independent, unofficial plugin. It is not affiliated with or endorsed by Kevin MacLeod or Incompetech.

## Install

Install using the deeplink:

[mygo-music://install-plugin?repo=Jimmyzzt/mygo-music-incompetech](mygo-music://install-plugin?repo=Jimmyzzt/mygo-music-incompetech)

Or paste this repository's URL into **MyGo Music → Settings → Plugins → + → Install from GitHub**:

<https://github.com/Jimmyzzt/mygo-music-incompetech>

No account, API key, external program, or separate server is required. The plugin needs network access to `incompetech.com` for the catalog and MP3 streams, plus `musicbrainz.org` and `coverartarchive.org` for optional album-cover lookups.

For local installation, download the plugin ZIP from [Releases](https://github.com/Jimmyzzt/mygo-music-incompetech/releases) (when available), or use **Settings → Plugins → + → Install from ZIP** with a ZIP containing `plugin.json` and `index.js` at its root.

## What works

- Search songs by title, description, genre, mood, and instruments; search collections and artists.
- Browse genres and moods, collections, recent additions, and featured tracks.
- Play MP3 audio directly from Incompetech; no audio is mirrored or shipped with the plugin.
- Display optional **real release artwork** when MusicBrainz and Cover Art Archive contain a confident exact-title match credited to Kevin MacLeod.
- Work with the player's own song cache and offline fallback to the last successfully fetched catalog.

Not supported: sign-in, synced favorites, lyrics, lossless streams, and paid WAV downloads. Some Incompetech collections do not have published cover art and will show MyGo's placeholder by design.

## How it works

The plugin reads Incompetech's [documented, machine-readable catalog](https://incompetech.com/agent-section/): `pieces.json`, `genre.json`, and `collections.json`. It gives MyGo direct `mp3-royaltyfree/` audio URLs for playback.

For album covers, it searches MusicBrainz **only when a collection's album page is opened**, checks an exact title and Kevin MacLeod artist credit, then checks whether Cover Art Archive has a front image. Images are fetched and displayed by MyGo; **this repository does not bundle or redistribute cover images**. Artwork may be copyrighted separately from the music.

## Caching

- **Audio:** managed by MyGo Music's song cache and its storage limit.
- **Artwork images:** managed in memory by MyGo Music; the plugin stores no image bytes.
- **Catalog metadata:** stored in plugin `host.storage` for up to 24 hours between plugin starts, with the last good catalog used when updating fails.
- **Artwork match metadata (URL or missing result):** stored in plugin `host.storage`; positive results last **30 days**, negative matches last **7 days**; transient HTTP errors are not stored as missing matches.

MyGo's **Clear the Cache** currently clears its song cache, not plugin storage. Restart or update the plugin to retry stale metadata according to the TTLs.

## Proxy on Windows

MyGo's Go network clients may not automatically follow the Windows **System Proxy** toggle. If the site is slow and you use mihomo, start MyGo from a PowerShell session with an HTTP or mixed proxy (replace the port and app path):

```powershell
$env:HTTP_PROXY  = 'http://127.0.0.1:7890'
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
& 'C:\Path\To\MyGo Music.exe'
```

These variables apply only to that PowerShell session and its child processes. An alternative is an appropriately configured TUN mode. The plugin's network allowlist is **not** a proxy setting.

## Copyright and attribution

Kevin MacLeod's compositions are **copyrighted, not public domain**. The Incompetech catalog documents a [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license requiring appropriate attribution when you reuse a track in videos, games, podcasts, or other projects. See the [official FAQ](https://incompetech.com/music/royalty-free/faq.html) and the individual track page for exact terms and credit text.

Example attribution (replace the placeholder):

```text
"[Track Title]" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
```

The plugin **source code** is licensed under [MIT](LICENSE). This does **not** change the licenses of the music, external metadata, or third-party cover art. No music files or cover artwork are included in the source repository.

## Development

No build step or runtime dependencies are required for MyGo. `plugin.json` and `index.js` are the plugin; `package.json` is only for local tests.

```bash
npm test
```

The tests mock the external catalogs and cover APIs. **Live Incompetech responses and end-to-end playback inside the MyGo desktop app have not yet been verified in this environment.** Bug reports and corrections are welcome.
