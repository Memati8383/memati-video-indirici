// ==========================================================
// NYC SOFTWARE - REELS İNDİRİCİ WEB v1.0
// Node.js + Express Backend (Pure JS)
// Doğrudan fetch + corsproxy.io fallback
// ==========================================================

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

let ytdl;
try {
    ytdl = require('@distube/ytdl-core');
} catch (e) {
    console.warn('⚠ ytdl-core yüklenemedi, YouTube desteği devre dışı.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// MIDDLEWARE
// ==========================================================
app.use(cors());
app.use(express.json());
if (!process.env.VERCEL) {
    app.use(express.static(__dirname));
}

// Downloads klasörü
const DOWNLOADS_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'downloads');
if (!process.env.VERCEL && !fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// ==========================================================
// HTTP İSTEK YARDIMCILARI
// ==========================================================
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
};

const INSTAGRAM_HEADERS = {
    ...DEFAULT_HEADERS,
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
};

/**
 * Gelişmiş fetch - önce doğrudan, sonra corsproxy.io ile dener
 */
async function smartFetch(url, options = {}) {
    const fetchOptions = {
        headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeout || 15000),
    };

    // 1. Doğrudan fetch dene (sunucu tarafı, CORS yok)
    try {
        const res = await fetch(url, fetchOptions);
        if (res.ok || res.status === 301 || res.status === 302) {
            return res;
        }
    } catch (e) {
        console.log(`  Doğrudan fetch başarısız (${url.substring(0, 60)}...): ${e.message}`);
    }

    // 2. corsproxy.io üzerinden dene
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const proxyRes = await fetch(proxyUrl, {
            ...fetchOptions,
            headers: {
                ...fetchOptions.headers,
                'Origin': 'https://corsproxy.io',
            }
        });
        if (proxyRes.ok) {
            return proxyRes;
        }
    } catch (e) {
        console.log(`  corsproxy.io fetch başarısız: ${e.message}`);
    }

    // 3. Alternatif proxy dene
    try {
        const altProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const altRes = await fetch(altProxy, {
            signal: AbortSignal.timeout(options.timeout || 15000),
        });
        if (altRes.ok) {
            return altRes;
        }
    } catch (e) {
        console.log(`  allorigins fetch başarısız: ${e.message}`);
    }

    throw new Error(`URL'ye erişilemedi: ${url.substring(0, 80)}`);
}

