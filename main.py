# ==========================================================
# NYC SOFTWARE - REELS İNDİRİCİ V4 (Modern UI)
# ==========================================================
import customtkinter as ctk
import yt_dlp
import os
import threading
import webbrowser
import requests
import io
import math
import time
from PIL import Image, ImageDraw, ImageFilter

# ==========================================================
# TEMA VE RENK PALETİ
# ==========================================================
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# Ana renkler
BG_PRIMARY = "#0f0f17"       # Koyu arka plan
BG_CARD = "#1a1a2e"          # Kart arka planı
BG_INPUT = "#16213e"         # Input arka planı
BG_INPUT_BORDER = "#2a2a4a"  # Input kenarlık
ACCENT_PRIMARY = "#7c3aed"   # Ana mor
ACCENT_SECONDARY = "#a855f7" # Açık mor
ACCENT_GRADIENT_1 = "#6366f1" # Gradient başlangıç
ACCENT_GRADIENT_2 = "#8b5cf6" # Gradient bitiş
TEXT_PRIMARY = "#f1f5f9"     # Ana metin
TEXT_SECONDARY = "#94a3b8"   # Alt metin
TEXT_MUTED = "#64748b"       # Soluk metin
SUCCESS = "#22c55e"          # Başarı yeşili
ERROR = "#ef4444"            # Hata kırmızısı
WARNING = "#f59e0b"          # Uyarı sarısı
BORDER_SUBTLE = "#2a2a4a"    # İnce kenarlık
HOVER_GLOW = "#7c3aed"       # Hover efekti


def create_rounded_image(pil_image, radius=16):
    """PIL imajına yuvarlatılmış köşeler uygular."""
    w, h = pil_image.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (w, h)], radius=radius, fill=255)
    output = pil_image.copy()
    output.putalpha(mask)
    return output


class NYCDownloaderApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        # ── Pencere Ayarları ──
        self.title("NYC Software — Reels İndirici V4")
        self.geometry("520x720")
        self.resizable(False, False)
        self.configure(fg_color=BG_PRIMARY)

        # İndirme klasörü
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.download_folder = os.path.join(self.base_dir, "downloads")
        os.makedirs(self.download_folder, exist_ok=True)

        # Durum değişkenleri
        self.cancel_download_flag = False
        self._thumb_photo = None  # Referansı kaybetmemek için

        # ── Arayüzü oluştur ──
        self._build_ui()

    # ══════════════════════════════════════════════════════════
    #  ARAYÜZ OLUŞTURMA
    # ══════════════════════════════════════════════════════════
    def _build_ui(self):
        # ---------- Üst başlık alanı ----------
        self.header = ctk.CTkFrame(self, fg_color=BG_PRIMARY, corner_radius=0)
        self.header.pack(fill="x", padx=0, pady=(24, 0))

        self.logo_icon = ctk.CTkLabel(
            self.header, text="⬇",
            font=ctk.CTkFont(size=36),
            text_color=ACCENT_PRIMARY
        )
        self.logo_icon.pack()

        self.brand_label = ctk.CTkLabel(
            self.header, text="NYC Reels İndirici",
            font=ctk.CTkFont(family="Segoe UI", size=24, weight="bold"),
            text_color=TEXT_PRIMARY
        )
        self.brand_label.pack(pady=(4, 0))

        self.subtitle_label = ctk.CTkLabel(
            self.header,
            text="Instagram • YouTube • TikTok • X",
            font=ctk.CTkFont(family="Segoe UI", size=12),
            text_color=TEXT_MUTED
        )
        self.subtitle_label.pack(pady=(2, 0))

        # ---------- Merkez kart ----------
        self.card = ctk.CTkFrame(
            self, fg_color=BG_CARD,
            corner_radius=16, border_width=1,
            border_color=BORDER_SUBTLE
        )
        self.card.pack(fill="x", padx=28, pady=(20, 0))

        # URL giriş alanı
        self.input_frame = ctk.CTkFrame(self.card, fg_color="transparent")
        self.input_frame.pack(fill="x", padx=20, pady=(20, 0))

        self.url_label = ctk.CTkLabel(
            self.input_frame, text="🔗  Video Bağlantısı",
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            text_color=TEXT_SECONDARY, anchor="w"
        )
        self.url_label.pack(fill="x")

        self.url_entry = ctk.CTkEntry(
            self.input_frame,
            placeholder_text="Bağlantıyı buraya yapıştırın...",
            height=44, corner_radius=10,
            fg_color=BG_INPUT,
            border_color=BG_INPUT_BORDER,
            border_width=1,
            text_color=TEXT_PRIMARY,
            placeholder_text_color=TEXT_MUTED,
            font=ctk.CTkFont(family="Segoe UI", size=13)
        )
        self.url_entry.pack(fill="x", pady=(6, 0))
        self.url_entry.bind("<Return>", lambda e: self.start_process_thread())

        # Ana indir butonu
        self.download_btn = ctk.CTkButton(
            self.card,
            text="İndir",
            height=44, corner_radius=10,
            font=ctk.CTkFont(family="Segoe UI", size=15, weight="bold"),
            fg_color=ACCENT_PRIMARY, hover_color=ACCENT_SECONDARY,
            command=self.start_process_thread
        )
        self.download_btn.pack(fill="x", padx=20, pady=(14, 20))

        # İptal butonu (gizli başlar)
        self.cancel_btn = ctk.CTkButton(
            self.card,
            text="İptal Et",
            height=44, corner_radius=10,
            font=ctk.CTkFont(family="Segoe UI", size=15, weight="bold"),
            fg_color=ERROR, hover_color="#dc2626",
            command=self.cancel_process
        )
        # cancel_btn pack edilmeyecek, gerektiğinde gösterilecek

        # ---------- Bilgi kartı (video önizleme) ----------
        self.info_card = ctk.CTkFrame(
            self, fg_color=BG_CARD,
            corner_radius=16, border_width=1,
            border_color=BORDER_SUBTLE
        )
        # info_card başlangıçta gizli

        self.thumb_label = ctk.CTkLabel(self.info_card, text="", fg_color="transparent")
        self.thumb_label.pack(padx=20, pady=(16, 6))

        self.video_title_label = ctk.CTkLabel(
            self.info_card, text="",
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold"),
            text_color=TEXT_PRIMARY, wraplength=420, justify="center"
        )
        self.video_title_label.pack(padx=20)

        self.video_duration_label = ctk.CTkLabel(
            self.info_card, text="",
            font=ctk.CTkFont(family="Segoe UI", size=12),
            text_color=ACCENT_SECONDARY
        )
        self.video_duration_label.pack(pady=(2, 14))

        # ---------- İlerleme kartı ----------
        self.progress_card = ctk.CTkFrame(
            self, fg_color=BG_CARD,
            corner_radius=16, border_width=1,
            border_color=BORDER_SUBTLE
        )
        # progress_card başlangıçta gizli

        self.status_label = ctk.CTkLabel(
            self.progress_card, text="Hazırlanıyor...",
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            text_color=TEXT_PRIMARY
        )
        self.status_label.pack(padx=20, pady=(16, 6))

        self.progress_bar = ctk.CTkProgressBar(
            self.progress_card,
            width=400, height=10,
            corner_radius=5,
            progress_color=ACCENT_PRIMARY,
            fg_color=BG_INPUT
        )
        self.progress_bar.set(0)
        self.progress_bar.pack(padx=20, pady=(0, 4))

        self.percent_label = ctk.CTkLabel(
            self.progress_card, text="0%",
            font=ctk.CTkFont(family="Segoe UI", size=22, weight="bold"),
            text_color=ACCENT_SECONDARY
        )
        self.percent_label.pack()

        # İndirme detay çizgisi
        self.detail_frame = ctk.CTkFrame(self.progress_card, fg_color="transparent")
        self.detail_frame.pack(fill="x", padx=20, pady=(4, 14))

        self.speed_label = ctk.CTkLabel(
            self.detail_frame, text="Hız: —",
            font=ctk.CTkFont(family="Segoe UI", size=11),
            text_color=TEXT_MUTED
        )
        self.speed_label.pack(side="left")

        self.eta_label = ctk.CTkLabel(
            self.detail_frame, text="Kalan: —",
            font=ctk.CTkFont(family="Segoe UI", size=11),
            text_color=TEXT_MUTED
        )
        self.eta_label.pack(side="right")

        self.downloaded_label = ctk.CTkLabel(
            self.progress_card, text="",
            font=ctk.CTkFont(family="Segoe UI", size=11),
            text_color=TEXT_MUTED
        )
        self.downloaded_label.pack(pady=(0, 14))

        # ---------- Sonuç kartı ----------
        self.result_card = ctk.CTkFrame(
            self, fg_color=BG_CARD,
            corner_radius=16, border_width=1,
            border_color=BORDER_SUBTLE
        )
        # result_card başlangıçta gizli

        self.result_icon = ctk.CTkLabel(
            self.result_card, text="",
            font=ctk.CTkFont(size=36)
        )
        self.result_icon.pack(pady=(16, 4))

        self.result_text = ctk.CTkLabel(
            self.result_card, text="",
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold"),
            text_color=TEXT_PRIMARY, wraplength=420, justify="center"
        )
        self.result_text.pack(padx=20)

        self.result_subtext = ctk.CTkLabel(
            self.result_card, text="",
            font=ctk.CTkFont(family="Segoe UI", size=11),
            text_color=TEXT_MUTED, wraplength=420, justify="center"
        )
        self.result_subtext.pack(padx=20, pady=(2, 4))

        self.open_folder_btn = ctk.CTkButton(
            self.result_card,
            text="📂  Klasörü Aç",
            height=38, corner_radius=10,
            font=ctk.CTkFont(family="Segoe UI", size=13),
            fg_color=BG_INPUT, hover_color=BG_INPUT_BORDER,
            text_color=TEXT_PRIMARY,
            command=self.open_download_folder
        )
        self.open_folder_btn.pack(padx=20, pady=(6, 16))

        # ---------- Alt bilgi ----------
        self.footer = ctk.CTkLabel(
            self,
            text="NYC Software © 2026  ·  nycsoftware.org",
            font=ctk.CTkFont(family="Segoe UI", size=10),
            text_color=TEXT_MUTED, cursor="hand2"
        )
        self.footer.pack(side="bottom", pady=(0, 12))
        self.footer.bind("<Button-1>", lambda e: self.open_website())

    # ══════════════════════════════════════════════════════════
    #  YARDIMCI FONKSİYONLAR
    # ══════════════════════════════════════════════════════════
    def open_website(self):
        webbrowser.open("https://nycsoftware.org")

    def open_download_folder(self):
        webbrowser.open(self.download_folder)

    def _show_card(self, card, after_widget=None):
        """Bir kartı görünür yapar."""
        card.pack(fill="x", padx=28, pady=(12, 0))
        # Footer'ı her zaman en alta al
        self.footer.pack_forget()
        self.footer.pack(side="bottom", pady=(0, 12))

    def _hide_card(self, card):
        """Bir kartı gizler."""
        card.pack_forget()

    def _reset_ui(self):
        """Arayüzü ilk haline döndürür."""
        self._hide_card(self.info_card)
        self._hide_card(self.progress_card)
        self._hide_card(self.result_card)
        self.thumb_label.configure(image=None, text="")
        self.video_title_label.configure(text="")
        self.video_duration_label.configure(text="")
        self.progress_bar.set(0)
        self.percent_label.configure(text="0%")
        self.speed_label.configure(text="Hız: —")
        self.eta_label.configure(text="Kalan: —")
        self.downloaded_label.configure(text="")
        self._thumb_photo = None

    def _show_download_btn(self):
        self.cancel_btn.pack_forget()
        self.download_btn.pack(fill="x", padx=20, pady=(14, 20))

    def _show_cancel_btn(self):
        self.download_btn.pack_forget()
        self.cancel_btn.pack(fill="x", padx=20, pady=(14, 20))

    # ══════════════════════════════════════════════════════════
    #  İNDİRME İŞLEMLERİ
    # ══════════════════════════════════════════════════════════
    def cancel_process(self):
        self.cancel_download_flag = True
        self.status_label.configure(text="İptal ediliyor...", text_color=WARNING)
        self.cancel_btn.configure(state="disabled")

    def start_process_thread(self):
        url = self.url_entry.get().strip()
        if not url:
            # Hızlı hata göster ve dön
            self._hide_card(self.info_card)
            self._hide_card(self.progress_card)
            self._show_result("error", "Lütfen bir bağlantı girin",
                              "Herhangi bir platformdan video bağlantısı yapıştırın.")
            return

        # UI'ı sıfırla
        self.cancel_download_flag = False
        self._reset_ui()
        self._hide_card(self.result_card)

        # İlerleme kartını göster
        self.status_label.configure(text="Video bilgileri alınıyor...", text_color=TEXT_PRIMARY)
        self._show_card(self.progress_card)
        self._show_cancel_btn()

        thread = threading.Thread(target=self.process_video, args=(url,), daemon=True)
        thread.start()

    def progress_hook(self, d):
        """yt-dlp ilerleme geri çağrısı."""
        if self.cancel_download_flag:
            raise Exception("KULLANICI_IPTAL")

        if d['status'] == 'downloading':
            _percent_str = d.get('_percent_str', '0%').replace('%', '')
            try:
                percent = max(0, min(1, float(_percent_str) / 100))
            except (ValueError, TypeError):
                percent = 0

            _speed_str = d.get('_speed_str', '—')
            _eta_str = d.get('_eta_str', '—')
            _downloaded_bytes_str = d.get('_downloaded_bytes_str', '—')

            total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate')
            total_str = f"{total_bytes / (1024 * 1024):.1f} MB" if total_bytes else "—"

            pct_int = int(percent * 100)

            self.progress_bar.set(percent)
            self.percent_label.configure(text=f"%{pct_int}")
            self.status_label.configure(text="İndiriliyor...", text_color=TEXT_PRIMARY)
            self.speed_label.configure(text=f"Hız: {_speed_str}")
            self.eta_label.configure(text=f"Kalan: {_eta_str}")
            self.downloaded_label.configure(text=f"{_downloaded_bytes_str} / {total_str}")

    def process_video(self, url):
        try:
            # ── 1. Bilgi çekme ──
            info_opts = {
                'quiet': True,
                'no_warnings': True,
                'socket_timeout': 10,
                'retries': 0
            }

            with yt_dlp.YoutubeDL(info_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            if self.cancel_download_flag:
                raise ValueError("KULLANICI_IPTAL")

            v_title = info.get('title', 'Bilinmeyen Başlık')
            duration_sec = info.get('duration', 0) or 0
            thumb_url = info.get('thumbnail', None)

            mins, secs = divmod(int(duration_sec), 60)
            duration_str = f"{mins:02d}:{secs:02d}"

            # Küçük resim yükle
            if thumb_url:
                try:
                    response = requests.get(thumb_url, timeout=5)
                    response.raise_for_status()
                    image = Image.open(io.BytesIO(response.content))
                    image = image.resize((320, 180), Image.LANCZOS)
                    image = create_rounded_image(image, radius=12)
                    self._thumb_photo = ctk.CTkImage(
                        light_image=image, dark_image=image, size=(320, 180)
                    )
                    self.thumb_label.configure(image=self._thumb_photo, text="")
                except Exception:
                    self.thumb_label.configure(image=None, text="Önizleme yüklenemedi")

            self.video_title_label.configure(text=v_title)
            self.video_duration_label.configure(text=f"⏱  {duration_str}")
            self._show_card(self.info_card)

            self.status_label.configure(text="İndiriliyor...", text_color=TEXT_PRIMARY)

            # ── 2. İndirme ──
            download_opts = {
                'format': '22/18/best',
                'outtmpl': os.path.join(self.download_folder, '%(title)s.%(ext)s'),
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [self.progress_hook],
                'socket_timeout': 15,
                'retries': 0
            }

            with yt_dlp.YoutubeDL(download_opts) as ydl:
                error_code = ydl.download([url])

            if self.cancel_download_flag or error_code != 0:
                raise ValueError("KULLANICI_IPTAL" if self.cancel_download_flag else "YTDLP_HATA")

            # Başarılı
            self.progress_bar.set(1)
            self.percent_label.configure(text="%100")
            self.status_label.configure(text="Tamamlandı!", text_color=SUCCESS)
            self._hide_card(self.progress_card)
            self._show_result("success", "İndirme Tamamlandı!",
                              f"Video başarıyla kaydedildi.\n{self.download_folder}")
            self.url_entry.delete(0, 'end')

        except Exception as e:
            if "KULLANICI_IPTAL" in str(e):
                self._hide_card(self.progress_card)
                self._show_result("cancel", "İndirme İptal Edildi",
                                  "İşlem kullanıcı tarafından durduruldu.")
            else:
                self._hide_card(self.progress_card)
                self._show_result("error", "Bir Hata Oluştu",
                                  "Bağlantı geçersiz, gizli veya erişilemiyor olabilir.")
                print(f"Hata detayı: {e}")
        finally:
            self._show_download_btn()

    def _show_result(self, result_type, title, subtitle):
        """Sonuç kartını gösterir."""
        icons = {"success": "✅", "error": "❌", "cancel": "⚠️"}
        colors = {"success": SUCCESS, "error": ERROR, "cancel": WARNING}
        border_colors = {"success": "#166534", "error": "#7f1d1d", "cancel": "#78350f"}

        self.result_icon.configure(text=icons.get(result_type, "ℹ️"))
        self.result_text.configure(text=title, text_color=colors.get(result_type, TEXT_PRIMARY))
        self.result_subtext.configure(text=subtitle)
        self.result_card.configure(border_color=border_colors.get(result_type, BORDER_SUBTLE))

        if result_type == "success":
            self.open_folder_btn.pack(padx=20, pady=(6, 16))
        else:
            self.open_folder_btn.pack_forget()

        self._show_card(self.result_card)


# ══════════════════════════════════════════════════════════
#  BAŞLAT
# ══════════════════════════════════════════════════════════
if __name__ == "__main__":
    app = NYCDownloaderApp()
    app.mainloop()