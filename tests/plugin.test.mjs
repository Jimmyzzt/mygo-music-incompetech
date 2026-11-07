import test from 'node:test';
import assert from 'node:assert/strict';

// MyGo provides `host` and `fetch`. The test uses tiny official-shaped fixtures,
// without needing network access, to validate the JavaScript plugin contract.
let store = {};
const calls = [];
const mbHeaders = [];
const fixtures = {
  pieces: [
    { title: 'Carefree', filename: 'Carefree.mp3', isrc: 'USUAN1100037', length: '00:03:25', genre: '25', collection: 'LE', feel: 'Calming, Relaxed', instruments: 'Piano', uploaded: '2025-01-01' },
    { title: 'Quirky Song', filename: 'Quirky Song.mp3', isrc: 'TEST2', length: '02:10', genre: '25', collection: 'LE', feel: 'Humorous', instruments: 'Piano', uploaded: '2024-01-01' },
    { title: 'Another Song', filename: 'Another Song.mp3', isrc: 'TEST3', length: '01:20', genre: '2', collection: 'NO', feel: 'Eerie', instruments: 'Violin', uploaded: '2023-01-01' },
  ],
  genres: [{ id: '25', genre: 'Electronica' }, { id: '2', genre: 'Soundtrack' }],
  collections: [{ code: 'LE', collection_name: 'Light Electronic' }, { code: 'NO', collection_name: 'No Cover Album' }],
};

globalThis.host = { storage: {
  get: (k) => store[k],
  set: (k, v) => { store[k] = structuredClone(v); },
  remove: (k) => { delete store[k]; },
}};

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  calls.push(u);
  let body;
  if (u.endsWith('/pieces.json')) body = fixtures.pieces;
  else if (u.endsWith('/genre.json')) body = fixtures.genres;
  else if (u.endsWith('/collections.json')) body = fixtures.collections;
  else if (u.includes('musicbrainz.org')) {
    mbHeaders.push(options.headers || {});
    body = u.includes('Light%20Electronic')
      ? { 'release-groups': [{ id: '123e4567-e89b-12d3-a456-426614174000', title: 'Light Electronic', 'artist-credit': [{ artist: { name: 'Kevin MacLeod' } }] }] }
      : { 'release-groups': [] };
  } else if (u.includes('coverartarchive.org')) body = { images: [{ front: true, approved: true }] };
  else throw new Error(`Unexpected mock URL: ${u}`);
  return { ok: true, status: 200, json: async () => body };
};

const plugin = await import('../index.js');

test('track and collection search and direct stream', async () => {
  const result = await plugin.search({ query: 'carefree' });
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].duration, 205000);
  const collections = await plugin.search({ query: 'Light', kind: 'albums' });
  assert.equal(collections.albums.length, 1);
  assert.equal(collections.albums[0].id, 'LE');
  const stream = await plugin.stream({ id: 'USUAN1100037' });
  assert.equal(stream.url, 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3');
  assert.equal(result.tracks[0].url, 'https://incompetech.com/music/royalty-free/music.html?isrc=USUAN1100037');
  assert.equal(store.incompetechCatalogV1.pieces.length, 3);
});

test('one cover lookup enriches all tracks of the same album, then caches it', async () => {
  const album = await plugin.album({ id: 'LE' });
  const url = 'https://coverartarchive.org/release-group/123e4567-e89b-12d3-a456-426614174000/front-250';
  assert.equal(album.album.imageUrl, url);
  assert.equal(album.tracks.length, 2);
  assert.equal(album.tracks[0].album, album.tracks[1].album);
  assert.equal(album.tracks[1].album.imageUrl, url);
  assert.equal((await plugin.album({ id: 'LE' })).album.imageUrl, url);
  assert.equal(calls.filter(x => x.includes('musicbrainz.org') && x.includes('Light%20Electronic')).length, 1);
  assert.equal(store.incompetechCoversV2.LE.url, url);
  assert.match(mbHeaders[0]['User-Agent'], /mygo-music-incompetech\/0\.2\.1/);
});

test('absent cover is cached as a negative result', async () => {
  const album = await plugin.album({ id: 'NO' });
  assert.equal(album.album.imageUrl, undefined);
  await plugin.album({ id: 'NO' });
  assert.equal(calls.filter(x => x.includes('musicbrainz.org') && x.includes('No%20Cover%20Album')).length, 1);
  assert.equal(store.incompetechCoversV2.NO.url, null);
});

test('genres and moods are browseable', async () => {
  const genres = await plugin.browse({ page: 'genres' });
  assert.ok(genres.sections[0].links.some(x => x.title === 'Electronica'));
  const moods = await plugin.browse({ page: 'moods' });
  assert.ok(moods.sections[0].links.some(x => x.title === 'Calming'));
  const matching = await plugin.browse({ page: 'mood:Calming' });
  assert.equal(matching.sections[0].tracks.length, 1);
});

// Negative results must expire sooner than a successful cover mapping.
test('negative cover cache expires after seven days', async () => {
  const before = calls.filter(x => x.includes('musicbrainz.org') && x.includes('No%20Cover%20Album')).length;
  store.incompetechCoversV2.NO.at -= 8 * 24 * 60 * 60 * 1000;
  await plugin.album({ id: 'NO' });
  const after = calls.filter(x => x.includes('musicbrainz.org') && x.includes('No%20Cover%20Album')).length;
  assert.equal(after, before + 1);
});
