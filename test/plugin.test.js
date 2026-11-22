const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pluginSource = fs.readFileSync(path.join(__dirname, '..', 'cinecalidad', 'plugin.js'), 'utf8');
const BASE = 'https://www.cinecalidad.vg/espana/';
const ROOT = 'https://www.cinecalidad.vg';
const PROXY_BASE = 'https://r.jina.ai/';

function b64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function article(href, title, year, image, plot, useDataSrc = false) {
  const imageAttr = useDataSrc ? `data-src="${image}"` : `src="${image}"`;
  return `<article><a href="${href}"><img class="w-full" ${imageAttr} title="${title} (${year})" alt="${title}"></a><div><p>${plot}</p></div></article>`;
}

const HOME_HTML = [
  article('/pelicula/the-kill-room/', 'The Kill Room', 2023, `${ROOT}/poster-src.jpg`, 'Un asesinato.'),
  article('/pelicula/matrix/', 'Matrix', 1999, `${ROOT}/matrix.jpg`, 'Un hacker descubre la verdad.', true),
  article('/serie/fractura/', 'Fractura', 2024, `${ROOT}/fractura.jpg`, 'Serie descartada.'),
  article('/pelicula/promo/', 'Promo Premium', 2024, `${ROOT}/promo.jpg`, 'Promo descartada.'),
  '<nav class="pagination"><a href="/espana/page/1/">1</a><a href="/espana/page/2/">2</a><a href="/espana/page/2/">Next</a></nav>'
].join('');

const SEARCH_HTML = article('/pelicula/matrix/', 'Matrix', 1999, `${ROOT}/matrix.jpg`, 'Resultado de busqueda.');

const VIMEO_M3U8 = 'https://s13.vimeos.net/hls2/03/00000/jyr89xiy7has_h/master.m3u8?t=test';
const VIMEO_EMBED_HTML = `<script>eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3/4/5.6?t=test";',62,7,'var|url|https|s13.vimeos.net|hls2/03/00000/jyr89xiy7has_h|master|m3u8'.split('|'),0,{}))</script>`;
const VIDEOAPP_EMBED_HTML = `<iframe id="frame" src="https://vimeos.net/embed-jyr89xiy7has.html"></iframe>`;
const INTERMEDIATE_HTML = '<div id="btn_enlace"><a href="https://streamwish.example/embed/xyz">Ver</a></div>';

const DETAIL_HTML = `
  <div><img class="w-full" src="${ROOT}/the-kill-room.jpg" title="The Kill Room (2023)" alt="The Kill Room"></div>
  <h1>The Kill Room</h1>
  <div class="sinopsis"><p>Un asesinato.</p></div>
  <span class="score">7.1</span>
  <span class="runtime">93 min</span>
  <ul class="py-2 options dff">
    <li><a class="inline-block" data-src="${b64('https://vimeos.net/embed-jyr89xiy7has.html')}">vimeos</a></li>
    <li><a class="inline-block" data-src="${b64('https://videoapp.zip/e/movie/958006')}">videoapp</a></li>
    <li><a class="inline-block" data-url="${b64(`${ROOT}/links/${b64('1/110372/1')}`)}">Streamwish</a></li>
    <li><a class="inline-block" data-src="${b64('magnet:?xt=urn:btih:abc')}">Utorrent</a></li>
  </ul>
  <a href="/categoria/ciencia-ficcion">Ciencia ficcion</a>
`;

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
  const source = String(html || '');
  if (tagName.toLowerCase() === 'img') {
    const voidRegex = /<img\b([^>]*)>/gi;
    const voidResult = [];
    let voidMatch;
    while ((voidMatch = voidRegex.exec(source)) !== null) {
      voidResult.push({ tag: voidMatch[0], attrs: voidMatch[1], inner: '' });
    }
    return voidResult;
  }
  const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const result = [];
  let match;
  while ((match = regex.exec(source)) !== null) {
    result.push({ tag: match[0], attrs: match[1], inner: match[2] });
  }
  return result;
}

function makeEntry(element, attr) {
  return {
    text: stripTags(element.inner),
    html: element.inner,
    attr: attr ? getAttr(element.tag, attr) : ''
  };
}

function anchorsIn(scope, className, hrefContains) {
  return elementsFrom(scope, 'a').filter((element) => {
    if (className && !hasClass(element.attrs, className)) return false;
    if (hrefContains && !getAttr(element.tag, 'href').includes(hrefContains)) return false;
    return true;
  });
}

