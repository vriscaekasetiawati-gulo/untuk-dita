/* ==========================================================
   hyperspeed.js — BACKGROUND "HYPERSPEED"
   Jalan raya + lampu mobil ngebut, pakai WebGL murni
   (tanpa React / Three.js / library apa pun, jadi enteng).

   Idenya dari komponen "Hyperspeed" di React Bits
   (reactbits.dev, karya David Haz) yang asalnya dari demo
   "Infinite Lights" Codrops. Angka & warnanya ngikutin
   preset bawaannya (distortion: turbulentDistortion).

   Kamu GAK perlu ngedit file ini.
   Cara pakai (udah dipanggil di love.js):
     const bg = Hyperspeed.mulai(canvas);
     bg.ngebut();   // tahan → makin kenceng
     bg.santai();   // balik normal
   ========================================================== */
(function () {
  'use strict';

  // ---------- OPSI (sama kayak preset default React Bits) ----------
  var OPSI = {
    length: 400, roadWidth: 10, islandWidth: 2, lanesPerRoad: 4,
    fov: 90, fovSpeedUp: 150, speedUp: 2, carLightsFade: 0.4,
    totalSideLightSticks: 20, lightPairsPerRoadWay: 40,
    shoulderLinesWidthPercentage: 0.05,
    brokenLinesWidthPercentage: 0.1,
    brokenLinesLengthPercentage: 0.5,
    lightStickWidth: [0.12, 0.5], lightStickHeight: [1.3, 1.7],
    movingAwaySpeed: [60, 80], movingCloserSpeed: [-120, -160],
    carLightsLength: [400 * 0.03, 400 * 0.2], carLightsRadius: [0.05, 0.14],
    carWidthPercentage: [0.3, 0.5], carShiftX: [-0.8, 0.8], carFloorSeparation: [0, 5],
    colors: {
      roadColor: 0x080808, islandColor: 0x0a0a0a, background: 0x000000,
      shoulderLines: 0x131318, brokenLines: 0x131318,
      leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
      rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
      sticks: 0x03b3c3
    },
    glow: 1.0             // kekuatan efek "bloom" (cahaya berpendar)
  };

  // turbulentDistortion
  var FREQ = [4, 8, 8, 1], AMP = [25, 5, 10, 10];

  function acak(r) { return Array.isArray(r) ? Math.random() * (r[1] - r[0]) + r[0] : Math.random() * r; }
  function pilih(a) { return Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a; }
  function rgb(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
  function daftarWarna(c) { return (Array.isArray(c) ? c : [c]).map(rgb); }

  // ---------- SHADER (program kecil yang jalan di GPU) ----------
  var KEPALA_VS = [
    'precision highp float;',
    '#define PI 3.14159265358979',
    'uniform mat4 uViewProj;',
    'uniform float uTime;',
    'uniform float uTravelLength;',
    'uniform float uOffsetX;',
    'uniform vec4 uFreq;',
    'uniform vec4 uAmp;',
    'float nsin(float v){ return sin(v) * 0.5 + 0.5; }',
    'float distX(float p){',
    '  float c = cos(PI * p * uFreq.y + uTime * (uFreq.y / uFreq.x));',
    '  return cos(PI * p * uFreq.x + uTime) * uAmp.x + c * c * uAmp.y;',
    '}',
    'float distY(float p){',
    '  return -nsin(PI * p * uFreq.z + uTime) * uAmp.z',
    '         - pow(nsin(PI * p * uFreq.w + uTime / (uFreq.z / uFreq.w)), 5.0) * uAmp.w;',
    '}',
    'vec3 getDistortion(float p){',
    '  return vec3(distX(p) - distX(0.0125), distY(p) - distY(0.0125), 0.0);',
    '}',
    ''
  ].join('\n');

  var KEPALA_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    ''
  ].join('\n');

  // jalan + pulau tengah
  var JALAN_VS = KEPALA_VS + [
    'attribute vec3 position;',
    'attribute vec2 uv;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 p = position;',
    '  vec3 d = getDistortion((p.y + uTravelLength * 0.5) / uTravelLength);',
    '  vec3 w = vec3(p.x + d.x + uOffsetX, d.y, -p.y - uTravelLength * 0.5);',
    '  gl_Position = uViewProj * vec4(w, 1.0);',
    '  vUv = uv;',
    '}'
  ].join('\n');

  var JALAN_FS = KEPALA_FS + [
    'varying vec2 vUv;',
    'uniform vec3 uColor;',
    'uniform float uIsRoad;',
    'uniform float uScroll;',
    'uniform float uLanes;',
    'uniform vec3 uBrokenColor;',
    'uniform vec3 uShoulderColor;',
    'uniform float uShoulderW;',
    'uniform float uBrokenW;',
    'uniform float uBrokenLen;',
    'void main(){',
    '  vec3 color = uColor;',
    '  if (uIsRoad > 0.5) {',
    '    float v = fract(vUv.y + uScroll);',
    '    float lane = vUv.x * uLanes;',
    '    float broken = step(1.0 - uBrokenW, fract(lane)) * step(1.0 - uBrokenLen, fract(v * 10.0)) * step(lane, uLanes - 1.0);',
    '    color = mix(color, uBrokenColor, broken);',
    '    float sw = uShoulderW / uLanes;',
    '    float shoulder = max(step(vUv.x, sw), step(1.0 - sw, vUv.x));',
    '    color = mix(color, uShoulderColor, shoulder);',
    '  }',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  // lampu mobil (tabung tipis yang bergerak)
  var MOBIL_VS = KEPALA_VS + [
    'attribute vec3 position;',
    'attribute vec2 uv;',
    'attribute vec3 aOffset;',
    'attribute vec3 aMetrics;',
    'attribute vec3 aColor;',
    'varying vec2 vUv;',
    'varying vec3 vColor;',
    'void main(){',
    '  vec3 t = position;',
    '  float radius = aMetrics.x;',
    '  float len = aMetrics.y;',
    '  float speed = aMetrics.z;',
    '  t.xy *= radius;',
    '  t.z *= len;',
    '  t.z += len - mod(uTime * speed + aOffset.z, uTravelLength);',
    '  t.xy += aOffset.xy;',
    '  t += getDistortion(abs(t.z / uTravelLength));',
    '  t.x += uOffsetX;',
    '  gl_Position = uViewProj * vec4(t, 1.0);',
    '  vUv = uv;',
    '  vColor = aColor;',
    '}'
  ].join('\n');

  var MOBIL_FS = KEPALA_FS + [
    'varying vec2 vUv;',
    'varying vec3 vColor;',
    'uniform vec2 uFade;',
    'void main(){',
    '  float k = clamp((vUv.x - uFade.x) / (uFade.y - uFade.x), 0.0, 1.0);',
    '  float a = k * k * (3.0 - 2.0 * k);',
    '  if (a < 0.0001) discard;',
    '  gl_FragColor = vec4(vColor, a);',
    '}'
  ].join('\n');

  // tiang lampu di pinggir jalan
  var TIANG_VS = KEPALA_VS + [
    'attribute vec3 position;',
    'attribute float aOffset;',
    'attribute vec2 aMetrics;',
    'attribute vec3 aColor;',
    'varying vec3 vColor;',
    'void main(){',
    '  vec3 t = position;',
    '  float w = aMetrics.x;',
    '  float h = aMetrics.y;',
    '  t.xy *= vec2(w, h);',
    '  float time = mod(uTime * 120.0 + aOffset, uTravelLength);',
    '  t = vec3(0.0, t.y, t.x);',
    '  t.z += -uTravelLength + time;',
    '  t += getDistortion(abs(t.z / uTravelLength));',
    '  t.y += h / 2.0;',
    '  t.x += -w / 2.0 + uOffsetX;',
    '  gl_Position = uViewProj * vec4(t, 1.0);',
    '  vColor = aColor;',
    '}'
  ].join('\n');

  var TIANG_FS = KEPALA_FS + [
    'varying vec3 vColor;',
    'void main(){ gl_FragColor = vec4(vColor, 1.0); }'
  ].join('\n');

  // efek glow: blur + gabung
  var LAYAR_VS = [
    'attribute vec2 position;',
    'varying vec2 vUv;',
    'void main(){ vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }'
  ].join('\n');

  var BLUR_FS = KEPALA_FS + [
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uDir;',
    'uniform float uCut;',
    'vec3 ambil(vec2 p){ return max(texture2D(uTex, p).rgb - uCut, 0.0); }',
    'void main(){',
    '  vec3 c = ambil(vUv) * 0.227027;',
    '  c += (ambil(vUv + uDir) + ambil(vUv - uDir)) * 0.1945946;',
    '  c += (ambil(vUv + uDir * 2.0) + ambil(vUv - uDir * 2.0)) * 0.1216216;',
    '  c += (ambil(vUv + uDir * 3.0) + ambil(vUv - uDir * 3.0)) * 0.054054;',
    '  c += (ambil(vUv + uDir * 4.0) + ambil(vUv - uDir * 4.0)) * 0.016216;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var GABUNG_FS = KEPALA_FS + [
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform float uKuat;',
    'void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb * uKuat, 1.0); }'
  ].join('\n');

  // ---------- MESIN UTAMA ----------
  function buat(canvas, opsi) {
    var o = opsi || OPSI;
    var attr = { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' };
    var gl = canvas.getContext('webgl2', attr);
    var gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', attr) || canvas.getContext('experimental-webgl', attr);
    if (!gl) return null;

    var setDivisor, gambarInstans;
    if (gl2) {
      setDivisor = function (l, d) { gl.vertexAttribDivisor(l, d); };
      gambarInstans = function (n, jml) { gl.drawElementsInstanced(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0, jml); };
    } else {
      var ext = gl.getExtension('ANGLE_instanced_arrays');
      if (!ext) return null;
      setDivisor = function (l, d) { ext.vertexAttribDivisorANGLE(l, d); };
      gambarInstans = function (n, jml) { ext.drawElementsInstancedANGLE(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0, jml); };
    }

    // --- bikin program shader ---
    var LOC = { position: 0, uv: 1, aOffset: 2, aMetrics: 3, aColor: 4 };
    function shader(tipe, src) {
      var s = gl.createShader(tipe);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function program(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      Object.keys(LOC).forEach(function (k) { gl.bindAttribLocation(p, LOC[k], k); });
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) {
        var info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p: p, u: u };
    }
    function U(prog, nama) { return prog.u[nama] || null; }

    var pJalan = program(JALAN_VS, JALAN_FS);
    var pMobil = program(MOBIL_VS, MOBIL_FS);
    var pTiang = program(TIANG_VS, TIANG_FS);
    var pBlur = program(LAYAR_VS, BLUR_FS);
    var pGabung = program(LAYAR_VS, GABUNG_FS);

    // --- buffer & geometri ---
    function buf(data, target) {
      var b = gl.createBuffer();
      gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
      gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }
    function geo(pos, uv, idx) {
      return { pos: buf(new Float32Array(pos)), uv: buf(new Float32Array(uv)),
               idx: buf(new Uint16Array(idx), gl.ELEMENT_ARRAY_BUFFER), n: idx.length };
    }
    function bidang(w, h, sx, sy) {          // kayak THREE.PlaneGeometry
      var pos = [], uv = [], idx = [], ix, iy;
      for (iy = 0; iy <= sy; iy++) for (ix = 0; ix <= sx; ix++) {
        pos.push(-w / 2 + ix * w / sx, h / 2 - iy * h / sy, 0);
        uv.push(ix / sx, 1 - iy / sy);
      }
      for (iy = 0; iy < sy; iy++) for (ix = 0; ix < sx; ix++) {
        var a = ix + (sx + 1) * iy, b = ix + (sx + 1) * (iy + 1), c = b + 1, d = a + 1;
        idx.push(a, b, d, b, c, d);
      }
      return geo(pos, uv, idx);
    }
    function tabung(seg, rad) {              // garis lurus z=0 → z=-1, jari-jari 1
      var pos = [], uv = [], idx = [], i, j;
      for (i = 0; i <= seg; i++) for (j = 0; j <= rad; j++) {
        var v = j / rad * Math.PI * 2;
        pos.push(Math.cos(v), Math.sin(v), -i / seg);
        uv.push(i / seg, j / rad);
      }
      for (i = 0; i < seg; i++) for (j = 0; j < rad; j++) {
        var a = i * (rad + 1) + j, b = (i + 1) * (rad + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      return geo(pos, uv, idx);
    }

    var gJalan = bidang(o.roadWidth, o.length, 20, 100);
    var gPulau = bidang(o.islandWidth, o.length, 20, 100);
    var gTabung = tabung(40, 8);
    var gTiang = bidang(1, 1, 1, 1);
    var bufLayar = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));

    var C = o.colors;
    var jalan = [
      { g: gJalan, x: -(o.islandWidth / 2 + o.roadWidth / 2), warna: rgb(C.roadColor), road: 1 },
      { g: gJalan, x: (o.islandWidth / 2 + o.roadWidth / 2), warna: rgb(C.roadColor), road: 1 },
      { g: gPulau, x: 0, warna: rgb(C.islandColor), road: 0 }
    ];

    function lampuMobil(warna, kecepatan, fade, x) {
      var n = o.lightPairsPerRoadWay, lebarLajur = o.roadWidth / o.lanesPerRoad;
      var off = new Float32Array(n * 6), met = new Float32Array(n * 6), col = new Float32Array(n * 6);
      var cs = daftarWarna(warna);
      for (var i = 0; i < n; i++) {
        var radius = acak(o.carLightsRadius), panjang = acak(o.carLightsLength), speed = acak(kecepatan);
        var lajurX = (i % o.lanesPerRoad) * lebarLajur - o.roadWidth / 2 + lebarLajur / 2;
        var lebarMobil = acak(o.carWidthPercentage) * lebarLajur;
        lajurX += acak(o.carShiftX) * lebarLajur;
        var y = acak(o.carFloorSeparation) + radius * 1.3, z = -acak(o.length);
        var c = pilih(cs);
        for (var k = 0; k < 2; k++) {
          var j = (i * 2 + k) * 3;
          off[j] = lajurX + (k ? lebarMobil / 2 : -lebarMobil / 2); off[j + 1] = y; off[j + 2] = z;
          met[j] = radius; met[j + 1] = panjang; met[j + 2] = speed;
          col[j] = c[0]; col[j + 1] = c[1]; col[j + 2] = c[2];
        }
      }
      return { off: buf(off), met: buf(met), col: buf(col), n: n * 2, fade: fade, x: x };
    }
    var mobilKiri = lampuMobil(C.leftCars, o.movingAwaySpeed, [0, 1 - o.carLightsFade], -o.roadWidth / 2 - o.islandWidth / 2);
    var mobilKanan = lampuMobil(C.rightCars, o.movingCloserSpeed, [1, o.carLightsFade], o.roadWidth / 2 + o.islandWidth / 2);

    var tiang = (function () {
      var n = o.totalSideLightSticks, jarak = o.length / (n - 1);
      var off = new Float32Array(n), met = new Float32Array(n * 2), col = new Float32Array(n * 3);
      var cs = daftarWarna(C.sticks);
      for (var i = 0; i < n; i++) {
        off[i] = (i - 1) * jarak * 2 + jarak * Math.random();
        met[i * 2] = acak(o.lightStickWidth); met[i * 2 + 1] = acak(o.lightStickHeight);
        col.set(pilih(cs), i * 3);
      }
      return { off: buf(off), met: buf(met), col: buf(col), n: n, x: -(o.roadWidth + o.islandWidth / 2) };
    })();

    // --- uniform yang nilainya tetap ---
    [pJalan, pMobil, pTiang].forEach(function (pr) {
      gl.useProgram(pr.p);
      gl.uniform1f(U(pr, 'uTravelLength'), o.length);
      gl.uniform4f(U(pr, 'uFreq'), FREQ[0], FREQ[1], FREQ[2], FREQ[3]);
      gl.uniform4f(U(pr, 'uAmp'), AMP[0], AMP[1], AMP[2], AMP[3]);
    });
    gl.useProgram(pJalan.p);
    gl.uniform1f(U(pJalan, 'uLanes'), o.lanesPerRoad);
    gl.uniform3fv(U(pJalan, 'uBrokenColor'), rgb(C.brokenLines));
    gl.uniform3fv(U(pJalan, 'uShoulderColor'), rgb(C.shoulderLines));
    gl.uniform1f(U(pJalan, 'uShoulderW'), o.shoulderLinesWidthPercentage);
    gl.uniform1f(U(pJalan, 'uBrokenW'), o.brokenLinesWidthPercentage);
    gl.uniform1f(U(pJalan, 'uBrokenLen'), o.brokenLinesLengthPercentage);
    gl.useProgram(pTiang.p);
    gl.uniform1f(U(pTiang, 'uOffsetX'), tiang.x);

    // --- helper atribut ---
    function atribut(loc, b, ukuran, instans) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, ukuran, gl.FLOAT, false, 0, 0);
      setDivisor(loc, instans ? 1 : 0);
    }
    function lepas(locs) { locs.forEach(function (l) { setDivisor(l, 0); gl.disableVertexAttribArray(l); }); }

    // --- kamera (matriks) ---
    var proj = new Float32Array(16), view = new Float32Array(16), vp = new Float32Array(16);
    var MATA = [0, 8, -5];
    function perspektif(out, fovy, aspek, near, far) {
      var f = 1 / Math.tan(fovy * Math.PI / 360), nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspek; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    }
    function lihatKe(out, e, t) {
      var zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2], l = Math.hypot(zx, zy, zz);
      zx /= l; zy /= l; zz /= l;
      var xx = zz, xz = -zx; l = Math.hypot(xx, xz); xx /= l; xz /= l;
      var yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = 0;  out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * e[0] + xz * e[2]);
      out[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
      out[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
      out[15] = 1;
    }
    function kali(out, a, b) {
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        out[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
      }
    }
    function nsin(v) { return Math.sin(v) * 0.5 + 0.5; }
    function arahKamera(p, time) {       // kamera ikut belokan jalan
      function gx(q) { return Math.cos(Math.PI * q * FREQ[0] + time) * AMP[0] + Math.pow(Math.cos(Math.PI * q * FREQ[1] + time * (FREQ[1] / FREQ[0])), 2) * AMP[1]; }
      function gy(q) { return -nsin(Math.PI * q * FREQ[2] + time) * AMP[2] - Math.pow(nsin(Math.PI * q * FREQ[3] + time / (FREQ[2] / FREQ[3])), 5) * AMP[3]; }
      return [(gx(p) - gx(p + 0.007)) * -2, (gy(p) - gy(p + 0.007)) * -5, -10];
    }

    // --- framebuffer buat efek glow ---
    function buatFBO(w, h, pakaiDepth) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var rb = null;
      if (pakaiDepth) {
        rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fb: fb, tex: tex, rb: rb, w: w, h: h, ok: ok };
    }
    function hapusFBO(f) {
      if (!f) return;
      gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex);
      if (f.rb) gl.deleteRenderbuffer(f.rb);
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var lebar = 0, tinggi = 0, fS = null, fA = null, fB = null, glow = false;
    function ukur() {
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w === lebar && h === tinggi) return;
      lebar = canvas.width = w; tinggi = canvas.height = h;
      hapusFBO(fS); hapusFBO(fA); hapusFBO(fB);
      var bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
      fS = buatFBO(bw, bh, true); fA = buatFBO(bw, bh, false); fB = buatFBO(bw, bh, false);
      glow = fS.ok && fA.ok && fB.ok;
    }

    // --- gambar satu adegan ---
    function gambarAdegan(time, scroll) {
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
      gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

      // jalan & pulau
      gl.useProgram(pJalan.p);
      gl.uniformMatrix4fv(U(pJalan, 'uViewProj'), false, vp);
      gl.uniform1f(U(pJalan, 'uTime'), time);
      gl.uniform1f(U(pJalan, 'uScroll'), scroll);
      jalan.forEach(function (j) {
        atribut(0, j.g.pos, 3, false);
        atribut(1, j.g.uv, 2, false);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, j.g.idx);
        gl.uniform1f(U(pJalan, 'uOffsetX'), j.x);
        gl.uniform3fv(U(pJalan, 'uColor'), j.warna);
        gl.uniform1f(U(pJalan, 'uIsRoad'), j.road);
        gl.drawElements(gl.TRIANGLES, j.g.n, gl.UNSIGNED_SHORT, 0);
      });
      gl.disableVertexAttribArray(1);

      // tiang lampu
      gl.useProgram(pTiang.p);
      gl.uniformMatrix4fv(U(pTiang, 'uViewProj'), false, vp);
      gl.uniform1f(U(pTiang, 'uTime'), time);
      atribut(0, gTiang.pos, 3, false);
      atribut(2, tiang.off, 1, true);
      atribut(3, tiang.met, 2, true);
      atribut(4, tiang.col, 3, true);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gTiang.idx);
      gambarInstans(gTiang.n, tiang.n);

      // lampu mobil (ekornya memudar)
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.useProgram(pMobil.p);
      gl.uniformMatrix4fv(U(pMobil, 'uViewProj'), false, vp);
      gl.uniform1f(U(pMobil, 'uTime'), time);
      atribut(0, gTabung.pos, 3, false);
      atribut(1, gTabung.uv, 2, false);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gTabung.idx);
      [mobilKiri, mobilKanan].forEach(function (m) {
        atribut(2, m.off, 3, true);
        atribut(3, m.met, 3, true);
        atribut(4, m.col, 3, true);
        gl.uniform2f(U(pMobil, 'uFade'), m.fade[0], m.fade[1]);
        gl.uniform1f(U(pMobil, 'uOffsetX'), m.x);
        gambarInstans(gTabung.n, m.n);
      });
      lepas([1, 2, 3, 4]);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }

    function layarPenuh() {
      atribut(0, bufLayar, 2, false);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function blur(src, dst, dx, dy, cut) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.useProgram(pBlur.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(U(pBlur, 'uTex'), 0);
      gl.uniform2f(U(pBlur, 'uDir'), dx / src.w, dy / src.h);
      gl.uniform1f(U(pBlur, 'uCut'), cut);
      layarPenuh();
    }

    // --- loop animasi ---
    var bgc = rgb(C.background);
    var lalu = performance.now(), jalanWaktu = 0, offsetWaktu = 0;
    var cepat = 0, targetCepat = 0, fov = o.fov, targetFov = o.fov;
    var nFrame = 0, totalDt = 0, raf = 0, mati = false;

    function frame(now) {
      if (mati) return;
      raf = requestAnimationFrame(frame);
      var dt = Math.min(Math.max((now - lalu) / 1000, 0), 0.1);
      lalu = now;

      // kualitas otomatis: kalau HP-nya berat, resolusi diturunin
      nFrame++;
      if (nFrame > 60) {
        totalDt += dt;
        if (nFrame >= 150) {
          if (totalDt / 90 > 0.034 && dpr > 1) dpr = Math.max(1, dpr - 0.5);
          nFrame = 60; totalDt = 0;
        }
      }
      ukur();

      jalanWaktu += dt;
      cepat += (targetCepat - cepat) * (1 - Math.exp(-dt * 10));
      offsetWaktu += cepat * dt;
      var time = jalanWaktu + offsetWaktu;
      fov += (targetFov - fov) * (1 - Math.exp(-dt * 5));

      var d = arahKamera(0.025, time);
      perspektif(proj, fov, lebar / tinggi, 0.1, 10000);
      lihatKe(view, MATA, [MATA[0] + d[0], MATA[1] + d[1], MATA[2] + d[2]]);
      kali(vp, proj, view);
      var scroll = (time * 0.05) % 1;

      if (glow) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fS.fb);
        gl.viewport(0, 0, fS.w, fS.h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gambarAdegan(time, scroll);
        gl.disable(gl.DEPTH_TEST);
        blur(fS, fA, 1, 0, 0.08);
        blur(fA, fB, 0, 1, 0);
        blur(fB, fA, 2, 0, 0);
        blur(fA, fB, 0, 2, 0);
        blur(fB, fA, 3, 0, 0);
        blur(fA, fB, 0, 3, 0);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, lebar, tinggi);
      gl.clearColor(bgc[0], bgc[1], bgc[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gambarAdegan(time, scroll);

      if (glow) {
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(pGabung.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fB.tex);
        gl.uniform1i(U(pGabung, 'uTex'), 0);
        gl.uniform1f(U(pGabung, 'uKuat'), o.glow);
        layarPenuh();
        gl.disable(gl.BLEND);
      }
    }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); mati = true; cancelAnimationFrame(raf);
      document.body.classList.add('no-webgl');
    });

    ukur();
    raf = requestAnimationFrame(frame);

    return {
      ngebut: function () { targetCepat = o.speedUp; targetFov = o.fovSpeedUp; },
      santai: function () { targetCepat = 0; targetFov = o.fov; },
      berhenti: function () { mati = true; cancelAnimationFrame(raf); }
    };
  }

  window.Hyperspeed = {
    OPSI: OPSI,
    mulai: function (canvas, opsi) {
      try { return buat(canvas, opsi); }
      catch (e) { console.warn('Hyperspeed gagal jalan:', e); return null; }
    }
  };
})();
