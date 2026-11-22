(function() {
  const DEFAULT_LATINO = 'https://www.cinecalidad.vg';
  const DEFAULT_CASTELLANO = DEFAULT_LATINO + '/espana/';
  const DEFAULT_PORTUGUES = 'https://www.cinemaqualidade.im';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

  const TITLE_CLEAN = [
    /\b(?:TV|Online|4k-hdr|fullbluray|4k|3d|miniserie|imax)\b/gi,
    /[\[|(]?\d{3,4}p[\])]?|[\[|(]?(?:4k|3d|uhd|hdr)[\])]?/gi,
    /[-|(]?\s*HDRip\)?|microHD|\(?BR-LINE\)?|\(?HDTS-SCREENER\)?/gi,
    /\(?BDRip\)?|\(?BR-Screener\)?|\(?DVDScreener\)?|\(?TS-Screener\)?|[\(|\[]\S*\.*$/gi,
    /Castellano-*|Ingl.s|Trailer|Audio|\(*SBS\)*|\[*\(*dvd\s*r\d*\w*\]*\)*|[\[|(]*dv\S*[\)|\]]*/gi,
    /Dual|Subt\w*|\(?Reparado\)?|\(?Proper\)?|\(?Latino\)?|saga(?:\s*del)?/gi,
    /(?:&#8211;)?\s*temp.*?\d+.*/gi,
    /\d?\d?&#.*/g,
    /\d+[x|×]\d+.*/g,
    /[\(|\[]\s*[\)|\]]/g,
    /\b(?:libro|volumen)?\s+\d{1,2}$/gi
  ];

  const SERVER_NAMES = {
    dood: 'Doodstream',
    watchsb: 'Streamsb',
    maxplay: 'voe',
    hlswish: 'Streamwish',
    filemoon: 'Filemoon',
    '1fichier': 'Onefichier',
    latmax: 'Fembed',
    ok: 'Okru',
    torrent: 'Torrent'
  };

  const SKIP_SERVERS = ['cineplay', 'netu', 'trailer', 'fembed', 'dood', 'doodstream'];

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(Number(code)); })
      .replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); })
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function cleanTitle(value) {
    let title = decodeEntities(value).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < TITLE_CLEAN.length; i++) title = title.replace(TITLE_CLEAN[i], ' ');
    return title.replace(/\s+/g, ' ').replace(/\s*[-|]\s*$/, '').trim();
  }

  function originOf(url) {
    const match = /^(https?:\/\/[^/]+)/i.exec(String(url || ''));
    return match ? match[1] : DEFAULT_LATINO;
  }

  function makeHeaders(refererUrl, extra) {
    const base = Object.assign({
      'User-Agent': USER_AGENT,
      'Referer': originOf(refererUrl) + '/'
    }, extra || {});
    return base;
  }

  function normalizeBase(url) {
    let base = decodeEntities(String(url || '')).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) base = DEFAULT_LATINO;
    return base;
  }

  function resolveUrl(value, base) {
    const raw = decodeEntities(String(value || '')).trim();
    if (!raw) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
    if (raw.indexOf('//') === 0) return 'https:' + raw;
    const baseMatch = /^(https?:\/\/[^/?#]+)(\/[^?#]*)?/i.exec(String(base || ''));
    if (!baseMatch) return raw;
    const origin = baseMatch[1];
    const basePath = baseMatch[2] || '/';
    const queryIndex = raw.search(/[?#]/);
    const suffix = queryIndex >= 0 ? raw.slice(queryIndex) : '';
    const clean = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
    let path;
    if (clean.charAt(0) === '/') {
      path = clean;
    } else {
      const dir = basePath.charAt(basePath.length - 1) === '/' ? basePath : basePath.replace(/\/[^/]*$/, '/');
      path = dir + clean;
    }
    const parts = [];
    const segments = path.split('/');
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        parts.pop();
        continue;
      }
      parts.push(segment);
    }
    return origin + '/' + parts.join('/') + suffix;
  }

  function joinUrl(base, path) {
    const cleanBase = normalizeBase(base);
    const cleanPath = String(path || '').trim();
    if (!cleanPath) return cleanBase;
    if (/^https?:\/\//i.test(cleanPath) || cleanPath.indexOf('//') === 0) return resolveUrl(cleanPath, cleanBase);
    return resolveUrl(cleanPath.replace(/^\/+/, ''), cleanBase + '/');
  }

  function addQuery(url, key, value) {
    const separator = url.indexOf('?') >= 0 ? '&' : '?';
    return url + separator + key + '=' + encodeURIComponent(value);
  }

  function makeStateUrl(type, payload) {
    const data = payload || {};
    const query = Object.keys(data).map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(String(data[key] || ''));
    }).join('&');
    return 'alfa:' + type + (query ? '?' + query : '');
  }

  function parseState(url) {
    const raw = String(url || '');
    if (raw.indexOf('alfa:') !== 0) return null;
    const chunks = raw.slice(5).split('?');
    const payload = {};
    const query = chunks[1] || '';
    const pairs = query.split('&');
    for (let i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      const index = pairs[i].indexOf('=');
      const key = decodeURIComponent(index >= 0 ? pairs[i].slice(0, index) : pairs[i]);
      const value = decodeURIComponent(index >= 0 ? pairs[i].slice(index + 1) : '');
      payload[key] = value;
    }
    return Object.assign({ type: chunks[0] }, payload);
  }

  function decodeBase64Utf8(value) {
    let text = String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    while (text.length % 4) text += '=';
    let binary;
    try {
      binary = atob(text);
    } catch (error) {
      return String(value || '');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    try {
      if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
      let encoded = '';
      for (let i = 0; i < bytes.length; i++) {
        let hex = bytes[i].toString(16);
        if (hex.length < 2) hex = '0' + hex;
        encoded += '%' + hex;
      }
      return decodeURIComponent(encoded);
    } catch (error) {
      return binary;
    }
  }

  function decodeOptionUrl(value, base) {
    let result = decodeBase64Utf8(value).trim().replace(/\s+/g, '%20');
    for (let i = 0; i < 3; i++) {
      if (!result || /^[a-z][a-z0-9+.-]*:/i.test(result)) break;
      const again = decodeBase64Utf8(result).trim();
      if (!again || again === result) break;
      result = again;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(result)) return result;
    return resolveUrl(result, base);
  }

  function normalizeServer(text, url) {
    let server = cleanTitle(text || '').toLowerCase().replace('utorrent', 'torrent');
    if (SERVER_NAMES[server]) server = SERVER_NAMES[server];
    if (!server) server = originOf(url).replace(/^https?:\/\//i, '').split('.')[0] || 'Directo';
    return server.charAt(0).toUpperCase() + server.slice(1);
  }

  function skipServer(server) {
    const lower = String(server || '').toLowerCase();
    return SKIP_SERVERS.indexOf(lower) >= 0;
  }

  async function parse(html, selector, attr) {
    try {
      const result = await parse_html(html, selector, attr);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      return [];
    }
  }

  async function httpGet(url) {
    const response = await http_get(url, makeHeaders(url));
    return {
      status: response && response.status ? response.status : 0,
      body: String((response && response.body) || ''),
      headers: (response && response.headers) || {}
    };
  }

  function sectionUrls() {
    const selected = normalizeBase((typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_LATINO);
    const isSpanish = /\/espana(?:\/|$)/i.test(selected);
    const isPortuguese = /cinemaqualidade/i.test(selected);
    const latino = isSpanish || isPortuguese ? DEFAULT_LATINO : selected;
    const castellano = isSpanish ? selected : DEFAULT_LATINO + '/espana/';
    const portugues = isPortuguese ? selected : DEFAULT_PORTUGUES;
    return [
      { title: 'Trending', url: joinUrl(latino, 'peliculas-populares/'), site: 1 },
      { title: 'Estrenos', url: joinUrl(latino, 'estrenos/'), site: 1 },
      { title: 'Películas', url: latino, site: 1 },
      { title: 'Castellano', url: castellano, site: 2 },
      { title: 'Portugués', url: portugues, site: 3 }
    ];
  }

  async function parseListing(html, base, site) {
    const cards = await parse(html, 'article');
    const items = [];
    const seen = {};
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i].html || cards[i].text;
      if (!card) continue;
      const links = await parse(card, 'a[href]', 'href');
      if (!links.length || !links[0].attr) continue;
      const href = resolveUrl(links[0].attr, base);
      if (/\/serie/i.test(href) || /\d+x\d+/i.test(href) || /episode/i.test(href)) continue;
      const dataImages = await parse(card, 'img.w-full', 'data-src');
      const srcImages = await parse(card, 'img.w-full', 'src');
      const titleImages = await parse(card, 'img.w-full', 'title');
      const altImages = await parse(card, 'img.w-full', 'alt');
      const headings = await parse(card, 'h2');
      let rawTitle = titleImages.length ? titleImages[0].attr : '';
      if (!rawTitle && altImages.length) rawTitle = altImages[0].attr;
      if (!rawTitle && headings.length) rawTitle = headings[0].text;
      rawTitle = decodeEntities(rawTitle);
      let year = 0;
      let title = rawTitle;
      const yearMatch = /\((\d{4})\)/.exec(rawTitle);
      if (yearMatch) {
        year = Number(yearMatch[1]);
        title = rawTitle.slice(0, yearMatch.index);
      }
      title = cleanTitle(title);
      if (!title || /premium/i.test(title) || /promo/i.test(title)) continue;
      const image = dataImages.length ? dataImages[0].attr : (srcImages.length ? srcImages[0].attr : '');
      const poster = resolveUrl(image, base).replace(/-\d+x\d+\.jpg$/i, '.jpg');
      const plots = await parse(card, 'p');
      const description = plots.length ? plots[0].text : '';
      let finalUrl = href;
      if (Number(site) === 2 && finalUrl.indexOf('castellano=sp') < 0) {
        finalUrl += (finalUrl.indexOf('?') >= 0 ? '&' : '?') + 'castellano=sp';
      }
      if (seen[finalUrl]) continue;
      seen[finalUrl] = true;
      items.push(new MultimediaItem({
        title: title,
        url: makeStateUrl('movie', { url: finalUrl }),
        posterUrl: poster,
        type: 'movie',
        year: year || undefined,
        description: description,
        headers: makeHeaders(finalUrl)
      }));
    }
    const pages = await parse(html, 'nav.pagination a[href]', 'href');
    if (pages.length > 1) {
      const nextHref = pages[pages.length - 1].attr || pages[pages.length - 2].attr;
      if (nextHref) {
        const nextUrl = resolveUrl(nextHref, base);
        if (nextUrl !== resolveUrl(base, base)) {
          items.push(new MultimediaItem({
            title: 'Página siguiente',
            url: makeStateUrl('list', { url: nextUrl, title: 'Página siguiente', site: site }),
            posterUrl: '',
            type: 'other',
            description: 'Cargar más resultados',
            headers: makeHeaders(nextUrl)
          }));
        }
      }
    }
    return items.slice(0, 12);
  }

  async function parseDetail(html, url) {
    const headings = await parse(html, 'h1');
    const titleImages = await parse(html, 'img.w-full', 'title');
    const altImages = await parse(html, 'img.w-full', 'alt');
    const dataImages = await parse(html, 'img.w-full', 'data-src');
    const srcImages = await parse(html, 'img.w-full', 'src');
    const plots = await parse(html, 'div.sinopsis p, .sinopsis p, p.sinopsis, .description, .plot');
    const scores = await parse(html, '.score, span.score');
    const runtimes = await parse(html, '.runtime, span.runtime');
    const tags = await parse(html, 'a[href*="/categoria/"]');
    const headingTitle = headings.length ? headings[0].text : '';
    const imageTitle = titleImages.length ? titleImages[0].attr : '';
    const rawTitle = /\((\d{4})\)/.test(imageTitle) ? imageTitle : (headingTitle || imageTitle || (altImages.length ? altImages[0].attr : ''));
    let year = 0;
    let title = rawTitle;
    const yearMatch = /\((\d{4})\)/.exec(rawTitle) || /\b(19\d{2}|20\d{2})\b/.exec(rawTitle);
    if (yearMatch) {
      year = Number(yearMatch[1]);
      title = rawTitle.slice(0, yearMatch.index);
    }
    const image = dataImages.length ? dataImages[0].attr : (srcImages.length ? srcImages[0].attr : '');
    const poster = resolveUrl(image, url).replace(/-\d+x\d+\.jpg$/i, '.jpg');
    const durationMatch = runtimes.length ? /(\d+)/.exec(runtimes[0].text) : null;
    const scoreMatch = scores.length ? /([0-9]+(?:\.[0-9]+)?)/.exec(scores[0].text) : null;
    const tagList = [];
    for (let i = 0; i < tags.length && tagList.length < 8; i++) {
      const tag = cleanTitle(tags[i].text);
      if (tag) tagList.push(tag);
    }
    return {
      title: cleanTitle(title),
      year: year || undefined,
      posterUrl: poster,
      description: plots.length ? plots[0].text : '',
      score: scoreMatch ? Number(scoreMatch[1]) : undefined,
      duration: durationMatch ? Number(durationMatch[1]) : undefined,
      tags: tagList
    };
  }

  async function resolveOptions(options, referer) {
    const streams = [];
    const seen = {};
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      let target = option.url;
      if (/^https?:\/\//i.test(target) && /(cinecalidad|cinemaqualidade)/i.test(target)) {
        const response = await httpGet(target);
        const direct = await parse(response.body, '#btn_enlace a[href]', 'href');
        if (direct.length && direct[0].attr) target = resolveUrl(direct[0].attr, target);
      }
      if (seen[target]) continue;
      seen[target] = true;
      let resolved = [];
      if (typeof loadExtractor === 'function') {
        try {
          resolved = await loadExtractor(target, originOf(referer) + '/');
        } catch (error) {
          resolved = [];
        }
      }
      if (resolved && resolved.length) {
        for (let j = 0; j < resolved.length; j++) {
          const link = resolved[j];
          if (!link || !link.url) continue;
          streams.push(new StreamResult({
            url: link.url,
            source: link.source || link.name || option.source,
            quality: link.quality || option.quality || 'HD',
            headers: Object.assign(makeHeaders(referer), link.headers || {})
          }));
        }
      } else {
        streams.push(new StreamResult({
          url: target,
          source: option.source,
          quality: option.quality || 'HD',
          headers: makeHeaders(referer)
        }));
      }
    }
    return streams;
  }

  async function extractStreams(html, url) {
    const anchors = await parse(html, 'ul.py-2.options.dff a.inline-block');
    const dataUrls = await parse(html, 'ul.py-2.options.dff a.inline-block', 'data-url');
    const dataSrcs = await parse(html, 'ul.py-2.options.dff a.inline-block', 'data-src');
    const options = [];
    for (let i = 0; i < anchors.length; i++) {
      let raw = i < dataUrls.length ? dataUrls[i].attr : '';
      if (!raw && i < dataSrcs.length) raw = dataSrcs[i].attr;
      if (!raw) continue;
      const server = normalizeServer(anchors[i].text || anchors[i].attr, url);
      if (skipServer(server)) continue;
      let target;
      try {
        target = decodeOptionUrl(raw, url);
      } catch (error) {
        continue;
      }
      if (!target || /mediafire/i.test(target)) continue;
      options.push({ url: target, source: server, quality: 'HD' });
    }
    return await resolveOptions(options, url);
  }

  async function getHome(cb) {
    try {
      const sections = sectionUrls();
      const requests = sections.map(function(section) {
        return { url: section.url, headers: makeHeaders(section.url) };
      });
      const responses = typeof http_parallel === 'function'
        ? await http_parallel(requests)
        : await Promise.all(sections.map(function(section) { return httpGet(section.url); }));
      const data = {};
      for (let i = 0; i < sections.length; i++) {
        const body = responses[i] ? String(responses[i].body || '') : '';
        data[sections[i].title] = await parseListing(body, sections[i].url, sections[i].site);
      }
      cb({ success: true, data: data });
    } catch (error) {
      cb({ success: false, errorCode: 'HOME_ERROR', message: String((error && error.stack) || error) });
    }
  }

  async function search(query, pageOrCb, maybeCb) {
    const cb = typeof pageOrCb === 'function' ? pageOrCb : maybeCb;
    if (typeof cb !== 'function') return;
    try {
      const text = String(query || '').trim();
      if (!text) {
        cb({ success: true, data: [] });
        return;
      }
      const sections = sectionUrls();
      const unique = [];
      const seenBase = {};
      for (let i = 0; i < sections.length; i++) {
        const base = normalizeBase(sections[i].url);
        if (seenBase[base]) continue;
        seenBase[base] = true;
        unique.push({ url: addQuery(base, 's', text), site: sections[i].site });
      }
      const responses = await Promise.all(unique.map(function(entry) { return httpGet(entry.url); }));
      const data = [];
      const seen = {};
      for (let i = 0; i < responses.length; i++) {
        const items = await parseListing(responses[i].body, unique[i].url, unique[i].site);
        for (let j = 0; j < items.length; j++) {
          if (seen[items[j].url]) continue;
          seen[items[j].url] = true;
          data.push(items[j]);
        }
      }
      cb({ success: true, data: data.slice(0, 40) });
    } catch (error) {
      cb({ success: false, errorCode: 'SEARCH_ERROR', message: String((error && error.stack) || error) });
    }
  }

  async function load(url, cb) {
    try {
      const state = parseState(url);
      if (state && (state.type === 'list' || state.type === 'menu')) {
        const target = state.url || (typeof manifest !== 'undefined' ? manifest.baseUrl : DEFAULT_LATINO);
        const response = await httpGet(target);
        const items = await parseListing(response.body, target, Number(state.site || 1));
        cb({
          success: true,
          data: new MultimediaItem({
            title: state.title || 'CineCalidad',
            url: url,
            posterUrl: items.length ? items[0].posterUrl : '',
            type: 'other',
            description: 'Navegación de CineCalidad',
            recommendations: items,
            streams: [],
            headers: makeHeaders(target)
          })
        });
        return;
      }
      const target = state && state.url ? state.url : String(url || '');
      const response = await httpGet(target);
      const detail = await parseDetail(response.body, target);
      const streams = await extractStreams(response.body, target);
      const related = await parseListing(response.body, target, 1);
      const data = Object.assign({
        url: target,
        type: 'movie',
        streams: streams,
        recommendations: related.slice(0, 8),
        headers: makeHeaders(target)
      }, detail);
      cb({ success: true, data: new MultimediaItem(data) });
    } catch (error) {
      cb({ success: false, errorCode: 'LOAD_ERROR', message: String((error && error.stack) || error) });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const state = parseState(url);
      const target = state && state.url ? state.url : String(url || '');
      let streams = [];
      if (state && state.type === 'option') {
        streams = await resolveOptions([{ url: target, source: state.source || 'Directo', quality: state.quality || 'HD' }], target);
      } else {
        const response = await httpGet(target);
        if (/<ul\b[^>]*class=["'][^"']*options[^"']*dff/i.test(response.body)) {
          streams = await extractStreams(response.body, target);
        } else {
          streams = await resolveOptions([{ url: target, source: 'Directo', quality: 'HD' }], target);
        }
      }
      cb({ success: true, data: streams });
    } catch (error) {
      cb({ success: false, errorCode: 'STREAM_ERROR', message: String((error && error.stack) || error) });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
