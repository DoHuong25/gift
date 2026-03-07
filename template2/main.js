// ---- HÀM NÉN VÀ GIẢI NÉN DỮ LIỆU ----

/**
 * Mã hóa object thành compressed Base64URL string
 * @param {Object} data - Dữ liệu cần mã hóa
 * @returns {string} - Chuỗi Base64URL đã nén
 */
function encodeData(data) {
  try {
    // 1. Chuyển object thành JSON string
    const jsonString = JSON.stringify(data);

    // 2. Nén dữ liệu bằng pako (deflate)
    const compressed = pako.deflate(jsonString);

    // 3. Chuyển Uint8Array thành binary string
    let binaryString = '';
    for (let i = 0; i < compressed.length; i++) {
      binaryString += String.fromCharCode(compressed[i]);
    }

    // 4. Encode thành Base64
    const base64 = btoa(binaryString);

    // 5. Chuyển thành Base64URL (URL-safe)
    const base64url = base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, ''); // Loại bỏ padding

    return base64url;
  } catch (e) {
    console.error("Lỗi khi mã hóa dữ liệu:", e);
    return null;
  }
}

/**
 * Giải mã Base64URL string thành object
 * @param {string} encodedString - Chuỗi Base64URL đã nén
 * @returns {Object|null} - Object đã giải nén hoặc null nếu lỗi
 */
function decodeData(encodedString) {
  try {
    // 1. Chuyển Base64URL về Base64 thông thường
    let base64 = encodedString
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // 2. Thêm padding nếu cần
    while (base64.length % 4) {
      base64 += '=';
    }

    // 3. Decode Base64 thành binary string
    const binaryString = atob(base64);

    // 4. Chuyển binary string thành Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 5. Giải nén bằng pako (inflate)
    const decompressed = pako.inflate(bytes, { to: 'string' });

    // 6. Parse JSON
    const data = JSON.parse(decompressed);

    return data;
  } catch (e) {
    console.error("Lỗi khi giải mã dữ liệu:", e);
    return null;
  }
}

// ---- API SETTINGS (từ ?id=) ----
let apiSettings = null;

// Danh sách ảnh bay (từ API hoặc fallback local)
let flyingImageUrls = [];

async function fetchSettings(configId) {
  try {
    const doc = await _fbDb.collection('gifts').doc(configId).get();
    if (!doc.exists) throw new Error('Gift not found');
    const data = doc.data();
    
    // Fetch images from subcollection
    let images = [];
    try {
      const imgDoc = await _fbDb.collection('gifts').doc(configId).collection('images').doc('tpl2').get();
      if (imgDoc.exists) {
         images = imgDoc.data().imgs || [];
      }
    } catch(e) {}
    
    // Convert to lovegift format
    return {
      title: data.letterCaption || 'Chúc mừng Ngày Quốc tế Phụ nữ 🌷',
      messages: data.morphTexts || ['happy', "women's day", 'em iu'],
      instructionText: data.tpl2Instruction || 'Chạm vào hoa để xem lời nhắn',
      modalTitle: data.passcodeTitle || 'Chúc Mừng Ngày 8/3 ❤️',
      modalContent: data.letterText || 'Gửi đến em những lời chúc tốt đẹp nhất!',
      image: images.length > 0 ? images : null,
      music: data.bgMusic || null,
      introTitle: data.tpl2IntroTitle || 'Cốc cốc, bó hoa đến rồi',
      introHint: data.tpl2IntroHint || 'Chạm vào ảnh, có điều bất ngờ'
    };
  } catch (e) {
    console.error('Failed to fetch settings from Firebase:', e);
    return null;
  }
}

