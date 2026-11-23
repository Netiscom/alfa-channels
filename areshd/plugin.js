(function() {
  const DEFAULT_BASE = 'https://areshd.com/';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
  const MEDIA_URL = /\.(?:mp4|m4v|mkv|webm|avi|mov|m3u8)(?:[?#]|$)/i;
  const HOSTED_URL = /(?:doodstream|dood\.(?:la|pm|so|to|ws|cloud|video|play)|playmogo|voe|streamwish|vidhide|filemoon|bysejikuar|uqload|streamtape|waaw|netu|vidara|czzbgnw)/i;
  const SKIP_TARGET = /(?:youtube|youtu\.be|plustream|cinestart|okru|ok\.ru|vk\.com|facebook|instagram|tiktok|telegram)/i;

  function isMediaUrl(value) {
    const raw = String(value || '').trim();
    if (!/^https?:\/\//i.test(raw)) return false;
    const path = raw.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    return MEDIA_URL.test(path);
  }

  const GENRES = [
    ['Acción', 'accion'],
    ['Aventura', 'aventura'],
    ['Animación', 'animacion'],
    ['Ciencia ficción', 'ciencia-ficcion'],
    ['Crimen', 'crimen'],
    ['Drama', 'drama'],
    ['Familia', 'familia'],
    ['Fantasía', 'fantasia'],
    ['Misterio', 'misterio'],
    ['Romance', 'romance'],
    ['Suspense', 'suspense'],
    ['Terror', 'terror']
  ];
  const LANGUAGE_LABELS = { latino: 'Latino', spanish: 'Español', english: 'Inglés' };

  function decode(value) {
    return String(value || '')
      .replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(Number(code)); })
      .replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); })
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  }

  function clean(value) {
    return decode(value).replace(/\s+/g, ' ').trim();
  }

  function originOf(url) {
    const match = /^(https?:\/\/[^/]+)/i.exec(String(url || ''));
    return match ? match[1] : DEFAULT_BASE.replace(/\/+$/, '');
  }

  function makeHeaders(referer, extra) {
    return Object.assign({
      'User-Agent': USER_AGENT,
      'Referer': originOf(referer) + '/'
    }, extra || {});
  }

  function absoluteUrl(value, base) {
    const raw = String(value || '').replace(/\\\//g, '/').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return 'https:' + raw;
    const origin = /^(https?:\/\/[^/]+)/i.exec(String(base || ''));
    if (!origin) return '';
    if (/^\//.test(raw)) return origin[1] + raw;
    return origin[1] + '/' + raw.replace(/^\.\//, '');
  }

  function randomString(length) {
    let text = '';
    while (text.length < length) text += Math.random().toString(36).slice(2);
    return text.slice(0, length);
  }

  function normalizeBase(url) {
    const raw = clean((typeof manifest !== 'undefined' && manifest.baseUrl) || url || DEFAULT_BASE);
    return /^https?:\/\//i.test(raw) ? raw.replace(/\/+$/, '') : DEFAULT_BASE.replace(/\/+$/, '');
  }

  function joinUrl(base, fragment) {
    const cleanBase = normalizeBase(base);
    const path = String(fragment || '').replace(/^\/+/, '');
    if (!path) return cleanBase + '/';
    if (/^https?:\/\//i.test(path)) return path;
    return cleanBase + '/' + path;
  }

  function stateUrl(type, payload) {
    const data = payload || {};
    const query = Object.keys(data).map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(String(data[key] || ''));
    }).join('&');
    return 'alfa:' + type + (query ? '?' + query : '');
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      void error;
      return String(value || '');
    }
  }

  function parseState(url) {
    const raw = String(url || '');
    if (raw.indexOf('alfa:') !== 0) return null;
    const chunks = raw.slice(5).split('?');
    const payload = {};
    const entries = chunks[1] || '';
    const pairs = entries.split('&');
    for (let i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      const index = pairs[i].indexOf('=');
      const key = safeDecode(index >= 0 ? pairs[i].slice(0, index) : pairs[i]);
      payload[key] = safeDecode(index >= 0 ? pairs[i].slice(index + 1) : '');
    }
    return Object.assign({ type: chunks[0] }, payload);
  }

  function nextData(html) {
    const source = String(html || '');
    const match = /<script\s+id=["']__NEXT_DATA__["']\s+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i.exec(source);
    if (!match) throw new Error('No __NEXT_DATA__ payload');
    const parsed = JSON.parse(match[1]);
    return (parsed.props && parsed.props.pageProps) || {};
  }

  async function httpGet(url, extraHeaders) {
    const response = await http_get(url, makeHeaders(url, extraHeaders));
    const status = Number((response && response.status) || 0);
    const body = String((response && response.body) || '');
    if (status >= 400 || !body) throw new Error('HTTP ' + (status || 0) + ' for ' + url);
    return body;
  }

  async function httpPost(url, headers, body) {
    if (typeof http_post !== 'function') throw new Error('http_post unavailable');
    const response = await http_post(url, headers, body);
    const status = Number((response && response.status) || 0);
    const text = String((response && response.body) || '');
    if (status >= 400 || !text) throw new Error('HTTP ' + (status || 0) + ' for ' + url);
    return text;
  }

  function titleOf(entry) {
    return clean((entry && entry.titles && entry.titles.name) || (entry && entry.title) || '');
  }

  function posterOf(entry) {
    const images = (entry && entry.images) || {};
    return clean(images.poster || (entry && entry.image) || '');
  }

  function yearOf(entry) {
    const date = String((entry && entry.releaseDate) || '');
    const match = /\b(?:19|20)\d{2}\b/.exec(date);
    return match ? Number(match[0]) : undefined;
  }

  function slugOf(entry) {
    const url = (entry && entry.url) || {};
    const full = String(url.slug || '');
    if (!full) return '';
    const parts = full.split('/');
    return parts[parts.length - 1];
  }

  function isSerieEntry(entry) {
    const url = (entry && entry.url) || {};
    return String(url.slug || '').indexOf('series/') === 0;
  }

  function detailUrl(entry, base) {
    const slug = slugOf(entry);
    if (!slug) return '';
    return joinUrl(base, (isSerieEntry(entry) ? 'serie/' : 'pelicula/') + slug);
  }

  function episodeUrl(entry, base) {
    const slug = (entry && entry.slug) || {};
    const name = clean(slug.name);
    const season = Number(slug.season || 1);
    const episode = Number(slug.episode || 0);
    if (!name || !episode) return '';
    return joinUrl(base, 'episodio/' + name + '-temporada-' + season + '-episodio-' + episode);
  }

  function genreNames(entry) {
    return ((entry && entry.genres) || []).map(function(genre) {
      return clean(genre.name || '');
    }).filter(Boolean);
  }

  function actorNames(entry) {
    return ((((entry && entry.cast) || {}).acting) || []).map(function(actor) {
      return clean(actor.name || '');
    }).filter(Boolean);
  }

  function itemFromEntry(entry, base) {
    const target = detailUrl(entry, base);
    const type = isSerieEntry(entry) ? 'series' : 'movie';
    return new MultimediaItem({
      title: titleOf(entry),
      url: stateUrl(type, { url: target }),
      posterUrl: posterOf(entry),
      type: type,
      year: yearOf(entry),
      description: clean(entry.overview || ''),
      headers: makeHeaders(target)
    });
  }

  function episodeFromEntry(entry, base) {
    const target = episodeUrl(entry, base);
    const slug = (entry && entry.slug) || {};
    return new Episode({
      name: titleOf(entry),
      url: stateUrl('episode', { url: target }),
      posterUrl: posterOf(entry),
      season: Number(slug.season || 1),
      episode: Number(slug.episode || 0),
      description: clean(entry.overview || ''),
      headers: makeHeaders(target)
    });
  }

  function episodesFromSeasons(seasons, base) {
    const episodes = [];
    const list = seasons || [];
    for (let i = 0; i < list.length; i++) {
      const season = list[i];
      const seasonNumber = Number(season.number || season.season || season.name || i + 1);
      const entries = season.episodes || [];
      for (let j = 0; j < entries.length; j++) {
        const entry = entries[j];
        const item = episodeFromEntry(entry, base);
        item.name = seasonNumber + 'x' + item.episode + ' - ' + item.name;
        episodes.push(item);
      }
    }
    return episodes;
  }

  function categoryItems(base) {
    return GENRES.map(function(genre) {
      const target = joinUrl(base, 'genero/' + genre[1]);
      return new MultimediaItem({
        title: genre[0],
        url: stateUrl('list', { url: target, title: genre[0] }),
        posterUrl: '',
        type: 'other',
        description: 'Películas y series de ' + genre[0],
        headers: makeHeaders(target)
      });
    });
  }

  function pageNumber(url) {
    const match = /\/pagina\/(\d+)\/?/i.exec(String(url || ''));
    return match ? Number(match[1]) : 1;
  }

  function nextPageUrl(url, page) {
    const base = String(url || '').replace(/\/pagina\/\d+\/?/i, '').replace(/\/+$/, '');
    return base + '/pagina/' + page;
  }

  function contentType(url) {
    const target = String(url || '');
    if (target.indexOf('/episodio/') >= 0) return 'episode';
    if (target.indexOf('/serie/') >= 0) return 'tv';
    if (target.indexOf('/pelicula/') >= 0) return 'movie';
    if (/\/genero\/|\/peliculas(?:\/|$)|\/series(?:\/|$)|\/search\//i.test(target)) return 'list';
    return '';
  }

  async function listPage(url, title) {
    const base = normalizeBase(url) + '/';
    const props = nextData(await httpGet(url));
    const entries = props.movies || [];
    const items = [];
    for (let i = 0; i < entries.length; i++) items.push(itemFromEntry(entries[i], base));
    const pages = Number(props.pages || 1);
    const current = pageNumber(url);
    if (pages > current) {
      const target = nextPageUrl(url, current + 1);
      items.push(new MultimediaItem({
        title: 'Página siguiente',
        url: stateUrl('list', { url: target, title: 'Página siguiente' }),
        posterUrl: '',
        type: 'other',
        description: 'Cargar más resultados',
        headers: makeHeaders(target)
      }));
    }
    return new MultimediaItem({
      title: title || clean(props.name || '') || 'ARESHD',
      url: url,
      posterUrl: items.length ? items[0].posterUrl : '',
      type: 'other',
      description: 'Contenido de ARESHD',
      recommendations: items,
      streams: [],
      headers: makeHeaders(url)
    });
  }

  function sourceLabel(option, language) {
    const host = clean(option.cyberlocker || option.source || 'Video');
    const source = host.charAt(0).toUpperCase() + host.slice(1);
    const label = LANGUAGE_LABELS[language] || clean(language);
    return label ? source + ' (' + label + ')' : source;
  }

  function streamFrom(link, fallback, referer) {
    const data = link || {};
    return new StreamResult({
      url: data.url,
      source: data.source || data.name || fallback.source || 'ARESHD',
      quality: data.quality || fallback.quality || 'HD',
      headers: Object.assign(makeHeaders(referer), data.headers || {})
    });
  }

  function mediaCandidates(body, target) {
    const text = decode(String(body || '').replace(/\\\//g, '/'));
    const patterns = [
      /["']?file["']?\s*:\s*["']([^"']+)["']/gi,
      /["']?src["']?\s*:\s*["']([^"']+)["']/gi,
      /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
      /\bvar\s+url\s*=\s*["']([^"']+)["']/gi
    ];
    const candidates = [];
    for (let i = 0; i < patterns.length; i++) {
      let match;
      while ((match = patterns[i].exec(text)) !== null) candidates.push(match[1]);
    }
    const urls = /https?:\/\/[^\s"'<>\\)]+/gi;
    let urlMatch;
    while ((urlMatch = urls.exec(text)) !== null) {
      candidates.push(String(urlMatch[0]).replace(/[,;]+$/, ''));
    }
    const result = [];
    const seen = {};
    for (let i = 0; i < candidates.length; i++) {
      const media = absoluteUrl(candidates[i], target);
      if (!isMediaUrl(media) || seen[media]) continue;
      seen[media] = true;
      result.push(media);
    }
    return result;
  }

  function isApiStreamHost(target) {
    const match = /^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i.exec(String(target || ''));
    if (!match) return false;
    const host = match[1].toLowerCase();
    return host === 'vidara.to' || host.endsWith('.vidara.to') ||
      host === 'czzbgnw.com' || host.endsWith('.czzbgnw.com');
  }

  function streamApiUrl(target) {
    const raw = String(target || '');
    const queryMatch = /[?]([^#]+)/.exec(raw);
    const query = queryMatch ? queryMatch[1].split('&').filter(function(part) {
      return !/^filecode=/i.test(part);
    }).join('&') : '';
    return originOf(raw) + '/api/stream' + (query ? '?' + query : '');
  }

  async function resolveApiStream(target, option, referer) {
    if (!isApiStreamHost(target)) return [];
    const match = /\/e\/([^/?#]+)/i.exec(String(target || ''));
    if (!match) return [];
    const filecode = safeDecode(match[1]);
    if (!/^[A-Za-z0-9_-]+$/.test(filecode)) return [];
    const headers = makeHeaders(target, { 'Content-Type': 'application/json' });
    const body = JSON.stringify({ filecode: filecode, device: 'web', codecs: [] });
    let payload;
    try {
      payload = JSON.parse(await httpPost(streamApiUrl(target), headers, body));
    } catch (error) {
      void error;
      return [];
    }
    const value = String((payload && payload.streaming_url) || '').trim();
    if (!/^https?:\/\//i.test(value)) return [];
    const url = decode(value);
    if (!isMediaUrl(url)) return [];
    return [streamFrom({ url: url, headers: makeHeaders(target, { Referer: target }) }, option, referer)];
  }

  async function resolveHosted(target, option, referer) {
    if (!HOSTED_URL.test(target) || SKIP_TARGET.test(target)) return [];
    const apiStreams = await resolveApiStream(target, option, referer);
    if (apiStreams.length) return apiStreams;
    const response = await httpGet(target, { Referer: target });
    const body = String((response && response.body) || response || '');
    const candidates = [];
    if (/doodstream|playmogo|dood\./i.test(target)) {
      const match = /\/pass_md5\/[^'"\s<>]+/i.exec(body);
      if (match) {
        const md5Url = absoluteUrl(match[0], target);
        const md5Response = await httpGet(md5Url, { Referer: target });
        const base = decode(String((md5Response && md5Response.body) || md5Response || '').trim());
        if (/^https?:\/\//i.test(base)) {
          const tokenMatch = /[?&]token=([^&"'\s]+)/i.exec(md5Url);
          const token = tokenMatch ? tokenMatch[1] : '';
          const suffix = randomString(10) + (token ? '?token=' + token + '&expiry=' + Date.now() : '?expiry=' + Date.now());
          candidates.push(base + suffix);
        }
      }
    }
    const media = mediaCandidates(body, target);
    for (let i = 0; i < media.length; i++) candidates.push(media[i]);
    const headers = makeHeaders(target, { Referer: target });
    const streams = [];
    const seen = {};
    for (let i = 0; i < candidates.length; i++) {
      const url = String(candidates[i] || '').trim();
      if (!isMediaUrl(url) || seen[url]) continue;
      seen[url] = true;
      streams.push(streamFrom({ url: url, headers: headers }, option, referer));
    }
    return streams;
  }

  async function resolveOption(option, referer) {
    if (!option) return [];
    const playerUrl = option.result || option.url;
    if (!playerUrl) return [];
    const response = await httpGet(playerUrl);
    const match = /var\s+url\s*=\s*['"]([^'"]+)['"]/i.exec(response);
    const target = match ? decode(match[1]) : '';
    if (!target || SKIP_TARGET.test(target)) return [];
    if (isMediaUrl(target)) return [streamFrom({ url: target }, option, referer)];
    if (/^https?:\/\//i.test(target)) {
      try {
        const hosted = await resolveHosted(target, option, referer);
        if (hosted.length) return hosted;
      } catch (error) {
        void error;
      }
    }
    if (!/^https?:\/\//i.test(target)) return [];
    if (typeof loadExtractor === 'function') {
      try {
        const extracted = await loadExtractor(target, referer);
        if (extracted && extracted.length) {
          const streams = [];
          for (let i = 0; i < extracted.length; i++) {
            if (extracted[i] && isMediaUrl(extracted[i].url)) streams.push(streamFrom(extracted[i], option, referer));
          }
          if (streams.length) return streams;
        }
      } catch (error) {
        void error;
      }
    }
    return [];
  }

  async function streamsFromVideos(videos, referer) {
    const streams = [];
    const seen = {};
    const keys = videos ? Object.keys(videos) : [];
    for (let i = 0; i < keys.length; i++) {
      const language = keys[i];
      const options = videos[language] || [];
      for (let j = 0; j < options.length; j++) {
        const option = Object.assign({}, options[j], {
          source: sourceLabel(options[j], language),
          language: language
        });
        if (!option.result || seen[option.result]) continue;
        seen[option.result] = true;
        let resolved = [];
        try {
          resolved = await resolveOption(option, referer);
        } catch (error) {
          void error;
          continue;
        }
        for (let k = 0; k < resolved.length; k++) streams.push(resolved[k]);
      }
    }
    return streams;
  }

  function playableEpisode(title, target, posterUrl, type, season, number) {
    const data = {
      name: title || 'Reproducir',
      url: stateUrl(type, { url: target }),
      posterUrl: posterUrl,
      headers: makeHeaders(target)
    };
    if (season !== undefined) data.season = season;
    if (number !== undefined) data.episode = number;
    return new Episode(data);
  }

  function videoObject(props) {
    if (props.thisMovie && props.thisMovie.videos) return props.thisMovie.videos;
    if (props.episode && props.episode.videos) return props.episode.videos;
    return {};
  }

  async function detailFromProps(props, target) {
    const base = normalizeBase(target) + '/';
    if (props.thisMovie) {
      const movie = props.thisMovie;
      return {
        title: titleOf(movie),
        year: yearOf(movie),
        posterUrl: posterOf(movie),
        description: clean(movie.overview || ''),
        score: Number((movie.rate && movie.rate.average) || 0) || undefined,
        duration: Number(movie.runtime || 0) || undefined,
        tags: genreNames(movie),
        actors: actorNames(movie).map(function(name) { return new Actor({ name: name }); }),
        url: target,
        type: 'movie',
        streams: await streamsFromVideos(videoObject(props), target),
        episodes: [playableEpisode(titleOf(movie), target, posterOf(movie), 'movie')],
        recommendations: [],
        headers: makeHeaders(target)
      };
    }
    if (props.thisSerie) {
      const serie = props.thisSerie;
      return {
        title: titleOf(serie),
        year: yearOf(serie),
        posterUrl: posterOf(serie),
        description: clean(serie.overview || ''),
        score: Number((serie.rate && serie.rate.average) || 0) || undefined,
        tags: genreNames(serie),
        actors: actorNames(serie).map(function(name) { return new Actor({ name: name }); }),
        url: target,
        type: 'series',
        streams: [],
        episodes: episodesFromSeasons(serie.seasons, base),
        recommendations: [],
        headers: makeHeaders(target)
      };
    }
    if (props.episode) {
      const episode = props.episode;
      const serie = props.serie || {};
      const slug = episode.slug || {};
      const seasonNumber = Number((props.season && props.season.number) || slug.season || 1);
      const episodeNumber = Number(episode.number || slug.episode || 0);
      const playable = playableEpisode(titleOf(episode), target, posterOf(episode), 'episode', seasonNumber, episodeNumber);
      const navigation = episodesFromSeasons(serie.seasons, base).filter(function(entry) {
        const state = parseState(entry.url);
        return !state || state.url !== target;
      });
      return {
        title: titleOf(episode),
        year: yearOf(episode),
        posterUrl: posterOf(episode),
        description: clean(episode.overview || serie.overview || ''),
        score: Number((serie.rate && serie.rate.average) || 0) || undefined,
        season: seasonNumber,
        episode: episodeNumber,
        tags: genreNames(serie),
        actors: actorNames(serie).map(function(name) { return new Actor({ name: name }); }),
        url: target,
        type: 'series',
        streams: await streamsFromVideos(videoObject(props), target),
        episodes: [playable].concat(navigation),
        recommendations: [],
        headers: makeHeaders(target)
      };
    }
    return null;
  }

  async function getHome(cb) {
    try {
      const base = normalizeBase() + '/';
      const props = nextData(await httpGet(base));
      const data = {
        'Películas': (props.movies || []).map(function(entry) { return itemFromEntry(entry, base); }),
        'Series': (props.series || []).map(function(entry) { return itemFromEntry(entry, base); }),
        'Últimos episodios': (props.episodes || []).map(function(entry) { return episodeFromEntry(entry, base); }),
        'Géneros': categoryItems(base)
      };
      cb({ success: true, data: data });
    } catch (error) {
      cb({ success: false, errorCode: 'HOME_ERROR', message: String((error && error.message) || error) });
    }
  }

  async function search(query, pageOrCb, maybeCb) {
    const cb = typeof pageOrCb === 'function' ? pageOrCb : maybeCb;
    if (typeof cb !== 'function') return;
    try {
      const text = clean(query);
      if (!text) {
        cb({ success: true, data: [] });
        return;
      }
      const base = normalizeBase();
      const target = joinUrl(base, 'search/' + encodeURIComponent(text));
      const props = nextData(await httpGet(target));
      const entries = props.movies || [];
      const items = [];
      for (let i = 0; i < entries.length && items.length < 40; i++) items.push(itemFromEntry(entries[i], base + '/'));
      cb({ success: true, data: items });
    } catch (error) {
      cb({ success: false, errorCode: 'SEARCH_ERROR', message: String((error && error.message) || error) });
    }
  }

  async function load(url, cb) {
    try {
      const state = parseState(url);
      const target = state && state.url ? state.url : String(url || '');
      if ((state && (state.type === 'list' || state.type === 'menu' || state.type === 'category')) || contentType(target) === 'list') {
        cb({ success: true, data: await listPage(target, state && state.title) });
        return;
      }
      if (!/^https?:\/\//i.test(target)) {
        cb({ success: false, errorCode: 'LOAD_ERROR', message: 'URL no válida' });
        return;
      }
      const props = nextData(await httpGet(target));
      if (props.movies && !props.thisMovie && !props.thisSerie && !props.episode) {
        cb({ success: true, data: await listPage(target, state && state.title) });
        return;
      }
      const detail = await detailFromProps(props, target);
      if (!detail) throw new Error('Unknown detail payload');
      cb({ success: true, data: new MultimediaItem(detail) });
    } catch (error) {
      cb({ success: false, errorCode: 'LOAD_ERROR', message: String((error && error.message) || error) });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const state = parseState(url);
      const target = state && state.url ? state.url : String(url || '');
      let streams = [];
      if (state && state.type === 'option') {
        streams = await resolveOption({
          result: target,
          source: state.source || 'ARESHD',
          quality: state.quality || 'HD'
        }, state.referer || normalizeBase() + '/');
      } else if (MEDIA_URL.test(target)) {
        if (isMediaUrl(target)) streams = [streamFrom({ url: target }, { source: 'Directo' }, target)];
      } else {
        const props = nextData(await httpGet(target));
        streams = await streamsFromVideos(videoObject(props), target);
      }
      cb({ success: true, data: streams });
    } catch (error) {
      cb({ success: false, errorCode: 'STREAM_ERROR', message: String((error && error.message) || error) });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
