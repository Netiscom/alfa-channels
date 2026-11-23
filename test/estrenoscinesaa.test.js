const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pluginSource = fs.readFileSync(path.join(__dirname, '..', 'estrenoscinesaa', 'plugin.js'), 'utf8');
const BASE = 'https://www.estrenoscinesaa.com/';
const ROOT = 'https://www.estrenoscinesaa.com';
const PROXY_BASE = 'https://r.jina.ai/';

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function getAttr(value, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(value || '');
  return match ? decodeEntities(match[2]) : '';
}

function hasClass(attrs, className) {
  return getAttr(attrs, 'class').split(/\s+/).filter(Boolean).includes(className);
}

function elementsFrom(html, tagName) {
  const result = allTags(html);
  if (!tagName || tagName === '*') return result;
  return result.filter((element) => element.name === String(tagName).toLowerCase());
}

function allTags(source) {
  const text = String(source || '');
  const voidTags = new Set(['img', 'meta', 'br', 'input', 'hr', 'link']);
  const result = [];
  const stack = [];
  const regex = /<\/?([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    const raw = match[0];
    if (raw.charAt(1) === '/') {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name !== name) continue;
        const open = stack[i];
        open.element.tag = text.slice(open.start, match.index + raw.length);
        open.element.inner = text.slice(open.end, match.index);
        stack.length = i;
        break;
      }
      continue;
    }
    const element = { name: name, tag: raw, attrs: match[2] || '', inner: '', index: match.index };
    result.push(element);
    if (voidTags.has(name)) continue;
    stack.push({ name: name, start: match.index, end: match.index + raw.length, element: element });
  }
  for (const open of stack) {
    open.element.tag = text.slice(open.start);
    open.element.inner = text.slice(open.end);
  }
  return result.sort((left, right) => left.index - right.index);
}

function makeEntry(element, attr) {
  return {
    text: stripTags(element.inner),
    html: element.inner,
    attr: attr ? getAttr(element.tag, attr) : ''
  };
}

