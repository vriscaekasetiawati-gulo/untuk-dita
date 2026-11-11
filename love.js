/* ==========================================================
   love.js — INTRO, LOVE BENANG, FOTO, LIRIK, LAGU, KEMBANG API
   Logika utamanya di sini. Yang mau diganti-ganti (teks,
   lirik, lagu, foto) cukup di pengaturan.js aja.
   ========================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;

  // ---------- 0. PESAN ERROR (biar kelihatan langsung di HP) ----------
  function galat(pesan) { var el = $('galat'); el.textContent = '⚠️ ' + pesan; el.hidden = false; }
  window.addEventListener('error', function (e) {
    galat((e.message || 'Ada error') + (e.filename ? ' — ' + e.filename.split('/').pop() + ' baris ' + e.lineno : ''));
  });

  // ---------- 1. AMBIL PENGATURAN ----------
  var ada = typeof PENGATURAN !== 'undefined';
  var A = ada ? PENGATURAN : {};
  if (!ada) galat('pengaturan.js gak kebaca. Cek tanda koma / kutip di file itu, atau nama filenya.');
  function ambil(k, cadangan) { return A[k] === undefined || A[k] === null ? cadangan : A[k]; }

  var vol = Number(ambil('volume', 1));
  var P = {
    teksIntro1: String(ambil('teksIntro1', 'HALLO DITA SAYANG')),
    teksIntro2: String(ambil('teksIntro2', 'THIS IS FOR YOU')),
    teksTombol: String(ambil('teksTombol', 'tap untuk memuat')),
    teksHint: String(ambil('teksHint', '')),
    fileLagu: String(ambil('fileLagu', 'lagu.mp3')),
    mulaiDetik: Number(ambil('mulaiDetik', 0)) || 0,
    durasi: Number(ambil('durasi', 0)) || 0,
    volume: isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 1,
    foto1: String(ambil('foto1', 'foto1.jpg')),
    foto2: String(ambil('foto2', 'foto2.jpg')),
    geser: Number(ambil('geserLirik', 0)) || 0,
    teksPenutup: String(ambil('teksPenutup', '')),
    kembangApi: ambil('kembangApi', true) !== false,
    sinkron: ambil('modeSinkron', false) === true
  };
  // lirik dari "teksLirik" (ditempel apa adanya) + "waktuLirik" (detik tiap baris).
  // Format lama "lirik: [[detik, teks], ...]" juga masih bisa.
  var LIRIK = [];
  var barisTeks = (typeof A.teksLirik === 'string' ? A.teksLirik : '')
    .split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  var pakaiTeks = barisTeks.length > 0;
  if (pakaiTeks) {
    var waktuL = Array.isArray(A.waktuLirik) ? A.waktuLirik : [];
    var jedaL = Number(ambil('jedaLirik', 3)) || 3, tL = 0.5;
    barisTeks.forEach(function (s, i) {
      var w = Number(waktuL[i]);
      if (waktuL[i] !== undefined && isFinite(w)) tL = w; else if (i > 0) tL += jedaL;
      LIRIK.push([tL, s]);
    });
  } else if (Array.isArray(A.lirik)) {
    LIRIK = A.lirik
      .filter(function (b) { return Array.isArray(b) && b.length >= 2; })
      .map(function (b) { return [Number(b[0]) || 0, String(b[1])]; });
  }
  LIRIK.sort(function (a, b) { return a[0] - b[0]; });
  if (!P.durasi) P.durasi = (LIRIK.length ? LIRIK[LIRIK.length - 1][0] : 25) + 6;

  // ---------- 2. PASANG TEKS ----------
  $('judul').textContent = P.teksIntro1;
  $('subjudul').textContent = P.teksIntro2;
  $('status').textContent = P.teksTombol;
  $('hint').textContent = P.teksHint;
  $('teksPenutup').textContent = P.teksPenutup;

  // ---------- 3. FOTO ----------
  var fotoBeres = 0;
  [P.foto1, P.foto2].forEach(function (src, i) {
    var fig = $('foto' + (i + 1)), img = fig.querySelector('img');
    img.addEventListener('load', function () { fig.classList.remove('kosong'); fotoBeres++; });
    img.addEventListener('error', function () { fig.classList.add('kosong'); fotoBeres++; });
    img.src = src;
  });

  // ---------- 4. LAGU ----------
  var audio = new Audio();
  audio.preload = 'auto';
  var audioSiap = false, audioGagal = false, musikMulai = false;
  audio.addEventListener('canplay', function () { audioSiap = true; });
  audio.addEventListener('error', function () { audioGagal = true; });
  audio.src = P.fileLagu;

  // ---------- 5. BACKGROUND HYPERSPEED ----------
  var bg = window.Hyperspeed ? window.Hyperspeed.mulai($('bg')) : null;
  if (!bg) body.classList.add('no-webgl');

  // ---------- 6. TATA LETAK (posisi love, foto, lirik) ----------
  var cv = $('love'), ctx = cv.getContext('2d');
  var W = 0, H = 0, S = 10, CX = 0, CY = 0, atasLove = 0;
  // S = ukuran 1 "satuan" love dalam pixel. Love lebarnya 32 satuan, tingginya 29.

  function posisiFoto(el, x, y, w, h, r) {
    el.style.width = w + 'px'; el.style.height = h + 'px';
    el.style.left = (x - w / 2) + 'px'; el.style.top = (y - h / 2) + 'px';
    el.style.setProperty('--rot', r + 'deg');
  }

  function tataLetak() {
    W = window.innerWidth; H = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var tegak = H > W, hy, fw, fh, fx, fy, rot;
    if (tegak) {                       // HP berdiri
      S = Math.min(W * 0.74, H * 0.42) / 32;
      hy = H * 0.38;
      fw = Math.min(W * 0.27, 160); fh = fw * 1.28;
      fx = W / 2 - 14 - fw / 2;
      CY = hy - 2.5 * S;
      fy = CY + 12 * S;
      rot = 7;
    } else {                           // laptop / HP miring
      S = Math.min(W * 0.30, H * 0.56) / 32;
      hy = H * 0.42;
      fw = Math.min(H * 0.30, W * 0.16, 240); fh = fw * 1.28;
      fx = Math.min(16 * S + 36 + fw / 2, W / 2 - fw / 2 - 20);
      CY = hy - 2.5 * S;
      fy = hy;
      rot = 6;
    }
    CX = W / 2;
    atasLove = CY - 12.5 * S;
    posisiFoto($('foto1'), CX - fx, fy, fw, fh, -rot);
    posisiFoto($('foto2'), CX + fx, fy, fw, fh, rot);
    var bawah = Math.max(CY + 17.8 * S, fy + fh / 2 + 8);
    body.style.setProperty('--ly', Math.round(bawah + (tegak ? 26 : 12)) + 'px');
  }
  window.addEventListener('resize', tataLetak);
  tataLetak();

  // ---------- 7. LOVE BENANG ----------
  // rumus love: x = 16 sin³t ; y = 13cos t − 5cos 2t − 2cos 3t − cos 4t
  function rumusLove(t) {
    var s = Math.sin(t);
    return [16 * s * s * s, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
  }
  var JEJAK = 145;           // panjang ekor tiap benang
  var LANGKAH = 1 / 90;      // fisika jalan 90x per detik (kayak versi pygame)
  var GOYANG = 9 / 22;       // goyangan benang
  var benang = [];

  function buatBenang() {
    benang = [];
    [[1.0, 20], [0.74, 16], [0.52, 14], [0.34, 10], [0.20, 8]].forEach(function (lapis) {
      for (var i = 0; i < lapis[1]; i++) {
        var a = Math.random() * Math.PI * 2, r = 0.23 + Math.random() * 2.95;
        var b = {
          skala: lapis[0], x: Math.cos(a) * r, y: Math.sin(a) * r,
          vx: (Math.random() * 2 - 1) * 0.09, vy: (Math.random() * 2 - 1) * 0.09,
          t: Math.random() * Math.PI * 2, speed: 0.025 + Math.random() * 0.02,
          off: Math.random() * 1000, jejak: new Float32Array(JEJAK * 2), kepala: 1, isi: 1
        };
        b.jejak[0] = b.x; b.jejak[1] = b.y;
        benang.push(b);
      }
    });
  }

  function langkahBenang(detak) {
    for (var i = 0; i < benang.length; i++) {
      var b = benang[i];
      b.off += 0.05; b.t += b.speed;
      var h = rumusLove(b.t), k = b.skala * detak;
      var tx = h[0] * k + Math.sin(b.off) * GOYANG;
      var ty = h[1] * k + Math.cos(b.off * 1.3) * GOYANG;
      b.vx += (tx - b.x) * 0.12; b.vy += (ty - b.y) * 0.12;
      b.vx *= 0.80; b.vy *= 0.80;
      b.x += b.vx; b.y += b.vy;
      b.jejak[b.kepala * 2] = b.x; b.jejak[b.kepala * 2 + 1] = b.y;
      b.kepala = (b.kepala + 1) % JEJAK;
      if (b.isi < JEJAK) b.isi++;
    }
  }

  function gambarBenang(alpha) {
    ctx.beginPath();
    for (var i = 0; i < benang.length; i++) {
      var b = benang[i];
      if (b.isi < 10) continue;
      var j = (b.kepala - b.isi + JEJAK) % JEJAK;
      ctx.moveTo(CX + b.jejak[j * 2] * S, CY - b.jejak[j * 2 + 1] * S);
      for (var n = 1; n < b.isi; n++) {
        j = (j + 1) % JEJAK;
        ctx.lineTo(CX + b.jejak[j * 2] * S, CY - b.jejak[j * 2 + 1] * S);
      }
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';           // pendar pink
    ctx.strokeStyle = 'rgba(216,86,191,' + (0.07 * alpha) + ')';
    ctx.lineWidth = Math.max(3, S * 0.45);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';       // benang putih
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * alpha) + ')';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  function gambarTitik(detak) {                          // titik bercahaya di tengah
    var x = CX, y = CY - 0.25 * S, r = S * (0.9 + 0.5 * (detak - 1) * 10);
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.28, 'rgba(180,230,255,0.75)');
    g.addColorStop(1, 'rgba(216,86,191,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function denyut(t) {                                   // detak jantung "dug-dug"
    var p = (t % 0.92) / 0.92;
    return Math.exp(-Math.pow((p - 0.10) / 0.045, 2)) + 0.55 * Math.exp(-Math.pow((p - 0.27) / 0.05, 2));
  }

  // ---------- 8. KEMBANG API ----------
  var kembang = [], jedaKembang = 0;
  var WARNA = [[255, 230, 120], [120, 220, 255], [255, 120, 160], [216, 86, 191], [3, 179, 195]];
  function luncurKembang() {
    var sk = Math.max(0.6, Math.min(W, H) / 800);
    var x = W * 0.08 + Math.random() * W * 0.84;
    var yMaks = Math.max(H * 0.06 + 20, atasLove - 30);
    var y = H * 0.06 + Math.random() * (yMaks - H * 0.06);
    var c = WARNA[Math.floor(Math.random() * WARNA.length)];
    for (var i = 0; i < 35; i++) {
      var a = Math.random() * Math.PI * 2, sp = (1.8 + Math.random() * 3.2) * sk;
      kembang.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, umur: 0, c: c, r: 2.2 * sk, g: 0.06 * sk });
    }
  }
  function langkahKembang() {
    for (var i = kembang.length - 1; i >= 0; i--) {
      var k = kembang[i];
      k.x += k.vx; k.y += k.vy; k.vy += k.g; k.vx *= 0.99; k.umur++;
      if (k.umur > 38) kembang.splice(i, 1);
    }
  }
  function gambarKembang() {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < kembang.length; i++) {
      var k = kembang[i];
      ctx.fillStyle = 'rgba(' + k.c[0] + ',' + k.c[1] + ',' + k.c[2] + ',' + (1 - k.umur / 38) + ')';
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- 9. JAM LAGU & LIRIK ----------
  var t0 = 0, pakeAudio = false, selesai = false, idx = 0, tampil = [];
  function jamLagu() {
    return pakeAudio ? audio.currentTime - P.mulaiDetik : (performance.now() - t0) / 1000;
  }
  function renderLirik() {
    var el = $('lirik');
    el.innerHTML = '';
    tampil.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'baris ' + (i === tampil.length - 1 ? 'baru' : 'lama');
      d.textContent = s;
      el.appendChild(d);
    });
  }
  function tambahBaris(teks) {
    tampil.push(teks);
    if (tampil.length > 2) tampil.shift();
    renderLirik();
  }
  function updateLirik() {
    if (selesai || P.sinkron) return;
    var t = jamLagu();
    while (idx < LIRIK.length && t >= LIRIK[idx][0] + P.geser) { tambahBaris(LIRIK[idx][1]); idx++; }
    if (t >= P.durasi || (pakeAudio && audio.ended)) selesaikan();
  }

  function putarLagu() {
    t0 = performance.now();
    pakeAudio = false;
    musikMulai = true;
    if (audioGagal) return;
    audio.muted = false;
    try { audio.volume = P.volume; } catch (e) { /* iPhone gak bisa atur volume */ }
    if (audio.readyState >= 1) { try { audio.currentTime = P.mulaiDetik; } catch (e) {} }
    else audio.addEventListener('loadedmetadata', function () { audio.currentTime = P.mulaiDetik; }, { once: true });
    var pr = audio.play();
    if (pr && pr.then) pr.then(function () { pakeAudio = true; }).catch(function (e) { console.warn('Lagu gak bisa diputar:', e); });
    else pakeAudio = true;
  }

  function kecilinSuara(ms, beres) {
    var v0 = audio.volume, mulai = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - mulai) / ms);
      try { audio.volume = v0 * (1 - k); } catch (e) {}
      if (k < 1) requestAnimationFrame(step); else beres();
    })(mulai);
  }

  function selesaikan() {
    if (selesai) return;
    selesai = true;
    body.classList.add('selesai');
    kecilinSuara(2000, function () { audio.pause(); });
  }

  $('ulang').addEventListener('click', function (e) {
    e.stopPropagation();
    selesai = false; idx = 0; tampil = []; renderLirik();
    body.classList.remove('selesai');
    putarLagu();
  });

  // ---------- 10. LOOP ANIMASI ----------
  var adegan = false, waktuAdegan = 0, sisa = 0, lalu = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(Math.max((now - lalu) / 1000, 0), 0.1);
    lalu = now;
    if (!adegan) return;

    waktuAdegan += dt; sisa += dt;
    var n = 0, detak = 1;
    while (sisa >= LANGKAH && n < 12) {
      sisa -= LANGKAH; n++;
      detak = 1 + 0.045 * denyut(waktuAdegan);
      langkahBenang(detak);
      langkahKembang();
      jedaKembang += LANGKAH;
      if (P.kembangApi && jedaKembang > 0.9) { jedaKembang = 0; luncurKembang(); }
    }
    if (n === 12) sisa = 0;

    ctx.clearRect(0, 0, W, H);
    gambarKembang();
    gambarBenang(Math.min(1, waktuAdegan / 0.6));
    gambarTitik(detak);
    updateLirik();
  }
  requestAnimationFrame(loop);

  // ---------- 11. INTRO: TAP → MEMUAT → MASUK ----------
  var intro = $('intro'), tombol = $('tombol'), status = $('status'), sudahTap = false;

  intro.addEventListener('click', function () {
    if (sudahTap) return;
    sudahTap = true;
    intro.classList.add('memuat');

    // "buka kunci" suara (wajib di iPhone: lagu harus dimulai dari tap)
    if (!audioGagal) {
      audio.muted = true;
      var pr = audio.play();
      var lanjut = function () { if (!musikMulai) audio.pause(); audio.muted = false; };
      if (pr && pr.then) pr.then(lanjut).catch(function () { audio.muted = false; });
      else lanjut();
    }

    if (bg) bg.ngebut();            // background ngebut kayak masuk warp
    memuat();
  });

  function memuat() {
    var mulai = performance.now(), MIN = 2200, MAKS = 9000;
    (function step(now) {
      var lama = now - mulai, siap = (audioSiap || audioGagal) && fotoBeres >= 2;
      var p = Math.min(lama / MIN, 1) * 92;
      if (lama > MIN) p = 92 + 7 * (1 - Math.exp(-(lama - MIN) / 1500));
      if (lama >= MIN && (siap || lama > MAKS)) p = 100;
      tombol.style.setProperty('--p', p.toFixed(1));
      status.textContent = p >= 100 ? 'siap ♡' : 'memuat… ' + Math.floor(p) + '%';
      if (p < 100) requestAnimationFrame(step);
      else { intro.classList.add('terbuka'); setTimeout(masuk, 550); }
    })(mulai);
  }

  function masuk() {
    intro.classList.add('hilang');
    body.classList.add('main');
    setTimeout(function () { intro.hidden = true; }, 1400);
    setTimeout(function () { if (bg) bg.santai(); }, 900);
    buatBenang();
    adegan = true; waktuAdegan = 0;
    setTimeout(function () { body.classList.add('foto-muncul'); }, 900);
    putarLagu();
    if (P.sinkron) mulaiSinkron();
  }

  // ---------- 12. TAHAN LAYAR = BACKGROUND NGEBUT (kayak di React Bits) ----------
  document.addEventListener('pointerdown', function (e) {
    if (!adegan || P.sinkron || !bg || e.target.closest('button')) return;
    bg.ngebut();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (adegan && !P.sinkron && bg) bg.santai(); });
  });
  window.addEventListener('blur', function () { if (adegan && bg) bg.santai(); });

  // ---------- 13. MODE SINKRON (bantu nyari detik lirik) ----------
  function mulaiSinkron() {
    var panel = $('sinkron');
    panel.hidden = false;
    var jam = panel.querySelector('.jam'), next = panel.querySelector('.next');
    var hasil = panel.querySelector('textarea'), salin = panel.querySelector('.salin');
    var catatan = [];
    var daftar = LIRIK.length ? LIRIK : [[0, 'lirik baris 1']];

    function tulisNext() {
      next.textContent = catatan.length < daftar.length
        ? 'Tap pas baris ini mulai → "' + daftar[catatan.length][1] + '"'
        : 'Beres! Tekan SALIN, terus ganti bagian ' + (pakaiTeks ? 'waktuLirik' : 'lirik') + ' di pengaturan.js';
    }
    function kode() {
      var w = daftar.map(function (b, i) { return (i < catatan.length ? catatan[i] : b[0]).toFixed(2); });
      if (pakaiTeks) {
        var isi = [];
        for (var i = 0; i < w.length; i += 6) isi.push('    ' + w.slice(i, i + 6).join(', '));
        return '  waktuLirik: [\n' + isi.join(',\n') + '\n  ],';
      }
      return '  lirik: [\n' + daftar.map(function (b, i) {
        return '    [' + w[i] + ', ' + JSON.stringify(b[1]) + '],';
      }).join('\n') + '\n  ],';
    }
    tulisNext();
    hasil.value = kode();
    (function tick() { jam.textContent = Math.max(0, jamLagu()).toFixed(2) + ' dtk'; requestAnimationFrame(tick); })();

    document.addEventListener('pointerdown', function (e) {
      if (e.target.closest('#sinkron') || e.target.closest('button')) return;
      if (catatan.length >= daftar.length) return;
      catatan.push(Math.max(0, jamLagu() - 0.15));     // -0.15 dtk = jeda reflek jari
      tambahBaris(daftar[catatan.length - 1][1]);
      tulisNext();
      hasil.value = kode();
    });

    salin.addEventListener('click', function () {
      hasil.focus(); hasil.select();
      var ok = function () { salin.textContent = 'TERSALIN ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(hasil.value).then(ok).catch(function () { document.execCommand('copy'); ok(); });
      } else { document.execCommand('copy'); ok(); }
    });
  }
})();
