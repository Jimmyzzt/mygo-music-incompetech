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
    { title: 'Dentaneosuchus Hunt', filename: 'Dentaneosuchus Hunt.mp3', isrc: 'USUAN2500003', length: '00:04:07', genre: '25', collection: 'LE', feel: 'Driving', instruments: 'Drums', uploaded: '2025-12-15', itunes: 'https://music.apple.com/us/album/dentaneosuchus-hunt-single/1860967298' },
    { title: 'Sauropod Spotting', filename: 'Sauropod Spotting.mp3', isrc: 'USUAN2500002', length: '00:03:45', genre: '25', collection: 'LE', feel: 'Action', instruments: 'Drums', uploaded: '2025-12-14', itunes: 'https://music.apple.com/us/album/sauropod-sighting-single/1861028633' },
    { title: '8bit Dungeon Boss', filename: '8bit Dungeon Boss.mp3', isrc: 'USUAN1200067', length: '00:02:52', genre: '25', collection: 'NO', feel: 'Humorous', instruments: 'Synths', uploaded: '2012-05-28', itunes: 'https://itunes.apple.com/us/album/8bit-dungeon-boss/id945466446?i=945466447' },
    { title: '8bit Dungeon Level', filename: '8bit Dungeon Level.mp3', isrc: 'USUAN1200066', length: '00:03:37', genre: '25', collection: 'NO', feel: 'Dark', instruments: 'Synths', uploaded: '2012-05-28', itunes: 'https://itunes.apple.com/us/album/8bit-dungeon-level/id945466446?i=945466448' },
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
  else if (u.startsWith('https://itunes.apple.com/lookup?')) {
    const ids = new URL(u).searchParams.get('id').split(',');
    body = { resultCount: ids.length, results: ids.map((id) => ({
      wrapperType: 'collection', collectionId: Number(id), artistName: 'Kevin MacLeod',
      collectionName: {
        1860967298: 'Dentaneosuchus Hunt - Single',
        1861028633: 'Sauropod Sighting - Single',
        945466446: '8bit Dungeon',
      }[id] || 'Unknown',
      artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/${id}/100x100bb.jpg`,
    })) };
  }
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
  assert.equal(store.incompetechCatalogV1.pieces.length, 7);
});

test('one cover lookup enriches all tracks of the same album, then caches it', async () => {
  const album = await plugin.album({ id: 'LE' });
  const url = 'https://coverartarchive.org/release-group/123e4567-e89b-12d3-a456-426614174000/front-250';
  assert.equal(album.album.imageUrl, url);
  assert.equal(album.tracks.length, 4);
  assert.equal(album.tracks[0].album, album.tracks[1].album);
  assert.equal(album.tracks[1].album.imageUrl, url);
  assert.equal((await plugin.album({ id: 'LE' })).album.imageUrl, url);
  assert.equal(calls.filter(x => x.includes('musicbrainz.org') && x.includes('Light%20Electronic')).length, 1);
  assert.equal(store.incompetechCoversV2.LE.url, url);
  assert.match(mbHeaders[0]['User-Agent'], /mygo-music-incompetech\/0\.2\.2/);
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

// Incompetech's "collection" can be a theme, NOT the original record album.
// Album art for official links must attach to the real release per track.
test('Home uses official iTunes release links to show real covers', async () => {
  const result = await plugin.home();
  const recent = result.sections.find(s => s.title === 'Recent additions').tracks;
  const dino = recent.find(t => t.name === 'Dentaneosuchus Hunt');
  const sauropod = recent.find(t => t.name === 'Sauropod Spotting');
  const noItunes = recent.find(t => t.name === 'Another Song');
  assert.equal(dino.album.id, 'apple:1860967298');
  assert.equal(dino.album.name, 'Dentaneosuchus Hunt - Single');
  assert.equal(dino.album.imageUrl, 'https://is1-ssl.mzstatic.com/image/thumb/1860967298/100x100bb.jpg');
  assert.equal(sauropod.album.id, 'apple:1861028633');
  assert.notEqual(dino.album.imageUrl, sauropod.album.imageUrl);
  // Another Song has no official link in this fixture; it must not receive
  // a different track's cover merely because both are in the LE theme.
  assert.equal(noItunes.album.imageUrl, undefined);
  const appleCalls = calls.filter(x => x.startsWith('https://itunes.apple.com/lookup?'));
  assert.ok(appleCalls.length <= 2, 'multiple IDs should be batched into a small number of requests');
  assert.ok(appleCalls.some(u => u.includes('1860967298') && u.includes('1861028633')), 'release IDs should share one request');
  assert.ok(appleCalls[0].includes('1860967298'));
  assert.ok(appleCalls[0].includes('1861028633'));
  const release = await plugin.album({ id: dino.album.id });
  assert.equal(release.tracks.length, 1);
  assert.equal(release.album.imageUrl, dino.album.imageUrl);
});

test('tracks from one published album share the same artwork and lookup is cached', async () => {
  const result = await plugin.search({ query: '8bit Dungeon' });
  assert.equal(result.tracks.length, 2);
  assert.equal(result.tracks[0].album.id, 'apple:945466446');
  assert.equal(result.tracks[0].album, result.tracks[1].album);
  const before = calls.filter(x => x.includes('itunes.apple.com/lookup')).length;
  await plugin.search({ query: '8bit Dungeon' });
  assert.equal(calls.filter(x => x.includes('itunes.apple.com/lookup')).length, before);
  assert.equal(store.incompetechAppleArtworkV1['945466446'].name, '8bit Dungeon');
});