function matchesSimple(element, token) {
  const cleaned = String(token || '').trim().replace(/^\s*>\s*/, '');
  if (!cleaned) return false;
  const tagMatch = /^([a-zA-Z][\w-]*)/.exec(cleaned);
  if (tagMatch && element.name !== tagMatch[1].toLowerCase()) return false;
  const idMatch = /#([\w-]+)/.exec(cleaned);
  if (idMatch && getAttr(element.attrs, 'id') !== idMatch[1]) return false;
  const classMatches = cleaned.match(/\.([-\w]+)/g) || [];
  for (const classMatch of classMatches) {
    if (!hasClass(element.attrs, classMatch.slice(1))) return false;
  }
  const attrSpecs = cleaned.match(/\[[^\]]+\]/g) || [];
  for (const spec of attrSpecs) {
    const inner = spec.slice(1, -1).trim();
    const quoted = /^([-\w:]+)\s*(=|\*=|\^=|\$=)\s*(["'])(.*?)\3$/.exec(inner);
    const unquoted = /^([-\w:]+)\s*(=|\*=|\^=|\$=)\s*([^\s]+)$/.exec(inner);
    const exists = /^([-\w:]+)$/.exec(inner);
    if (exists) {
      if (!getAttr(element.tag, exists[1])) return false;
      continue;
    }
    const parsed = quoted || unquoted;
    if (!parsed) return false;
    const name = parsed[1];
    const operator = parsed[2];
    const wanted = decodeEntities(parsed[4] || parsed[3] || '');
    const actual = getAttr(element.tag, name);
    if (operator === '=' && actual !== wanted) return false;
    if (operator === '*=' && !actual.includes(wanted)) return false;
    if (operator === '^=' && !actual.startsWith(wanted)) return false;
    if (operator === '$=' && !actual.endsWith(wanted)) return false;
  }
  return true;
}

function select(source, token) {
  const parts = String(token || '').trim().split(/\s+>\s+|\s+/).filter(Boolean);
  if (!parts.length) return [];
  let current = elementsFrom(source, /^([a-zA-Z][\w-]*)/.exec(parts[0]) ? /^([a-zA-Z][\w-]*)/.exec(parts[0])[1] : '*')
    .filter((element) => matchesSimple(element, parts[0]));
  for (let i = 1; i < parts.length && current.length; i++) {
    const scope = current.map((element) => element.inner).join('\n');
    const tagMatch = /^([a-zA-Z][\w-]*)/.exec(parts[i]);
    current = elementsFrom(scope, tagMatch ? tagMatch[1] : '*')
      .filter((element) => matchesSimple(element, parts[i]));
  }
  return current;
}

function parseHtml(html, selector, attr) {
  const source = String(html || '');
  const selectors = String(selector || '').split(',').map((value) => value.trim()).filter(Boolean);
  const result = [];
  const seen = new Set();
  for (const item of selectors) {
    for (const element of select(source, item)) {
      const key = element.tag + '|' + element.inner;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(makeEntry(element, attr));
    }
  }
  return result;
}

function card(kind, slug, title, image, year) {
  const href = `/${kind}/${slug}/`;
  return `<article id="post-19031" class="item ${kind === 'movies' ? 'movies' : 'tvshows'}">
    <div class="poster"><a href="${href}"><img src="${ROOT}/uploads/${image}-185x278.jpg" alt="${title}"></a></div>
    <div class="data"><span>Oct. 07, ${year}</span><h3><a href="${href}">${title}</a></h3><div class="dtinfo"><p>Sinopsis de ${title}.</p></div></div>
  </article>`;
}

function episodeCard(slug, title, image) {
  const href = `/episodes/${slug}/`;
  return `<article id="post-19032" class="item episodes">
    <div class="poster"><a href="${href}"><img src="${ROOT}/uploads/${image}.jpg" alt="${title}"></a></div>
    <div class="data"><span>Sep. 18, 2024</span><h3><a href="${href}">${title}</a></h3></div>
  </article>`;
}

function landscapeCard(kind, slug, title, image, year) {
  const href = `/${kind}/${slug}/`;
  return `<article id="post-19033" class="item ${kind === 'movies' ? 'movies' : 'tvshows'}">
    <div class="image"><a href="${href}"><img src="${ROOT}/uploads/${image}.jpg" alt="${title}"></a></div>
    <div class="data"><span>${year}</span><h3 class="title"><a href="${href}">${title}</a></h3></div>
  </article>`;
}

const PLAYER_OPTIONS = `
  <ul id="playeroptionsul" class="no_ajax">
    <li class="dooplay_player_option" data-post="19031" data-type="movie" data-nume="1"><span class="server">uqload</span><span class="title">uqload</span></li>
    <li class="dooplay_player_option" data-post="19031" data-type="movie" data-nume="2"><span class="server">fivemanage</span><span class="title">fivemanage</span></li>
    <li class="dooplay_player_option" data-post="19031" data-type="movie" data-nume="3"><span class="server">waaw</span><span class="title">waaw</span></li>
  </ul>
  <div class="dooplay_player"><div id="playcontainer" class="play"><div id="dooplay_player_content">
    <div id="source-player-1" class="source-box"><div class="pframe"><iframe src="https://uqload.example/embed-abc.html"></iframe></div></div>
    <div id="source-player-2" class="source-box"><div class="pframe"><iframe src="${ROOT}/uploads/video.mp4"></iframe></div></div>
    <div id="source-player-3" class="source-box"><div class="pframe"><iframe src="https://waaw.example/embed"></iframe></div></div>
  </div></div></div>
`;

const STREAMTAPE_URL = 'https://streamtape.com/e/ZD1ZJAR0eGiqJWq/';
const STREAMTAPE_DIRECT = 'https://streamtape.com/get_video?id=ZD1ZJAR0eGiqJWq&expires=1795450241&ip=FHEsF0InDS9X&token=gTBYciecEX4h';
const STREAMTAPE_HTML = `
  <div id="norobotlink">document.getElementById('norobotlink').innerHTML = '//streamtape.com/get_video?id=ZD1ZJAR0eGiqJWq&amp;expires=1795450241' + '&amp;ip=FHEsF0InDS9X&amp;token=gTBYciecEX4h';</div>
`;

const STREAMTAPE_LITERAL_URL = 'https://streamtape.com/e/literal12345/';
const STREAMTAPE_LITERAL_DIRECT = 'https://streamtape.com/get_video?id=literal12345&expires=1795450940&ip=GxqsEROnDS9X&token=gTFLsppd1cde';
const STREAMTAPE_LITERAL_HTML = `
  <div id="ideoolink" style="display:none;">/streamtape.com/get_video?id=literal12345&amp;expires=1795450940&amp;ip=GxqsEROnDS9X&amp;token=gTFLsppd1cde</div>
`;

const STREAMTAPE_OBFUSCATED_URL = 'https://streamtape.com/e/obfuscated12345/';
const STREAMTAPE_OBFUSCATED_DIRECT = 'https://streamtape.com/get_video?id=obfuscated12345&expires=1795455406&ip=GxqsEROnDS9X&token=HwqeruobmtEa';
const STREAMTAPE_OBFUSCATED_HTML = `
  <div id="ideoolink" style="display:none;">/streamtape.com/get_video?id=obfuscated12345&amp;expires=1795455406&amp;ip=GxqsEROnDS9X&amp;token=placeholdercde</div>
  <script>
    document.getElementById('ideoolink').innerHTML = '/streamtape.comb/get_video?id=obfuscated12345&amp;expires=1795455406&amp;ip=GxqsEROnDS9X&amp;token=decoyxyz';
    document.getElementById('ideoolink').innerHTML = '//streamtape.co'+ ('xcdm/get_video?id=obfuscated12345&amp;expires=1795455406&amp;ip=GxqsEROnDS9X&amp;token=HwqeruobmtEa').substring(2).substring(1);
  </script>
`;

const STREAMTAPE_TRAILING_URL = 'https://streamtape.com/e/trailing12345/';
const STREAMTAPE_TRAILING_DIRECT = 'https://streamtape.com/get_video?id=trailing12345&expires=1795455600&ip=GxqsEROnDS9X&token=ValidToken99';
const STREAMTAPE_TRAILING_HTML = `
  <div id="ideoolink" style="display:none;">/streamtape.com/get_video?id=trailing12345&amp;expires=1795455600&amp;ip=GxqsEROnDS9X&amp;token=placeholdercde</div>
  <script>
    document.getElementById('ideoolink').innerHTML = '//streamtape.comb'.substring(0, 16) + '/xb/get_video?id=trailing12345&amp;expires=1795455600&amp;ip=GxqsEROnDS9X&amp;token=ValidToken99'.substring(3, 200);
    document.getElementById('ideoolink').innerHTML = 'Cargando...';
  </script>
`;

const STREAMTAPE_UNSUPPORTED_URL = 'https://streamtape.com/e/unsupported12345/';
const STREAMTAPE_UNSUPPORTED_LITERAL = 'https://streamtape.com/get_video?id=unsupported12345&expires=1795455700&ip=GxqsEROnDS9X&token=placeholdercde';
const STREAMTAPE_UNSUPPORTED_HTML = `
  <div id="ideoolink" style="display:none;">/streamtape.com/get_video?id=unsupported12345&amp;expires=1795455700&amp;ip=GxqsEROnDS9X&amp;token=placeholdercde</div>
  <script>
    document.getElementById('ideoolink').innerHTML = '//notstreamtape.com/get_video?id=unsupported12345&amp;expires=1795455700&amp;ip=GxqsEROnDS9X&amp;token=decoyxyz';
    document.getElementById('ideoolink').innerHTML = atob('ZmFrZQ==');
  </script>
`;

const UQLOAD_URL = 'https://uqload.vc/e/qz6fftnxdhv5?e19.uqload.vc/i/02/06269/qz6fftnxdhv5';
const UQLOAD_DIRECT = 'https://e19.uqload.vc/i/02/06269/qz6fftnxdhv5/v.mp4';
const UQLOAD_HTML = `
  <script>var playerConfig = { sources: ["${UQLOAD_DIRECT}"] };</script>
`;

const UQLOAD_QUERY_URL = 'https://uqload.vc/e/abcdef?e11.uqload.vc/i/01/00000/abcdef';
const UQLOAD_QUERY_DIRECT = 'https://e11.uqload.vc/i/01/00000/abcdef/v.mp4';

const DOOD_URL = 'https://playmogo.com/e/xc8o3b0i2bfm';
const DOOD_MD5_PATH = '/pass_md5/289746223-47-63-1795380241-65093c254763c75a183234c18288f32d/6o96p7hargbwqo07jmyfwuyy';
const DOOD_MD5_URL = 'https://playmogo.com' + DOOD_MD5_PATH;
const DOOD_MD5_BODY = 'https://cdn.playmogo.com/videos/289746223/';
const DOOD_DIRECT = DOOD_MD5_BODY + 'AAAAAAAAAA?token=6o96p7hargbwqo07jmyfwuyy&expiry=1700000000000';
const DOOD_HTML = `
  <script>
    $.cookie('file_id', '289746223', { expires: 10 });
    $.get('${DOOD_MD5_PATH}', function(data) {
      dsplayer.src({ type: "video/mp4", src: data + makePlay() });
    });
    function makePlay() {
      for (var a = "", t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", n = t.length, o = 0; 10 > o; o++) a += t.charAt(Math.floor(Math.random() * n));
      return a + "?token=6o96p7hargbwqo07jmyfwuyy&expiry=" + Date.now();
    }
  </script>
`;

const POWVIDEO_URL = 'https://powvideo.org/embed-yhh9gqw6c8ss.html';
const POWVIDEO_DIRECT = 'https://video.powvideo.org/yhh9gqw6c8ss/init-a1-x3.mp4';
const POWVIDEO_HTML = `
  <script>jwplayer("player").setup({ sources: [{ file: "${POWVIDEO_DIRECT}", type: "mp4" }] });</script>
`;

const REAL_PLAYER_OPTIONS = `
  <ul id="playeroptionsul" class="no_ajax">
    <li class="dooplay_player_option" data-nume="1"><span class="title">Ver trailer</span></li>
    <li class="dooplay_player_option" data-nume="2"><span class="title">UqLoadCastellano</span></li>
    <li class="dooplay_player_option" data-nume="3"><span class="title">StreamTapeCastellano</span></li>
    <li class="dooplay_player_option" data-nume="4"><span class="title">PowVideoCastellano</span></li>
    <li class="dooplay_player_option" data-nume="5"><span class="title">Playmogo</span></li>
  </ul>
  <div class="dooplay_player"><div id="dooplay_player_content">
    <div id="source-player-1" class="source-box"><iframe src="https://www.youtube.com/embed/trailer"></iframe></div>
    <div id="source-player-2" class="source-box"><iframe src="${UQLOAD_URL}"></iframe></div>
    <div id="source-player-3" class="source-box"><iframe src="${STREAMTAPE_URL}"></iframe></div>
    <div id="source-player-4" class="source-box"><iframe src="${POWVIDEO_URL}"></iframe></div>
    <div id="source-player-5" class="source-box"><iframe src="${DOOD_URL}"></iframe></div>
  </div></div>
`;

class FixedDate extends Date {
  static now() {
    return 1700000000000;
  }
}

const FIXED_GLOBALS = {
  Date: FixedDate,
  Math: Object.assign(Object.create(Math), { random: () => 0 })
};

const ROOT_HTML = `
  <ul id="menu-main">
    <li class="menu-item"><a href="/genre/marvel/">MARVEL</a></li>
    <li class="menu-item"><a href="/genre/netflix/">NETFLIX</a></li>
  </ul>
  <nav class="genres"><h2 class="widget-title">Géneros</h2><ul class="genres falsescroll">
    <li class="cat-item"><a href="/genre/accion/">Acción</a></li>
    <li class="cat-item"><a href="/genre/action-adventure/">Action &amp; Adventure</a></li>
    <li class="cat-item"><a href="/genre/aventura/">Aventura</a></li>
    <li class="cat-item"><a href="/genre/terror/">Terror</a></li>
  </ul></nav>
  ${card('movies', 'la-otra-madre', 'La otra madre', 'poster', 2026)}
  ${card('tvshows', 'agatha-quien-si-no', 'Agatha quien si no', 'agatha', 2024)}
  ${episodeCard('agatha-quien-si-no-1x1', 'Encontrad la Senda', 'episode-300x170')}
`;

const MOVIES_HTML = [
  landscapeCard('movies', 'la-otra-madre', 'La otra madre', 'backdrop-780x439', 2026),
  landscapeCard('movies', 'exclusivo-catalogo', 'Exclusivo catálogo', 'catalogo-780x439', 2025),
  '<div class="pagination"><a class="arrow_pag" href="/movies/page/2/">Siguiente</a></div>'
].join('');

const TVSHOWS_HTML = card('tvshows', 'agatha-quien-si-no', 'Agatha quien si no', 'agatha', 2024);
const EPISODES_HTML = episodeCard('agatha-quien-si-no-1x1', 'Encontrad la Senda', 'episode-300x170');
const SEARCH_HTML = card('movies', 'matrix-resurrections', 'Matrix Resurrections', 'matrix', 2021);

function detailHtml(options) {
  const config = options || {};
  return `<html><head>
    <meta property="og:image" content="${ROOT}/uploads/${config.image || 'poster'}.jpg" />
  </head><body>
    <div class="sheader">
      <div class="poster"><img src="${ROOT}/uploads/${config.poster || config.image || 'poster'}-200x300.jpg" itemprop="image"></div>
      <div class="data">
        <h1>${config.title || 'La otra madre'}</h1>
        <div class="starstruck-rating"><span class="dt_rating_vgs" itemprop="ratingValue">5</span></div>
        <div class="extra"><span class="date" itemprop="dateCreated">Oct. 07, 2026</span><span itemprop="duration" class="runtime">93 Min.</span></div>
        <div class="sgeneros"><a href="/genre/terror/" rel="tag">Terror</a></div>
      </div>
    </div>
    <div id="info" class="sbox">
      <div class="wp-content" itemprop="description">Bela, una niña de 8 años.</div>
      ${config.episodeTitle ? `<h3 class="epih3">${config.episodeTitle}</h3>` : ''}
      ${config.playerOptions || PLAYER_OPTIONS}
    </div>
  </body></html>`;
}

const MOVIE_DETAIL_HTML = detailHtml({});
const REAL_MOVIE_DETAIL_HTML = detailHtml({ playerOptions: REAL_PLAYER_OPTIONS });
const BACKDROP_DETAIL_HTML = detailHtml({ image: 'backdrop-780x439', poster: 'poster' });
const EPISODE_DETAIL_HTML = detailHtml({ title: 'Agatha 1x1', episodeTitle: 'Encontrad la Senda', image: 'episode' });

const SERIES_DETAIL_HTML = `
  <div class="sheader"><div class="poster"><img src="${ROOT}/uploads/agatha-200x300.jpg" itemprop="image"></div><div class="data"><h1>Agatha quien si no</h1><div class="extra"><span class="date" itemprop="dateCreated">Sep. 18, 2024</span></div></div></div>
  <div id="seasons"><div class="se-c"><div class="se-q"><span class="se-t se-o">1</span><span class="title">Temporada 1</span></div><div class="se-a"><ul class="episodios"><li class="mark-1"><div class="imagen"><img src="${ROOT}/uploads/episode-300x170.jpg"></div><div class="numerando">1 - 1</div><div class="episodiotitle"><a href="${ROOT}/episodes/agatha-quien-si-no-1x1/">Encontrad la Senda</a><span class="date">Sep. 18, 2024</span></div></li></ul></div></div></div>
`;

function bodyFor(target) {
  if (!target) return '';
  if (target === BASE) return ROOT_HTML;
  if (target === BASE + 'movies/') return MOVIES_HTML;
  if (target === BASE + 'tvshows/') return TVSHOWS_HTML;
  if (target === BASE + 'episodes/') return EPISODES_HTML;
  if (target.includes('?s=')) return SEARCH_HTML;
  if (target.includes('/movies/la-otra-madre-real/')) return REAL_MOVIE_DETAIL_HTML;
  if (target.includes('/movies/la-otra-madre-backdrop/')) return BACKDROP_DETAIL_HTML;
  if (target.includes('/movies/la-otra-madre/')) return MOVIE_DETAIL_HTML;
  if (target === STREAMTAPE_URL) return STREAMTAPE_HTML;
  if (target === STREAMTAPE_LITERAL_URL) return STREAMTAPE_LITERAL_HTML;
  if (target === STREAMTAPE_OBFUSCATED_URL) return STREAMTAPE_OBFUSCATED_HTML;
  if (target === STREAMTAPE_TRAILING_URL) return STREAMTAPE_TRAILING_HTML;
  if (target === STREAMTAPE_UNSUPPORTED_URL) return STREAMTAPE_UNSUPPORTED_HTML;
  if (target === UQLOAD_URL) return UQLOAD_HTML;
  if (target === DOOD_URL) return DOOD_HTML;
  if (target === DOOD_MD5_URL) return DOOD_MD5_BODY;
  if (target === POWVIDEO_URL) return POWVIDEO_HTML;
  if (target.includes('/tvshows/agatha-quien-si-no/')) return SERIES_DETAIL_HTML;
  if (target.includes('/episodes/agatha-quien-si-no-1x1/')) return EPISODE_DETAIL_HTML;
  return '';
}

function createSandbox(overrides = {}, options = {}) {
  const requests = [];
  const httpGet = async (url, headers) => {
    requests.push({ url, headers });
    if (options.blockDirect && !url.startsWith(PROXY_BASE)) {
      return { status: 403, body: '<title>Just a moment...</title>', headers: {} };
    }
    const target = url.startsWith(PROXY_BASE) ? decodeURIComponent(url.slice(PROXY_BASE.length)) : url;
    const body = bodyFor(target);
    return { status: body ? 200 : 404, body, headers: {} };
  };

  class MultimediaItem {
    constructor(data) {
      Object.assign(this, { type: 'movie', streams: [], recommendations: [], headers: {}, ...data });
    }
  }
  class StreamResult {
    constructor(data) {
      Object.assign(this, { source: 'Auto', ...data });
    }
  }
  class Episode {
    constructor(data) {
      Object.assign(this, { season: 0, episode: 0, streams: [], ...data });
    }
  }

  const sandbox = {
    manifest: {
      packageName: 'dev.alfa.skystream.estrenoscinesaa',
      name: 'EstrenosCinesaa',
      baseUrl: BASE,
      version: 1
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    parse_html: parseHtml,
    http_get: httpGet,
    registerSettings: () => {},
    loadExtractor: async (url) => {
      if (!url.includes('uqload')) return [];
      return [{
        source: 'uqload',
        name: '720p',
        url: 'https://uqload.example/file.m3u8',
        quality: 720,
        headers: { 'X-Test': '1' }
      }];
    },
    MultimediaItem,
    StreamResult,
    Episode,
    Actor: class Actor { constructor(data) { Object.assign(this, data); } },
    Trailer: class Trailer { constructor(data) { Object.assign(this, data); } },
    NextAiring: class NextAiring { constructor(data) { Object.assign(this, data); } },
    ...overrides
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(pluginSource, sandbox);
  return { sandbox, requests };
}

function invoke(callbackApi, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('callback timeout')), 5000);
    callbackApi(...args, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

test('getHome separa películas, series, episodios y géneros', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.deepEqual(Object.keys(result.data), ['Películas', 'Series', 'Últimos episodios', 'Géneros']);
  assert.equal(result.data['Películas'][0].title, 'La otra madre');
  assert.equal(result.data['Películas'][0].posterUrl, `${ROOT}/uploads/poster.jpg`);
  assert.equal(result.data['Películas'][0].year, 2026);
  assert.equal(result.data['Películas'][0].type, 'movie');
  assert.ok(Array.from(result.data['Películas'], (item) => item.title).includes('Página siguiente'));
  assert.equal(result.data['Series'][0].type, 'series');
  assert.equal(result.data['Últimos episodios'][0].title, '1x1 - Encontrad la Senda');
  assert.deepEqual(Array.from(result.data['Géneros'], (item) => item.title), ['Acción', 'Action & Adventure', 'Aventura', 'Terror']);
});

test('getHome no inventa géneros cuando no hay widget', async () => {
  const { sandbox } = createSandbox({
    http_get: async (url) => ({
      status: 200,
      body: url === BASE
        ? '<ul id="menu-main"><li class="menu-item"><a href="/genre/marvel/">MARVEL</a></li></ul>'
        : bodyFor(url),
      headers: {}
    })
  });
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.equal(result.data['Géneros'].length, 0);
});

test('getHome usa carátulas de la portada aunque el catálogo tenga imágenes panorámicas', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.equal(result.data['Películas'][0].posterUrl, `${ROOT}/uploads/poster.jpg`);
  assert.notEqual(result.data['Películas'][0].posterUrl, `${ROOT}/uploads/backdrop-780x439.jpg`);
  assert.ok(Array.from(result.data['Películas'], (item) => item.title).includes('Página siguiente'));
});

test('getHome conserva títulos exclusivos del catálogo sin perder las carátulas de portada', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.getHome);

  const titles = Array.from(result.data['Películas'], (item) => item.title);
  assert.equal(result.success, true);
  assert.equal(result.data['Películas'][0].posterUrl, `${ROOT}/uploads/poster.jpg`);
  assert.ok(titles.includes('Exclusivo catálogo'));
  assert.ok(titles.includes('Página siguiente'));
});

