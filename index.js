// Incompetech music source for MyGo Music.
// Data and MP3s come DIRECTLY from https://incompetech.com/.
// Copyright Kevin MacLeod; music is licensed under CC BY 4.0 (attribution required).

const BASE = "https://incompetech.com/music/royalty-free/";
const CATALOG_URL = `${BASE}pieces.json`;
const GENRE_URL = `${BASE}genre.json`;
const COLLECTION_URL = `${BASE}collections.json`;
const MP3_BASE = `${BASE}mp3-royaltyfree/`;
const TTL_MS = 24 * 60 * 60 * 1000;
const COVER_TTL_MS = 30 * TTL_MS;
const MISSING_COVER_TTL_MS = 7 * TTL_MS;
const MB_INTERVAL_MS = 1300;
const APPLE_CACHE_KEY = "incompetechAppleArtworkV1";
const APPLE_ID_PREFIX = "apple:";
const APPLE_LOOKUP_BATCH = 50;
const APPLE_LOOKUP_WAIT_MS = 4500;
// MusicBrainz requires an identifiable User-Agent; see its API guidelines.
const MUSICBRAINZ_AGENT = "mygo-music-incompetech/0.2.2 (https://github.com/Jimmyzzt/mygo-music-incompetech)";
const PAGE_SIZE = 40;
const ARTIST = { id: "kevin-macleod", name: "Kevin MacLeod" };
const ARTIST_NAME = "Kevin MacLeod";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

const POPULAR_TITLES = [
  "Monkeys Spinning Monkeys", "Sneaky Snitch", "Carefree",
  "Fluffing a Duck", "Investigations", "Scheming Weasel",
  "Cipher", "Local Forecast", "Wallpaper", "Merry Go",
];

let catalog = null;
let pending = null;
let coverQueue = Promise.resolve();
let coverNextRequestAt = 0;
const coverInFlight = new Map();
const appleInFlight = new Map();

// MusicBrainz has a one-request-per-second policy. We only resolve actual
// named releases on demand; Incompetech collection names are not necessarily
// the titles of commercially released albums.
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function limitedMusicBrainzJSON(url) {
  const task = coverQueue.then(async () => {
    const delay = coverNextRequestAt - Date.now();
    if (delay > 0) await pause(delay);
    coverNextRequestAt = Date.now() + MB_INTERVAL_MS;
    return getJSON(url, { headers: { "User-Agent": MUSICBRAINZ_AGENT } });
  });
  coverQueue = task.catch(() => {});
  return task;
}

function cleanAlbumName(value) {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function hasKevinMacLeod(release) {
  return (release["artist-credit"] || []).some((credit) => {
    if (!credit || typeof credit !== "object") return false;
    const name = credit.artist?.name || credit.name || "";
    return cleanAlbumName(name) === cleanAlbumName(ARTIST_NAME);
  });
}

function readCoverCache() {
  const value = host.storage.get("incompetechCoversV2");
  return value && typeof value === "object" ? value : {};
}

async function lookUpAlbumCover(albumName) {
  // Query only exact release titles and the correct artist: never attach an
  // unrelated cover to a broad genre/category pseudo-album.
  const search = `releasegroup:"${albumName.replace(/["\\]/g, " ")}" AND artist:"${ARTIST_NAME}"`;
  const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(search)}&fmt=json&limit=8`;
  const response = await limitedMusicBrainzJSON(url);
  const release = (response["release-groups"] || []).find((item) =>
    item?.id && hasKevinMacLeod(item) && cleanAlbumName(item.title) === cleanAlbumName(albumName)
  );
  if (!release) return null;

  // Check that a front cover actually exists; an MBID alone is not enough.
  const archiveUrl = `https://coverartarchive.org/release-group/${encodeURIComponent(release.id)}`;
  let archive;
  try {
    archive = await getJSON(archiveUrl);
  } catch (error) {
    // Missing cover: negative cache. Temporary network errors: retry later.
    if (String(error).includes("HTTP 404")) return null;
    throw error;
  }
  const hasFront = Array.isArray(archive.images) && archive.images.some((item) => item.front && item.approved !== false);
  if (!hasFront) return null;
  return `https://coverartarchive.org/release-group/${release.id}/front-250`;
}