// ==========================================================
// PLATFORM DETECTION
// ==========================================================
function detectPlatform(url) {
    try {
        if (url.includes('instagram.com') || url.includes('instagr.am')) return 'instagram';
        if (url.includes('tiktok.com')) return 'tiktok';
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

// ==========================================================
// INSTAGRAM SHORTCODE → MEDIA ID
// ==========================================================
function shortcodeToMediaId(shortcode) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = BigInt(0);
    for (const c of shortcode) {
        id = id * 64n + BigInt(alphabet.indexOf(c));
    }
    return id.toString();
}

// ==========================================================
// INSTAGRAM EXTRACTOR
// ==========================================================
async function extractInstagram(url) {
    const shortcodeMatch = url.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (!shortcodeMatch) throw new Error('Geçersiz Instagram bağlantısı.');
    const shortcode = shortcodeMatch[2];
    const mediaId = shortcodeToMediaId(shortcode);

    console.log(`  Instagram: shortcode=${shortcode}, mediaId=${mediaId}`);

    // ── Yöntem 1: Instagram API v1 (en güvenilir) ──
    try {
        const apiUrl = `https://i.instagram.com/api/v1/media/${mediaId}/info/`;
        const res = await fetch(apiUrl, {
            headers: INSTAGRAM_HEADERS,
            signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
            const data = await res.json();
            const item = data.items?.[0];
            if (item) {
                const videoVersions = item.video_versions || [];
                const videoUrl = videoVersions[0]?.url || item.video_url;
                if (videoUrl) {
                    return {
                        platform: 'Instagram',
                        title: item.caption?.text?.substring(0, 200) || `Instagram Reel - ${shortcode}`,
                        thumbnail: item.image_versions2?.candidates?.[0]?.url || '',
                        videoUrl,
                        duration: item.video_duration || 0,
                        uploader: item.user?.username || ''
                    };
                }
            }
        }
        console.log('  API v1: Yanıt alınamadı veya video yok');
    } catch (e) {
        console.log(`  API v1 hatası: ${e.message}`);
    }

    // ── Yöntem 2: GraphQL query ──
    try {
        const variables = JSON.stringify({
            shortcode: shortcode,
            child_comment_count: 0,
            fetch_comment_count: 0,
            parent_comment_count: 0,
            has_threaded_comments: false
        });
        const docId = '8845758582119845'; // PolarisPostActionLoadPostQueryQuery
        const graphqlUrl = `https://www.instagram.com/graphql/query/?doc_id=${docId}&variables=${encodeURIComponent(variables)}`;

        const res = await fetch(graphqlUrl, {
            headers: INSTAGRAM_HEADERS,
            signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
            const data = await res.json();
            const media = data?.data?.xdt_shortcode_media || data?.data?.shortcode_media;
            if (media && media.is_video && media.video_url) {
                return {
                    platform: 'Instagram',
                    title: media.edge_media_to_caption?.edges?.[0]?.node?.text?.substring(0, 200) || `Instagram Reel - ${shortcode}`,
                    thumbnail: media.display_url || '',
                    videoUrl: media.video_url,
                    duration: Math.round(media.video_duration || 0),
                    uploader: media.owner?.username || ''
                };
            }
        }
        console.log('  GraphQL: Yanıt alınamadı veya video yok');
    } catch (e) {
        console.log(`  GraphQL hatası: ${e.message}`);
    }

    // ── Yöntem 3: Embed sayfası ──
    try {
        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
        const res = await smartFetch(embedUrl);
        const html = await res.text();

        let videoUrl = null;
        let title = '';
        let thumbnail = '';

        // video_url JSON field
        const videoUrlMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
        if (videoUrlMatch) {
            videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        }

        // Alternatif: videoSrc attribute
        if (!videoUrl) {
            const srcMatch = html.match(/class="[^"]*EmbeddedMedia[^"]*Video[^"]*"[^>]*>\s*<source\s+src="([^"]+)"/s);
            if (srcMatch) videoUrl = srcMatch[1].replace(/&amp;/g, '&');
        }

        // video tag src
        if (!videoUrl) {
            const videoTagMatch = html.match(/<video[^>]+src="([^"]+)"/);
            if (videoTagMatch) videoUrl = videoTagMatch[1].replace(/&amp;/g, '&');
        }

        // Caption
        const captionMatch = html.match(/<div class="Caption[^"]*"[^>]*>.*?<div[^>]*>(.*?)<\/div>/s);
        if (captionMatch) title = captionMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 200);

        // Thumbnail
        const imgMatch = html.match(/<img[^>]+class="[^"]*EmbeddedMedia[iI]mage[^"]*"[^>]+src="([^"]+)"/);
        if (imgMatch) thumbnail = imgMatch[1].replace(/&amp;/g, '&');

        if (videoUrl) {
            return {
                platform: 'Instagram',
                title: title || `Instagram Reel - ${shortcode}`,
                thumbnail,
                videoUrl,
                duration: 0,
                uploader: ''
            };
        }
        console.log('  Embed: Video URL bulunamadı');
    } catch (e) {
        console.log(`  Embed hatası: ${e.message}`);
    }

    // ── Yöntem 4: Sayfa HTML + og:video ──
    try {
        const pageUrl = `https://www.instagram.com/p/${shortcode}/`;
        const res = await smartFetch(pageUrl, {
            headers: {
                ...DEFAULT_HEADERS,
                'Cookie': 'ig_did=; csrftoken=; mid=;',
            }
        });
        const html = await res.text();

        // og:video
        const ogVideoMatch = html.match(/property="og:video(?::secure_url)?"\s+content="([^"]+)"/);
        if (ogVideoMatch) {
            const videoUrl = ogVideoMatch[1].replace(/&amp;/g, '&');
            const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/);
            const ogImgMatch = html.match(/property="og:image"\s+content="([^"]+)"/);

            return {
                platform: 'Instagram',
                title: ogTitleMatch?.[1] || `Instagram Reel - ${shortcode}`,
                thumbnail: ogImgMatch?.[1] || '',
                videoUrl,
                duration: 0,
                uploader: ''
            };
        }

        // JSON-LD video
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">(\{.*?\})<\/script>/s);
        if (jsonLdMatch) {
            try {
                const ld = JSON.parse(jsonLdMatch[1]);
                if (ld.contentUrl || ld.video?.contentUrl) {
                    return {
                        platform: 'Instagram',
                        title: ld.name || ld.caption || `Instagram Reel - ${shortcode}`,
                        thumbnail: ld.thumbnailUrl || '',
                        videoUrl: ld.contentUrl || ld.video.contentUrl,
                        duration: 0,
                        uploader: ld.author?.name || ''
                    };
                }
            } catch { }
        }

        console.log('  Page HTML: Video URL bulunamadı');
    } catch (e) {
        console.log(`  Page hatası: ${e.message}`);
    }

    // ── Yöntem 5: Üçüncü parti API (son çare) ──
    try {
        // saveig tarzı API
        const thirdPartyUrl = `https://api.saveig.app/api/v1/info?url=${encodeURIComponent(url)}`;
        const res = await fetch(thirdPartyUrl, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.data?.[0]?.url || data.url) {
                return {
                    platform: 'Instagram',
                    title: data.title || `Instagram Reel - ${shortcode}`,
                    thumbnail: data.thumbnail || data.data?.[0]?.thumbnail || '',
                    videoUrl: data.data?.[0]?.url || data.url,
                    duration: 0,
                    uploader: ''
                };
            }
        }
    } catch (e) {
        console.log(`  3rd party API hatası: ${e.message}`);
    }

    throw new Error('Instagram videosu bulunamadı. Lütfen bağlantının doğru olduğundan ve videonun herkese açık olduğundan emin olun.');
}

