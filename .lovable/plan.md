# Health Tracker keluarga

## Yang akan dibangun
- Onboarding mobile dengan masuk/daftar Google dan tombol Install untuk pemasangan ke layar utama.
- Tampilan setelah masuk dengan header dan navigasi bawah yang selalu terlihat: Home, Rekam, Profil.
- Home bergaya Soft clay bento: skor harian, Tidur, Langkah, Detak Jantung, serta pembuatan dan pengelolaan Group keluarga.
- Alur Group untuk membuat grup, melihat anggota, dan mengundang anggota berbagi Rekam Kesehatan.
- Rekam dengan ringkasan data Tidur, Langkah, dan Detak Jantung dalam tampilan harian.
- Profil dengan nama, foto, umur, jenis kelamin, preferensi berbagi, status koneksi data kesehatan, dan keluar akun.

## Data dan akun
- Aktifkan Lovable Cloud untuk login Google, profil pengguna, grup, undangan, dan izin berbagi.
- Simpan profil serta relasi grup dengan aturan akses agar hanya anggota yang berhak dapat melihat data yang dibagikan.
- Gunakan data contoh yang jelas pada pratinjau sampai sumber data perangkat tersedia.

## Catatan Health Connect
- PWA web tidak dapat membaca Health Connect Android secara langsung. Layar Rekam akan menyiapkan alur koneksi dan data contoh; sinkronisasi asli memerlukan pembungkus aplikasi Android/native bridge sebagai tahap terpisah.

## Tampilan
- Kunci palet Hijau Aktif, Outfit untuk judul, Figtree untuk isi, kartu radius 8px, dan susunan bento sesuai arah yang dipilih.
- Optimalkan untuk layar HP dan periksa tampilan pada ukuran mobile.

## Pemasangan
- Tambahkan manifest, ikon, dan metadata agar aplikasi dapat dipasang dari browser sebagai PWA tanpa menambahkan mode offline.