async function coverForAlbum(album) {
  if (!album || !album.id || album.id.startsWith("genre:") || !album.name) return null;
  if (album.imageUrl) return album.imageUrl;
  const cache = readCoverCache();
  const old = cache[album.id];
  if (old && Date.now() - old.at < (old.url ? COVER_TTL_MS : MISSING_COVER_TTL_MS)) {
    if (old.url) album.imageUrl = old.url;
    return old.url || null;
  }
  if (coverInFlight.has(album.id)) return coverInFlight.get(album.id);
  const job = (async () => {
    try {
      const url = await lookUpAlbumCover(album.name);
      const saved = readCoverCache();
      saved[album.id] = { url, at: Date.now() };
      host.storage.set("incompetechCoversV2", saved);
      if (url) album.imageUrl = url;
      return url;
    } catch (_error) {
      // Best-effort metadata enrichment must never prevent music playback.
      return null;
    }
  })();
  coverInFlight.set(album.id, job);
  try { return await job; }
  finally { coverInFlight.delete(album.id); }
}


// The official Incompetech catalog points many recordings to their exact
// Apple Music/iTunes release. These are real *release* IDs, unlike Incompetech's
// own "collections", which are mostly themes such as "African" or "Action".
function appleReleaseId(link) {
  if (!link || typeof link !== "string") return null;
  try {
    const u = new URL(link);
    if (!(["music.apple.com", "itunes.apple.com"].includes(u.hostname))) return null;
    const match = u.pathname.match(/\/album\/.*\/(?:id)?(\d+)\/?$/);
    return match ? match[1] : null;
  } catch { return null; }
}

function readAppleCache() {
  const value = host.storage.get(APPLE_CACHE_KEY);
  return value && typeof value === "object" ? value : {};
}

function freshAppleRecord(value) {
  return value && Number.isFinite(value.at) && Date.now() - value.at <
    (value.url ? COVER_TTL_MS : MISSING_COVER_TTL_MS);
}

// An external album is only attached to tracks that Incompetech itself
// explicitly links to this release. Never use one artwork for an unrelated
// Incompetech thematic collection containing many different albums.
function applyAppleRecord(c, id, record) {
  if (!record?.url || !record.name || !c.appleTracks.has(id)) return;
  let album = c.appleAlbums.get(id);
  if (!album) {
    album = { id: APPLE_ID_PREFIX + id, name: record.name, artists: [ARTIST] };
    c.appleAlbums.set(id, album);
  }
  album.name = record.name;
  album.imageUrl = record.url;
  for (const track of c.appleTracks.get(id)) track.album = album;
}

// Resolve up to 50 OFFICIAL release IDs in a single iTunes Lookup API call,
// with no fuzzy name search. Apple only supplies artwork metadata; MP3 audio
// always streams directly from Incompetech. Album covers themselves are only
// fetched by MyGo when they appear on screen.
async function fetchAppleRecords(c, ids) {
  const url = `https://itunes.apple.com/lookup?id=${ids.join(",")}&country=us`;
  try {
    const body = await getJSON(url);
    const found = new Map();
    for (const item of Array.isArray(body.results) ? body.results : []) {
      const id = String(item.collectionId ?? "");
      if (!ids.includes(id) || item.wrapperType !== "collection") continue;
      if (cleanAlbumName(item.artistName) !== cleanAlbumName(ARTIST_NAME)) continue;
      const artwork = item.artworkUrl600 || item.artworkUrl100;
      if (typeof artwork !== "string" || !artwork.startsWith("https://")) continue;
      if (!item.collectionName) continue;
      found.set(id, { url: artwork, name: item.collectionName, at: Date.now() });
    }
    const store = readAppleCache();
    for (const id of ids) {
      // Genuine missing IDs get a short negative TTL. Network failures are not
      // negative cached. This whole batch is only written to storage once.
      const record = found.get(id) || { url: null, at: Date.now() };
      store[id] = record;
      applyAppleRecord(c, id, record);
    }
    host.storage.set(APPLE_CACHE_KEY, store);
  } catch (_error) {
    // Artwork is optional; unreachable services must not block playback.
  }
}

