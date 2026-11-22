const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pluginSource = fs.readFileSync(path.join(__dirname, '..', 'cinecalidad', 'plugin.js'), 'utf8');
const LATINO = 'https://www.cinecalidad.vg';

function b64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function article(href, title, year, image, plot) {
  return `<article><a href="${href}"><img class="w-full" data-src="${image}" title="${title} (${year})" alt="${title}"></a><div><p>${plot}</p></div></article>`;
}

const HOME_HTML = [
  article('/pelicula/matrix', 'Matrix', 1999, `${LATINO}/matrix.jpg`, 'Un hacker descubre la verdad.'),
  article('/serie/fractura', 'Fractura', 2024, `${LATINO}/fractura.jpg`, 'Serie descartada.'),
  article('/pelicula/promo', 'Promo Premium', 2024, `${LATINO}/promo.jpg`, 'Promo descartada.'),
  '<nav class="pagination"><a href="/page/1/">1</a><a href="/page/2/">2</a><a href="/page/2/">Siguiente</a></nav>'
].join('');

const SEARCH_HTML = article('/pelicula/matrix', 'Matrix', 1999, `${LATINO}/matrix.jpg`, 'Resultado de busqueda.');

const DETAIL_HTML = `
  <div><img class="w-full" data-src="${LATINO}/matrix-poster.jpg" title="Matrix (1999)" alt="Matrix"></div>
  <h1>Matrix 4K HDR Online</h1>
  <div class="sinopsis"><p>Un hacker descubre la verdad.</p></div>
  <span class="score">8.7</span>
  <span class="runtime">136 min</span>
  <ul class="py-2 options dff">
    <li><a class="inline-block" data-url="${b64(`${LATINO}/go/stream-1`)}">Streamwish</a></li>
    <li><a class="inline-block" data-src="${b64('magnet:?xt=urn:btih:abc')}">torrent</a></li>
  </ul>
  <a href="/categoria/ciencia-ficcion">Ciencia ficcion</a>
`;

const INTERMEDIATE_HTML = '<div id="btn_enlace"><a href="https://streamwish.example/embed/xyz">Ver</a></div>';

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
    const tagName = (/^[a-zA-Z0-9]+/.exec(item) || [''])[0];
    if (!tagName) continue;
    for (const element of elementsFrom(source, tagName)) {
      if (item === 'img.w-full' && !hasClass(element.attrs, 'w-full')) continue;
      result.push(makeEntry(element, attr));
    }
  }
  return result;
}

function createSandbox(overrides = {}) {
  const requests = [];
  const httpGet = async (url, headers) => {
    requests.push({ url, headers });
    let body = '';
    if (url.includes('peliculas-populares') || url.includes('estrenos') || url.includes('/peliculas')) {
      body = HOME_HTML;
    } else if (url.includes('?s=')) {
      body = SEARCH_HTML;
    } else if (url.includes('/pelicula/matrix')) {
      body = DETAIL_HTML;
    } else if (url.includes('/go/stream-1')) {
      body = INTERMEDIATE_HTML;
    }
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
      baseUrl: LATINO,
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
    http_parallel: httpParallel,
    registerSettings: () => {},
    loadExtractor: async (url, referer) => {
      if (!url.includes('streamwish')) return [];
      return [{
        source: 'Streamwish',
        name: '1080p',
        url: 'https://streamwish.example/file.m3u8',
        quality: 1080,
        headers: { 'X-Test': '1' },
        referer
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

test('getHome publica categorias y filtra series y promociones', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.getHome);

  assert.equal(result.success, true);
  assert.ok(result.data.Trending.length >= 1);
  assert.equal(result.data.Trending[0].title, 'Matrix');
  assert.ok(decodeURIComponent(result.data.Trending[0].url).includes('/pelicula/matrix'));
  assert.ok(result.data.Estrenos);
  assert.ok(result.data['Películas']);
  assert.ok(result.data.Castellano);
  assert.ok(result.data['Portugués']);
  assert.equal(result.data.Trending.some((item) => item.url.includes('/serie/')), false);
  assert.equal(result.data.Trending.some((item) => item.title.includes('Premium')), false);
});

test('search consulta el parametro s y devuelve resultados parseados', async () => {
  const { sandbox, requests } = createSandbox();
  const result = await invoke(sandbox.search, 'the matrix');

  assert.equal(result.success, true);
  assert.equal(result.data.length >= 1, true);
  assert.equal(result.data[0].title, 'Matrix');
  assert.ok(requests.some((request) => request.url.includes('s=the%20matrix')));
});

test('load obtiene metadata y streams desde opciones base64', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.load, `${LATINO}/pelicula/matrix`);

  assert.equal(result.success, true);
  assert.equal(result.data.title, 'Matrix');
  assert.equal(result.data.year, 1999);
  assert.equal(result.data.type, 'movie');
  assert.ok(result.data.streams.length >= 1);
  assert.equal(result.data.streams[0].url, 'https://streamwish.example/file.m3u8');
  assert.equal(result.data.streams[0].source, 'Streamwish');
});

test('loadStreams resuelve un enlace directo con loadExtractor', async () => {
  const { sandbox } = createSandbox();
  const result = await invoke(sandbox.loadStreams, 'https://streamwish.example/embed/xyz');

  assert.equal(result.success, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].quality, 1080);
});