test('load prefiere carátula del detalle sobre og:image panorámica', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.load, `${ROOT}/movies/la-otra-madre-backdrop/`);

  assert.equal(result.success, true);
  assert.equal(result.data.posterUrl, `${ROOT}/uploads/poster.jpg`);
  assert.notEqual(result.data.posterUrl, `${ROOT}/uploads/backdrop-780x439.jpg`);
});

test('search consulta el buscador raíz y filtra resultados útiles', async () => {
  const { sandbox, requests } = createSandbox();
  const result = await invoke(sandbox.search, 'matrix');

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].title, 'Matrix Resurrections');
  assert.ok(decodeURIComponent(result.data[0].url).includes(`${ROOT}/movies/matrix-resurrections/`));
  assert.ok(requests.some((request) => request.url === BASE + '?s=matrix'));
});

test('load obtiene metadata, carátula completa y streams de source-player', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.load, `${ROOT}/movies/la-otra-madre/`);

  assert.equal(result.success, true);
  assert.equal(result.data.title, 'La otra madre');
  assert.equal(result.data.year, 2026);
  assert.equal(result.data.type, 'movie');
  assert.equal(result.data.posterUrl, `${ROOT}/uploads/poster.jpg`);
  assert.equal(result.data.score, 5);
  assert.equal(result.data.duration, 93);
  assert.deepEqual(Array.from(result.data.tags), ['Terror']);
  const urls = Array.from(result.data.streams, (stream) => stream.url);
  assert.deepEqual(urls, ['https://uqload.example/file.m3u8', `${ROOT}/uploads/video.mp4`]);
  assert.equal(result.data.streams[0].headers['X-Test'], '1');
  assert.equal(result.data.streams.some((stream) => stream.url.includes('waaw')), false);
});