async function artworkForTracks(c, tracks) {
  const ids = [...new Set(tracks.map((t) => c.rawById.get(t.id)?.appleReleaseId).filter(Boolean))];
  if (!ids.length) return;
  const store = readAppleCache();
  const missing = [];
  for (const id of ids) {
    if (freshAppleRecord(store[id])) applyAppleRecord(c, id, store[id]);
    else missing.push(id);
  }
  // Deduplicate concurrent searches, Home and album page requests.
  for (let i = 0; i < missing.length; i += APPLE_LOOKUP_BATCH) {
    const group = missing.slice(i, i + APPLE_LOOKUP_BATCH).filter((id) => !appleInFlight.has(id));
    if (!group.length) continue;
    const task = fetchAppleRecords(c, group);
    for (const id of group) appleInFlight.set(id, task);
    task.finally(() => { for (const id of group) if (appleInFlight.get(id) === task) appleInFlight.delete(id); });
  }
  const jobs = [...new Set(missing.map((id) => appleInFlight.get(id)).filter(Boolean))];
  if (!jobs.length) return;
  // Don't hold up the user's Home/search page indefinitely on a blocked API.
  await Promise.race([
    Promise.all(jobs),
    pause(APPLE_LOOKUP_WAIT_MS),
  ]);
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function getJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

function timeInMs(value) {
  if (typeof value === "number") return Math.max(0, value * 1000);
  const parts = String(value || "").split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
}

function normalize(s) {
  return String(s ?? "").normalize("NFKC").toLowerCase().trim();
}

function pageOf(items, offset = 0) {
  const start = Math.max(0, Number(offset) || 0);
  return { items: items.slice(start, start + PAGE_SIZE), more: start + PAGE_SIZE < items.length };
}

function sourceUrl(isrc) {
  return isrc ? `${BASE}music.html?isrc=${encodeURIComponent(isrc)}` : `${BASE}music.html`;
}

function filenameToURL(filename) {
  if (typeof filename !== "string" || !filename.trim()) return null;
  // Encode the filename as a path segment, not as a URL supplied by a third party.
  return MP3_BASE + encodeURIComponent(filename.trim());
}

function toCatalog(pieces, genres, collections) {
  if (!Array.isArray(pieces)) throw new Error("Unexpected Incompetech catalog format");
  const genreById = new Map((Array.isArray(genres) ? genres : []).map((x) => [String(x.id), String(x.genre || "")]));
  const collectionById = new Map();
  for (const c of Array.isArray(collections) ? collections : []) {
    const obj = { id: String(c.code || c.id), name: String(c.collection_name || "Collection") };
    if (c.id != null) collectionById.set(String(c.id), obj);
    if (c.code != null) collectionById.set(String(c.code), obj);
  }

  const rawById = new Map();
  const tracks = [];
  const albumTracks = new Map();
  const albums = new Map();
  const appleTracks = new Map();
  const appleAlbums = new Map();
  const moods = new Set();
  const genresFound = new Map();

  for (const p of pieces) {
    if (!p || !p.title || !filenameToURL(p.filename)) continue;
    const id = String(p.isrc || p.uuid || p.filename);
    const genreId = String(p.genre ?? "");
    const genreName = genreById.get(genreId) || (genreId && !/^\d+$/.test(genreId) ? genreId : "Other");
    const collection = collectionById.get(String(p.collection ?? ""));
    const collectionId = collection ? collection.id : `genre:${genreId}`;
    let album = albums.get(collectionId);
    if (!album) {
      album = {
        id: collectionId,
        name: collection ? collection.name : genreName,
        artists: [ARTIST],
      };
      albums.set(album.id, album);
    }
    const feel = String(p.feel || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const f of feel) moods.add(f);
    genresFound.set(genreId, genreName);
    const description = String(p.description || "");
    const track = {
      id,
      name: String(p.title),
      artists: [ARTIST],
      album,
      duration: timeInMs(p.length),
      url: sourceUrl(p.isrc),
      description: `${description}\n\nMusic: Kevin MacLeod (incompetech.com) — CC BY 4.0: ${LICENSE_URL}`.trim(),
    };
    tracks.push(track);
    const appleId = appleReleaseId(p.itunes);
    rawById.set(id, { ...p, appleReleaseId: appleId, genreName, feel });
    if (appleId) {
      if (!appleTracks.has(appleId)) appleTracks.set(appleId, []);
      appleTracks.get(appleId).push(track);
    }
    if (!albumTracks.has(album.id)) albumTracks.set(album.id, []);
    albumTracks.get(album.id).push(track);
  }
  // Cached artwork is applied without network requests on every catalog load.
  const cachedCovers = readCoverCache();
  for (const album of albums.values()) {
    const record = cachedCovers[album.id];
    if (record?.url && Date.now() - record.at < COVER_TTL_MS) album.imageUrl = record.url;
  }
  const cachedApple = readAppleCache();
  const c = { appleTracks, appleAlbums };
  for (const [id, record] of Object.entries(cachedApple)) {
    if (freshAppleRecord(record)) applyAppleRecord(c, id, record);
  }
  const byTitle = [...tracks].sort((a, b) => a.name.localeCompare(b.name));
  const recent = [...tracks].sort((a, b) => {
    const x = rawById.get(a.id)?.uploaded || "";
    const y = rawById.get(b.id)?.uploaded || "";
    return y.localeCompare(x);
  });
  return {
    tracks, byTitle, recent, rawById, albumTracks, appleTracks, appleAlbums, albums: [...albums.values()],
    genres: [...genresFound].filter(([id]) => id !== "").sort((a, b) => a[1].localeCompare(b[1])),
    moods: [...moods].sort((a, b) => a.localeCompare(b)),
  };
}

async function loadCatalog() {
  if (catalog) return catalog;
  if (pending) return pending;
  pending = (async () => {
    const cached = host.storage.get("incompetechCatalogV1");
    let data;
    if (cached && Date.now() - cached.savedAt < TTL_MS) data = cached;
    else {
      try {
        const [pieces, genres, collections] = await Promise.all([
          getJSON(CATALOG_URL), getJSON(GENRE_URL), getJSON(COLLECTION_URL),
        ]);
        data = { pieces, genres, collections, savedAt: Date.now() };
        host.storage.set("incompetechCatalogV1", data);
      } catch (error) {
        if (!cached?.pieces) throw error;
        data = cached; // Continue to work from the last good catalog if offline.
      }
    }
    catalog = toCatalog(data.pieces, data.genres, data.collections);
    return catalog;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}

function score(track, raw, q) {
  const t = normalize(track.name);
  if (t === q) return 100;
  if (t.startsWith(q)) return 70;
  if (t.includes(q)) return 55;
  if (normalize(raw.genreName).includes(q)) return 35;
  if (raw.feel.some((feel) => normalize(feel).includes(q))) return 30;
  if (normalize(raw.instruments).includes(q)) return 25;
  if (normalize(track.album.name).includes(q)) return 20;
  if (normalize(raw.description).includes(q)) return 10;
  return 0;
}

export async function search({ query = "", kind = "tracks", offset = 0 } = {}) {
  const c = await loadCatalog();
  const q = normalize(query);
  if (kind === "tracks") {
    if (!q) return { tracks: [], more: false };
    const matches = c.tracks.map((track) => ({ track, rank: score(track, c.rawById.get(track.id), q) }))
      .filter((x) => x.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.track.name.localeCompare(b.track.name))
      .map((x) => x.track);
    const page = pageOf(matches, offset);
    await artworkForTracks(c, page.items);
    return { tracks: page.items, more: page.more };
  }
  if (kind === "albums") {
    const matches = c.albums.filter((x) => normalize(x.name).includes(q));
    const page = pageOf(q ? matches : [], offset);
    return { albums: page.items, more: page.more };
  }
  if (kind === "artists") {
    return { artists: (Number(offset) || 0) === 0 && normalize(ARTIST_NAME).includes(q) ? [ARTIST] : [], more: false };
  }
  return { [kind]: [], more: false };
}

export async function suggest({ query = "" } = {}) {
  const c = await loadCatalog();
  const q = normalize(query);
  if (!q) return [];
  return c.tracks.filter((t) => normalize(t.name).startsWith(q)).slice(0, 8).map((t) => t.name);
}

export async function home() {
  const c = await loadCatalog();
  const curated = POPULAR_TITLES.map((name) => c.tracks.find((t) => normalize(t.name) === normalize(name))).filter(Boolean);
  await artworkForTracks(c, [...curated, ...c.recent.slice(0, 20)]);
  return {
    title: "Incompetech · Kevin MacLeod",
    subtitle: "Royalty-free soundtrack catalog. Reuse requires attribution (CC BY 4.0).",
    sections: [
      { title: "Familiar favorites", tracks: curated },
      { title: "Recent additions", tracks: c.recent.slice(0, 20) },
      { title: "Browse", links: [
        { title: "Genres", subtitle: "Classical, soundtrack, jazz, electronica…", page: "genres" },
        { title: "Moods", subtitle: "Epic, humorous, calm, mysterious…", page: "moods" },
        { title: "Music credits and license", subtitle: "How to credit music in a video or project", page: "credits" },
      ] },
    ],
  };
}

export async function browse({ page = "" } = {}) {
  const c = await loadCatalog();
  if (page === "genres") {
    return { title: "Genres", sections: [{ title: "Browse by genre", links: c.genres.map(([id, name]) => ({ title: name, page: `genre:${encodeURIComponent(id)}` })) }] };
  }
  if (page === "moods") {
    return { title: "Moods", sections: [{ title: "Browse by mood", links: c.moods.map((mood) => ({ title: mood, page: `mood:${encodeURIComponent(mood)}` })) }] };
  }
  if (page === "credits") {
    return {
      title: "Credits · CC BY 4.0",
      subtitle: "For reuse in videos, games and podcasts, credit the track and Kevin MacLeod.",
      sections: [{ title: "License and official website", links: [
        { title: "Incompetech licensing", subtitle: "Copy attribution text for specific tracks from the official site", url: `${BASE}licenses/` },
        { title: "Creative Commons Attribution 4.0", subtitle: "Attribution conditions", url: LICENSE_URL },
      ] }],
    };
  }
  if (page.startsWith("genre:")) {
    const id = decodeURIComponent(page.slice(6));
    const name = c.genres.find(([n]) => n === id)?.[1];
    if (!name) throw fail("unavailable", "Unknown genre");
    const tracks = c.byTitle.filter((t) => String(c.rawById.get(t.id)?.genre ?? "") === id);
    await artworkForTracks(c, tracks.slice(0, 60));
    return { title: name, sections: [{ title: `${tracks.length} tracks`, tracks }] };
  }
  if (page.startsWith("mood:")) {
    const mood = decodeURIComponent(page.slice(5));
    const tracks = c.byTitle.filter((t) => c.rawById.get(t.id)?.feel.some((x) => normalize(x) === normalize(mood)));
    if (!tracks.length) throw fail("unavailable", "Unknown mood");
    await artworkForTracks(c, tracks.slice(0, 60));
    return { title: mood, sections: [{ title: `${tracks.length} tracks`, tracks }] };
  }
  throw fail("unavailable", "No such page");
}

export async function album({ id }) {
  const c = await loadCatalog();
  if (id.startsWith(APPLE_ID_PREFIX)) {
    const appleId = id.slice(APPLE_ID_PREFIX.length);
    const tracks = c.appleTracks.get(appleId);
    if (!tracks?.length) throw fail("unavailable", "No such album");
    await artworkForTracks(c, tracks.slice(0, 1));
    return { album: c.appleAlbums.get(appleId) || tracks[0].album, tracks };
  }
  const album = c.albums.find((a) => a.id === id);
  if (!album) throw fail("unavailable", "No such album");
  await coverForAlbum(album);
  await artworkForTracks(c, (c.albumTracks.get(id) || []).slice(0, 40));
  return { album, tracks: c.albumTracks.get(id) || [] };
}

export async function artist({ id }) {
  if (id !== ARTIST.id) throw fail("unavailable", "No such artist");
  const c = await loadCatalog();
  await artworkForTracks(c, c.recent.slice(0, 50));
  return { artist: ARTIST, tracks: c.recent.slice(0, 100), albums: c.albums };
}

export async function stream({ id } = {}) {
  const c = await loadCatalog();
  const info = c.rawById.get(String(id));
  if (!info) throw fail("unavailable", "This track is no longer in the Incompetech catalog");
  const url = filenameToURL(info.filename);
  if (!url) throw fail("unavailable", "No audio file for this track");
  return { url, type: "mp3" };
}
