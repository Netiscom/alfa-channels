'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');

const PLUGIN_PATH = path.join(__dirname, '..', 'areshd', 'plugin.js');
const PLUGIN_SOURCE = fs.readFileSync(PLUGIN_PATH, 'utf8');
const BUNDLE_PATH = path.join(__dirname, '..', 'dist', 'dev.alfa.skystream.areshd.sky');
const BASE = 'https://areshd.com/';
const MOVIE_SLUG = 'oppenheimer-el-dilema-de-la-bomba-atomica';
const SERIE_SLUG = 'ciudad-de-dios-la-lucha-no-para';
const PLAYER_HTML = (target) => `<html><script>var url = '${target}';</script></html>`;
const HOSTED_TARGET = 'https://doodstream.com/e/hosted123';
const HOSTED_DIRECT = 'https://cdn.example.com/dood-hosted.mp4';
const HOSTED_PLAYER_HTML = `<html><script>var url = '${HOSTED_TARGET}';</script><script>jwplayer("player").setup({ sources: [{ file: "${HOSTED_DIRECT}", type: "video/mp4" }] });</script></html>`;
const SKIPPED_TARGET = 'https://www.youtube.com/watch?v=abc123';
const TRACKER_TARGET = 'https://tracker.example/click?to=clip.mp4';
const API_STREAM_TARGET = 'https://vidara.to/e/qVldKnaquvrVz';
const API_STREAM_MIRROR = 'https://czzbgnw.com/e/qVldKnaquvrVz';
const LOOKALIKE_TARGET = 'https://evil.example/e/abc?ref=https://vidara.to';
const API_STREAM_DIRECT = 'https://cdn.example.com/hls/master.m3u8?token=abc123';
const API_STREAM_BODY = JSON.stringify({
  default_sub_lang: 'English',
  filecode: 'qVldKnaquvrVz',
  streaming_url: API_STREAM_DIRECT,
  subtitles: null,
  thumbnail: 'https://cdn.example.com/thumb.jpg',
  title: 'stream title',
  vast_ads: '',
  vast_provider: ''
});
const VOE_TARGET = 'https://voe.sx/e/test123';
const VOE_REDIRECT_TARGET = 'https://caseyseemavoid.com/e/test123';
const VOE_CHALLENGE_URL = 'https://caseyseemavoid.com/challenge/test123';
const VOE_DIRECT = 'https://cdn.example.com/voe/master.m3u8?token=abc';
const VOE_ENCODED_CONFIG = '@$CR18KTkWJyA4JGIxrIH2HmqLAyO3BTkzo1H2Mzf0AH9iCUOarGZ1MJ04Iy12EIgyn2goKKt3Fy1gCUkCBIOYMwAIF2Efpz1Zo1SjMwD8AJMfrzkZsHkKHQAEJ10mGJkFoSuXKKyEAIgir1cxpR18nN==';
const VOE_REDIRECT_HTML = `<html><script>window.location.href = '${VOE_REDIRECT_TARGET}';</script></html>`;
const VOE_CAPTCHA_HTML = `<html><form method="POST" action="${VOE_REDIRECT_TARGET}" class="access-form"><input type="hidden" name="_token" value="test-token"><input type="hidden" name="access" value="0"><altcha-widget challenge="${VOE_CHALLENGE_URL}"></altcha-widget></form><h1>Confirm you're human</h1></html>`;
const VOE_CHALLENGE_BODY = JSON.stringify({
  parameters: {
    algorithm: 'PBKDF2/SHA-256',
    cost: 2,
    expiresAt: 4102444800,
    keyLength: 32,
    keyPrefix: '00',
    nonce: '0102030405060708',
    salt: '1112131415161718'
  },
  signature: 'deadbeef'
});
const VOE_VERIFIED_HTML = `<html><script type="application/json">${VOE_ENCODED_CONFIG}</script><script>var source='https://test-videos.co.uk/decoy.mp4';</script></html>`;
const VOE_UNSOLVABLE_CHALLENGE_BODY = JSON.stringify({
  parameters: {
    algorithm: 'PBKDF2/SHA-256',
    cost: 1,
    expiresAt: 4102444800,
    keyLength: 32,
    keyPrefix: 'ffffffffff',
    nonce: '0102030405060708',
    salt: '1112131415161718'
  },
  signature: 'cafebabe'
});

function countingWebCrypto() {
  const calls = { deriveBits: 0 };
  return {
    calls: calls,
    crypto: {
      subtle: {
        importKey: (format, keyData, algorithm, extractable, usages) => webcrypto.subtle.importKey(
          format,
          Uint8Array.from(keyData),
          algorithm,
          extractable,
          usages
        ),
        deriveBits: async (algorithm, key, length) => {
          calls.deriveBits += 1;
          return webcrypto.subtle.deriveBits(
            Object.assign({}, algorithm, { salt: Uint8Array.from(algorithm.salt) }),
            key,
            length
          );
        }
      }
    }
  };
}