test('load de serie construye episodios con temporada, número y URL de estado', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.load, `${ROOT}/tvshows/agatha-quien-si-no/`);

  assert.equal(result.success, true);
  assert.equal(result.data.type, 'series');
  assert.equal(result.data.title, 'Agatha quien si no');
  assert.equal(result.data.episodes.length, 1);
  assert.equal(result.data.episodes[0].name, '1x1 - Encontrad la Senda');
  assert.equal(result.data.episodes[0].season, 1);
  assert.equal(result.data.episodes[0].episode, 1);
  assert.equal(result.data.episodes[0].posterUrl, `${ROOT}/uploads/episode-300x170.jpg`);
  assert.ok(decodeURIComponent(result.data.episodes[0].url).includes(`${ROOT}/episodes/agatha-quien-si-no-1x1/`));
});

test('load de episodio conserva numeración y resuelve streams', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.load, `${ROOT}/episodes/agatha-quien-si-no-1x1/`);

  assert.equal(result.success, true);
  assert.equal(result.data.type, 'series');
  assert.equal(result.data.title, '1x1 - Encontrad la Senda');
  assert.ok(result.data.streams.some((stream) => stream.url === 'https://uqload.example/file.m3u8'));
});

test('load expone un episode reproducible para películas y episodios', async () => {
  const { sandbox } = createSandbox();
  const movie = await invoke(sandbox.load, `${ROOT}/movies/la-otra-madre/`);
  const episode = await invoke(sandbox.load, `${ROOT}/episodes/agatha-quien-si-no-1x1/`);

  for (const [result, target] of [
    [movie, `${ROOT}/movies/la-otra-madre/`],
    [episode, `${ROOT}/episodes/agatha-quien-si-no-1x1/`]
  ]) {
    assert.equal(result.success, true);
    assert.ok(Array.isArray(result.data.episodes));
    assert.equal(result.data.episodes.length, 1);
    assert.ok(decodeURIComponent(result.data.episodes[0].url).includes(target));
  }
});

