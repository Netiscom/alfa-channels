(function() {
  const DEFAULT_BASE = 'https://areshd.com/';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
  const MEDIA_URL = /\.(?:mp4|m4v|mkv|webm|avi|mov|m3u8)(?:[?#]|$)/i;
  const HOSTED_URL = /(?:doodstream|dood\.(?:la|pm|so|to|ws|cloud|video|play)|playmogo|voe|voesx|caseyseemavoid|streamwish|vidhide|filemoon|bysejikuar|uqload|streamtape|waaw|netu|vidara|czzbgnw)/i;
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

  function hostnameOf(url) {
    const match = /^https?:\/\/([^/?#]+)/i.exec(String(url || ''));
    if (!match) return '';
    return match[1].replace(/:\d+$/, '').toLowerCase();
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

  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const VOE_JUNK = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
  const VOE_POW_TIME_BUDGET_MS = 5000;
  const VOE_POW_MAX_ATTEMPTS = 4096;
  const VOE_POW_MAX_PREFIX_LENGTH = 4;

  function rotr32(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
  }

  function sha256Bytes(bytes) {
    const length = bytes.length;
    const total = (((length + 9 + 63) >> 6) << 6);
    const data = new Uint8Array(total);
    data.set(bytes);
    data[length] = 0x80;
    const high = Math.floor(length / 0x20000000);
    const low = (length << 3) >>> 0;
    data[total - 8] = (high >>> 24) & 255;
    data[total - 7] = (high >>> 16) & 255;
    data[total - 6] = (high >>> 8) & 255;
    data[total - 5] = high & 255;
    data[total - 4] = (low >>> 24) & 255;
    data[total - 3] = (low >>> 16) & 255;
    data[total - 2] = (low >>> 8) & 255;
    data[total - 1] = low & 255;
    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const words = new Uint32Array(64);
    for (let offset = 0; offset < total; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const index = offset + i * 4;
        words[i] = ((data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const x = words[i - 15];
        const y = words[i - 2];
        const s0 = rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3);
        const s1 = rotr32(y, 17) ^ rotr32(y, 19) ^ (y >>> 10);
        words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
      }
      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;
      for (let i = 0; i < 64; i++) {
        const big1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        const choice = (e & f) ^ (~e & g);
        const temp1 = (h + big1 + choice + SHA256_K[i] + words[i]) >>> 0;
        const big0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (big0 + majority) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
    }
    const digest = new Uint8Array(32);
    const state = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 8; i++) {
      digest[i * 4] = (state[i] >>> 24) & 255;
      digest[i * 4 + 1] = (state[i] >>> 16) & 255;
      digest[i * 4 + 2] = (state[i] >>> 8) & 255;
      digest[i * 4 + 3] = state[i] & 255;
    }
    return digest;
  }

  function hmacSha256(key, message) {
    let secret = key;
    if (secret.length > 64) secret = sha256Bytes(secret);
    const inner = new Uint8Array(64);
    const outer = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      const value = i < secret.length ? secret[i] : 0;
      inner[i] = value ^ 0x36;
      outer[i] = value ^ 0x5c;
    }
    const innerMessage = new Uint8Array(64 + message.length);
    innerMessage.set(inner);
    innerMessage.set(message, 64);
    const innerDigest = sha256Bytes(innerMessage);
    const outerMessage = new Uint8Array(96);
    outerMessage.set(outer);
    outerMessage.set(innerDigest, 64);
    return sha256Bytes(outerMessage);
  }

  function pbkdf2Sha256(password, salt, iterations, keyLength) {
    const blocks = Math.ceil(keyLength / 32);
    const result = new Uint8Array(blocks * 32);
    for (let block = 1; block <= blocks; block++) {
      const initial = new Uint8Array(salt.length + 4);
      initial.set(salt);
      initial[salt.length] = (block >>> 24) & 255;
      initial[salt.length + 1] = (block >>> 16) & 255;
      initial[salt.length + 2] = (block >>> 8) & 255;
      initial[salt.length + 3] = block & 255;
      let unit = hmacSha256(password, initial);
      const accumulated = new Uint8Array(unit);
      for (let i = 1; i < iterations; i++) {
        unit = hmacSha256(password, unit);
        for (let j = 0; j < 32; j++) accumulated[j] ^= unit[j];
      }
      result.set(accumulated, (block - 1) * 32);
    }
    return result.subarray(0, keyLength);
  }

  async function deriveKeyBytes(password, salt, iterations, keyLength) {
    if (typeof crypto !== 'undefined' && crypto && crypto.subtle && crypto.subtle.importKey && crypto.subtle.deriveBits) {
      try {
        const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: salt,
          iterations: iterations
        }, key, keyLength * 8);
        return new Uint8Array(bits);
      } catch (error) {
        void error;
      }
    }
    return pbkdf2Sha256(password, salt, iterations, keyLength);
  }

  function bytesToHex(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += ('0' + bytes[i].toString(16)).slice(-2);
    return text;
  }

  function hexToBytes(value) {
    const text = String(value || '').trim().replace(/^0x/i, '');
    if (!text || text.length % 2 || !/^[0-9a-f]+$/i.test(text)) return new Uint8Array(0);
    const bytes = new Uint8Array(text.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.substr(i * 2, 2), 16);
    return bytes;
  }

  function base64Encode(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const first = bytes[i];
      const second = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const third = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const chunk = (first << 16) | (second << 8) | third;
      text += BASE64_ALPHABET.charAt((chunk >>> 18) & 63);
      text += BASE64_ALPHABET.charAt((chunk >>> 12) & 63);
      text += i + 1 < bytes.length ? BASE64_ALPHABET.charAt((chunk >>> 6) & 63) : '=';
      text += i + 2 < bytes.length ? BASE64_ALPHABET.charAt(chunk & 63) : '=';
    }
    return text;
  }

  function base64Decode(value) {
    const text = String(value || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!text || text.length % 4) throw new Error('Invalid base64');
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      if (char === '=') break;
      const index = BASE64_ALPHABET.indexOf(char);
      if (index < 0) throw new Error('Invalid base64');
      buffer = (buffer << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >>> bits) & 255);
      }
    }
    return Uint8Array.from(bytes);
  }

  function utf8Encode(text) {
    const bytes = [];
    const source = String(text || '');
    for (let i = 0; i < source.length; i++) {
      let code = source.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < source.length) {
        const low = source.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      } else {
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      }
    }
    return Uint8Array.from(bytes);
  }

  function utf8Decode(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length;) {
      const first = bytes[i++];
      if (first < 0x80) {
        text += String.fromCharCode(first);
        continue;
      }
      let code = 0;
      let extra = 0;
      if ((first & 0xe0) === 0xc0) {
        code = first & 0x1f;
        extra = 1;
      } else if ((first & 0xf0) === 0xe0) {
        code = first & 0x0f;
        extra = 2;
      } else if ((first & 0xf8) === 0xf0) {
        code = first & 0x07;
        extra = 3;
      } else {
        code = 0xfffd;
      }
      for (let j = 0; j < extra && i < bytes.length; j++) code = (code << 6) | (bytes[i++] & 63);
      if (code <= 0xffff) {
        text += String.fromCharCode(code);
      } else {
        const value = code - 0x10000;
        text += String.fromCharCode(0xd800 + (value >> 10), 0xdc00 + (value & 0x3ff));
      }
    }
    return text;
  }

  function rot13(value) {
    return String(value || '').replace(/[a-zA-Z]/g, function(char) {
      const code = char.charCodeAt(0);
      return String.fromCharCode(code <= 90 ? (code + 13 - 65) % 26 + 65 : (code + 13 - 97) % 26 + 97);
    });
  }

  function decodeVoeConfig(value) {
    let text = rot13(String(value || '').trim());
    for (let i = 0; i < VOE_JUNK.length; i++) text = text.split(VOE_JUNK[i]).join('');
    const outer = base64Decode(text);
    let shifted = '';
    for (let i = 0; i < outer.length; i++) shifted += String.fromCharCode(outer[i] - 3);
    const inner = base64Decode(shifted.split('').reverse().join(''));
    return JSON.parse(utf8Decode(inner));
  }

  function tagWithAttr(body, tag, attr) {
    const tags = new RegExp('<' + tag + '\\b[^>]*>', 'gi');
    const attributes = new RegExp("\\b" + attr + "\\s*=\\s*([\"'])(.*?)\\1", 'i');
    const source = String(body || '');
    let match;
    while ((match = tags.exec(source)) !== null) {
      const found = attributes.exec(match[0]);
      if (found) return decode(found[2]);
    }
    return '';
  }

  function inputValue(body, name) {
    const inputs = String(body || '').match(/<input\b[^>]*>/gi) || [];
    const namePattern = new RegExp("\\bname\\s*=\\s*[\"']" + name + "[\"']", 'i');
    const valuePattern = /\bvalue\s*=\s*(["'])(.*?)\1/i;
    for (let i = 0; i < inputs.length; i++) {
      if (!namePattern.test(inputs[i])) continue;
      const match = valuePattern.exec(inputs[i]);
      return match ? decode(match[2]) : '';
    }
    return '';
  }

  function cookieHeader(response) {
    const headers = (response && response.headers) || {};
    const raw = headers['set-cookie'] || headers['Set-Cookie'] || headers['setcookie'] || '';
    const values = Array.isArray(raw) ? raw : [raw];
    const cookies = [];
    for (let i = 0; i < values.length; i++) {
      if (!values[i]) continue;
      const part = String(values[i]).split(';')[0].trim();
      if (part) cookies.push(part);
    }
    return cookies.join('; ');
  }

  function mergeCookies(first, second) {
    const result = [];
    const seen = {};
    const values = [first, second];
    for (let i = 0; i < values.length; i++) {
      const parts = String(values[i] || '').split(';');
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j].trim();
        if (!part) continue;
        const key = part.split('=')[0];
        if (seen[key]) continue;
        seen[key] = true;
        result.push(part);
      }
    }
    return result.join('; ');
  }

  function formEncode(data) {
    return Object.keys(data).map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(String(data[key])).replace(/%20/g, '+');
    }).join('&');
  }

  async function solveAltcha(challengeValue, startedAt) {
    let parsed = challengeValue;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (error) {
        void error;
        return null;
      }
    }
    const parameters = (parsed && parsed.parameters) || {};
    const algorithm = String(parameters.algorithm || '').toUpperCase();
    if (algorithm && algorithm !== 'PBKDF2/SHA-256' && algorithm !== 'SHA-256' && algorithm !== 'PBKDF2') return null;
    if (parameters.expiresAt && Number(parameters.expiresAt) < Date.now() / 1000) return null;
    const nonce = hexToBytes(parameters.nonce);
    const salt = hexToBytes(parameters.salt);
    const iterations = Math.max(1, Math.min(50000, Number(parameters.cost) || 1));
    const keyLength = Math.max(1, Math.min(64, Number(parameters.keyLength) || 32));
    const prefix = String(parameters.keyPrefix || '').toLowerCase();
    if (!nonce.length || !salt.length || !/^[0-9a-f]+$/.test(prefix)) return null;
    if (!prefix || prefix.length > VOE_POW_MAX_PREFIX_LENGTH) return null;
    const password = new Uint8Array(nonce.length + 4);
    const counterBytes = new Uint8Array(4);
    const deadline = (Number(startedAt) || Date.now()) + VOE_POW_TIME_BUDGET_MS;
    password.set(nonce, 0);
    for (let counter = 0; counter < VOE_POW_MAX_ATTEMPTS; counter++) {
      if (Date.now() > deadline) return null;
      counterBytes[0] = (counter >>> 24) & 255;
      counterBytes[1] = (counter >>> 16) & 255;
      counterBytes[2] = (counter >>> 8) & 255;
      counterBytes[3] = counter & 255;
      password.set(counterBytes, nonce.length);
      const derived = await deriveKeyBytes(password, salt, iterations, keyLength);
      const hex = bytesToHex(derived);
      if (hex.indexOf(prefix) === 0) {
        return {
          counter: counter,
          derivedKey: hex,
          time: Math.max(0, Date.now() - Number(startedAt || Date.now()))
        };
      }
    }
    return null;
  }

  function isCaptchaPage(body) {
    return /<altcha-widget\b/i.test(String(body || '')) || /confirm you(?:'|’)?re human/i.test(String(body || ''));
  }

  function isVoeTarget(target) {
    const host = hostnameOf(target);
    return /^(?:www\.)?(?:voe\.(?:sx|com|net|to)|voesx(?:\.com)?|caseyseemavoid(?:\.(?:com|net|to))?)$/i.test(host);
  }

  function captchaForm(body) {
    const forms = String(body || '').match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];
    for (let i = 0; i < forms.length; i++) {
      if (/<altcha-widget\b/i.test(forms[i])) return forms[i];
    }
    return String(body || '');
  }

  function extractVoeRedirect(body) {
    const source = String(body || '');
    const patterns = [
      /(?:window\s*\.\s*location(?:\s*\.\s*href)?|location\s*\.\s*href|location\s*\.\s*replace)\s*(?:=|\()\s*["']([^"']+)["']/i,
      /["'](https?:\/\/[^"']+\/e\/[^"']+)["']/i
    ];
    for (let i = 0; i < patterns.length; i++) {
      const match = patterns[i].exec(source);
      if (!match) continue;
      const url = decode(match[1]);
      if (/^https?:\/\//i.test(url)) return url;
    }
    return '';
  }

  function extractVoeSource(body) {
    const scripts = String(body || '').match(/<script\b[^>]*\btype\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (let i = 0; i < scripts.length; i++) {
      const openEnd = scripts[i].indexOf('>');
      const closeStart = scripts[i].toLowerCase().lastIndexOf('</script>');
      if (openEnd < 0 || closeStart < 0) continue;
      try {
        const config = decodeVoeConfig(scripts[i].slice(openEnd + 1, closeStart));
        const value = config && (config.source || config.direct_access_url);
        const url = decode(value || '');
        if (isMediaUrl(url)) return url;
      } catch (error) {
        void error;
      }
    }
    return '';
  }

  async function solveVoeCaptcha(pageUrl, body, response) {
    const form = captchaForm(body);
    const challengeUrl = absoluteUrl(tagWithAttr(form, 'altcha-widget', 'challenge'), pageUrl);
    const action = absoluteUrl(tagWithAttr(form, 'form', 'action'), pageUrl);
    const token = inputValue(form, '_token');
    if (!challengeUrl || !action) return '';
    const cookies = cookieHeader(response);
    const challengeResponse = await request(challengeUrl, { Referer: pageUrl, Cookie: cookies });
    const status = Number((challengeResponse && challengeResponse.status) || 0);
    if (status >= 400 || !challengeResponse.body) return '';
    let challenge;
    try {
      challenge = JSON.parse(challengeResponse.body);
    } catch (error) {
      void error;
      return '';
    }
    const startedAt = Date.now();
    const solution = await solveAltcha(challenge, startedAt);
    if (!solution) return '';
    const payload = base64Encode(utf8Encode(JSON.stringify({
      challenge: { parameters: challenge.parameters, signature: challenge.signature },
      solution: solution
    })));
    const headers = makeHeaders(pageUrl, {
      Referer: pageUrl,
      Origin: originOf(pageUrl),
      Cookie: mergeCookies(cookies, cookieHeader(challengeResponse)),
      'Content-Type': 'application/x-www-form-urlencoded'
    });
    return await httpPost(action, headers, formEncode({ _token: token, access: '0', altcha: payload }));
  }

  async function resolveVoe(target, option, referer) {
    let current = target;
    const seen = {};
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!/^https?:\/\//i.test(current) || seen[current]) break;
      seen[current] = true;
      let response;
      try {
        response = await request(current, { Referer: target });
      } catch (error) {
        void error;
        break;
      }
      if (Number((response && response.status) || 0) >= 400) break;
      let body = response.body;
      if (isCaptchaPage(body)) {
        try {
          body = await solveVoeCaptcha(current, body, response);
        } catch (error) {
          void error;
          break;
        }
        if (!body) break;
      }
      const source = extractVoeSource(body);
      if (source) {
        return [streamFrom({
          url: source,
          headers: makeHeaders(current, { Referer: current })
        }, option, referer)];
      }
      const redirect = extractVoeRedirect(body);
      if (!redirect || redirect === current || seen[redirect] || !isVoeTarget(redirect)) break;
      current = redirect;
    }
    return [];
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

  async function request(url, extraHeaders) {
    const response = await http_get(url, makeHeaders(url, extraHeaders));
    return {
      status: Number((response && response.status) || 0),
      body: String((response && response.body) || ''),
      headers: (response && response.headers) || {}
    };
  }

  async function httpGet(url, extraHeaders) {
    const response = await request(url, extraHeaders);
    if (response.status >= 400 || !response.body) throw new Error('HTTP ' + (response.status || 0) + ' for ' + url);
    return response.body;
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
    if (isVoeTarget(target)) {
      const voeStreams = await resolveVoe(target, option, referer);
      if (voeStreams.length) return voeStreams;
    }
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
