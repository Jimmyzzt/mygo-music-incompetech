# Incompetech for MyGo Music

[简体中文](README.zh-CN.md)

Play [Kevin MacLeod](https://incompetech.com/)'s royalty-free music in [MyGo Music](https://github.com/egoist/mygo-music). Browse genres, moods, and collections, with optional album artwork.

This is an unofficial plugin, not affiliated with or endorsed by Kevin MacLeod or Incompetech.

## Install

[Install in MyGo Music](mygo-music://install-plugin?repo=Jimmyzzt/mygo-music-incompetech)

Or paste the [GitHub repository URL](https://github.com/Jimmyzzt/mygo-music-incompetech) into **Settings → Plugins → + → Install from GitHub**.

No account, API key, or extra program is needed.

## Features

- Search tracks, collections, and artists; explore genres and moods.
- Browse recent additions and featured music.
- Stream MP3 directly from Incompetech.
- Show album covers when an exact Kevin MacLeod release match is available through MusicBrainz / Cover Art Archive.
- Use MyGo Music's built-in song cache.

Some collections have no matching cover art. Sign-in, synced favorites, lyrics, lossless streams, and paid WAV downloads are not supported.

## Sources and caching

The plugin reads Incompetech's [machine-readable catalog](https://incompetech.com/agent-section/) and uses official MP3 URLs. It caches catalog metadata for **24 hours** and cover-match results for **30 days** (or **7 days** when no match is found) using `host.storage`.

MyGo Music handles song and artwork caching. No audio or cover images are bundled or redistributed by this repository.

## License and attribution

The music is copyrighted and generally provided under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), **not** in the public domain. Check the [official FAQ](https://incompetech.com/music/royalty-free/faq.html) and individual track terms before reuse. Example credit:

```text
"[Track Title]" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
```

Plugin source code is [MIT-licensed](LICENSE). Third-party cover artwork may have separate rights.

## Development

The plugin uses plain JavaScript with no build step. Run the mocked API tests with `npm test`.

Live API responses and playback inside MyGo Music have not been verified end-to-end in this environment. Bug reports are welcome.