function parseHtml(html, selector, attr) {
  const source = String(html || '');
  const selectors = String(selector || '').split(',').map((value) => value.trim()).filter(Boolean);
  const result = [];
  for (const item of selectors) {
    if (item === 'article') {
      for (const element of elementsFrom(source, 'article')) result.push(makeEntry(element, attr));
      continue;
    }
    if (item === 'nav.pagination a[href]') {
      const nav = /<nav\b[^>]*class=["'][^"']*pagination[^"']*["'][\s\S]*?<\/nav>/i.exec(source);
      if (nav) for (const element of anchorsIn(nav[0])) result.push(makeEntry(element, attr));
      continue;
    }
    if (item === 'ul.py-2.options.dff a.inline-block') {
      const list = /<ul\b[^>]*class=["'][^"']*py-2[^"']*options[^"']*dff[^"']*["'][\s\S]*?<\/ul>/i.exec(source);
      if (list) for (const element of anchorsIn(list[0], 'inline-block')) result.push(makeEntry(element, attr));
      continue;
    }
    if (item === '#btn_enlace a[href]') {
      const container = /<div\b[^>]*id=["']btn_enlace["'][\s\S]*?<\/div>/i.exec(source);
      if (container) for (const element of anchorsIn(container[0])) result.push(makeEntry(element, attr));
      continue;
    }
    if (item === 'a[href*="/categoria/"]') {
      for (const element of anchorsIn(source, '', '/categoria/')) result.push(makeEntry(element, attr));
      continue;
    }
    const classSelector = /^([a-zA-Z0-9]+)\.([-\w]+)$/.exec(item);
    const tagName = (classSelector ? classSelector[1] : (/^[a-zA-Z0-9]+/.exec(item) || [''])[0]);
    if (!tagName) continue;
    for (const element of elementsFrom(source, tagName)) {
      if (item === 'img.w-full' && !hasClass(element.attrs, 'w-full')) continue;
      if (classSelector && !hasClass(element.attrs, classSelector[2])) continue;
      result.push(makeEntry(element, attr));
    }
  }
  return result;
}

function bodyFor(target) {
  if (!target) return '';
  if (target === BASE) return HOME_HTML;
  if (target.includes('?s=')) return SEARCH_HTML;
  if (target.includes('/pelicula/the-kill-room/')) return DETAIL_HTML;
  if (target.includes('/links/1/110372/1')) return INTERMEDIATE_HTML;
  if (target.includes('vimeos.net/embed-jyr89xiy7has.html')) return VIMEO_EMBED_HTML;
  if (target.includes('videoapp.zip/e/movie/958006')) return VIDEOAPP_EMBED_HTML;
  return '';
}

function createSandbox(overrides = {}, options = {}) {
  const requests = [];
  const httpGet = async (url, headers) => {
    requests.push({ url, headers });
    if (options.blockDirect && !url.startsWith(PROXY_BASE)) {
      return { status: 403, body: '<title>Just a moment...</title>', headers: {} };
    }
    const target = url.startsWith(PROXY_BASE)
      ? decodeURIComponent(url.slice(PROXY_BASE.length))
      : url;
    const body = bodyFor(target);
    return { status: body ? 200 : 404, body, headers: {} };
  };
  const httpParallel = async (entries) => Promise.all(entries.map((entry) => httpGet(entry.url, entry.headers)));

  class MultimediaItem {
    constructor(data) {
      Object.assign(this, { type: 'movie', streams: [], headers: {}, ...data });
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
      packageName: 'dev.alfa.skystream.cinecalidad',
      name: 'CineCalidad',
      baseUrl: BASE,
      version: 2
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    parse_html: parseHtml,
    http_get: httpGet,
    http_parallel: httpParallel,
    registerSettings: () => {},
    loadExtractor: async (url) => {
      if (!url.includes('streamwish')) return [];
      return [{
        source: 'Streamwish',
        name: '1080p',
        url: 'https://streamwish.example/file.m3u8',
        quality: 1080,
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

test('getHome publica solo CineCalidad España y usa src como carátula', async () => {
  const { sandbox, requests } = createSandbox();
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.deepEqual(Object.keys(result.data), ['Castellano']);
  assert.equal(result.data.Castellano[0].title, 'The Kill Room');
  assert.equal(result.data.Castellano[0].posterUrl, `${ROOT}/poster-src.jpg`);
  assert.equal(result.data.Castellano[1].title, 'Matrix');
  assert.equal(result.data.Castellano[1].posterUrl, `${ROOT}/matrix.jpg`);
  assert.ok(decodeURIComponent(result.data.Castellano[0].url).includes('castellano=sp'));
  assert.equal(result.data.Castellano.some((item) => item.url.includes('/serie/')), false);
  assert.equal(result.data.Castellano.some((item) => item.title.includes('Premium')), false);
  assert.equal(requests.some((request) => request.url.startsWith(PROXY_BASE)), false);
});

test('search consulta solo el buscador raíz y fuerza castellano en los resultados', async () => {
  const { sandbox, requests } = createSandbox();
  const result = await invoke(sandbox.search, 'the matrix');

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].title, 'Matrix');
  assert.ok(decodeURIComponent(result.data[0].url).includes('castellano=sp'));
  assert.ok(requests.some((request) => request.url.includes('s=the%20matrix')));
  assert.equal(requests.some((request) => request.url.includes('/espana/?s=')), false);
});

test('load obtiene metadata, carátula y streams embebidos resueltos', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.load, `${ROOT}/pelicula/the-kill-room/?castellano=sp`);

  assert.equal(result.success, true);
  assert.equal(result.data.title, 'The Kill Room');
  assert.equal(result.data.year, 2023);
  assert.equal(result.data.type, 'movie');
  assert.equal(result.data.posterUrl, `${ROOT}/the-kill-room.jpg`);
  assert.equal(result.data.duration, 93);
  const urls = result.data.streams.map((stream) => stream.url);
  assert.ok(urls.includes(VIMEO_M3U8));
  assert.ok(urls.includes('https://streamwish.example/file.m3u8'));
  assert.equal(urls.some((url) => url.includes('magnet:')), false);
});

test('loadStreams resuelve un enlace directo con loadExtractor', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.loadStreams, 'https://streamwish.example/embed/xyz');

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].url, 'https://streamwish.example/file.m3u8');
  assert.equal(result.data[0].quality, 1080);
});