// ---- INDEXEDDB FOR PREVIEW ----
async function loadPreviewData() {
  return new Promise(resolve => {
    try {
      const r = indexedDB.open('WomensDayPreviewDB', 1);
      r.onsuccess = e => {
        const db = e.target.result;
        try {
          const tx = db.transaction('preview', 'readonly');
          const req = tx.objectStore('preview').get('config');
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch(e) { resolve(null); }
      };
      r.onerror = () => resolve(null);
    } catch(e) { resolve(null); }
  });
}

// ---- HÀM LẤY THAM SỐ TỪ URL ----
function getUrlParameter(name) {
  // Ưu tiên 1: API settings (từ ?id=)
  if (apiSettings) {
    const keyMap = {
      title: 'title',
      subtitle: 'subtitle',
      instructionText: 'instructionText',
      modalTitle: 'modalTitle',
      modalContent: 'modalContent',
      image: 'image',
      music: 'music',
      messages: ['listText', 'arrayText', 'messages']
    };

    const keys = keyMap[name];
    if (Array.isArray(keys)) {
      for (const key of keys) {
        if (apiSettings[key]) return apiSettings[key];
      }
    } else if (keys && apiSettings[keys]) {
      return apiSettings[keys];
    }
  }

  const urlParams = new URLSearchParams(window.location.search);

  // Ưu tiên 2: ?b= format (base64 JSON)
  const bParam = urlParams.get("b");
  if (bParam) {
    try {
      const base64 = bParam.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = decodeURIComponent(escape(atob(base64)));
      const data = JSON.parse(decoded);
      if (name === "messages" && data.t) return Array.isArray(data.t) ? data.t : data.t.split(',').map(s => s.trim());
      if (name === "music" && data.m) return data.m;
    } catch (e) {
      console.error('Error decoding ?b= parameter:', e);
    }
  }

  // Ưu tiên 3: ?c= format (pako compressed)
  const compressedContent = urlParams.get("c");
  if (compressedContent) {
    const content = decodeData(compressedContent);
    if (content) {
      if (name === "title" && content.title) return content.title;
      if (name === "subtitle" && content.subtitle) return content.subtitle;
      if (name === "instructionText" && content.instructionText) return content.instructionText;
      if (name === "modalTitle" && content.modalTitle) return content.modalTitle;
      if (name === "modalContent" && content.modalContent) return content.modalContent;
      if (name === "image" && content.image) return content.image;
      if (name === "music" && content.music) return content.music;
      if (name === "messages" && content.messages) return content.messages;
    }
  }

  // Ưu tiên 4: Direct URL params
  const regularParam = urlParams.get(name);
  if (regularParam) {
    return regularParam;
  }

  return null;
}

// ---- INTRO SCREEN ----
let mainStarted = false;

async function enterMain() {
    if (mainStarted) return;
    mainStarted = true;

    // Nếu có ?id= và API chưa load xong, đợi
    const urlParams = new URLSearchParams(window.location.search);
    const configId = urlParams.get('id');
    if (configId && !apiSettings) {
        console.log('🔄 Waiting for API settings...');
        apiSettings = await fetchSettings(configId);
    }

    const intro = document.getElementById('introScreen');
    const mainContent = document.getElementById('mainContent');

    // Fade out intro
    intro.classList.add('fade-out');

    // Show main content
    mainContent.classList.remove('hidden');

    // Remove intro from DOM after transition
    setTimeout(() => {
        intro.remove();
    }, 900);

    // Start main initialization
    startMainApp();
}

function startMainApp() {
    document.body.classList.remove("container");

    // Initialize content from URL params
    initializeContent();

    // Create starry night background
    createStarryNight();

    // Create falling petals
    createFallingPetals();

    // Setup music button immediately
    const musicButton = getMusicToggle();
    if (musicButton) {
        musicButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleMusic();
        });
    }

    // Setup flower click/touch handlers immediately
    setupFlowerClickHandlers();

    // Add sparkle effect when card appears
    setTimeout(() => {
        createSparkles();
    }, 6000);

    // Show instruction after flowers animation (only if images haven't started flying)
    setTimeout(() => {
        if (flyingImagesShown) return;
        const instruction = document.querySelector('.instruction');
        if (instruction) {
            instruction.style.opacity = '0';
            instruction.style.display = 'block';
            setTimeout(() => {
                instruction.style.transition = 'opacity 1s ease-in';
                instruction.style.opacity = '1';
            }, 100);
        }
    }, 5000);

    // Play music after user interaction (intro click counts)
    setTimeout(() => {
        playMusic();
    }, 300);
}

onload = async () => {
    // Nếu có ?id= thì gọi API lấy settings trước
    const urlParams = new URLSearchParams(window.location.search);
    const configId = urlParams.get('id');
    const isPreview = urlParams.get('preview');

    if (isPreview) {
        console.log('🔄 Loading preview settings from IDB...');
        const previewData = await loadPreviewData();
        if (previewData) {
            apiSettings = {
                title: previewData.letterCaption || 'Chúc mừng Ngày Quốc tế Phụ nữ 🌷',
                messages: previewData.morphTexts || ['happy', "women's day", 'em iu'],
                instructionText: previewData.tpl2Instruction || 'Chạm vào hoa để xem lời nhắn',
                modalTitle: previewData.passcodeTitle || 'Chúc Mừng Ngày 8/3 ❤️',
                modalContent: previewData.letterText || 'Gửi đến em những lời chúc tốt đẹp nhất!',
                image: previewData.tpl2Images && previewData.tpl2Images.length > 0 ? previewData.tpl2Images : null,
                music: previewData.bgMusic || null,
                introTitle: previewData.tpl2IntroTitle || 'Cốc cốc, bó hoa đến rồi',
                introHint: previewData.tpl2IntroHint || 'Chạm vào ảnh, có điều bất ngờ'
            };
        }
    } else if (configId) {
        console.log('🔄 Fetching settings from API for id:', configId);
        apiSettings = await fetchSettings(configId);
        console.log('✅ API settings loaded:', apiSettings);
    }

    // Pre-initialize content
    initializeContent();
};