test('load normaliza respuestas parse_html con innerHTML', async () => {
  const innerHtmlParse = async (html, selector, attr) => Promise.resolve(parseHtml(html, selector, attr)).then((entries) =>
    entries.map((entry) => ({ text: entry.text, innerHTML: entry.html, attr: entry.attr }))
  );
  const { sandbox } = createSandbox({ parse_html: innerHtmlParse });
  const result = await invoke(sandbox.load, `${ROOT}/movies/la-otra-madre/`);

  assert.equal(result.success, true);
  assert.equal(result.data.title, 'La otra madre');
  assert.equal(result.data.posterUrl, `${ROOT}/uploads/poster.jpg`);
  assert.equal(result.data.episodes.length, 1);
});

test('load de estado list devuelve recomendaciones paginadas', async () => {
  const { sandbox } = createSandbox();
  const stateUrl = `alfa:list?url=${encodeURIComponent(BASE + 'movies/')}&title=Pel%C3%ADculas`;
  const result = await invoke(sandbox.load, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.title, 'Películas');
  assert.equal(result.data.recommendations[0].title, 'La otra madre');
  assert.ok(Array.from(result.data.recommendations, (item) => item.title).includes('Página siguiente'));
});

test('loadStreams resuelve una opción directa', async () => {
  const { sandbox } = createSandbox();
  const stateUrl = `alfa:option?url=${encodeURIComponent('https://uqload.example/embed-abc.html')}&source=uqload`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, 'https://uqload.example/file.m3u8');
  assert.equal(result.data[0].quality, 720);
});

