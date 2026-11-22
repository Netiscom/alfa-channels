(function() {
  const DEFAULT_BASE = 'https://www.estrenoscinesaa.com/';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
  const PROXY_BASE = 'https://r.jina.ai/';
  const PROXY_HEADERS = { 'X-Respond-With': 'html' };
  const MOVIE_PATH = '/movies/';
  const TV_PATH = '/tvshows/';
  const EPISODE_PATH = '/episodes/';
  const GENRE_PATH = '/genre/';
  const BLOCK_MARKERS = [
    /Just a moment/i,
    /cf-browser-verification/i,
    /cf_chl_/i,
    /Attention Required/i,
    /Access denied/i,
    /Enable JavaScript and cookies/i,
    /Proxy is launching/i,
    /AuthenticationRequiredError/i
  ];
  const SKIP_MARKERS = [/mirrorace/i, /waaw/i, /netu/i, /trailer/i, /1fichier/i, /onefichier/i, /mediafire/i, /mega\b/i, /utorrent/i, /torrent/i];
  const GENRE_NAMES = {
    marvel: 'Marvel',
    'd-c': 'D.C',
    dc: 'D.C',
    starwars: 'StarWars',
    netflix: 'Netflix'
  };

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
    return decodeEntities(value)
      .replace(/&8211;/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*EstrenosCinesaa(?:\.com)?\s*$/i, '')
      .trim();
  }

  function normalizePoster(value) {
    return String(value || '').replace(/-(?:185x278|300x450|200x300)(?=\.(?:jpe?g|png|webp))/i, '');
  }

  function originOf(url) {
    const match = /^(https?:\/\/[^/]+)/i.exec(String(url || ''));
    return match ? match[1] : DEFAULT_BASE.replace(/\/+$/, '');
  }

  function makeHeaders(refererUrl, extra) {
    return Object.assign({
      'User-Agent': USER_AGENT,
      'Referer': originOf(refererUrl) + '/'
    }, extra || {});
  }

  function normalizeBase(url) {
    const raw = decodeEntities(String(url || '')).trim();
    return /^https?:\/\//i.test(raw) ? raw.replace(/\/+$/, '') : DEFAULT_BASE.replace(/\/+$/, '');
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
    const trailingSlash = clean.charAt(clean.length - 1) === '/';
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
    return origin + '/' + parts.join('/') + (trailingSlash && parts.length ? '/' : '') + suffix;
  }

  function joinUrl(base, path) {
    const cleanBase = normalizeBase(base);
    const cleanPath = String(path || '').trim();
    if (!cleanPath) return cleanBase + '/';
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
    const pairs = chunks[1] || '';
    const entries = pairs.split('&');
    for (let i = 0; i < entries.length; i++) {
      if (!entries[i]) continue;
      const index = entries[i].indexOf('=');
      const key = decodeURIComponent(index >= 0 ? entries[i].slice(0, index) : entries[i]);
      const value = decodeURIComponent(index >= 0 ? entries[i].slice(index + 1) : '');
      payload[key] = value;
    }
    return Object.assign({ type: chunks[0] }, payload);
  }

  function firstAttr(entries) {
    for (let i = 0; i < entries.length; i++) {
      const value = entries[i] && String(entries[i].attr || '').trim();
      if (value) return value;
    }
    return '';
  }

  function firstText(entries) {
    for (let i = 0; i < entries.length; i++) {
      const value = entries[i] && String(entries[i].text || '').trim();
      if (value) return cleanTitle(value);
    }
    return '';
  }

  async function parse(html, selector, attr) {
    try {
      const result = await parse_html(html, selector, attr);
      if (!Array.isArray(result)) return [];
      return result.map(function(entry) {
        if (!entry) return { text: '', html: '', attr: '' };
        return Object.assign({}, entry, { html: entry.html || entry.innerHTML || '' });
      });
    } catch (error) {
      return [];
    }
  }

  function isBlocked(response) {
    const body = String((response && response.body) || '');
    const status = Number((response && response.status) || 0);
    if (!body || status >= 400) return true;
    for (let i = 0; i < BLOCK_MARKERS.length; i++) {
      if (BLOCK_MARKERS[i].test(body)) return true;
    }
    return false;
  }

  function proxyUrl(url) {
    return PROXY_BASE + encodeURIComponent(String(url || ''));
  }

  async function request(url, headers) {
    const response = await http_get(url, headers);
    return {
      status: Number((response && response.status) || 0),
      body: String((response && response.body) || ''),
      headers: (response && response.headers) || {}
    };
  }

  async function httpGet(url, headers) {
    let response = null;
    try {
      response = await request(url, headers || makeHeaders(url));
    } catch (error) {
      response = null;
    }
    if (response && !isBlocked(response)) return response;
    try {
      const proxiedHeaders = Object.assign(makeHeaders(url, PROXY_HEADERS), headers || {});
      const proxied = await request(proxyUrl(url), proxiedHeaders);
      if (proxied && !isBlocked(proxied)) return proxied;
    } catch (error) {
      return response || { status: 0, body: '', headers: {} };
    }
    return response || { status: 0, body: '', headers: {} };
  }

  function contentType(url) {
    const target = String(url || '');
    if (target.indexOf(EPISODE_PATH) >= 0) return 'episode';
    if (target.indexOf(TV_PATH) >= 0) return 'tv';
    if (target.indexOf(MOVIE_PATH) >= 0) return 'movie';
    if (target.indexOf(GENRE_PATH) >= 0) return 'list';
    return '';
  }

  function pageNumber(url) {
    const match = /\/page\/(\d+)\//i.exec(String(url || ''));
    return match ? Number(match[1]) : 1;
  }

  async function parseListing(html, base) {
    const cards = await parse(html, 'article.item, div.result-item');
    const items = [];
    const seen = {};
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i].html || cards[i].text;
      if (!card) continue;
      const links = await parse(card, '.data h3 a[href], h3 a[href], .poster > a[href], a[href]', 'href');
      const href = resolveUrl(firstAttr(links), base);
      const kind = contentType(href);
      if (!kind || kind === 'list') continue;
      const headings = await parse(card, '.data h3 a, h3 a, h3');
      const images = await parse(card, '.poster img[src], .poster img[data-src], img[src], img[data-src]', 'src');
      const dataImages = await parse(card, '.poster img[data-src], img[data-src]', 'data-src');
      const altTitles = await parse(card, 'img[alt]', 'alt');
      const plots = await parse(card, '.dtinfo .texto, .data .texto, .plot, p');
      const dateTexts = await parse(card, '.data span, .metadata span, span.year, span.date');
      let title = firstText(headings) || firstAttr(altTitles);
      if (!title) continue;
      const image = firstAttr(images) || firstAttr(dataImages);
      const poster = normalizePoster(resolveUrl(image, base));
      const dates = dateTexts.map(function(entry) { return String(entry.text || ''); }).join(' ');
      const yearMatch = /\b(?:19|20)\d{2}\b/.exec(dates + ' ' + title);
      const year = yearMatch ? Number(yearMatch[0]) : undefined;
      const episodeMatch = /-(\d+)x(\d+)\//i.exec(href);
      if (kind === 'episode' && episodeMatch) {
        const season = Number(episodeMatch[1]);
        const episode = Number(episodeMatch[2]);
        title = season + 'x' + episode + ' - ' + title.replace(/^\s*\d+x\d+\s*-?\s*/i, '');
      }
      const stateType = kind === 'episode' ? 'episode' : (kind === 'tv' ? 'tv' : 'movie');
      const itemType = kind === 'movie' ? 'movie' : 'series';
      const itemUrl = makeStateUrl(stateType, { url: href });
      if (seen[itemUrl]) continue;
      seen[itemUrl] = true;
      items.push(new MultimediaItem({
        title: cleanTitle(title),
        url: itemUrl,
        posterUrl: poster,
        type: itemType,
        year: year,
        description: plots.length ? cleanTitle(plots[0].text) : '',
        headers: makeHeaders(href)
      }));
    }
    const current = pageNumber(base);
    const pages = await parse(html, 'div.pagination a.arrow_pag[href], div.pagination a.inactive[href], div.resppages a[href]', 'href');
    for (let i = 0; i < pages.length; i++) {
      const nextUrl = resolveUrl(pages[i].attr, base);
      if (pageNumber(nextUrl) <= current) continue;
      items.push(new MultimediaItem({
        title: 'Página siguiente',
        url: makeStateUrl('list', { url: nextUrl, title: 'Página siguiente' }),
        posterUrl: '',
        type: 'other',
        description: 'Cargar más resultados',
        headers: makeHeaders(nextUrl)
      }));
      break;
    }
    return items;
  }

  async function parseCategories(html, base) {
    const anchors = await parse(html, 'nav.genres li.cat-item a[href]', 'href');
    const texts = await parse(html, 'nav.genres li.cat-item a[href]');
    const items = [];
    const seen = {};
    for (let i = 0; i < anchors.length; i++) {
      const href = resolveUrl(anchors[i].attr, base);
      if (href.indexOf(GENRE_PATH) < 0) continue;
      const slugMatch = /\/genre\/([^/]+)\//i.exec(href);
      const slug = slugMatch ? slugMatch[1].toLowerCase() : '';
      if (!GENRE_NAMES[slug] || seen[href]) continue;
      seen[href] = true;
      items.push(new MultimediaItem({
        title: GENRE_NAMES[slug],
        url: makeStateUrl('list', { url: href, title: GENRE_NAMES[slug] }),
        posterUrl: '',
        type: 'other',
        description: 'Películas y series de ' + GENRE_NAMES[slug],
        headers: makeHeaders(href)
      }));
    }
    return items;
  }

  function ogImage(html) {
    const match = /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(String(html || ''));
    if (match) return decodeEntities(match[1]);
    const reversed = /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(String(html || ''));
    return reversed ? decodeEntities(reversed[1]) : '';
  }

  async function parseDetail(html, url, stateType) {
    const headings = await parse(html, '#info.sbox h1.epih1, .sheader .data h1, h1');
    const plots = await parse(html, '#info [itemprop="description"], .wp-content[itemprop="description"], .sinopsis, .description, #info p');
    const runtimes = await parse(html, '.runtime[itemprop="duration"], .runtime');
    const scores = await parse(html, '[itemprop="ratingValue"], .dt_rating_vgs');
    const dates = await parse(html, '.date[itemprop="dateCreated"], .date');
    const tags = await parse(html, '.sgeneros a[rel="tag"], nav.genres a[href*="/genre/"]');
    const episodeTitles = await parse(html, '.epih3, .episodiotitle a');
    const image = ogImage(html) || firstAttr(await parse(html, '.sheader .poster img[src], img[itemprop="image"][src], img[src]', 'src'));
    const rawTitle = firstText(headings) || decodeEntities(String((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || ''));
    const yearMatch = (/\b(?:19|20)\d{2}\b/.exec(firstText(dates) + ' ' + rawTitle) ||
      /"datePublished":"(?:19|20)\d{2}/.exec(String(html)) ||
      [])[0];
    const scoreMatch = /([0-9]+(?:\.[0-9]+)?)/.exec(firstText(scores));
    const durationMatch = /(\d+)/.exec(firstText(runtimes));
    const episodeMatch = /(\d+)\s*x\s*(\d+)/i.exec(rawTitle + ' ' + url);
    let title = cleanTitle(rawTitle);
    if (stateType === 'episode' && episodeMatch) {
      const episodeName = firstText(episodeTitles).replace(/^\s*\d+\s*x\s*\d+\s*-?\s*/i, '');
      title = episodeMatch[1] + 'x' + episodeMatch[2] + (episodeName ? ' - ' + episodeName : '');
    }
    const tagList = [];
    for (let i = 0; i < tags.length && tagList.length < 8; i++) {
      const tag = cleanTitle(tags[i].text);
      if (tag && tagList.indexOf(tag) < 0) tagList.push(tag);
    }
    return {
      title: title,
      year: yearMatch ? Number(String(yearMatch).replace(/\D/g, '').slice(0, 4)) : undefined,
      posterUrl: normalizePoster(resolveUrl(image, url)),
      description: plots.length ? cleanTitle(plots[0].text) : '',
      score: scoreMatch ? Number(scoreMatch[1]) : undefined,
      duration: durationMatch ? Number(durationMatch[1]) : undefined,
      tags: tagList
    };
  }

  async function parseSeasons(html, base) {
    const seasons = await parse(html, '#seasons .se-c');
    const episodes = [];
    const seen = {};
    for (let i = 0; i < seasons.length; i++) {
      const block = seasons[i].html || seasons[i].text;
      if (!block) continue;
      const seasonTexts = await parse(block, '.se-t, .se-q .title');
      const seasonMatch = /(\d+)/.exec(firstText(seasonTexts));
      const season = seasonMatch ? Number(seasonMatch[1]) : i + 1;
      const episodeBlocks = await parse(block, 'ul.episodios li');
      for (let j = 0; j < episodeBlocks.length; j++) {
        const episodeHtml = episodeBlocks[j].html || episodeBlocks[j].text;
        if (!episodeHtml) continue;
        const links = await parse(episodeHtml, '.episodiotitle a[href]', 'href');
        const titles = await parse(episodeHtml, '.episodiotitle a');
        const numerando = await parse(episodeHtml, '.numerando');
        const images = await parse(episodeHtml, '.imagen img[src]', 'src');
        const href = resolveUrl(firstAttr(links), base);
        if (!href || href.indexOf(EPISODE_PATH) < 0 || seen[href]) continue;
        const numbers = /(\d+)\s*-\s*(\d+)/.exec(firstText(numerando));
        const episode = numbers ? Number(numbers[2]) : j + 1;
        const properSeason = numbers ? Number(numbers[1]) : season;
        const name = firstText(titles) || 'Episodio ' + episode;
        seen[href] = true;
        episodes.push(new Episode({
          name: properSeason + 'x' + episode + ' - ' + name,
          url: makeStateUrl('episode', { url: href }),
          season: properSeason,
          episode: episode,
          posterUrl: normalizePoster(resolveUrl(firstAttr(images), base)),
          headers: makeHeaders(href)
        }));
      }
    }
    return episodes;
  }

  async function parsePlayerSources(html, base) {
    const sources = [];
    const boxes = await parse(html, 'div.source-box');
    const boxIds = await parse(html, 'div.source-box', 'id');
    const options = await parse(html, 'li.dooplay_player_option');
    const optionNums = await parse(html, 'li.dooplay_player_option', 'data-nume');
    const names = {};
    for (let i = 0; i < options.length; i++) {
      const optionHtml = options[i].html || options[i].text;
      const title = firstText(await parse(optionHtml, 'span.title'));
      const num = String(optionNums[i] && optionNums[i].attr || '').trim();
      if (num) names[num] = title || ('Fuente ' + num);
    }
    for (let i = 0; i < boxes.length; i++) {
      const boxHtml = boxes[i].html || boxes[i].text;
      const id = String(boxIds[i] && boxIds[i].attr || '').trim();
      const numMatch = /(\d+)\s*$/.exec(id);
      if (!boxHtml || !numMatch) continue;
      const num = numMatch[1];
      const iframes = await parse(boxHtml, 'iframe', 'src');
      const url = resolveUrl(firstAttr(iframes), base);
      if (!/^https?:\/\//i.test(url)) continue;
      sources.push({ url: url, source: names[num] || ('Fuente ' + num), num: num });
    }
    if (!sources.length) {
      const regex = /<div[^>]*id=["']source-player-(\d+)["'][\s\S]*?<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
      let match;
      while ((match = regex.exec(String(html || ''))) !== null) {
        sources.push({
          url: resolveUrl(decodeEntities(match[2]), base),
          source: names[match[1]] || ('Fuente ' + match[1]),
          num: match[1]
        });
      }
    }
    if (!sources.length) {
      const links = await parse(html, 'a[href*="/links/"]', 'href');
      for (let i = 0; i < links.length; i++) {
        const url = resolveUrl(links[i].attr, base);
        if (url) sources.push({ url: url, source: 'Descarga', kind: 'link' });
      }
    }
    return sources;
  }

  function skipSource(source, url) {
    const text = String(source || '') + ' ' + String(url || '');
    for (let i = 0; i < SKIP_MARKERS.length; i++) {
      if (SKIP_MARKERS[i].test(text)) return true;
    }
    return false;
  }

  function isMediaUrl(url) {
    return /\.(?:m3u8|mp4|mkv|avi|mov)(?:\?|$)/i.test(url) || /\/hls2?\//i.test(url);
  }

  function absoluteUrl(value, base) {
    const raw = decodeEntities(String(value || '').trim());
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.indexOf('//') === 0) return 'https:' + raw;
    if (raw.charAt(0) === '/' && raw.charAt(1) !== '/') {
      const host = raw.slice(1).split('/')[0];
      if (/\./.test(host) && !/^pass_md5$/i.test(host)) return 'https://' + raw.slice(1);
    }
    return resolveUrl(raw, base);
  }

  function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let i = 0; i < length; i++) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
  }

  function extractMediaUrls(body) {
    const text = String(body || '');
    const regex = /(?:https?:)?\/\/[^\s'"<>]+\.(?:m3u8|mp4)(?:\?[^\s'"<>]*)?/gi;
    const urls = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      urls.push(match[0]);
    }
    return urls;
  }

  function hostedKind(url) {
    if (/streamtape|strbamtape/i.test(url)) return 'streamtape';
    if (/dood|playmogo/i.test(url)) return 'dood';
    if (/uqload/i.test(url)) return 'uqload';
    if (/powvideo|powwideo/i.test(url)) return 'powvideo';
    return '';
  }

  function resolveStreamTape(body, target) {
    const text = String(body || '');
    const candidates = [];
    const literal = /(?:(?:https?:)?\/\/|\/)[^\s'"<>]+\/get_video\?[^\s'"<>]+/i.exec(text);
    if (literal) candidates.push(literal[0]);
    const split = /innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\(?\s*['"]([^'"]*)['"]/i.exec(text);
    if (split) candidates.push(split[1] + split[2]);
    const media = extractMediaUrls(text);
    for (let i = 0; i < media.length; i++) candidates.push(media[i]);
    const mapped = candidates.map(function(value) {
      return absoluteUrl(value, target);
    }).filter(function(value) {
      return /^https?:\/\//i.test(value) && (/get_video/i.test(value) || isMediaUrl(value));
    });
    return mapped.filter(function(value, index) {
      for (let i = 0; i < mapped.length; i++) {
        if (i !== index && mapped[i].length > value.length && mapped[i].indexOf(value) === 0) return false;
      }
      return true;
    });
  }

  async function resolveDood(body, target) {
    const match = /\/pass_md5\/[^'"\s<>]+/i.exec(String(body || ''));
    if (!match) return [];
    const md5Url = absoluteUrl(match[0], target);
    const md5Response = await httpGet(md5Url, makeHeaders(target, { Referer: target }));
    if (isBlocked(md5Response)) return [];
    const base = decodeEntities(String(md5Response.body || '').trim());
    if (!/^https?:\/\//i.test(base)) return [];
    const tokenMatch = /[?&]token=([^&"'\s]+)/i.exec(md5Url);
    const segments = md5Url.split('/');
    const lastSegment = (segments[segments.length - 1] || '').split('?')[0];
    const token = tokenMatch ? tokenMatch[1] : (lastSegment && lastSegment !== 'pass_md5' ? lastSegment : '');
    const suffix = randomString(10) + (token ? '?token=' + token + '&expiry=' + Date.now() : '?expiry=' + Date.now());
    return [base + suffix];
  }

  function uqloadFromQuery(url) {
    const chunks = String(url || '').split('?');
    for (let i = 1; i < chunks.length; i++) {
      const pairs = chunks[i].split('&');
      for (let j = 0; j < pairs.length; j++) {
        const pair = pairs[j];
        const equal = pair.indexOf('=');
        let value = equal >= 0 ? pair.slice(equal + 1) : pair;
        try {
          value = decodeURIComponent(value);
        } catch (error) {
          value = equal >= 0 ? pair.slice(equal + 1) : pair;
        }
        if (/^[a-z0-9.-]+\/(?:.*\/)?i\/\d+/i.test(value)) {
          return 'https://' + value.replace(/\/+$/, '') + '/v.mp4';
        }
      }
    }
    return '';
  }

  function resolveUqLoad(body, target) {
    const text = String(body || '');
    const candidates = [];
    const queryDirect = uqloadFromQuery(target);
    if (queryDirect) candidates.push(queryDirect);
    const sources = /sources\s*:\s*\[\s*["']([^"']+)["']/i.exec(text);
    if (sources) candidates.push(sources[1]);
    const file = /["']?file["']?\s*:\s*["']([^"']+)["']/i.exec(text);
    if (file) candidates.push(file[1]);
    const media = extractMediaUrls(text);
    for (let i = 0; i < media.length; i++) candidates.push(media[i]);
    return candidates.map(function(value) {
      return absoluteUrl(value, target);
    }).filter(isMediaUrl);
  }

  function resolvePowVideo(body, target) {
    const text = String(body || '');
    const candidates = [];
    const file = /["']?file["']?\s*:\s*["']([^"']+)["']/i.exec(text);
    if (file) candidates.push(file[1]);
    const source = /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(text);
    if (source) candidates.push(source[1]);
    const media = extractMediaUrls(text);
    for (let i = 0; i < media.length; i++) candidates.push(media[i]);
    return candidates.map(function(value) {
      return absoluteUrl(value, target);
    }).filter(isMediaUrl);
  }

  async function resolveHosted(url, source) {
    const kind = hostedKind(url);
    if (!kind) return [];
    const response = await httpGet(url);
    const usable = !isBlocked(response);
    if (!usable && kind !== 'uqload') return [];
    const body = usable ? decodeEntities(response.body) : '';
    let candidates = [];
    if (kind === 'streamtape') {
      candidates = resolveStreamTape(body, url);
    } else if (kind === 'dood') {
      candidates = await resolveDood(body, url);
    } else if (kind === 'uqload') {
      candidates = resolveUqLoad(body, url);
    } else {
      candidates = resolvePowVideo(body, url);
    }
    const headers = kind === 'dood' ? makeHeaders(url, { Referer: url }) : makeHeaders(url);
    const streams = [];
    for (let i = 0; i < candidates.length; i++) {
      const media = String(candidates[i] || '').trim();
      if (!/^https?:\/\//i.test(media)) continue;
      streams.push(new StreamResult({
        url: media,
        source: source || 'Directo',
        quality: 'HD',
        headers: headers
      }));
    }
    return streams;
  }

  async function resolveOptions(options, referer) {
    const streams = [];
    const seen = {};
    const addStream = function(stream) {
      if (!stream || !stream.url || seen[stream.url]) return;
      seen[stream.url] = true;
      streams.push(stream);
    };
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      if (!option || !option.url) continue;
      let target = resolveUrl(option.url, referer);
      if (option.kind === 'link' || /\/links\/[^/?#]+/i.test(target)) {
        const response = await httpGet(target);
        const direct = await parse(response.body, 'a#link[href], #link[href], a[href^="http"]', 'href');
        if (direct.length) target = resolveUrl(firstAttr(direct), target);
        if (/\/links\/[^/?#]+/i.test(target)) continue;
      }
      if (skipSource(option.source, target)) continue;
      if (/^https?:\/\//i.test(target) && !isMediaUrl(target)) {
        const hosted = await resolveHosted(target, option.source);
        if (hosted.length) {
          for (let j = 0; j < hosted.length; j++) addStream(hosted[j]);
          continue;
        }
      }
      if (typeof loadExtractor === 'function') {
        try {
          const extracted = await loadExtractor(target, originOf(referer) + '/');
          if (extracted && extracted.length) {
            for (let j = 0; j < extracted.length; j++) {
              const link = extracted[j];
              if (!link || !link.url) continue;
              addStream(new StreamResult({
                url: link.url,
                source: link.source || link.name || option.source,
                quality: link.quality || option.quality || (isMediaUrl(link.url) ? 'HD' : 'Auto'),
                headers: Object.assign(makeHeaders(referer), link.headers || {})
              }));
            }
            continue;
          }
        } catch (error) {
          void error;
        }
      }
      if (!/^https?:\/\//i.test(target) || !isMediaUrl(target)) continue;
      addStream(new StreamResult({
        url: target,
        source: option.source || 'Directo',
        quality: option.quality || (isMediaUrl(target) ? 'HD' : 'Auto'),
        headers: makeHeaders(referer)
      }));
    }
    return streams;
  }

  async function extractStreams(html, url) {
    const sources = await parsePlayerSources(html, url);
    return await resolveOptions(sources, url);
  }

  async function listPage(url, title) {
    const response = await httpGet(url);
    const items = await parseListing(response.body, url);
    return new MultimediaItem({
      title: title || 'EstrenosCinesaa',
      url: url,
      posterUrl: items.length ? items[0].posterUrl : '',
      type: 'other',
      description: 'Contenido de EstrenosCinesaa',
      recommendations: items,
      streams: [],
      headers: makeHeaders(url)
    });
  }

  async function getHome(cb) {
    try {
      const base = normalizeBase((typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_BASE) + '/';
      const urls = {
        'Películas': joinUrl(base, 'movies/'),
        'Series': joinUrl(base, 'tvshows/'),
        'Últimos episodios': joinUrl(base, 'episodes/')
      };
      const responses = await Promise.all([
        httpGet(urls['Películas']),
        httpGet(urls['Series']),
        httpGet(urls['Últimos episodios']),
        httpGet(base)
      ]);
      const data = {};
      data['Películas'] = await parseListing(responses[0].body, urls['Películas']);
      data['Series'] = await parseListing(responses[1].body, urls['Series']);
      data['Últimos episodios'] = await parseListing(responses[2].body, urls['Últimos episodios']);
      const categories = await parseCategories(responses[3].body, base);
      data['Géneros'] = categories.length ? categories : ['Marvel', 'D.C', 'StarWars', 'Netflix'].map(function(name) {
        const slug = name === 'D.C' ? 'd-c' : name.toLowerCase();
        const url = joinUrl(base, 'genre/' + slug + '/');
        return new MultimediaItem({
          title: name,
          url: makeStateUrl('list', { url: url, title: name }),
          posterUrl: '',
          type: 'other',
          description: 'Películas y series de ' + name,
          headers: makeHeaders(url)
        });
      });
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
      const base = normalizeBase((typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_BASE);
      const target = addQuery(base + '/', 's', text);
      const response = await httpGet(target);
      const items = await parseListing(response.body, target);
      cb({ success: true, data: items.slice(0, 40) });
    } catch (error) {
      cb({ success: false, errorCode: 'SEARCH_ERROR', message: String((error && error.stack) || error) });
    }
  }

  async function load(url, cb) {
    try {
      const state = parseState(url);
      const plain = String(url || '');
      const target = state && state.url ? state.url : plain;
      const stateType = state && state.type ? state.type : contentType(target);
      if (stateType === 'list' || stateType === 'menu' || stateType === 'category' || contentType(target) === 'list') {
        cb({ success: true, data: await listPage(target, state && state.title) });
        return;
      }
      if (!/^https?:\/\//i.test(target)) {
        cb({ success: false, errorCode: 'LOAD_ERROR', message: 'URL no válida' });
        return;
      }
      const response = await httpGet(target);
      const detail = await parseDetail(response.body, target, stateType);
      const data = Object.assign({
        url: target,
        type: stateType === 'episode' || stateType === 'tv' ? 'series' : 'movie',
        streams: [],
        recommendations: [],
        headers: makeHeaders(target)
      }, detail);
      if (stateType === 'tv') {
        data.episodes = await parseSeasons(response.body, target);
      } else {
        data.streams = await extractStreams(response.body, target);
        data.episodes = [new Episode({
          name: detail.title || 'Reproducir',
          url: makeStateUrl(stateType === 'episode' ? 'episode' : 'movie', { url: target }),
          posterUrl: data.posterUrl,
          headers: makeHeaders(target)
        })];
      }
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
        streams = await resolveOptions([{
          url: target,
          source: state.source || 'Directo',
          quality: state.quality || 'Auto'
        }], target);
      } else {
        const response = await httpGet(target);
        streams = await extractStreams(response.body, target);
        if (!streams.length && isMediaUrl(target)) {
          streams = await resolveOptions([{ url: target, source: 'Directo' }], target);
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
