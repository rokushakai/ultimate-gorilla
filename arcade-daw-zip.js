// 究極ゴリラ — ゴリラDAW のプロジェクトパック（ZIP）の道具（§341 Phase 9A-11）。画面を持たない・ES5・外部ライブラリなし
// CRC32・SHA-256・deflate の展開（RFC 1951）・ZIP の書き出し（無圧縮）・ZIP の読みこみ（無圧縮・deflate）
(function () {
  "use strict";

  // ---------- CRC32（ZIP の決まり）----------
  var CRC_T = null;
  function crcTable() {
    if (CRC_T) { return CRC_T; }
    var t = new Int32Array(256), n, k, c;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) { c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); } t[n] = c; }
    CRC_T = t;
    return t;
  }
  function crc32(u8) {
    var t = crcTable(), c = -1, i, n = u8.length;
    for (i = 0; i < n; i++) { c = t[(c ^ u8[i]) & 255] ^ (c >>> 8); }
    return (c ^ -1) >>> 0;
  }

  // ---------- SHA-256（FIPS 180-4）→ 16 進 64 けた ----------
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(u8) {
    var n = u8.length, full = Math.floor(n / 64), rest = n - full * 64, tailLen = rest < 56 ? 64 : 128, tail = new Uint8Array(tailLen), i;
    for (i = 0; i < rest; i++) { tail[i] = u8[full * 64 + i]; }
    tail[rest] = 0x80;
    var bitsHi = Math.floor(n / 0x20000000), bitsLo = (n * 8) >>> 0; // 長さ（ビット）を 64bit のビッグエンディアンで
    tail[tailLen - 8] = (bitsHi >>> 24) & 255; tail[tailLen - 7] = (bitsHi >>> 16) & 255; tail[tailLen - 6] = (bitsHi >>> 8) & 255; tail[tailLen - 5] = bitsHi & 255;
    tail[tailLen - 4] = (bitsLo >>> 24) & 255; tail[tailLen - 3] = (bitsLo >>> 16) & 255; tail[tailLen - 2] = (bitsLo >>> 8) & 255; tail[tailLen - 1] = bitsLo & 255;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Int32Array(64);
    function block(src, off) {
      var t, a, b, c, d, e, f, g, h, s0, s1, t1, t2;
      for (t = 0; t < 16; t++) { W[t] = (src[off + t * 4] << 24) | (src[off + t * 4 + 1] << 16) | (src[off + t * 4 + 2] << 8) | src[off + t * 4 + 3]; }
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
      for (t = 0; t < 64; t++) {
        s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        t1 = (h + s1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
        s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    for (i = 0; i < full; i++) { block(u8, i * 64); }
    for (i = 0; i < tailLen; i += 64) { block(tail, i); }
    var out = "";
    for (i = 0; i < 8; i++) { out += ("0000000" + (H[i] >>> 0).toString(16)).slice(-8); }
    return out;
  }
  // ブラウザの crypto.subtle があれば使う（速い）。無ければ上の ES5 の実装（同じ結果）→ cb(16 進, "subtle" | "js")
  function sha256Async(u8, cb) {
    var sub = null;
    try { sub = window.crypto && window.crypto.subtle && window.crypto.subtle.digest ? window.crypto.subtle : null; } catch (e) { sub = null; }
    function js() { var h = ""; try { h = sha256(u8); } catch (e2) { h = ""; } cb(h, "js"); }
    if (!sub) { js(); return; }
    var done = false;
    try {
      sub.digest("SHA-256", u8).then(function (buf) {
        if (done) { return; } done = true;
        var b = new Uint8Array(buf), s = "", i; for (i = 0; i < b.length; i++) { s += (b[i] < 16 ? "0" : "") + b[i].toString(16); }
        cb(s, "subtle");
      }, function () { if (!done) { done = true; js(); } });
    } catch (e3) { if (!done) { done = true; js(); } }
  }

  // ---------- deflate の展開（RFC 1951・puff の考え方）。outLen をこえたら止める（ZIP 爆弾の対策）----------
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function huff(lengths, n) {
    var h = { count: new Uint16Array(16), symbol: new Uint16Array(n) }, offs = new Uint16Array(16), i, left = 1;
    for (i = 0; i < n; i++) { h.count[lengths[i]]++; }
    if (h.count[0] === n) { return h; }
    for (i = 1; i < 16; i++) { left <<= 1; left -= h.count[i]; if (left < 0) { throw new Error("bad huffman"); } } // 多すぎる符号
    for (i = 1; i < 15; i++) { offs[i + 1] = offs[i] + h.count[i]; }
    for (i = 0; i < n; i++) { if (lengths[i]) { h.symbol[offs[lengths[i]]++] = i; } }
    return h;
  }
  var FIXED = null;
  function fixedTables() {
    if (FIXED) { return FIXED; }
    var l = new Uint8Array(288), d = new Uint8Array(30), i;
    for (i = 0; i < 144; i++) { l[i] = 8; } for (; i < 256; i++) { l[i] = 9; } for (; i < 280; i++) { l[i] = 7; } for (; i < 288; i++) { l[i] = 8; }
    for (i = 0; i < 30; i++) { d[i] = 5; }
    FIXED = { lit: huff(l, 288), dist: huff(d, 30) };
    return FIXED;
  }
  function inflateRaw(src, outLen) {
    var out = new Uint8Array(outLen), op = 0, ip = 0, bitbuf = 0, bitcnt = 0, last, type;
    function bits(n) {
      while (bitcnt < n) { if (ip >= src.length) { throw new Error("unexpected end"); } bitbuf |= src[ip++] << bitcnt; bitcnt += 8; }
      var v = bitbuf & ((1 << n) - 1); bitbuf >>>= n; bitcnt -= n; return v;
    }
    function decode(h) {
      var code = 0, first = 0, index = 0, len, count;
      for (len = 1; len < 16; len++) {
        code |= bits(1); count = h.count[len];
        if (code - count < first) { return h.symbol[index + (code - first)]; }
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error("bad code");
    }
    function codes(lit, dist) {
      var sym, len, d, k;
      for (;;) {
        sym = decode(lit);
        if (sym < 256) { if (op >= outLen) { throw new Error("too big"); } out[op++] = sym; continue; }
        if (sym === 256) { return; }
        sym -= 257;
        if (sym >= 29) { throw new Error("bad length"); }
        len = LBASE[sym] + bits(LEXT[sym]);
        sym = decode(dist);
        if (sym >= 30) { throw new Error("bad distance"); }
        d = DBASE[sym] + bits(DEXT[sym]);
        if (d > op) { throw new Error("distance too far"); }
        if (op + len > outLen) { throw new Error("too big"); }
        for (k = 0; k < len; k++) { out[op] = out[op - d]; op++; }
      }
    }
    do {
      last = bits(1); type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0; // バイトの境目へ
        if (ip + 4 > src.length) { throw new Error("unexpected end"); }
        var len = src[ip] | (src[ip + 1] << 8), nlen = src[ip + 2] | (src[ip + 3] << 8);
        ip += 4;
        if (len !== (~nlen & 0xFFFF)) { throw new Error("bad stored block"); }
        if (ip + len > src.length) { throw new Error("unexpected end"); }
        if (op + len > outLen) { throw new Error("too big"); }
        out.set(src.subarray(ip, ip + len), op); op += len; ip += len;
      } else if (type === 1) {
        var f = fixedTables(); codes(f.lit, f.dist);
      } else if (type === 2) {
        var nlit = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4, lens = new Uint8Array(320), i, sym, rep, prev;
        if (nlit > 286 || ndist > 30) { throw new Error("bad counts"); }
        for (i = 0; i < ncode; i++) { lens[CLORDER[i]] = bits(3); }
        var lencode = huff(lens.subarray(0, 19), 19), all = new Uint8Array(nlit + ndist);
        i = 0;
        while (i < nlit + ndist) {
          sym = decode(lencode);
          if (sym < 16) { all[i++] = sym; continue; }
          prev = 0;
          if (sym === 16) { if (i === 0) { throw new Error("repeat with no first"); } prev = all[i - 1]; rep = 3 + bits(2); }
          else if (sym === 17) { rep = 3 + bits(3); }
          else { rep = 11 + bits(7); }
          if (i + rep > nlit + ndist) { throw new Error("too many lengths"); }
          while (rep--) { all[i++] = prev; }
        }
        if (all[256] === 0) { throw new Error("no end code"); }
        codes(huff(all.subarray(0, nlit), nlit), huff(all.subarray(nlit), ndist));
      } else { throw new Error("bad block type"); }
    } while (!last);
    if (op !== outLen) { throw new Error("size mismatch"); }
    return out;
  }

  // ---------- ZIP ----------
  function utf8(s) {
    s = String(s);
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { var c2 = s.charCodeAt(i + 1); if (c2 >= 0xDC00 && c2 < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00); i++; } }
      if (c < 0x80) { out.push(c); } else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c < 0x10000) { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
      else { out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return new Uint8Array(out);
  }
  function fromUtf8(u8) {
    var s = "", i = 0, c;
    while (i < u8.length) {
      c = u8[i++];
      if (c >= 0xF0) { c = ((c & 7) << 18) | ((u8[i++] & 63) << 12) | ((u8[i++] & 63) << 6) | (u8[i++] & 63); c -= 0x10000; s += String.fromCharCode(0xD800 + (c >> 10), 0xDC00 + (c & 1023)); continue; }
      if (c >= 0xE0) { c = ((c & 15) << 12) | ((u8[i++] & 63) << 6) | (u8[i++] & 63); }
      else if (c >= 0xC0) { c = ((c & 31) << 6) | (u8[i++] & 63); }
      s += String.fromCharCode(c);
    }
    return s;
  }
  function dosTime(d) {
    d = d || new Date();
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  // 書き出す（全部「無圧縮」）: files = [{ name, data: Uint8Array }] → { parts: [Uint8Array…], size }（Blob の材料）
  function zipBuild(files, date) {
    var dt = dosTime(date), parts = [], cd = [], off = 0, i;
    function head(len) { var b = new Uint8Array(len); return { b: b, v: new DataView(b.buffer) }; }
    for (i = 0; i < files.length; i++) {
      var name = utf8(files[i].name), data = files[i].data, crc = crc32(data), h = head(30 + name.length), v = h.v;
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, dt.time, true); v.setUint16(12, dt.date, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true); v.setUint16(28, 0, true); h.b.set(name, 30);
      parts.push(h.b, data);
      var c = head(46 + name.length), w = c.v;
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true);
      w.setUint16(12, dt.time, true); w.setUint16(14, dt.date, true); w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true);
      w.setUint16(28, name.length, true); w.setUint32(42, off, true); c.b.set(name, 46);
      cd.push(c.b);
      off += h.b.length + data.length;
      if (off > 0xFFFFFFF0) { throw new Error("too big"); }
    }
    var cdSize = 0;
    for (i = 0; i < cd.length; i++) { parts.push(cd[i]); cdSize += cd[i].length; }
    var e = head(22), ev = e.v;
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
    parts.push(e.b);
    return { parts: parts, size: off + cdSize + 22 };
  }
  // 安全な名前か（../・/ で始まる・\・:・制御文字・空の部分は危ない）
  function safeName(n) {
    if (!n || n.length > 200 || /[\\:\u0000-\u001f\u007f]/.test(n) || n.charAt(0) === "/") { return false; }
    var p = n.split("/"), i;
    for (i = 0; i < p.length; i++) { if (p[i] === ".." || p[i] === "." || (p[i] === "" && i < p.length - 1)) { return false; } }
    return true;
  }
  // 読む（中央ディレクトリから）。lim: { maxEntries, maxTotal, maxRatio } → { ok, files: { 名前: { method, csize, usize, crc, start } }, list, why }
  function zipRead(ab, lim) {
    lim = lim || {};
    var u8 = new Uint8Array(ab), v = new DataView(ab), len = u8.length, i, e = -1;
    function bad(why) { return { ok: false, why: why }; }
    if (len < 22) { return bad("ZIP ではありません（短すぎます）"); }
    if (v.getUint32(0, true) !== 0x04034b50 && v.getUint32(0, true) !== 0x06054b50) { return bad("ZIP ではありません"); }
    for (i = len - 22; i >= Math.max(0, len - 22 - 65535); i--) { if (v.getUint32(i, true) === 0x06054b50) { e = i; break; } }
    if (e < 0) { return bad("ZIP の目次（終わりの印）が見つかりません（こわれているか、途中までしかありません）"); }
    var count = v.getUint16(e + 10, true), cdSize = v.getUint32(e + 12, true), cdOff = v.getUint32(e + 16, true);
    if (v.getUint16(e + 4, true) !== 0 || v.getUint16(e + 6, true) !== 0 || v.getUint16(e + 8, true) !== count) { return bad("分割された ZIP には対応していません"); }
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF) { return bad("ZIP64（とても大きい ZIP）には対応していません"); }
    if (count > (lim.maxEntries || 64)) { return bad("ZIP の中のファイルが多すぎます（" + count + " 個）"); }
    if (cdOff + cdSize > e) { return bad("ZIP の目次がこわれています"); }
    var files = {}, list = [], p = cdOff, total = 0;
    for (i = 0; i < count; i++) {
      if (p + 46 > e || v.getUint32(p, true) !== 0x02014b50) { return bad("ZIP の目次がこわれています"); }
      var flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
      var nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
      if (p + 46 + nl > e) { return bad("ZIP の目次がこわれています"); }
      var nb = u8.subarray(p + 46, p + 46 + nl), name = flags & 0x0800 ? fromUtf8(nb) : fromUtf8(nb);
      p += 46 + nl + xl + cl;
      if (!safeName(name)) { return bad("ZIP の中に危ない名前のファイルがあります（" + name.replace(/[\u0000-\u001f]/g, "?").substring(0, 60) + "）"); }
      if (/\/$/.test(name)) { continue; } // フォルダ
      if (flags & 1) { return bad("パスワードつき（暗号化）の ZIP には対応していません"); }
      if (method !== 0 && method !== 8) { return bad("この圧縮の方式（" + method + "）には対応していません"); }
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || lho === 0xFFFFFFFF) { return bad("ZIP64（とても大きい ZIP）には対応していません"); }
      if (lho + 30 > len || v.getUint32(lho, true) !== 0x04034b50) { return bad("ZIP の中身がこわれています（" + name + "）"); }
      var start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
      if (start + csize > len) { return bad("ZIP が途中までしかありません（" + name + "）"); }
      if (method === 0 && csize !== usize) { return bad("ZIP の中身がこわれています（" + name + "）"); }
      if (method === 8 && usize > Math.max(1, csize) * (lim.maxRatio || 200)) { return bad("圧縮率が高すぎるファイルがあります（" + name + "）"); }
      total += usize;
      if (total > (lim.maxTotal || 100 * 1024 * 1024)) { return bad("ZIP を広げると大きすぎます"); }
      if (files.hasOwnProperty(name)) { return bad("ZIP の中に同じ名前のファイルが 2 つあります（" + name + "）"); }
      files[name] = { name: name, method: method, csize: csize, usize: usize, crc: crc, start: start };
      list.push(name);
    }
    return { ok: true, files: files, list: list, size: len };
  }
  // 中身を取り出す（CRC32 も確かめる）→ { ok, data } / { ok:false, why }
  function zipData(ab, f) {
    var raw = new Uint8Array(ab, f.start, f.csize), out;
    try { out = f.method === 0 ? new Uint8Array(raw) : inflateRaw(raw, f.usize); } catch (e) { return { ok: false, why: "「" + f.name + "」を広げられませんでした（" + (e && e.message) + "）" }; }
    if (out.length !== f.usize) { return { ok: false, why: "「" + f.name + "」の大きさがちがいます" }; }
    if (crc32(out) !== f.crc) { return { ok: false, why: "「" + f.name + "」がこわれています（CRC がちがいます）" }; }
    return { ok: true, data: out };
  }

  window.UGDawZip = { crc32: crc32, sha256: sha256, sha256Async: sha256Async, inflateRaw: inflateRaw, utf8: utf8, fromUtf8: fromUtf8, zipBuild: zipBuild, zipRead: zipRead, zipData: zipData, safeName: safeName };
})();