test('loadStreams no devuelve embeds sin extractor como streams', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent('https://uqload.ws/embed-inzbnejkoc0b.html')}&source=uqload`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 0);
});

test('loadStreams resuelve StreamTape desde el embed sin extractor', async () => {
  const { sandbox, requests } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(STREAMTAPE_URL)}&source=StreamTapeCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, STREAMTAPE_DIRECT);
  assert.equal(result.data[0].source, 'StreamTapeCastellano');
  assert.equal(result.data[0].headers.Referer, 'https://streamtape.com/');
  assert.ok(requests.some((request) => request.url === STREAMTAPE_URL));
});

test('loadStreams resuelve StreamTape desde enlace literal con barra simple', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(STREAMTAPE_LITERAL_URL)}&source=StreamTapeCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, STREAMTAPE_LITERAL_DIRECT);
});

test('loadStreams usa el ultimo innerHTML evaluado valido de StreamTape', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(STREAMTAPE_OBFUSCATED_URL)}&source=StreamTapeCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, STREAMTAPE_OBFUSCATED_DIRECT);
  assert.equal(result.data[0].headers.Referer, 'https://streamtape.com/');
});

test('loadStreams conserva un innerHTML valido aunque despues aparezca texto', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(STREAMTAPE_TRAILING_URL)}&source=StreamTapeCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, STREAMTAPE_TRAILING_DIRECT);
});

test('loadStreams descarta dominios lookalike y usa el fallback literal', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(STREAMTAPE_UNSUPPORTED_URL)}&source=StreamTapeCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, STREAMTAPE_UNSUPPORTED_LITERAL);
  assert.ok(!result.data[0].url.includes('notstreamtape'));
});

test('loadStreams resuelve DoodStream usando pass_md5 sin extractor', async () => {
  const { sandbox, requests } = createSandbox({ ...FIXED_GLOBALS, loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(DOOD_URL)}&source=Playmogo`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, DOOD_DIRECT);
  assert.equal(result.data[0].source, 'Playmogo');
  assert.equal(result.data[0].headers.Referer, DOOD_URL);
  assert.ok(requests.some((request) => request.url === DOOD_MD5_URL));
});