// Create starry night background
function createStarryNight() {
    const night = document.querySelector('.night');
    if (!night) {
        console.error('Night element not found');
        return;
    }

    // Reduce stars on mobile for better performance
    const isMobile = window.innerWidth <= 600;
    const starCount = isMobile ? 80 : 200;
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';

        // Random size
        const size = Math.random();
        if (size < 0.5) {
            star.classList.add('small');
        } else if (size < 0.8) {
            star.classList.add('medium');
        } else {
            star.classList.add('large');
        }

        // Random position
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';

        // Random animation duration and delay
        star.style.animationDuration = (2 + Math.random() * 3) + 's';
        star.style.animationDelay = Math.random() * 3 + 's';

        night.appendChild(star);
    }

}

// Create falling petals effect
function createFallingPetals() {
    const petals = ['\u{1F337}', '\u{1F338}', '\u{1F33A}', '\u{1F490}'];
    const isMobile = window.innerWidth <= 600;
    const count = isMobile ? 8 : 15;
    const night = document.querySelector('.night');
    if (!night) return;

    for (let i = 0; i < count; i++) {
        const petal = document.createElement('div');
        petal.className = 'petal';
        petal.textContent = petals[Math.floor(Math.random() * petals.length)];
        petal.style.left = Math.random() * 100 + '%';
        petal.style.fontSize = (14 + Math.random() * 16) + 'px';
        petal.style.animationDuration = (6 + Math.random() * 8) + 's';
        petal.style.animationDelay = Math.random() * 10 + 's';
        night.appendChild(petal);
    }
}

// Typing messages loop (like Heart_Valentine)
let headerTypingActive = false;
function startTypingMessages(element, messages) {
    if (headerTypingActive) return;
    headerTypingActive = true;

    let msgIndex = 0;
    let charIndex = 0;
    const typingSpeed = 80;
    const waitTime = 2500;
    let isWaiting = false;
    let waitStart = 0;

    function animate() {
        const now = Date.now();
        const msg = messages[msgIndex];

        if (!isWaiting) {
            if (!animate.lastType || now - animate.lastType > typingSpeed) {
                charIndex++;
                const cursor = Math.floor(now / 500) % 2 === 0 ? '|' : '';
                element.textContent = msg.substring(0, charIndex) + cursor;
                animate.lastType = now;

                if (charIndex > msg.length) {
                    isWaiting = true;
                    waitStart = now;
                }
            }
        } else {
            const cursor = Math.floor(now / 500) % 2 === 0 ? '|' : '';
            element.textContent = msg + cursor;

            if (now - waitStart > waitTime) {
                isWaiting = false;
                charIndex = 0;
                msgIndex = (msgIndex + 1) % messages.length;
                element.textContent = '';
            }
        }

        requestAnimationFrame(animate);
    }

    animate();
}

