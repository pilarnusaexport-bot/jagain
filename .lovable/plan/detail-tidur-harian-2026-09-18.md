# Detail Tidur Harian

## Tujuan
Mengubah pilihan **Tidur · Harian** dari daftar 14 hari menjadi halaman detail untuk satu tanggal, mengikuti susunan referensi tanpa membuat data tidur palsu.

## Yang dibangun
- Pemilih tanggal dengan tombol hari sebelumnya/berikutnya; tanggal awal memakai catatan tidur terbaru.
- Ringkasan durasi tidur besar, tanggal, dan sumber **Health Connect Webhook**.
- Visual rentang tidur malam berdasarkan waktu selesai dan durasi yang dikirim ponsel.
- Navigasi antarhari memakai seluruh riwayat yang sudah tersimpan; hari tanpa data menampilkan keadaan kosong.
- Pilihan Mingguan dan Bulanan tetap tersedia sementara, dengan tampilan lama sampai perbaikannya diminta berikutnya.

## Batasan data
Aplikasi Health Connect Webhook saat ini hanya mengirim durasi dan waktu selesai sesi tidur, bukan tahapan **Deep/Light/REM**. Karena itu grafik tahapan pada referensi tidak akan direka. Detail harian hanya menampilkan data nyata yang tersedia.

## Teknis
- Simpan waktu mulai, waktu selesai, dan sumber sesi pada catatan tidur agar detail harian akurat.
- Tetap mendukung catatan lama yang hanya memiliki durasi; waktu tidur akan ditandai belum tersedia.
- Sesuaikan penerima sinkronisasi dan tampilan Rekam, lalu verifikasi pada ukuran layar ponsel.