function readZipEntry(zipPath, entryName) {
  const archive = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= 0; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP EOCD not found');
  const count = archive.readUInt16LE(eocd + 10);
  let cursor = archive.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP central directory entry not found');
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (name !== entryName) {
      cursor += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataStart, dataStart + compressedSize);
    return method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
  }
  throw new Error('ZIP entry not found: ' + entryName);
}

function nextHtml(page, props, query) {
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    page,
    query: query || {},
    props: { pageProps: props }
  })}</script></html>`;
}

function movieCard(name, slug, images) {
  return {
    titles: { name },
    images: { poster: images.poster, backdrop: images.backdrop },
    overview: images.overview || 'Sinopsis de ' + name,
    rate: { average: 8.02 },
    TMDbId: '1149947',
    runtime: 181,
    releaseDate: '2023-07-19T00:00:00.000Z',
    genres: [{ name: 'Drama' }],
    cast: { acting: [{ name: 'Cillian Murphy' }] },
    url: { slug: 'movies/1149947/' + slug },
    slug: { name: slug }
  };
}

function serieCard() {
  return {
    titles: { name: 'Ciudad de Dios: La lucha no para' },
    images: { poster: 'https://image.tmdb.org/t/p/original/serie.jpg' },
    url: { slug: 'series/223397/' + SERIE_SLUG },
    slug: { name: SERIE_SLUG }
  };
}

function episodeEntry(season, episode) {
  return {
    TMDbId: '432855' + episode,
    title: 'Ciudad de Dios: La lucha no para ' + season + 'x' + episode,
    number: episode,
    image: 'https://image.tmdb.org/t/p/original/e' + season + episode + '.jpg',
    slug: { name: SERIE_SLUG, season: String(season), episode: String(episode) },
    url: { slug: 'series/223397/' + SERIE_SLUG + '/seasons/' + season + '/episodes/' + episode }
  };
}

function createHarness(options) {
  const config = options || {};
  const calls = { get: [], extract: [], post: [] };
  const sandbox = {
    manifest: {
      packageName: 'dev.alfa.skystream.areshd',
      name: 'ARESHD',
      version: 1,
      baseUrl: BASE,
      description: 'Catálogo de ARESHD',
      languages: ['es'],
      categories: ['Movie', 'TVShow'],
      domains: ['areshd.com']
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    crypto: config.crypto || { subtle: undefined },
    setTimeout,
    clearTimeout,
    URL,
    parse_html: async () => [],
    http_get: async (url) => {
      calls.get.push(url);
      const fixture = (config.html || {})[url];
      if (!fixture) return { status: 404, body: '', headers: {} };
      if (typeof fixture === 'string') return { status: 200, body: fixture, headers: {} };
      return {
        status: Number(fixture.status || 200),
        body: String(fixture.body || ''),
        headers: fixture.headers || {}
      };
    },
    http_post: async (url, headers, body) => {
      calls.post.push({ url: url, headers: headers, body: body });
      const response = (config.post || {})[url];
      if (!response) return { status: 404, body: '', headers: {} };
      return { status: 200, body: response, headers: {} };
    },
    loadExtractor: async (url, referer) => {
      calls.extract.push({ url, referer });
      return typeof config.extractor === 'function' ? config.extractor(url, referer) : [];
    },
    MultimediaItem: function MultimediaItem(data) { Object.assign(this, data); },
    StreamResult: function StreamResult(data) { Object.assign(this, data); },
    Episode: function Episode(data) { Object.assign(this, data); },
    Actor: function Actor(data) { Object.assign(this, data); },
    Trailer: function Trailer(data) { Object.assign(this, data); },
    NextAiring: function NextAiring(data) { Object.assign(this, data); }
  };
  vm.createContext(sandbox);
  vm.runInContext(config.source || PLUGIN_SOURCE, sandbox, { filename: config.filename || PLUGIN_PATH });
  return { sandbox, calls };
}

function invoke(fn, args) {
  return new Promise((resolve, reject) => {
    try {
      fn.apply(null, args.concat([(result) => resolve(result)]));
    } catch (error) {
      reject(error);
    }
  });
}

function parseState(url) {
  const raw = String(url || '');
  if (raw.indexOf('alfa:') !== 0) return null;
  const chunks = raw.slice(5).split('?');
  const payload = {};
  for (const pair of (chunks[1] || '').split('&')) {
    if (!pair) continue;
    const index = pair.indexOf('=');
    payload[decodeURIComponent(pair.slice(0, index))] = decodeURIComponent(pair.slice(index + 1));
  }
  return Object.assign({ type: chunks[0] }, payload);
}

function movieDetail() {
  const card = movieCard('Oppenheimer: el dilema de la bomba atómica', MOVIE_SLUG, {
    poster: 'https://image.tmdb.org/t/p/original/poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/backdrop.jpg'
  });
  return Object.assign({}, card, {
    videos: {
      latino: [
        {
          cyberlocker: 'voesx',
          result: BASE + 'player-direct',
          quality: 'FULL_HD'
        }
      ],
      spanish: [
        {
          cyberlocker: 'doodstream',
          result: BASE + 'player-extractor',
          quality: 'FULL_HD'
        }
      ]
    }
  });
}

function detailWithVideos(videos) {
  return Object.assign({}, movieDetail(), { videos: videos });
}

function htmlForDetail(detail) {
  return Object.assign({}, HTML, {
    [BASE + 'pelicula/' + MOVIE_SLUG]: nextHtml('/pelicula/[slug]', { thisMovie: detail }, { slug: MOVIE_SLUG })
  });
}

function commonHtml(detail) {
  return {
    [BASE]: nextHtml('/', {
      movies: [movieCard('Rammstein: Live in Mexico City', 'rammstein-live-in-mexico-city', {
        poster: 'https://image.tmdb.org/t/p/original/rammstein.jpg'
      })],
      series: [serieCard()],
      episodes: [episodeEntry(2, 3)]
    }),
    [BASE + 'search/oppenheimer']: nextHtml('/search/[search]', {
      movies: [movieCard('Oppenheimer: el dilema de la bomba atómica', MOVIE_SLUG, {
        poster: 'https://image.tmdb.org/t/p/original/poster.jpg'
      })]
    }, { search: 'oppenheimer' }),
    [BASE + 'peliculas']: nextHtml('/peliculas', {
      movies: [movieCard('Oppenheimer: el dilema de la bomba atómica', MOVIE_SLUG, {
        poster: 'https://image.tmdb.org/t/p/original/poster.jpg'
      })],
      pages: 3
    }),
    [BASE + 'pelicula/' + MOVIE_SLUG]: nextHtml('/pelicula/[slug]', { thisMovie: movieDetail() }, { slug: MOVIE_SLUG }),
    [BASE + 'serie/' + SERIE_SLUG]: nextHtml('/serie/[slug]', {
      thisSerie: Object.assign({}, serieCard(), {
        overview: 'Sigue la vida de los residentes de la favela.',
        rate: { average: 7.63 },
        genres: [{ name: 'Crimen' }, { name: 'Drama' }],
        seasons: [{ number: 1, episodes: [episodeEntry(1, 1)] }]
      })
    }, { slug: SERIE_SLUG }),
    [BASE + 'episodio/' + SERIE_SLUG + '-temporada-2-episodio-3']: nextHtml('/episodio/[episode]', {
      season: { number: 2 },
      episode: Object.assign({}, episodeEntry(2, 3), {
        overview: 'Episodio 3',
        videos: movieDetail().videos
      }),
      serie: Object.assign({}, serieCard(), {
        overview: 'Sigue la vida de los residentes de la favela.',
        rate: { average: 7.63 },
        genres: [{ name: 'Crimen' }],
        seasons: [{ number: 2, episodes: [episodeEntry(2, 3)] }]
      })
    }, { episode: SERIE_SLUG + '-temporada-2-episodio-3' }),
    [BASE + 'player-direct']: { status: 200, body: PLAYER_HTML('https://media.example.com/pelicula.mp4') },
    [BASE + 'player-extractor']: { status: 200, body: PLAYER_HTML('https://doodstream.com/e/abc123') }
  };
}

const HTML = commonHtml();
for (const key of Object.keys(HTML)) {
  if (typeof HTML[key] === 'string') continue;
  HTML[key] = HTML[key].body;
}
HTML[BASE + 'player-hosted'] = HOSTED_PLAYER_HTML;
HTML[HOSTED_TARGET] = HOSTED_PLAYER_HTML;
HTML[BASE + 'player-skip'] = PLAYER_HTML(SKIPPED_TARGET);
HTML[BASE + 'player-tracker'] = PLAYER_HTML(TRACKER_TARGET);
HTML[BASE + 'player-relative'] = PLAYER_HTML('relative-player');
HTML[VOE_TARGET] = { body: VOE_REDIRECT_HTML, headers: {} };
HTML[VOE_REDIRECT_TARGET] = {
  body: VOE_CAPTCHA_HTML,
  headers: { 'set-cookie': 'voe_session=abc; Path=/; HttpOnly' }
};
HTML[VOE_CHALLENGE_URL] = {
  body: VOE_CHALLENGE_BODY,
  headers: { 'Set-Cookie': 'voe_challenge=def; Path=/' }
};

function harness(options) {
  const config = typeof options === 'function' ? { extractor: options } : (options || {});
  const defaultExtractor = async (url) => url.indexOf('doodstream') >= 0
    ? [{
        url: 'https://cdn.example.com/dood.mp4',
        source: 'Doodstream',
        quality: 'HD',
        headers: { Referer: 'https://doodstream.com/e/abc123' }
      }]
    : [];
  return createHarness({
    html: config.html || HTML,
    post: config.post,
    source: config.source,
    crypto: config.crypto,
    extractor: config.extractor === undefined ? defaultExtractor : config.extractor
  });
}

test('getHome builds movie, series, episode and genre sections from __NEXT_DATA__', async () => {
  const { sandbox, calls } = harness();
  const response = await invoke(sandbox.getHome, []);

  assert.equal(response.success, true);
  assert.deepEqual(Object.keys(response.data), ['Películas', 'Series', 'Últimos episodios', 'Géneros']);
  assert.equal(response.data['Películas'].length, 1);
  assert.equal(response.data['Películas'][0].title, 'Rammstein: Live in Mexico City');
  assert.equal(response.data['Películas'][0].type, 'movie');
  assert.equal(response.data['Series'][0].type, 'series');
  assert.equal(parseState(response.data['Últimos episodios'][0].url).type, 'episode');
  assert.equal(parseState(response.data['Géneros'][0].url).type, 'list');
  assert.deepEqual(calls.get, [BASE]);
});

test('search maps ARESHD search results and skips empty queries', async () => {
  const { sandbox, calls } = harness();
  const response = await invoke(sandbox.search, ['oppenheimer', 1]);

  assert.equal(response.success, true);
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].title, 'Oppenheimer: el dilema de la bomba atómica');
  assert.equal(response.data[0].posterUrl, 'https://image.tmdb.org/t/p/original/poster.jpg');
  assert.equal(response.data[0].type, 'movie');
  assert.equal(parseState(response.data[0].url).url, BASE + 'pelicula/' + MOVIE_SLUG);
  assert.deepEqual(calls.get, [BASE + 'search/oppenheimer']);

  const empty = await invoke(sandbox.search, ['   ']);
  assert.equal(empty.success, true);
  assert.deepEqual(Array.from(empty.data), []);
  assert.deepEqual(calls.get, [BASE + 'search/oppenheimer']);
});

test('load list maps next data and adds a next-page item', async () => {
  const { sandbox } = harness();
  const response = await invoke(sandbox.load, [parseStateUrl('list', { url: BASE + 'peliculas', title: 'Películas' })]);

  assert.equal(response.success, true);
  assert.equal(response.data.type, 'other');
  assert.equal(response.data.recommendations.length, 2);
  const next = response.data.recommendations[1];
  assert.equal(next.title, 'Página siguiente');
  assert.equal(parseState(next.url).url, BASE + 'peliculas/pagina/2');
});

test('load movie maps metadata and resolves player options to streams', async () => {
  const { sandbox, calls } = harness();
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.equal(response.data.title, 'Oppenheimer: el dilema de la bomba atómica');
  assert.equal(response.data.year, 2023);
  assert.equal(response.data.score, 8.02);
  assert.equal(response.data.duration, 181);
  assert.equal(response.data.type, 'movie');
  assert.deepEqual(Array.from(response.data.tags), ['Drama']);
  assert.equal(response.data.streams.length, 2);
  assert.equal(response.data.streams[0].url, 'https://media.example.com/pelicula.mp4');
  assert.equal(response.data.streams[0].source, 'Voesx (Latino)');
  assert.equal(response.data.streams[1].url, 'https://cdn.example.com/dood.mp4');
  assert.equal(response.data.streams[1].quality, 'HD');
  assert.equal(response.data.streams[1].headers.Referer, 'https://doodstream.com/e/abc123');
  assert.ok(calls.get.includes(BASE + 'player-direct'));
  assert.ok(calls.get.includes(BASE + 'player-extractor'));
  assert.equal(calls.extract.length, 1);
});

test('load drops unresolved hosts instead of returning embed pages', async () => {
  const { sandbox } = harness(async () => []);
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(
    Array.from(response.data.streams.map((stream) => stream.url)),
    ['https://media.example.com/pelicula.mp4']
  );
});

test('load resolves hosted media without an external extractor', async () => {
  const html = htmlForDetail(detailWithVideos({
    latino: [{ cyberlocker: 'doodstream', result: BASE + 'player-hosted', quality: 'FULL_HD' }]
  }));
  const { sandbox, calls } = harness({ html: html, extractor: async () => [] });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.equal(response.data.streams.length, 1);
  assert.equal(response.data.streams[0].url, HOSTED_DIRECT);
  assert.equal(response.data.streams[0].source, 'Doodstream (Latino)');
  assert.equal(response.data.streams[0].quality, 'FULL_HD');
  assert.equal(response.data.streams[0].headers.Referer, HOSTED_TARGET);
  assert.deepEqual(Array.from(calls.extract), []);
});

test('load skips unsupported player targets', async () => {
  const html = htmlForDetail(detailWithVideos({
    latino: [{ cyberlocker: 'youtube', result: BASE + 'player-skip' }]
  }));
  const { sandbox, calls } = harness({
    html: html,
    extractor: async () => [{ url: 'https://cdn.example.com/should-not.mp4' }]
  });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), []);
  assert.deepEqual(Array.from(calls.extract), []);
});

test('load rejects media-looking tracker targets', async () => {
  const html = htmlForDetail(detailWithVideos({
    latino: [{ cyberlocker: 'voesx', result: BASE + 'player-tracker' }]
  }));
  const { sandbox } = harness({ html: html, extractor: async () => [] });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), []);
});

test('load ignores extractor results without absolute media URLs', async () => {
  const { sandbox } = harness(async () => [
    { url: '/relative.mp4' },
    { url: 'ftp://cdn.example.com/unsupported.mp4' },
    { url: TRACKER_TARGET },
    { url: 'https://cdn.example.com/extracted.mp4' }
  ]);
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-extractor',
    referer: BASE + 'pelicula/' + MOVIE_SLUG,
    source: 'Doodstream (Español)',
    quality: 'FULL_HD'
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(
    Array.from(response.data.map((stream) => stream.url)),
    ['https://cdn.example.com/extracted.mp4']
  );
});

test('loadStreams rejects relative media targets', async () => {
  const { sandbox } = harness();
  const response = await invoke(sandbox.loadStreams, ['relative.mp4']);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data), []);
});

test('load skips extractor for non-http player targets', async () => {
  const html = htmlForDetail(detailWithVideos({
    latino: [{ cyberlocker: 'voesx', result: BASE + 'player-relative' }]
  }));
  const { sandbox, calls } = harness({
    html: html,
    extractor: async () => [{ url: HOSTED_DIRECT }]
  });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), []);
  assert.equal(calls.extract.length, 0);
});

test('loadStreams resolves API stream hosts through http_post', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-api']: PLAYER_HTML(API_STREAM_TARGET),
    [API_STREAM_TARGET]: '<html></html>'
  });
  const { sandbox, calls } = harness({
    html: html,
    post: { 'https://vidara.to/api/stream': API_STREAM_BODY },
    extractor: async () => []
  });
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-api',
    referer: BASE + 'pelicula/' + MOVIE_SLUG,
    source: 'Vidara (Español)',
    quality: 'FULL_HD'
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.map((stream) => stream.url)), [API_STREAM_DIRECT]);
  assert.equal(response.data[0].source, 'Vidara (Español)');
  assert.equal(response.data[0].quality, 'FULL_HD');
  assert.equal(response.data[0].headers.Referer, API_STREAM_TARGET);
  assert.equal(calls.post.length, 1);
  assert.equal(calls.post[0].url, 'https://vidara.to/api/stream');
  assert.equal(calls.post[0].headers['Content-Type'], 'application/json');
  assert.equal(calls.post[0].body, JSON.stringify({ filecode: 'qVldKnaquvrVz', device: 'web', codecs: [] }));
});

test('loadStreams ignores invalid API stream payloads', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-api']: PLAYER_HTML(API_STREAM_TARGET),
    [API_STREAM_TARGET]: '<html></html>'
  });
  const { sandbox, calls } = harness({
    html: html,
    post: { 'https://vidara.to/api/stream': JSON.stringify({ streaming_url: '/relative.mp4' }) },
    extractor: async () => []
  });
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-api',
    referer: BASE + 'pelicula/' + MOVIE_SLUG
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data), []);
  assert.equal(calls.post.length, 1);
});

test('loadStreams resolves API stream mirrors through http_post', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-mirror']: PLAYER_HTML(API_STREAM_MIRROR),
    [API_STREAM_MIRROR]: '<html></html>'
  });
  const { sandbox, calls } = harness({
    html: html,
    post: { 'https://czzbgnw.com/api/stream': API_STREAM_BODY },
    extractor: async () => []
  });
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-mirror',
    referer: BASE + 'pelicula/' + MOVIE_SLUG
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.map((stream) => stream.url)), [API_STREAM_DIRECT]);
  assert.equal(calls.post.length, 1);
  assert.equal(calls.post[0].url, 'https://czzbgnw.com/api/stream');
});

test('loadStreams does not POST to lookalike API hosts', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-lookalike']: PLAYER_HTML(LOOKALIKE_TARGET),
    [LOOKALIKE_TARGET]: '<html></html>'
  });
  const { sandbox, calls } = harness({
    html: html,
    post: { 'https://evil.example/api/stream': API_STREAM_BODY },
    extractor: async () => []
  });
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-lookalike',
    referer: BASE + 'pelicula/' + MOVIE_SLUG
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data), []);
  assert.equal(calls.post.length, 0);
});

test('loadStreams tolerates malformed API filecodes', async () => {
  const badTarget = 'https://vidara.to/e/%';
  const html = Object.assign({}, HTML, {
    [BASE + 'player-bad-filecode']: PLAYER_HTML(badTarget),
    [badTarget]: '<html></html>'
  });
  const { sandbox, calls } = harness({
    html: html,
    post: { 'https://vidara.to/api/stream': API_STREAM_BODY },
    extractor: async () => []
  });
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-bad-filecode',
    referer: BASE + 'pelicula/' + MOVIE_SLUG
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data), []);
  assert.equal(calls.post.length, 0);
});

test('loadStreams falls back to the extractor when the API POST fails', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-api-fallback']: PLAYER_HTML(API_STREAM_TARGET),
    [API_STREAM_TARGET]: '<html></html>'
  });
  const { sandbox, calls } = harness({
    html: html,
    extractor: async () => [{ url: HOSTED_DIRECT }]
  });
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-api-fallback',
    referer: BASE + 'pelicula/' + MOVIE_SLUG
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.map((stream) => stream.url)), [HOSTED_DIRECT]);
  assert.equal(calls.post.length, 1);
  assert.equal(calls.extract.length, 1);
});

test('bundled plugin resolves API stream hosts through http_post', async () => {
  const source = readZipEntry(BUNDLE_PATH, 'plugin.js');
  const html = Object.assign({}, HTML, {
    [BASE + 'player-api']: PLAYER_HTML(API_STREAM_TARGET),
    [API_STREAM_TARGET]: '<html></html>'
  });
  const { sandbox } = harness({
    source: source,
    html: html,
    post: { 'https://vidara.to/api/stream': API_STREAM_BODY },
    extractor: async () => []
  });
  const response = await invoke(sandbox.loadStreams, [parseStateUrl('option', {
    url: BASE + 'player-api',
    referer: BASE + 'pelicula/' + MOVIE_SLUG,
    source: 'Vidara (Español)',
    quality: 'FULL_HD'
  })]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.map((stream) => stream.url)), [API_STREAM_DIRECT]);
});

test('bundled plugin drops unresolved embeds and keeps hosted media', async () => {
  const source = readZipEntry(BUNDLE_PATH, 'plugin.js');
  const html = htmlForDetail(detailWithVideos({
    latino: [
      { cyberlocker: 'doodstream', result: BASE + 'player-hosted', quality: 'FULL_HD' },
      { cyberlocker: 'voesx', result: BASE + 'player-extractor', quality: 'FULL_HD' }
    ]
  }));
  const { sandbox } = harness({ source: source, html: html, extractor: async () => [] });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(
    Array.from(response.data.streams.map((stream) => stream.url)),
    [HOSTED_DIRECT]
  );
});

test('VOE redirect, Altcha challenge and decoded config resolve without a browser', async () => {
  const sources = [
    ['source', PLUGIN_SOURCE],
    ['source-webcrypto', PLUGIN_SOURCE],
    ['bundle', readZipEntry(BUNDLE_PATH, 'plugin.js')],
    ['bundle-webcrypto', readZipEntry(BUNDLE_PATH, 'plugin.js')]
  ];
  for (const [label, source] of sources) {
    const cryptoMonitor = label.indexOf('webcrypto') >= 0 ? countingWebCrypto() : null;
    const html = Object.assign({}, HTML, {
      [BASE + 'player-voe']: PLAYER_HTML(VOE_TARGET),
      [BASE + 'pelicula/' + MOVIE_SLUG]: nextHtml('/pelicula/[slug]', {
        thisMovie: detailWithVideos({
          latino: [{ cyberlocker: 'voesx', result: BASE + 'player-voe', quality: 'FULL_HD' }]
        })
      }, { slug: MOVIE_SLUG })
    });
    const { sandbox, calls } = harness({
      source,
      crypto: cryptoMonitor && cryptoMonitor.crypto,
      html,
      post: { [VOE_REDIRECT_TARGET]: VOE_VERIFIED_HTML },
      extractor: async () => []
    });
    const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

    assert.equal(response.success, true, label);
    assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), [VOE_DIRECT], label);
    assert.ok(calls.get.includes(VOE_TARGET), label);
    assert.ok(calls.get.includes(VOE_REDIRECT_TARGET), label);
    assert.ok(calls.get.includes(VOE_CHALLENGE_URL), label);
    assert.equal(calls.post.length, 1, label);
    assert.equal(calls.post[0].url, VOE_REDIRECT_TARGET, label);
    assert.equal(calls.post[0].headers.Cookie, 'voe_session=abc; voe_challenge=def', label);
    const fields = new URLSearchParams(calls.post[0].body);
    assert.equal(fields.get('_token'), 'test-token', label);
    assert.equal(fields.get('access'), '0', label);
    const solved = JSON.parse(Buffer.from(fields.get('altcha'), 'base64').toString('utf8'));
    assert.equal(solved.challenge.signature, 'deadbeef', label);
    assert.equal(solved.solution.counter, 181, label);
    assert.equal(solved.solution.derivedKey, '00a56ce0743ce828e109bb24f88fbb26246fed3ac26d178d63cfb587af92bd5a', label);
    if (cryptoMonitor) assert.ok(cryptoMonitor.calls.deriveBits > 0, label);
  }
});

test('VOE invalid Altcha challenge falls back to the extractor', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-voe']: PLAYER_HTML(VOE_TARGET),
    [VOE_CHALLENGE_URL]: '{ invalid json',
    [BASE + 'pelicula/' + MOVIE_SLUG]: nextHtml('/pelicula/[slug]', {
      thisMovie: detailWithVideos({
        latino: [{ cyberlocker: 'voesx', result: BASE + 'player-voe' }]
      })
    }, { slug: MOVIE_SLUG })
  });
  const { sandbox, calls } = harness({
    html,
    post: { [VOE_REDIRECT_TARGET]: VOE_VERIFIED_HTML },
    extractor: async (url) => url === VOE_TARGET
      ? [{ url: VOE_DIRECT, source: 'Voesx', quality: 'HD' }]
      : []
  });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), [VOE_DIRECT]);
  assert.equal(calls.post.length, 0);
  assert.ok(calls.extract.some((call) => call.url === VOE_TARGET));
});

test('VOE mirror host resolves directly without a prior redirect', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-voe']: PLAYER_HTML(VOE_REDIRECT_TARGET),
    [VOE_REDIRECT_TARGET]: VOE_CAPTCHA_HTML,
    [VOE_CHALLENGE_URL]: VOE_CHALLENGE_BODY,
    [BASE + 'pelicula/' + MOVIE_SLUG]: nextHtml('/pelicula/[slug]', {
      thisMovie: detailWithVideos({
        latino: [{ cyberlocker: 'voesx', result: BASE + 'player-voe' }]
      })
    }, { slug: MOVIE_SLUG })
  });
  const { sandbox, calls } = harness({
    html,
    post: { [VOE_REDIRECT_TARGET]: VOE_VERIFIED_HTML },
    extractor: async () => []
  });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), [VOE_DIRECT]);
  assert.ok(calls.get.includes(VOE_REDIRECT_TARGET));
  assert.equal(calls.post.length, 1);
  assert.equal(calls.extract.length, 0);
});

test('VOE rejects unrealistic Altcha challenges without POSTing', async () => {
  const html = Object.assign({}, HTML, {
    [BASE + 'player-voe']: PLAYER_HTML(VOE_TARGET),
    [VOE_TARGET]: VOE_REDIRECT_HTML,
    [VOE_CHALLENGE_URL]: VOE_UNSOLVABLE_CHALLENGE_BODY,
    [BASE + 'pelicula/' + MOVIE_SLUG]: nextHtml('/pelicula/[slug]', {
      thisMovie: detailWithVideos({
        latino: [{ cyberlocker: 'voesx', result: BASE + 'player-voe' }]
      })
    }, { slug: MOVIE_SLUG })
  });
  const { sandbox, calls } = harness({
    html,
    post: { [VOE_REDIRECT_TARGET]: VOE_VERIFIED_HTML },
    extractor: async () => [{ url: VOE_DIRECT, source: 'Voesx', quality: 'HD' }]
  });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), [VOE_DIRECT]);
  assert.equal(calls.post.length, 0);
  assert.ok(calls.extract.some((call) => call.url === VOE_TARGET));
});

test('bundled plugin rejects media-looking tracker targets', async () => {
  const source = readZipEntry(BUNDLE_PATH, 'plugin.js');
  const html = htmlForDetail(detailWithVideos({
    latino: [{ cyberlocker: 'voesx', result: BASE + 'player-tracker' }]
  }));
  const { sandbox } = harness({
    source: source,
    html: html,
    extractor: async () => []
  });
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.deepEqual(Array.from(response.data.streams.map((stream) => stream.url)), []);
});

test('load survives a failing player request and keeps the other streams', async () => {
  const { sandbox } = harness();
  const originalGet = sandbox.http_get;
  sandbox.http_get = async (url, headers) => {
    if (url === BASE + 'player-direct') throw new Error('player unavailable');
    return originalGet(url, headers);
  };
  const response = await invoke(sandbox.load, [BASE + 'pelicula/' + MOVIE_SLUG]);

  assert.equal(response.success, true);
  assert.equal(response.data.streams.length, 1);
  assert.equal(response.data.streams[0].url, 'https://cdn.example.com/dood.mp4');
});

test('load series maps seasons to episodes', async () => {
  const { sandbox } = harness();
  const response = await invoke(sandbox.load, [BASE + 'serie/' + SERIE_SLUG]);

  assert.equal(response.success, true);
  assert.equal(response.data.type, 'series');
  assert.equal(response.data.episodes.length, 1);
  assert.equal(response.data.episodes[0].season, 1);
  assert.equal(response.data.episodes[0].episode, 1);
  assert.equal(response.data.episodes[0].name, '1x1 - Ciudad de Dios: La lucha no para 1x1');
  assert.equal(
    parseState(response.data.episodes[0].url).url,
    BASE + 'episodio/' + SERIE_SLUG + '-temporada-1-episodio-1'
  );
});

test('load episode maps series metadata, streams and navigation episodes', async () => {
  const { sandbox } = harness();
  const response = await invoke(sandbox.load, [BASE + 'episodio/' + SERIE_SLUG + '-temporada-2-episodio-3']);

  assert.equal(response.success, true);
  assert.equal(response.data.type, 'series');
  assert.equal(response.data.season, 2);
  assert.equal(response.data.episode, 3);
  assert.equal(response.data.streams.length, 2);
  assert.equal(response.data.episodes.length, 1);
  assert.equal(response.data.episodes[0].season, 2);
  assert.equal(response.data.episodes[0].episode, 3);
});

test('load expone un episodio reproducible para películas y episodios', async () => {
  const { sandbox } = harness();
  const movieTarget = BASE + 'pelicula/' + MOVIE_SLUG;
  const episodeTarget = BASE + 'episodio/' + SERIE_SLUG + '-temporada-2-episodio-3';
  const movie = await invoke(sandbox.load, [movieTarget]);
  const episode = await invoke(sandbox.load, [episodeTarget]);

  for (const [result, target, type] of [
    [movie, movieTarget, 'movie'],
    [episode, episodeTarget, 'episode']
  ]) {
    assert.equal(result.success, true);
    assert.ok(Array.isArray(result.data.episodes));
    assert.ok(result.data.episodes.length >= 1);
    const playable = result.data.episodes[0];
    assert.equal(parseState(playable.url).type, type);
    assert.equal(parseState(playable.url).url, target);
    assert.equal(playable.name, result.data.title);
    const playback = await invoke(sandbox.loadStreams, [playable.url]);
    assert.equal(playback.success, true);
    assert.ok(playback.data.length >= 1);
  }
});

test('loadStreams resolves an option state URL', async () => {
  const { sandbox, calls } = harness();
  const optionUrl = parseStateUrl('option', {
    url: BASE + 'player-extractor',
    referer: BASE + 'pelicula/' + MOVIE_SLUG,
    source: 'Doodstream (Español)',
    quality: 'FULL_HD'
  });
  const response = await invoke(sandbox.loadStreams, [optionUrl]);

  assert.equal(response.success, true);
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].url, 'https://cdn.example.com/dood.mp4');
  assert.equal(response.data[0].source, 'Doodstream');
  assert.equal(response.data[0].quality, 'HD');
  assert.equal(calls.extract.length, 1);
});

test('load rejects non-http URLs', async () => {
  const { sandbox } = harness();
  const response = await invoke(sandbox.load, ['not-a-url']);

  assert.equal(response.success, false);
  assert.equal(response.errorCode, 'LOAD_ERROR');
});

test('load tolerates malformed state query values', async () => {
  const { sandbox } = harness();
  const state = 'alfa:list?url=' + encodeURIComponent(BASE + 'peliculas') + '&bad=%&broken';
  const response = await invoke(sandbox.load, [state]);

  assert.equal(response.success, true);
  assert.equal(response.data.type, 'other');
});

function parseStateUrl(type, payload) {
  const query = Object.keys(payload)
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(String(payload[key])))
    .join('&');
  return 'alfa:' + type + (query ? '?' + query : '');
}