// ==========================================================
// YOUTUBE EXTRACTOR
// ==========================================================
async function extractYouTube(url) {
    throw new Error('YouTube desteği bu sürümde kaldırılmıştır.');
}

// ==========================================================
// TIKTOK EXTRACTOR
// ==========================================================
async function extractTikTok(url) {
    let resolvedUrl = url;

    // Kısa URL'leri çöz
    if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
        try {
            const res = await fetch(url, {
                headers: DEFAULT_HEADERS,
                redirect: 'follow',
                signal: AbortSignal.timeout(10000)
            });
            resolvedUrl = res.url || url;
        } catch { }
    }

    console.log(`  TikTok çözülmüş URL: ${resolvedUrl}`);

    // ── Yöntem 1: TikWM API ──
    try {
        const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(resolvedUrl)}`;
        const res = await fetch(tikwmUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000) 
        });
        if (res.ok) {
            const data = await res.json();
            if (data.code === 0 && data.data) {
                const videoData = data.data;
                console.log('  TikWM: Başarılı');
                return {
                    platform: 'TikTok',
                    title: videoData.title || `TikTok - ${videoData.id}`,
                    thumbnail: videoData.cover || '',
                    videoUrl: videoData.play || videoData.wmplay || videoData.hdplay,
                    duration: videoData.duration || 0,
                    uploader: videoData.author?.nickname || videoData.author?.unique_id || ''
                };
            } else {
                console.log(`  TikWM: API Hatası - ${data.msg || 'Bilinmeyen'}`);
            }
        }
    } catch (e) {
        console.log(`  TikWM hatası: ${e.message}`);
    }

    // ── Yöntem 2: TikMate API (Alternatif) ──
    try {
        const res = await fetch('https://api.tikmate.app/api/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `url=${encodeURIComponent(resolvedUrl)}`,
            signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.token) {
                console.log('  TikMate: Başarılı');
                return {
                    platform: 'TikTok',
                    title: data.author_name ? `${data.author_name} - TikTok` : 'TikTok Video',
                    thumbnail: `https://tikmate.app/thumbnail/${data.id}.jpg`,
                    videoUrl: `https://tikmate.app/download/${data.token}/${data.id}.mp4`,
                    duration: 0,
                    uploader: data.author_name || ''
                };
            }
        }
    } catch (e) {
        console.log(`  TikMate hatası: ${e.message}`);
    }

    // ── Yöntem 3: oEmbed + Sayfa HTML (Manuel) ──
    try {
        let title = '', thumbnail = '', uploader = '';
        try {
            const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolvedUrl)}`;
            const oRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
            if (oRes.ok) {
                const oembed = await oRes.json();
                title = oembed.title || '';
                thumbnail = oembed.thumbnail_url || '';
                uploader = oembed.author_name || '';
            }
        } catch { }

        const res = await smartFetch(resolvedUrl, { timeout: 20000 });
        const html = await res.text();
        let videoUrl = null;

        // SIGI_STATE
        const sigiMatch = html.match(/<script\s+id="SIGI_STATE"[^>]*>(.+?)<\/script>/s);
        if (sigiMatch) {
            try {
                const data = JSON.parse(sigiMatch[1]);
                const item = Object.values(data?.ItemModule || {})[0];
                if (item) {
                    videoUrl = item.video?.downloadAddr || item.video?.playAddr;
                }
            } catch { }
        }

        // og:video
        if (!videoUrl) {
            const ogMatch = html.match(/property="og:video(?::secure_url)?"\s+content="([^"]+)"/);
            if (ogMatch) videoUrl = ogMatch[1].replace(/&amp;/g, '&');
        }

        if (videoUrl) {
            console.log('  Manuel Extraction: Başarılı');
            return {
                platform: 'TikTok',
                title: title || 'TikTok Video',
                thumbnail,
                videoUrl,
                duration: 0,
                uploader
            };
        }
    } catch (e) {
        console.log(`  TikTok manuel hata: ${e.message}`);
    }

    throw new Error('TikTok videosu bulunamadı. Lütfen bağlantıyı kontrol edin.');
}

// ==========================================================
// TWITTER/X EXTRACTOR
// ==========================================================
async function extractTwitter(url) {
    throw new Error('X (Twitter) desteği bu sürümde kaldırılmıştır.');
}

// ==========================================================
// ANA EXTRACTOR
// ==========================================================
async function extractVideo(url) {
    const platform = detectPlatform(url);
    console.log(`\n▶ Video çıkarma: ${platform} - ${url}`);

    switch (platform) {
        case 'instagram': return await extractInstagram(url);
        case 'tiktok': return await extractTikTok(url);
        default: throw new Error('Desteklenmeyen platform. Instagram veya TikTok bağlantısı girin.');
    }
}

// ==========================================================
// AKTİF İNDİRMELER
// ==========================================================
const activeDownloads = new Map();

// ==========================================================
// API: Video Bilgisi
// ==========================================================
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'Lütfen bir bağlantı girin.' });
    }

    try {
        const info = await extractVideo(url.trim());
        res.json({
            title: info.title,
            duration: info.duration || 0,
            thumbnail: info.thumbnail || null,
            uploader: info.uploader || 'Bilinmeyen',
            extractor: info.platform,
        });
    } catch (e) {
        console.error('Info hatası:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================================
// API: İndirmeyi Başlat
// ==========================================================
app.post('/api/download', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ error: 'Lütfen bir bağlantı girin.' });
    }

    const downloadId = uuidv4();
    const downloadState = {
        id: downloadId,
        status: 'downloading',
        progress: 0,
        speed: '—',
        eta: '—',
        filename: null,
        error: null
    };

    activeDownloads.set(downloadId, downloadState);
    res.json({ id: downloadId, status: 'downloading' });

    // Arka planda indir
    (async () => {
        try {
            downloadState.progress = 5;
            const info = await extractVideo(url.trim());
            downloadState.progress = 20;

            const safeTitle = (info.title || 'video')
                .replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_')
                .substring(0, 100).trim();
            const filename = `${downloadId}_${safeTitle}.mp4`;
            const filePath = path.join(DOWNLOADS_DIR, filename);

            if (info.isYouTube && info.ytInfo && ytdl) {
                // YouTube: ytdl stream
                downloadState.progress = 30;
                const format = info.format;
                const totalBytes = parseInt(format?.contentLength) || 0;
                let downloadedBytes = 0;
                const startTime = Date.now();

                const stream = ytdl.downloadFromInfo(info.ytInfo, { format });
                const writeStream = fs.createWriteStream(filePath);

                stream.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0) {
                        downloadState.progress = 30 + Math.round((downloadedBytes / totalBytes) * 65);
                    } else {
                        downloadState.progress = Math.min(90, downloadState.progress + 0.5);
                    }
                    updateSpeed(downloadState, downloadedBytes, totalBytes, startTime);
                });

                await new Promise((resolve, reject) => {
                    stream.pipe(writeStream);
                    stream.on('end', () => {
                        writeStream.close();
                        resolve();
                    });
                    stream.on('error', reject);
                    writeStream.on('error', reject);
                    // Zaman aşımı kaldırıldı (Limitsiz)
                });
            } else {
                // Diğer platformlar: Native HTTPS Downloader (403 ve Redirect çözümü için)
                downloadState.progress = 30;
                console.log(`  İndirme başlatılıyor (HTTPS): ${info.videoUrl.substring(0, 60)}...`);

                const downloadStream = (urlToDownload, referer) => {
                    return new Promise((resolve, reject) => {
                        const options = {
                            headers: {
                                ...DEFAULT_HEADERS,
                                'Referer': referer || 'https://www.tiktok.com/',
                            },
                        };

                        const request = https.get(urlToDownload, options, (response) => {
                            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                                console.log(`  Yönlendiriliyor: ${response.headers.location.substring(0, 50)}...`);
                                resolve(downloadStream(response.headers.location, referer));
                                return;
                            }

                            if (response.statusCode !== 200) {
                                reject(new Error(`HTTP ${response.statusCode}`));
                                return;
                            }

                            resolve(response);
                        });

                        request.on('error', reject);
                        // Zaman aşımı kaldırıldı (Limitsiz)
                    });
                };

                let videoStream;
                let usedProxyName = 'Doğrudan';

                // PROXY ROTASYONU
                const proxyList = [
                    { name: 'Doğrudan', url: (u) => u, ref: url },
                    { name: 'CorsProxy', url: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`, ref: 'https://corsproxy.io/' },
                    { name: 'AllOrigins', url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, ref: 'https://api.allorigins.win/' },
                    { name: 'ThingProxy', url: (u) => `https://thingproxy.freeboard.io/fetch/${u}`, ref: 'https://thingproxy.freeboard.io/' },
                    { name: 'CloudTunnel', url: (u) => `https://proxy.scrape-it.cloud/?url=${encodeURIComponent(u)}`, ref: 'https://scrape-it.cloud/' }
                ];

                for (const proxy of proxyList) {
                    try {
                        console.log(`  [İndirme] ${proxy.name} deneniyor...`);
                        usedProxyName = proxy.name;
                        videoStream = await downloadStream(proxy.url(info.videoUrl), proxy.ref);
                        if (videoStream) break; 
                    } catch (e) {
                        console.log(`  [İndirme] ${proxy.name} başarısız.`);
                    }
                }

                if (!videoStream) throw new Error('Maalesef tüm proxy yolları denendi ancak video akışı başlatılamadı.');

                const contentLength = parseInt(videoStream.headers['content-length']) || 0;
                let downloadedBytes = 0;
                const startTime = Date.now();
                const writeStream = fs.createWriteStream(filePath);

                videoStream.on('data', (chunk) => {
                    if (downloadState.status === 'cancelled') {
                        videoStream.destroy();
                        writeStream.close();
                        try { fs.unlinkSync(filePath); } catch { }
                        return;
                    }
                    writeStream.write(chunk);
                    downloadedBytes += chunk.length;

                    if (contentLength > 0) {
                        downloadState.progress = 30 + Math.round((downloadedBytes / contentLength) * 65);
                    } else {
                        downloadState.progress = Math.min(98, 30 + Math.round(downloadedBytes / 100000));
                    }
                    updateSpeed(downloadState, downloadedBytes, contentLength, startTime);
                });

                await new Promise((resolve, reject) => {
                    videoStream.on('end', () => {
                        writeStream.end();
                        resolve();
                    });
                    videoStream.on('error', reject);
                    writeStream.on('error', reject);
                });
            }

            downloadState.progress = 100;
            downloadState.status = 'completed';
            downloadState.filename = filePath;
            downloadState.speed = '—';
            downloadState.eta = '—';
            console.log(`✓ İndirme tamamlandı: ${filename}`);

        } catch (e) {
            console.error('İndirme hatası:', e.message);
            if (downloadState.status !== 'cancelled') {
                downloadState.status = 'error';
                downloadState.error = e.message || 'İndirme başarısız.';
            }
        }
    })();
});

