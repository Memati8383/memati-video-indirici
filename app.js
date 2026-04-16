// ==========================================================
// NYC SOFTWARE - REELS İNDİRİCİ WEB v1.0
// Frontend Application Logic
// ==========================================================

(function () {
    'use strict';

    // ── DOM ELEMENTS ──
    const $ = (sel) => document.querySelector(sel);
    const urlInput = $('#url-input');
    const downloadBtn = $('#download-btn');
    const pasteBtn = $('#paste-btn');
    const cancelBtn = $('#cancel-btn');
    const saveBtn = $('#save-btn');
    const newBtn = $('#new-btn');
    const proxyIndicator = $('#proxy-indicator');

    // Sections
    const infoSection = $('#info-section');
    const progressSection = $('#progress-section');
    const resultSection = $('#result-section');

    // Info elements
    const videoThumbnail = $('#video-thumbnail');
    const videoTitle = $('#video-title');
    const videoDuration = $('#video-duration');
    const videoUploader = $('#video-uploader');
    const videoPlatform = $('#video-platform');

    // Progress elements
    const progressStatus = $('#progress-status');
    const progressPercent = $('#progress-percent');
    const progressBarFill = $('#progress-bar-fill');
    const progressBarGlow = $('#progress-bar-glow');
    const progressSpeed = $('#progress-speed');
    const progressEta = $('#progress-eta');

    // Result elements
    const resultCard = $('#result-card');
    const resultIcon = $('#result-icon');
    const resultTitle = $('#result-title');
    const resultSubtitle = $('#result-subtitle');
    const resultActions = $('#result-actions');

    // ── STATE ──
    let currentDownloadId = null;
    let statusPollInterval = null;
    let isProcessing = false;

    // ── INITIALIZATION ──
    function init() {
        checkProxyStatus();
        setupEventListeners();
        setupHeaderScroll();
        setupInputAnimations();

        // Theme Toggle Logic
        const themeToggle = document.getElementById('toggle');
        const savedTheme = localStorage.getItem('memati_theme') || 'dark';

        if (savedTheme === 'light') {
            themeToggle.checked = false;
            document.documentElement.classList.add('light-theme');
        } else {
            themeToggle.checked = true;
            document.documentElement.classList.remove('light-theme');
        }

        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.classList.remove('light-theme');
                localStorage.setItem('memati_theme', 'dark');
            } else {
                document.documentElement.classList.add('light-theme');
                localStorage.setItem('memati_theme', 'light');
            }
        });

        // URL parametresi varsa otomatik doldur
        const params = new URLSearchParams(window.location.search);
        const urlParam = params.get('url');
        if (urlParam) {
            urlInput.value = urlParam;
        }
    }

    // ── EVENT LISTENERS ──
    function setupEventListeners() {
        downloadBtn.addEventListener('click', handleDownload);

        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleDownload();
            }
        });

        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                urlInput.value = text;
                urlInput.focus();
                showToast('Bağlantı yapıştırıldı', 'info');
            } catch {
                showToast('Panoya erişilemedi', 'error');
            }
        });

        cancelBtn.addEventListener('click', handleCancel);
        saveBtn.addEventListener('click', handleSave);
        newBtn.addEventListener('click', handleNew);
    }

    function setupHeaderScroll() {
        const header = $('#app-header');
        let lastScroll = 0;

        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY > 20) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            lastScroll = scrollY;
        }, { passive: true });
    }

    function setupInputAnimations() {
        urlInput.addEventListener('focus', () => {
            $('#input-card').style.borderColor = 'var(--accent-primary)';
        });

        urlInput.addEventListener('blur', () => {
            $('#input-card').style.borderColor = '';
        });
    }

    // ── PROXY STATUS ──
    async function checkProxyStatus() {
        try {
            const res = await fetch('/api/proxy-status');
            const data = await res.json();
            if (data.active) {
                proxyIndicator.classList.add('active');
                proxyIndicator.querySelector('.proxy-text').textContent = 'Proxy Aktif';
            }
        } catch {
            // ignore
        }
    }

    // ── MAIN DOWNLOAD HANDLER ──
    async function handleDownload() {
        const url = urlInput.value.trim();

        if (!url) {
            showToast('Lütfen bir video bağlantısı girin', 'error');
            urlInput.focus();
            shakeElement(urlInput);
            return;
        }

        if (!isValidUrl(url)) {
            showToast('Geçersiz bağlantı formatı', 'error');
            shakeElement(urlInput);
            return;
        }

        if (isProcessing) return;
        isProcessing = true;

        // Reset UI
        hideSection(infoSection);
        hideSection(progressSection);
        hideSection(resultSection);

        // Show loading state on button
        downloadBtn.classList.add('loading');
        downloadBtn.disabled = true;

        try {
            // ── Step 1: Get video info ──
            showToast('Emanet sorgulanıyor...', 'info');
            const infoRes = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!infoRes.ok) {
                const err = await infoRes.json();
                throw new Error(err.error || 'Video bilgileri alınamadı');
            }

            const info = await infoRes.json();
            displayVideoInfo(info);

            // ── Step 2: Start download ──
            const dlRes = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!dlRes.ok) {
                const err = await dlRes.json();
                throw new Error(err.error || 'İndirme başlatılamadı');
            }

            const dlData = await dlRes.json();
            currentDownloadId = dlData.id;

            // Show progress
            showSection(progressSection);
            downloadBtn.classList.remove('loading');
            downloadBtn.disabled = true;

            // Start polling status
            startStatusPolling();

        } catch (err) {
            console.error('Download error:', err);
            showResult('error', 'Bir Hata Oluştu', err.message);
            downloadBtn.classList.remove('loading');
            downloadBtn.disabled = false;
            isProcessing = false;
        }
    }

    // ── VIDEO INFO DISPLAY ──
    function displayVideoInfo(info) {
        if (info.thumbnail) {
            // Instagram/TikTok görsellerini yerel proxy üzerinden yükle (Hotlinking korumasını aşmak için)
            const proxiedThumb = `/api/proxy-image?url=${encodeURIComponent(info.thumbnail)}`;
            videoThumbnail.src = proxiedThumb;
            
            videoThumbnail.onerror = () => {
                // Eğer yerel proxy de başarısız olursa (nadiren), doğrudan dene
                if (videoThumbnail.src !== info.thumbnail) {
                    videoThumbnail.src = info.thumbnail;
                } else {
                    videoThumbnail.src = '';
                    videoThumbnail.alt = 'Önizleme yüklenemedi';
                }
            };
        } else {
            videoThumbnail.src = '';
            videoThumbnail.alt = 'Önizleme yok';
        }

        videoTitle.textContent = info.title || 'Bilinmeyen Başlık';

        // Duration
        if (info.duration) {
            const mins = Math.floor(info.duration / 60);
            const secs = Math.floor(info.duration % 60);
            videoDuration.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            videoDuration.textContent = '—';
        }

        // Uploader
        const uploaderSpan = videoUploader.querySelector('span');
        uploaderSpan.textContent = info.uploader || '—';

        // Platform
        const platformSpan = videoPlatform.querySelector('span');
        platformSpan.textContent = formatPlatform(info.extractor);

        showSection(infoSection);
    }

    function formatPlatform(extractor) {
        if (!extractor) return 'Bilinmeyen';
        const map = {
            'instagram': 'Instagram',
            'tiktok': 'TikTok'
        };
        for (const [key, val] of Object.entries(map)) {
            if (extractor.toLowerCase().includes(key.toLowerCase())) return val;
        }
        return extractor;
    }

    // ── STATUS POLLING ──
    function startStatusPolling() {
        if (statusPollInterval) clearInterval(statusPollInterval);

        updateProgress(0, 'MASAYA YATIRILDI...', '—', '—');

        statusPollInterval = setInterval(async () => {
            if (!currentDownloadId) {
                stopStatusPolling();
                return;
            }

            try {
                const res = await fetch(`/api/status/${currentDownloadId}`);
                if (!res.ok) {
                    stopStatusPolling();
                    showResult('error', 'Bağlantı Hatası', 'Sunucu ile bağlantı kesildi.');
                    return;
                }

                const data = await res.json();

                switch (data.status) {
                    case 'downloading':
                        updateProgress(
                            data.progress,
                            'ÇEKİYORUZ...',
                            data.speed,
                            data.eta
                        );
                        break;

                    case 'completed':
                        stopStatusPolling();
                        updateProgress(100, 'TAMAMLANDI!', '—', '—');
                        
                        setTimeout(() => {
                            hideSection(progressSection);
                            showResult('success', 'İŞLEM TAMAM USTA', 'Emaneti sağ salim teslim aldık.');
                        }, 600);
                        break;

                    case 'error':
                        stopStatusPolling();
                        hideSection(progressSection);
                        showResult('error', 'SIKINTI ÇIKTI', data.error || 'Bilinmeyen bir hata oluştu.');
                        break;

                    case 'cancelled':
                        stopStatusPolling();
                        hideSection(progressSection);
                        showResult('cancel', 'İPTAL EDİLDİ', 'Usta, fişi çektin.');
                        break;
                }
            } catch (err) {
                console.error('Status poll error:', err);
            }
        }, 500);
    }

    function stopStatusPolling() {
        if (statusPollInterval) {
            clearInterval(statusPollInterval);
            statusPollInterval = null;
        }
    }

    // ── PROGRESS UPDATE ──
    function updateProgress(percent, status, speed, eta) {
        const p = Math.min(100, Math.max(0, percent));

        progressBarFill.style.width = `${p}%`;
        progressPercent.textContent = `%${Math.round(p)}`;
        progressStatus.textContent = status;

        if (speed && speed !== '—') {
            progressSpeed.textContent = `» Hız: ${speed}`;
        }

        if (eta && eta !== '—') {
            progressEta.textContent = `» Kalan: ${eta}`;
        }

        // Color change when complete
        if (p >= 100) {
            progressStatus.style.color = 'var(--success)';
            progressPercent.style.color = 'var(--success)';
        } else {
            progressStatus.style.color = '';
            progressPercent.style.color = '';
        }
    }

    // ── CANCEL HANDLER ──
    async function handleCancel() {
        if (!currentDownloadId) return;

        cancelBtn.disabled = true;
        cancelBtn.textContent = 'FİŞİ ÇEKİYORUZ...';

        try {
            await fetch(`/api/cancel/${currentDownloadId}`, { method: 'POST' });
        } catch (err) {
            console.error('Cancel error:', err);
        }

        stopStatusPolling();
        hideSection(progressSection);
        showResult('cancel', 'İPTAL EDİLDİ', 'Usta, işlemi durdurdun.');

        cancelBtn.disabled = false;
        cancelBtn.textContent = 'İPTAL ET';
    }

    // ── SAVE HANDLER ──
    function handleSave() {
        if (!currentDownloadId) return;

        const link = document.createElement('a');
        link.href = `/api/file/${currentDownloadId}`;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Dosya indiriliyor...', 'success');
    }

    // ── NEW VIDEO HANDLER ──
    function handleNew() {
        currentDownloadId = null;
        isProcessing = false;
        urlInput.value = '';

        hideSection(infoSection);
        hideSection(progressSection);
        hideSection(resultSection);

        downloadBtn.disabled = false;
        downloadBtn.classList.remove('loading');

        // Reset progress
        updateProgress(0, 'Hazırlanıyor...', '—', '—');

        urlInput.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── RESULT DISPLAY ──
    function showResult(type, title, subtitle) {
        const icons = { success: '✓', error: '✕', cancel: '!' };

        resultCard.className = 'memati-box result-card ' + type;
        resultIcon.textContent = icons[type] || '»';
        resultTitle.textContent = title;
        resultSubtitle.textContent = subtitle;

        // Show/hide save button based on type
        if (type === 'success') {
            resultActions.style.display = 'flex';
            saveBtn.style.display = 'flex';
        } else {
            saveBtn.style.display = 'none';
            resultActions.style.display = 'flex';
        }

        showSection(resultSection);
        downloadBtn.disabled = false;
        downloadBtn.classList.remove('loading');
        isProcessing = false;
    }

    // ── SECTION VISIBILITY ──
    function showSection(section) {
        section.classList.remove('hidden');
        section.style.animation = 'slideUp 0.4s ease-out';
    }

    function hideSection(section) {
        section.classList.add('hidden');
    }

    // ── TOAST NOTIFICATIONS ──
    function showToast(message, type = 'info') {
        const container = $('#toast-container');
        const icons = {
            success: '✓',
            error: '✕',
            info: '»'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span style="font-weight:700;font-size:1.1rem;">${icons[type] || '»'}</span>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        // Auto-remove after 3.5s
        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
        }, 3500);
    }

    // ── UTILITIES ──
    function isValidUrl(str) {
        try {
            const url = new URL(str);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    function shakeElement(el) {
        el.style.animation = 'none';
        el.offsetHeight; // trigger reflow
        el.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => { el.style.animation = ''; }, 500);
    }

    // Add shake keyframes dynamically
    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
        }
    `;
    document.head.appendChild(shakeStyle);

    // ── START ──
    document.addEventListener('DOMContentLoaded', init);
})();