// Initialize content from URL parameters
function initializeContent() {
    console.log('🎨 Initializing content from URL params...');

    // Default values
    const defaults = {
        title: 'Chúc mừng Ngày Quốc tế Phụ nữ \u{1F337}',
        messages: [
            '\u{1F337} 8/3 hạnh phúc nhé, người anh yêu!',
            'Gửi tặng em bó hoa thật đẹp! 💕✨'
        ],
        instructionText: 'Chạm vào hoa để xem lời nhắn',
        modalTitle: 'Chúc Mừng Ngày 8/3 ❤️',
        modalContent: 'Gửi đến người phụ nữ tuyệt vời...\n\nChúc em luôn xinh đẹp, hạnh phúc và tràn đầy niềm vui. Em xứng đáng được yêu thương mỗi ngày, không chỉ riêng ngày hôm nay.\n\nCảm ơn em vì tất cả những điều tuyệt vời em mang đến cho cuộc sống này 💕',
        music: 'https://cdn.shopify.com/s/files/1/0757/9700/4572/files/tiktok-music-1772120806305-u34o6f.mp3?v=1772120809'
    };

    // Get messages: API arrayText > URL params > defaults
    const urlMessages = getUrlParameter('messages');
    let messages = defaults.messages;
    if (urlMessages) {
        messages = Array.isArray(urlMessages) ? urlMessages : urlMessages.split(',').map(m => m.trim());
    }
    // Filter empty strings
    messages = messages.filter(m => m && m.trim() !== '');

    // Update header - title (static) + messages (typing)
    const teachersDayTitle = document.querySelector('.teachers-day-title');
    const teachersDayDate = document.querySelector('.teachers-day-date');

    const title = getUrlParameter('title') || defaults.title;

    if (teachersDayTitle) {
        teachersDayTitle.textContent = title;
    }

    if (teachersDayDate) {
        teachersDayDate.style.display = 'block';
        startTypingMessages(teachersDayDate, messages);
    }

    // Update instruction text
    const instructionTextElement = document.querySelector('.instruction-text');
    const instructionText = getUrlParameter('instructionText') || defaults.instructionText;

    if (instructionTextElement) {
        instructionTextElement.innerHTML = instructionText + ' <span class="instruction-icon">👆</span>';
    }

    // Update intro texts
    const introTitleElem = document.querySelector('.intro-title');
    const introHintElem = document.querySelector('.intro-hint');
    const introTitle = (apiSettings && apiSettings.introTitle) ? apiSettings.introTitle : 'Cốc cốc, bó hoa đến rồi';
    const introHint = (apiSettings && apiSettings.introHint) ? apiSettings.introHint : 'Chạm vào ảnh, có điều bất ngờ';
    
    if (introTitleElem) introTitleElem.textContent = introTitle;
    if (introHintElem) introHintElem.textContent = introHint;

    // Update modal content
    const modalTitleElement = document.querySelector('.popup-title');
    const modalMessageElement = document.querySelector('.popup-message');

    const modalTitle = getUrlParameter('modalTitle') || defaults.modalTitle;
    const modalContent = getUrlParameter('modalContent') || defaults.modalContent;

    if (modalTitleElement) {
        modalTitleElement.innerHTML = modalTitle;
    }

    if (modalMessageElement) {
        // Convert \n to <br> for line breaks
        modalMessageElement.innerHTML = modalContent.replace(/\n/g, '<br>');
    }

    // Update image if provided (API trả về array)
    let imageParam = getUrlParameter('image');
    // Lưu tất cả ảnh từ API cho flying images
    if (Array.isArray(imageParam) && imageParam.length > 0) {
        flyingImageUrls = imageParam.filter(url => url && url.trim() !== '');
    } else if (imageParam && typeof imageParam === 'string') {
        flyingImageUrls = [imageParam];
    }

    const popupImageContainer = document.querySelector('.popup-card-image');
    const popupImage = document.querySelector('.popup-card-image img');
    const hasApiId = new URLSearchParams(window.location.search).get('id');

    if (flyingImageUrls.length > 0) {
        // API có ảnh → popup hiện ảnh đầu tiên
        if (popupImage) popupImage.src = flyingImageUrls[0];
        if (popupImageContainer) popupImageContainer.style.display = 'block';
    } else if (hasApiId) {
        // Có ?id= nhưng API không trả ảnh → ẩn ảnh popup
        if (popupImageContainer) popupImageContainer.style.display = 'none';
    } else {
        // Không có ?id= → giữ ảnh mặc định (girl.jpeg từ HTML)
        if (popupImageContainer) popupImageContainer.style.display = 'block';
    }

    // Update music source
    const musicUrl = getUrlParameter('music') || defaults.music;
    const bgMusicElement = document.getElementById('bgMusic');

    console.log('🎵 Initializing music...');
    console.log('Music URL:', musicUrl);
    console.log('bgMusic element:', bgMusicElement);

    if (bgMusicElement && musicUrl) {
        bgMusicElement.src = musicUrl;
        bgMusicElement.volume = 0.5;
        bgMusicElement.loop = true;
        console.log('✅ Music source set to:', musicUrl);
        bgMusicElement.load();
        bgMusicElement.preload = 'auto';

        console.log('Music element after setup:', {
            src: bgMusicElement.src,
            volume: bgMusicElement.volume,
            loop: bgMusicElement.loop,
            preload: bgMusicElement.preload
        });
    } else {
        console.error('❌ bgMusic element not found!');
    }

    console.log('✅ Content initialization complete');
}