// ==========================================================
// API: Durum / Dosya / İptal
// ==========================================================
app.get('/api/status/:id', (req, res) => {
    const dl = activeDownloads.get(req.params.id);
    if (!dl) return res.status(404).json({ error: 'İndirme bulunamadı.' });
    res.json({
        id: dl.id, status: dl.status, progress: dl.progress,
        speed: dl.speed, eta: dl.eta, error: dl.error,
        hasFile: !!dl.filename && dl.status === 'completed'
    });
});

app.get('/api/file/:id', (req, res) => {
    const dl = activeDownloads.get(req.params.id);
    if (!dl || dl.status !== 'completed' || !dl.filename) {
        return res.status(404).json({ error: 'Dosya bulunamadı.' });
    }
    if (!fs.existsSync(dl.filename)) {
        return res.status(404).json({ error: 'Dosya bulunamadı.' });
    }
    const cleanName = path.basename(dl.filename).replace(`${dl.id}_`, '');
    res.download(dl.filename, cleanName);
});

app.post('/api/cancel/:id', (req, res) => {
    const dl = activeDownloads.get(req.params.id);
    if (!dl) return res.status(404).json({ error: 'İndirme bulunamadı.' });
    dl.status = 'cancelled';
    try {
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(dl.id));
        for (const f of files) fs.unlinkSync(path.join(DOWNLOADS_DIR, f));
    } catch { }
    res.json({ status: 'cancelled' });
});