test('getHome usa el proxy cuando la respuesta directa esta bloqueada', async () => {
  const { sandbox, requests } = createSandbox({}, { blockDirect: true });
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.equal(result.data.Castellano[0].title, 'The Kill Room');
  const proxyRequests = requests.filter((request) => request.url.startsWith(PROXY_BASE));
  assert.ok(proxyRequests.length >= 1);
  assert.ok(proxyRequests.every((request) => request.headers['X-Respond-With'] === 'html'));
  assert.ok(proxyRequests.some((request) => decodeURIComponent(request.url.slice(PROXY_BASE.length)) === BASE));
});

test('search usa el proxy cuando la respuesta directa esta bloqueada', async () => {
  const { sandbox, requests } = createSandbox({}, { blockDirect: true });
  const result = await invoke(sandbox.search, 'the matrix');

  assert.equal(result.success, true);
  assert.equal(result.data[0].title, 'Matrix');
  assert.ok(requests.some((request) => {
    if (!request.url.startsWith(PROXY_BASE)) return false;
    return decodeURIComponent(request.url.slice(PROXY_BASE.length)).includes('s=the%20matrix');
  }));
});

test('load usa el proxy para metadata y streams cuando la respuesta directa esta bloqueada', async () => {
  const { sandbox, requests } = createSandbox({}, { blockDirect: true });
  const result = await invoke(sandbox.load, `${ROOT}/pelicula/the-kill-room/?castellano=sp`);

  assert.equal(result.success, true);
  assert.equal(result.data.title, 'The Kill Room');
  assert.equal(result.data.year, 2023);
  assert.ok(result.data.streams.some((stream) => stream.url === VIMEO_M3U8));
  assert.ok(requests.some((request) => {
    if (!request.url.startsWith(PROXY_BASE)) return false;
    return decodeURIComponent(request.url.slice(PROXY_BASE.length)).includes('/pelicula/the-kill-room/');
  }));
});

test('getHome usa el proxy cuando la solicitud directa lanza error', async () => {
  const requests = [];
  const httpGet = async (url, headers) => {
    requests.push({ url, headers });
    if (!url.startsWith(PROXY_BASE)) throw new Error('network down');
    return { status: 200, body: HOME_HTML, headers: {} };
  };
  const { sandbox } = createSandbox({ http_get: httpGet, http_parallel: undefined });
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.equal(result.data.Castellano[0].title, 'The Kill Room');
  assert.ok(requests.some((request) => request.url.startsWith(PROXY_BASE)));
});