// Music control
let isPlaying = false;
let musicInitialized = false;
let userInteractionListener = null;

function getBgMusic() {
    return document.getElementById('bgMusic');
}

function getMusicToggle() {
    return document.getElementById('musicToggle');
}

function getMusicIcon() {
    return document.getElementById('musicIcon');
}

function playMusic() {
    const bgMusic = getBgMusic();

    if (!bgMusic) {
        console.error('bgMusic element not found in playMusic()');
        return;
    }

    console.log('playMusic() called, readyState:', bgMusic.readyState, 'src:', bgMusic.src);

    // If no src is set, set default
    if (!bgMusic.src) {
        console.log('No music src found, setting default');
        bgMusic.src = '';
        bgMusic.load();
    }

    // Wait for audio to load before playing
    if (bgMusic.readyState >= 2) {
        // Audio is loaded enough to play
        console.log('Audio already loaded, trying to play');
        tryPlayMusic();
    } else {
        // Wait for audio to load
        console.log('Waiting for audio to load...');
        bgMusic.addEventListener('canplay', function() {
            console.log('Audio can play now');
            tryPlayMusic();
        }, { once: true });

        // Add error handler
        bgMusic.addEventListener('error', function(e) {
            console.error('Audio loading error:', e, bgMusic.error);
        }, { once: true });
    }
}

function tryPlayMusic() {
    const bgMusic = getBgMusic();
    const musicToggle = getMusicToggle();
    const musicIcon = getMusicIcon();

    if (!bgMusic || !bgMusic.src) {
        console.error('Music element or source not found');
        return;
    }

    console.log('Attempting to play music:', bgMusic.src);

    // Set volume to reasonable level
    bgMusic.volume = 0.5;

    const playPromise = bgMusic.play();

    if (playPromise !== undefined) {
        playPromise.then(() => {
            console.log('Music playing successfully');
            isPlaying = true;
            musicInitialized = true;
            if (musicToggle) musicToggle.classList.add('playing');
            if (musicIcon) {
                musicIcon.classList.add('playing');
                musicIcon.classList.remove('muted');
            }
        }).catch((error) => {
            // Autoplay was prevented, need user interaction
            console.log('Autoplay prevented, waiting for user interaction:', error);
            isPlaying = false;
            if (musicToggle) musicToggle.classList.remove('playing');
            if (musicIcon) {
                musicIcon.classList.remove('playing');
                musicIcon.classList.add('muted');
            }

            // Remove old listener if exists
            if (userInteractionListener) {
                document.removeEventListener('click', userInteractionListener);
            }

            // Play on first user interaction
            userInteractionListener = function playOnce() {
                console.log('User clicked, trying to play music');
                const bgMusicNow = getBgMusic();
                if (bgMusicNow) {
                    bgMusicNow.play().then(() => {
                        console.log('Music started after user interaction');
                        isPlaying = true;
                        musicInitialized = true;
                        const toggle = getMusicToggle();
                        const icon = getMusicIcon();
                        if (toggle) toggle.classList.add('playing');
                        if (icon) {
                            icon.classList.add('playing');
                            icon.classList.remove('muted');
                        }
                    }).catch(err => {
                        console.error('Failed to play music after user interaction:', err);
                    });
                }
                userInteractionListener = null;
            };

            document.addEventListener('click', userInteractionListener, { once: true });
        });
    }
}