test('loadStreams resuelve UqLoad desde sources del embed sin extractor', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(UQLOAD_URL)}&source=UqLoadCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, UQLOAD_DIRECT);
  assert.equal(result.data[0].source, 'UqLoadCastellano');
});

test('loadStreams resuelve UqLoad desde la query cuando la página falla', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(UQLOAD_QUERY_URL)}&source=UqLoadCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, UQLOAD_QUERY_DIRECT);
});

test('loadStreams resuelve PowVideo desde source del reproductor sin extractor', async () => {
  const { sandbox } = createSandbox({ loadExtractor: async () => [] });
  const stateUrl = `alfa:option?url=${encodeURIComponent(POWVIDEO_URL)}&source=PowVideoCastellano`;
  const result = await invoke(sandbox.loadStreams, stateUrl);

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, POWVIDEO_DIRECT);
  assert.equal(result.data[0].source, 'PowVideoCastellano');
});

test('loadStreams resuelve fuentes reales y omite el tráiler', async () => {
  const { sandbox } = createSandbox({ ...FIXED_GLOBALS, loadExtractor: async () => [] });
  const result = await invoke(sandbox.loadStreams, `${ROOT}/movies/la-otra-madre-real/`);

  assert.equal(result.success, true);
  assert.deepEqual(Array.from(result.data, (stream) => stream.url), [UQLOAD_DIRECT, STREAMTAPE_DIRECT, POWVIDEO_DIRECT, DOOD_DIRECT]);
  assert.equal(result.data.some((stream) => /trailer|youtube/i.test(stream.url)), false);
});

test('getHome usa el proxy cuando la respuesta directa está bloqueada', async () => {
  const { sandbox, requests } = createSandbox({}, { blockDirect: true });
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.equal(result.data['Películas'][0].title, 'La otra madre');
  const proxyRequests = requests.filter((request) => request.url.startsWith(PROXY_BASE));
  assert.ok(proxyRequests.length >= 1);
  assert.ok(proxyRequests.every((request) => request.headers['X-Respond-With'] === 'html'));
  assert.ok(proxyRequests.some((request) => decodeURIComponent(request.url.slice(PROXY_BASE.length)) === BASE));
});
