/* ==========================================================
   PENGATURAN ✏️  —  cuma file ini yang perlu kamu edit.
   Abis ngedit: simpan, terus buka / refresh index.html lagi.

   ATURAN BIAR GAK ERROR:
   - teks harus di dalam tanda kutip  "..."
   - tiap baris diakhiri koma  ,
   - kalau di lirik ada tanda kutip dua, tulis  \"
   ========================================================== */

const PENGATURAN = {

  // ---------- 1. INTRO (layar pertama yang harus di-tap) ----------
  teksIntro1: "HALLO DITA SAYANG",
  teksIntro2: "THIS IS FOR YOU",
  teksTombol: "tap untuk memuat",
  teksHint:   "🔊 nyalain suaranya ya",

  // ---------- 2. LAGU ----------
  fileLagu:   "assets/lagu.mp3",  // lagu ada di folder assets
  mulaiDetik: 0,           // detik reff mulai di file lagu.
                           // lagu udah dipotong pas reff? biarin 0.
                           // reff mulai di menit 1:05? tulis 65
  durasi:     40,          // lagu diputar berapa detik sebelum penutup muncul
                           // (lagu kamu panjangnya ±40 detik)
  volume:     1.0,         // 0.0 sampai 1.0

  // ---------- 3. FOTO (kiri & kanan love) ----------
  foto1: "assets/foto1.jpeg",   // foto kiri
  foto2: "assets/foto2.jpeg",   // foto kanan

  // ---------- 4. LIRIK ----------
  // TEMPEL lirik reff kamu di antara dua tanda ` (backtick) di bawah ini,
  // persis kayak kamu ngetik di chat. Gak perlu tanda kutip / koma.
  // - 1 baris = 1 kali muncul di layar (baris kosong dilewatin)
  // - jangan ada tanda ` di dalam liriknya
  teksLirik: `
'Cause every night
I'm talking to the moon

Still try to get to you
In hopes you're on
the other side
Talking to me too
Or am I a fool
who sits alone
Talking to the moon?
  `,

  // detik muncul tiap baris (urutannya sama kayak baris lirik di atas),
  // dihitung dari awal lagu. Isi otomatis pakai modeSinkron.
  // Kalau masih kosong [], liriknya muncul gantian tiap 3 detik.
  waktuLirik: [7.82, 10.41, 16.52, 24.20, 26.63, 28.38,
    30.77, 33.55, 36.10],

  // KALO LIRIK MASIH KECEPETAN, GANTI JADI 0.5 ATAU 1.0
  // KALO KELAMBATAN, GANTI JADI -0.5
  geserLirik: 0.5,

  // ---------- 5. PENUTUP (muncul pas lagu selesai) ----------
  teksPenutup: "♡ i love you, Dita ♡",

  // ---------- 6. LAIN-LAIN ----------
  kembangApi:  true,       // false = tanpa kembang api
  modeSinkron: false,      // true = mode bantu nyari detik lirik (lihat tutorial)
};