function toggleMusic() {
    const bgMusic = getBgMusic();
    const musicToggle = getMusicToggle();
    const musicIcon = getMusicIcon();

    if (!bgMusic) {
        console.error('Music element not found');
        return;
    }

    console.log('Toggle music - isPlaying:', isPlaying);
    console.log('Audio src:', bgMusic.src);
    console.log('Audio readyState:', bgMusic.readyState);
    console.log('Audio paused:', bgMusic.paused);
    console.log('Audio currentTime:', bgMusic.currentTime);
    console.log('Audio networkState:', bgMusic.networkState);
    console.log('Audio error:', bgMusic.error);

    if (isPlaying) {
        console.log('Pausing music');
        bgMusic.pause();
        isPlaying = false;
        if (musicToggle) musicToggle.classList.remove('playing');
        if (musicIcon) {
            musicIcon.classList.remove('playing');
            musicIcon.classList.add('muted');
        }
    } else {
        console.log('Starting music, attempting play...');

        // If no src, set it now
        if (!bgMusic.src) {
            console.log('No src found, setting default music');
            bgMusic.src = '';
            bgMusic.volume = 0.5;
            bgMusic.loop = true;
            bgMusic.load();

            // Wait for load before playing
            setTimeout(() => {
                console.log('Trying to play after load delay');
                attemptPlay();
            }, 500);
        } else {
            attemptPlay();
        }

        function attemptPlay() {
            console.log('attemptPlay called - readyState:', bgMusic.readyState);

            // Check if audio can play
            if (bgMusic.readyState < 2) {
                console.log('Audio not ready yet, waiting for canplay event...');
                bgMusic.addEventListener('canplay', function onCanPlay() {
                    console.log('canplay event fired, now trying to play');
                    actuallyPlay();
                }, { once: true });
                return;
            }

            actuallyPlay();
        }

        function actuallyPlay() {
            console.log('actuallyPlay called');
            const playPromise = bgMusic.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('✅ Music started successfully!');
                    isPlaying = true;
                    musicInitialized = true;
                    if (musicToggle) musicToggle.classList.add('playing');
                    if (musicIcon) {
                        musicIcon.classList.add('playing');
                        musicIcon.classList.remove('muted');
                    }
                }).catch(err => {
                    console.error('❌ Failed to play music:', err);
                    console.error('Error name:', err.name);
                    console.error('Error message:', err.message);
                    console.error('Error stack:', err.stack);
                    isPlaying = false;
                    if (musicToggle) musicToggle.classList.remove('playing');
                    if (musicIcon) {
                        musicIcon.classList.remove('playing');
                        musicIcon.classList.add('muted');
                    }
                });
            } else {
                console.error('Play promise is undefined');
            }
        }
    }
}

// Create floating hearts effect
function createSparkles() {
    const isMobile = window.innerWidth <= 600;
    const sparkleCount = isMobile ? 8 : 15;
    const container = document.querySelector('.flowers');
    if (!container) return;

    const hearts = ['\u2764\uFE0F', '\u{1F495}', '\u{1F497}', '\u{1F496}'];

    for (let i = 0; i < sparkleCount; i++) {
        setTimeout(() => {
            const heart = document.createElement('div');
            heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
            const drift = -30 + Math.random() * 60;
            const duration = 2 + Math.random() * 2;
            heart.style.cssText = `
                position: absolute;
                font-size: ${12 + Math.random() * 14}px;
                pointer-events: none;
                left: ${30 + Math.random() * 40}%;
                bottom: 40%;
                z-index: 200;
                animation: heart-float ${duration}s ease-out forwards;
                --drift: ${drift}px;
            `;
            container.appendChild(heart);
            setTimeout(() => heart.remove(), 4000);
        }, i * 200);
    }
}

// Modal functions
function openModal() {
    const modal = document.getElementById('wishModal');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('wishModal');
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('wishModal');
    if (event.target === modal) {
        closeModal();
    }
}

// Add sparkle animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes sparkle-burst {
        0% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateX(0) scale(1);
            opacity: 1;
        }
        100% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateX(150px) scale(0);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Store typing timeout to clear it when needed
let typingTimeout = null;
let typingIntervals = [];

// Popup functions for flower click
function openPopup() {
    const popup = document.getElementById('flowerPopup');
    const messageElement = document.querySelector('.popup-message');
    const titleElement = document.querySelector('.popup-title');

    // Hide instruction when user clicks flower
    const instruction = document.querySelector('.instruction');
    if (instruction) {
        instruction.style.display = 'none';
    }

    // Try to play music if not already playing (for user interaction requirement)
    if (!musicInitialized || !isPlaying) {
        const bgMusic = getBgMusic();
        if (bgMusic && bgMusic.src) {
            bgMusic.play().then(() => {
                console.log('Music started from popup open');
                isPlaying = true;
                musicInitialized = true;
                const toggle = getMusicToggle();
                const icon = getMusicIcon();
                if (toggle) toggle.classList.add('playing');
                if (icon) {
                    icon.classList.add('playing');
                    icon.classList.remove('muted');
                }
            }).catch(err => {
                console.log('Could not auto-play music from popup:', err);
            });
        }
    }

    popup.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Create floating hearts when popup opens
    createSparkles();

    // Clear any existing typing timeouts/intervals
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
    typingIntervals.forEach(timeout => clearTimeout(timeout));
    typingIntervals = [];

    // Always reset and trigger typing animation
    if (messageElement) {
        // Store original text if not already stored
        if (!messageElement.getAttribute('data-original-text')) {
            const originalText = messageElement.textContent.trim();
            messageElement.setAttribute('data-original-text', originalText);
        }

        const originalText = messageElement.getAttribute('data-original-text');

        // Force reset animation by removing and re-adding element
        messageElement.classList.remove('typing-done');

        // Reset animation on title to restart it
        if (titleElement) {
            titleElement.style.animation = 'none';
            // Trigger reflow to restart animation
            void titleElement.offsetWidth;
            titleElement.style.animation = '';
        }

        // Reset message completely
        messageElement.textContent = '';
        messageElement.style.opacity = '0';

        // Small delay to ensure clean state before starting
        setTimeout(() => {
            messageElement.style.opacity = '1';

            // Start typing effect
            let index = 0;
            const typingSpeed = 30; // milliseconds per character

            function typeCharacter() {
                if (index < originalText.length) {
                    messageElement.textContent += originalText.charAt(index);
                    index++;
                    const timeout = setTimeout(typeCharacter, typingSpeed);
                    typingIntervals.push(timeout);
                } else {
                    messageElement.classList.add('typing-done');
                }
            }

            typingTimeout = setTimeout(typeCharacter, 800); // Start after title animation
        }, 50);
    }
}