app.get('/api/proxy-status', (req, res) => {
    res.json({ active: true, proxy: 'corsproxy.io + doğrudan' });
});

// ==========================================================
// API: Resim Proxy (Hotlinking korumasını aşmak için)
// ==========================================================
app.get('/api/proxy-image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('URL gerekli');

    console.log(`  Resim Proxy: ${imageUrl.substring(0, 60)}...`);

    try {
        const imageRes = await fetch(imageUrl, {
            headers: {
                ...DEFAULT_HEADERS,
                'Referer': 'https://www.instagram.com/',
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!imageRes.ok) throw new Error('Resim alınamadı');

        const contentType = imageRes.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        const arrayBuffer = await imageRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (e) {
        console.error('  Resim Proxy hatası:', e.message);
        res.status(500).send('Resim yüklenemedi');
    }
});

// ==========================================================
// YARDIMCI FONKSİYONLAR
// ==========================================================
function updateSpeed(state, downloaded, total, startTime) {
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > 0.5) {
        const speed = downloaded / elapsed;
        state.speed = formatBytes(speed) + '/s';
        if (total > 0 && speed > 0) {
            state.eta = formatTime((total - downloaded) / speed);
        }
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(sec) {
    if (!sec || sec < 0 || !isFinite(sec)) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
}

// Otomatik temizlik (1 saat)
setInterval(() => {
    try {
        const files = fs.readdirSync(DOWNLOADS_DIR);
        for (const f of files) {
            const fp = path.join(DOWNLOADS_DIR, f);
            if (Date.now() - fs.statSync(fp).mtimeMs > 3600000) fs.unlinkSync(fp);
        }
    } catch { }
}, 1800000);

// SPA Fallback
if (!process.env.VERCEL) {
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}

// Başlat
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n  ╔══════════════════════════════════════════════╗`);
        console.log(`  ║   NYC Reels İndirici Web v1.0                ║`);
        console.log(`  ║   http://localhost:${PORT}                      ║`);
        console.log(`  ║   Proxy: corsproxy.io ✓                      ║`);
        console.log(`  ║   Python: Gerekmiyor ✓                       ║`);
        console.log(`  ╚══════════════════════════════════════════════╝\n`);
    });
}
module.exports = app;
