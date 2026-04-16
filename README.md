# MEMATİ — Usta İşi Video İndirici 🍷👓

Instagram ve TikTok platformlarındaki gönderileri bot korumalarına takılmadan; keskin, karanlık ve modern "Memati" teması ile tek tıkla indirmenizi sağlayan özel bir web projesi. 

![Arayüz Önizlemesi](https://i.imgur.com/Kz8jGzZ.png) <!-- Opsiyonel: Buraya uygulamanızın bir ekran görüntüsü linkini koyabilirsiniz -->

## 🚀 Özellikler

- **Çift Platform Desteği:** Instagram (Reels, Gönderi) ve TikTok videolarını sorunsuz çeker.
- **Bot Koruması Aşma (Proxy Fallback):** Engellemelerden kaynaklı "api block" hatalarına karşı sıralı proxy rotasyon sistemi (Sextuple Fallback) kullanır.
- **Tema Şalteri (Dark / Light Mode):** İster gece "Karbon/Kan Kırmızı" racon modunda, ister gündüz açık renk modda kullanın. Tercihiniz tarayıcınıza kaydedilir.
- **Mobil Uyumlu (Responsive):** Telefon, tablet veya Usta'nın bilgisayar ekranı fark etmeden her ekrana tam oturur.
- **Şık Bildirimler:** İşlem durumlarını ve hataları havalı ve köşeli tasarıma sahip anlık toast bildirimleri ile gösterir.

## 🛠️ Kurulum ve Çalıştırma

Projeyi kendi bilgisayarınızda (veya bir sunucuda) kurmak çok basittir:

1. **Projeyi Klonlayın veya İndirin:**
   ```bash
   git clone https://github.com/Memati8383/memati-reels-downloader.git
   cd memati-reels-downloader
   ```

2. **Gerekli Paketleri Yükleyin:**
   Node.js kurulu olduğundan emin olun.
   ```bash
   npm install
   ```
   *(Eğer `package.json` yoksa, sadece `npm init -y` yapıp `npm install express cors node-fetch axios user-agents` çalıştırabilirsiniz.)*

3. **Sunucuyu Başlatın:**
   ```bash
   node server.js
   ```

4. **Tarayıcıda Açın:**
   Adres çubuğunuza `http://localhost:3000` yazarak Usta'nın mekanına giriş yapabilirsiniz.

## 💻 Kullanılan Teknolojiler
- **Backend:** Node.js, Express.js
- **Frontend:** Vanilla HTML5, CSS3, DOM Javascript 
- **Tasarım Yapısı:** Özel Memati stili (Keskin hatlar, Oswald ve Inter font kombinasyonu), Uiverse bileşenleri.

## 🤝 Bize Ulaşın
Projeyle ilgili sormak istediğiniz bir şey olursa Github profilimden ulaşabilirsiniz.
> "Biz racon kesmeyiz... Video indiririz."