// Guard to prevent popup from reopening immediately after closing
let popupJustClosed = false;

let flyingImagesShown = false;

function closePopup() {
    const popup = document.getElementById('flowerPopup');
    const messageElement = document.querySelector('.popup-message');

    // Clear any running typing animation
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
    typingIntervals.forEach(timeout => clearTimeout(timeout));
    typingIntervals = [];

    // Reset message element state
    if (messageElement) {
        messageElement.classList.remove('typing-done');
        // Reset to original text for next open
        const originalText = messageElement.getAttribute('data-original-text');
        if (originalText) {
            messageElement.textContent = originalText;
        }
        messageElement.style.opacity = '0';
    }

    popup.classList.remove('active');
    document.body.style.overflow = 'auto';

    // Hide flowers and show flying images (only first time)
    if (!flyingImagesShown) {
        flyingImagesShown = true;
        hideFlowersAndShowImages();
    }

    // Prevent immediate reopen from event bubbling
    popupJustClosed = true;
    setTimeout(() => { popupJustClosed = false; }, 300);
}

function hideFlowersAndShowImages() {
    console.log("hideFlowersAndShowImages called!");

    // Ẩn bó hoa
    const flowers = document.querySelector('.flowers');
    if (flowers) flowers.classList.add('flowers-hidden');

    // Ẩn dòng hướng dẫn
    const instruction = document.querySelector('.instruction');
    if (instruction) instruction.style.display = 'none';

    // Danh sách ảnh gốc (thêm/bớt tùy ý)
    const baseImages = [
        'images/p1.jpg',
        'images/p2.jpg',
        'images/p3.jpg',
        'images/p4.jpg'
        // 'images/p5.jpg',
        // 'images/p6.jpg',
        // 'images/p7.jpg',
        // 'images/p8.jpg',
        // 'images/p9.jpg',
        // 'images/p10.jpg'
    ];

    // Tối thiểu 10 ảnh: lặp lại danh sách nếu ít hơn 10
    const MIN_IMAGES = 10;
    const images = [...baseImages];
    while (images.length < MIN_IMAGES) {
        images.push(...baseImages.slice(0, MIN_IMAGES - images.length));
    }

    console.log(`Launching ${images.length} flying images (base: ${baseImages.length})`);

    // Tính kích thước ảnh theo số lượng
    const count = images.length;
    // Hình vuông hoàn toàn: 14vw cho 10 ảnh (càng ít ảnh càng to, max 20vw)
    const imgVW = Math.max(9, Math.round(20 - (count - 4) * 1.0));
    const imgVH = imgVW;  // Khung vuông

    // Hàm tạo 1 bức ảnh bay lên từ dưới màn hình
    // index: vị trí trong danh sách (chia đều màn hình)
    function launchImage(src, startDelay, index) {
        setTimeout(function() {
            const img = document.createElement('img');
            img.src = src;
            img.alt = 'flying';

            // Chia màn hình thành các cột, thêm chút ngẫu nhiên nhỏ để không cứng ngắc
            const zoneWidth  = 84 / Math.max(count - 1, 1);
            const baseLeft   = 8 + index * zoneWidth;
            const jitter     = -2 + Math.random() * 4;
            const leftPct    = Math.min(92, Math.max(8, baseLeft + jitter));

            img.style.cssText = `
                position: fixed;
                bottom: -50px;
                left: ${leftPct}%;
                width: ${imgVW}vw;
                height: ${imgVH}vw;
                object-fit: cover;
                border-radius: 20px;
                box-shadow: 0 8px 32px rgba(255,100,140,0.6);
                border: 4px solid rgba(255,255,255,0.85);
                opacity: 0;
                z-index: 9999;
                pointer-events: none;
                transform: translateX(-50%) scale(0.4);
                transition: none;
            `;
            document.body.appendChild(img);

            const driftX    = -20 + Math.random() * 40;   // px trôi ngang
            const rotateEnd = -10 + Math.random() * 20;    // góc xoay đích
            const duration  = 12000 + Math.random() * 2000; // 12-14 giây: đủ chậm để ngắm

            let startTime = null;

            function animate(ts) {
                if (!startTime) startTime = ts;
                const t = Math.min((ts - startTime) / duration, 1);

                // --- HIỆU ỨNG OPACITY ---
                // 0 -> 15% (Hiện dần lên)
                // 15% -> 45% (Sáng rõ nhất)
                // 45% -> 85% (Mờ dần đi khi lên cao để không che chữ)
                // 85% -> 100% (Ẩn hoàn toàn)
                let opacity;
                if (t < 0.15) opacity = t / 0.15;
                else if (t < 0.45) opacity = 1;
                else if (t < 0.85) opacity = 1 - (t - 0.45) / 0.40;
                else opacity = 0;

                // --- HIỆU ỨNG THU PHÓNG (SCALE) ---
                // Phóng to lên 1.0 đến giữa chừng, sau đó nhỏ dần lại
                let scale;
                if (t < 0.4) scale = 0.4 + (t / 0.4) * 0.6; // To dần
                else if (t < 0.85) scale = 1.0 - ((t - 0.4) / 0.45) * 0.5; // Nhỏ dần về 0.5
                else scale = 0.5;

                // --- HIỆU ỨNG LẮC LƯ VÀ DI CHUYỂN ---
                const moveUp = t * window.innerHeight * 1.1; 
                const shiftX = Math.sin(t * Math.PI) * driftX;
                
                // Lắc lư: Tạo 2 chu kỳ sóng lượn (sin), biên độ ±15 độ
                const wobble = Math.sin(t * Math.PI * 4) * 15;
                const rotate = t * rotateEnd + wobble;

                img.style.opacity   = opacity;
                img.style.transform = `translate(calc(-50% + ${shiftX}px), ${-moveUp}px) rotate(${rotate}deg) scale(${scale})`;

                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    img.remove();
                }
            }

            requestAnimationFrame(animate);
        }, startDelay);
    }

    // Hàm thả các ảnh lên theo thứ tự ngăn nắp để không lộn xộn
    function spawnWave() {
        // Xếp vị trí xen kẽ: trái, phải, trái giữa, phải giữa... để chia đều không gian
        const indices = [];
        let left = 0, right = count - 1;
        while (left <= right) {
            if (left === right) { indices.push(left); break; }
            indices.push(left++);
            indices.push(right--);
        }

        images.forEach(function(src, i) {
            // Bay lên lần lượt, cách nhau 700ms (rất nhịp nhàng, có trật tự)
            const delay = i * 700;
            launchImage(src, delay, indices[i]);
        });
    }

    // Thả đợt đầu ngay lập tức
    spawnWave();

    // Lặp lại chu kỳ mới cứ mỗi 14 giây (sau khi đợt cũ đã mờ hết)
    setInterval(spawnWave, 14000);
}



// Setup close button with proper touch handling
(function() {
    const closeBtn = document.getElementById('popupCloseBtn');
    if (!closeBtn) return;

    // Handle touch - respond immediately on touchend, prevent ghost click
    closeBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        e.stopPropagation();
        closePopup();
    }, { passive: false });

    // Handle mouse click (desktop)
    closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closePopup();
    });
})();

// Tap anywhere on main content to open popup - called from startMainApp()
function setupFlowerClickHandlers() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    mainContent.addEventListener('click', function(e) {
        // Ignore if popup was just closed (prevent reopen from event bubbling)
        if (popupJustClosed) return;
        // Ignore taps on music toggle button
        if (e.target.closest('#musicToggle')) return;
        // Ignore taps inside popup (prevents reopen when closing)
        if (e.target.closest('#flowerPopup')) return;
        // Ignore if popup is already open
        const popup = document.getElementById('flowerPopup');
        if (popup && popup.classList.contains('active')) return;

        openPopup();
    });
}

// Close popup when clicking outside the modal
window.addEventListener('click', function(event) {
    const popup = document.getElementById('flowerPopup');
    if (event.target === popup) {
        closePopup();
    }
});