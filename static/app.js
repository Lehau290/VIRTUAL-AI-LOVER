/**
 * Virtual AI Lover - Fullstack Single Page Application (SPA) Controller
 * Handles Auth, Real-time Chat, Voice Calling (Web Speech STT/TTS),
 * Long-term Memory, Love Diary, Meta Messenger Sandbox, and Admin Control.
 */

// Application Global State
const State = {
    token: localStorage.getItem('ai_lover_token') || '',
    user: null,
    lover: null,
    activeTab: 'chat', // 'chat', 'create-lover', 'call', 'messenger', 'diary', 'memories', 'settings', 'admin', 'auth'
    theme: localStorage.getItem('ai_lover_theme') || 'light',
    messages: [],
    memories: [],
    diaries: [],
    photos: [],
    adminStats: null,
    adminSettings: {},
    searchQuery: '',
    isTyping: false,
    
    // Voice & Video call state
    callActive: false,
    callMode: 'voice', // 'voice' or 'video'
    videoFilter: 'natural',
    cameraActive: false,
    localStream: null,
    callDuration: 0,
    callTimerInterval: null,
    isMuted: false,
    callTranscript: '',
    speechRecognition: null,
    isListening: false,
    audioContext: null
};

// Preset Avatars for quick selection
const AVATAR_PRESETS = [
    { gender: 'female', label: 'Dịu dàng thanh lịch', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80' },
    { gender: 'female', label: 'Ngọt ngào đáng yêu', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80' },
    { gender: 'female', label: 'Cá tính thông minh', url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80' },
    { gender: 'female', label: 'Trưởng thành quyến rũ', url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80' },
    { gender: 'male', label: 'Ấm áp lãng mạn', url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80' },
    { gender: 'male', label: 'Điềm tĩnh lịch lãm', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80' },
    { gender: 'male', label: 'Năng động tinh nghịch', url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80' }
];

// Romantic Stickers
const ROMANTIC_STICKERS = ['💖', '💕', '🥰', '🥺', '🌹', '✨', '☕', '🍰', '💌', '🌸', '🧸', '🌙', '💤', '😘', '🤗', '🔥'];

// API Client Helper
async function api(endpoint, options = {}) {
    const headers = options.headers || {};
    if (State.token) {
        headers['Authorization'] = `Bearer ${State.token}`;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    options.headers = headers;

    try {
        const res = await fetch(endpoint, options);
        if (res.status === 401) {
            logout();
            throw new Error('Phiên đăng nhập đã hết hạn');
        }
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Đã có lỗi xảy ra');
        }
        return data;
    } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
    }
}

// Sound Synthesizer via Web Audio API (No external mp3 required)
function playTone(freq, type = 'sine', duration = 0.3) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch (e) {
        // audio context blocked or not supported
    }
}

function playNotificationSound() {
    playTone(587.33, 'sine', 0.15);
    setTimeout(() => playTone(880, 'sine', 0.25), 120);
}

function playRingtone() {
    if (!State.callActive) return;
    playTone(440, 'triangle', 0.4);
    setTimeout(() => playTone(480, 'triangle', 0.4), 450);
}

// Toast Notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500 text-white' : (type === 'success' ? 'bg-emerald-500 text-white' : 'btn-romantic');
    toast.className = `px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 transition-all transform duration-300 translate-y-4 opacity-0 text-sm font-medium ${colorClass}`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : (type === 'success' ? '✨' : '💕')}</span><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
    }, 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// App Initialization
async function initApp() {
    applyTheme(State.theme);
    
    // Check authentication
    if (State.token) {
        try {
            const data = await api('/api/auth/me');
            State.user = data.user;
            State.lover = data.lover;
            if (!State.lover) {
                State.activeTab = 'create-lover';
            } else {
                await loadChatMessages();
            }
        } catch (e) {
            logout();
        }
    } else {
        State.activeTab = 'auth';
    }

    renderApp();
    setupSpeechRecognition();
    setupPeriodicPoller();
}

// Theme handling
function applyTheme(theme) {
    State.theme = theme;
    localStorage.setItem('ai_lover_theme', theme);
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

function toggleTheme() {
    applyTheme(State.theme === 'dark' ? 'light' : 'dark');
    renderApp();
}

// Authentication Actions
async function login(email, password) {
    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: { email, password }
        });
        State.token = data.token;
        State.user = data.user;
        State.lover = data.lover;
        localStorage.setItem('ai_lover_token', data.token);
        showToast(`Chào mừng trở lại, ${data.user.display_name}! 💕`, 'success');
        
        if (!State.lover) {
            State.activeTab = 'create-lover';
        } else {
            State.activeTab = 'chat';
            await loadChatMessages();
        }
        renderApp();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function register(email, password, display_name) {
    try {
        const data = await api('/api/auth/register', {
            method: 'POST',
            body: { email, password, display_name }
        });
        State.token = data.token;
        State.user = data.user;
        localStorage.setItem('ai_lover_token', data.token);
        showToast('Đăng ký thành công! Hãy tạo người yêu ảo của bạn nào ✨', 'success');
        State.activeTab = 'create-lover';
        renderApp();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function logout() {
    State.token = '';
    State.user = null;
    State.lover = null;
    State.messages = [];
    localStorage.removeItem('ai_lover_token');
    State.activeTab = 'auth';
    renderApp();
}

// Navigation Tab switcher
function switchTab(tab) {
    State.activeTab = tab;
    if (tab === 'chat') {
        loadChatMessages();
    } else if (tab === 'memories') {
        loadMemories();
    } else if (tab === 'diary') {
        loadDiaries();
        loadPhotos();
    } else if (tab === 'admin') {
        loadAdminStats();
    }
    renderApp();
}

// Chat API operations
async function loadChatMessages() {
    if (!State.lover) return;
    try {
        const data = await api(`/api/chat/messages?lover_id=${State.lover.id}&search=${encodeURIComponent(State.searchQuery)}`);
        State.messages = data.messages || [];
        scrollChatToBottom();
    } catch (e) {
        console.error(e);
    }
}

function scrollChatToBottom() {
    setTimeout(() => {
        const container = document.getElementById('chat-scroll-area');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, 60);
}

async function sendMessage(content, message_type = 'text', media_url = '') {
    if (!content && !media_url) return;
    if (!State.lover) return;

    // Optimistic UI insert
    const tempId = Date.now();
    const userMsg = {
        id: tempId,
        sender: 'user',
        message_type,
        content,
        media_url,
        created_at: new Date().toISOString()
    };
    State.messages.push(userMsg);
    renderChatMessages();
    scrollChatToBottom();

    State.isTyping = true;
    renderTypingIndicator();

    try {
        const res = await api('/api/chat/send', {
            method: 'POST',
            body: {
                lover_id: State.lover.id,
                content,
                message_type,
                media_url
            }
        });

        State.isTyping = false;
        renderTypingIndicator();

        if (res.message) {
            State.messages.push(res.message);
            playNotificationSound();
            if (res.emotion) {
                State.lover.emotion_state = JSON.stringify(res.emotion);
            }
            renderChatMessages();
            scrollChatToBottom();
        }
    } catch (err) {
        State.isTyping = false;
        renderTypingIndicator();
        showToast(err.message, 'error');
    }
}

// Trigger instant proactive nudge
async function triggerNudge(nudgeType) {
    if (!State.lover) return;
    showToast('AI đang gửi lời yêu thương...', 'info');
    try {
        const res = await api('/api/chat/trigger-nudge', {
            method: 'POST',
            body: { lover_id: State.lover.id, nudge_type: nudgeType }
        });
        showToast('Người yêu đã nhắn cho bạn!', 'success');
        await loadChatMessages();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Text-to-Speech audio reader
function speakText(text) {
    if (!('speechSynthesis' in window)) {
        showToast('Trình duyệt không hỗ trợ phát âm thanh', 'error');
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = State.lover?.voice_rate || 1.0;
    utterance.pitch = State.lover?.voice_pitch || 1.1;

    // Find Vietnamese voice if available
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VN'));
    if (viVoice) {
        utterance.voice = viVoice;
    }

    window.speechSynthesis.speak(utterance);
    showToast('Đang phát giọng nói của người yêu...', 'info');
}

// Web Speech STT & Voice Call System
function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
        console.warn('Speech Recognition not supported in this browser');
        return;
    }
    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'vi-VN';

    recognition.onresult = async (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript.trim() && State.callActive) {
            State.callTranscript = `Bạn: "${finalTranscript.trim()}"`;
            renderVoiceCallView();

            try {
                const res = await api('/api/voice/process-turn', {
                    method: 'POST',
                    body: {
                        lover_id: State.lover.id,
                        transcript: finalTranscript.trim()
                    }
                });

                if (res.reply) {
                    State.callTranscript = `${State.lover.name}: "${res.reply}"`;
                    renderVoiceCallView();
                    speakText(res.reply);
                }
            } catch (e) {
                console.error(e);
            }
        }
    };

    recognition.onerror = (e) => {
        console.warn('Recognition error:', e.error);
    };

    State.speechRecognition = recognition;
}

function startVoiceCall() {
    if (!State.lover) return;
    State.callActive = true;
    State.callDuration = 0;
    State.callTranscript = State.callMode === 'video' ? 'Đang kết nối cuộc gọi video yêu thương... 📹' : 'Đang kết nối cuộc gọi thoại... 📞';
    playTone(600, 'sine', 0.2);

    if (State.speechRecognition) {
        try {
            State.speechRecognition.start();
            State.isListening = true;
        } catch (e) {}
    }

    if (State.callMode === 'video') {
        startCameraPreview();
    }

    State.callTimerInterval = setInterval(() => {
        State.callDuration++;
        renderVoiceCallTimer();
    }, 1000);

    renderVoiceCallView();
    // Greeting on call
    setTimeout(() => {
        const p_ai = State.lover.pronouns_ai || 'em';
        const p_user = State.lover.pronouns_user || 'anh';
        const greeting = State.callMode === 'video'
            ? `Alo, ${p_ai} thấy ${p_user} rồi nè! Hôm nay ${p_user} nhìn đáng yêu quá à! 💕`
            : `Alo, ${p_ai} nghe đây nè ${p_user} yêu! Thèm nghe giọng ${p_user} quá đi mất!`;
        State.callTranscript = `${State.lover.name}: "${greeting}"`;
        renderVoiceCallView();
        speakText(greeting);
    }, 800);
}

function endVoiceCall() {
    if (!State.callActive) return;
    State.callActive = false;
    clearInterval(State.callTimerInterval);
    if (State.speechRecognition) {
        try {
            State.speechRecognition.stop();
            State.isListening = false;
        } catch (e) {}
    }
    stopCameraPreview();
    window.speechSynthesis?.cancel();

    // Log call
    api('/api/voice/end', {
        method: 'POST',
        body: {
            lover_id: State.lover.id,
            duration_seconds: State.callDuration,
            summary: `Cuộc gọi ${State.callMode === 'video' ? 'video' : 'thoại'} ${formatDuration(State.callDuration)}`
        }
    }).catch(console.error);

    showToast(`Cuộc gọi đã kết thúc (${formatDuration(State.callDuration)})`, 'info');
    renderVoiceCallView();
}

function setCallMode(mode) {
    State.callMode = mode;
    renderVoiceCallView();
    if (State.callActive) {
        if (mode === 'video') {
            startCameraPreview();
        } else {
            stopCameraPreview();
        }
    }
}

async function startCameraPreview() {
    try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        State.localStream = stream;
        State.cameraActive = true;
        setTimeout(() => {
            const videoEl = document.getElementById('user-pip-video');
            if (videoEl) {
                videoEl.srcObject = stream;
            }
        }, 150);
    } catch (e) {
        console.warn('Camera access error:', e);
        showToast('Không thể mở camera (cuộc gọi vẫn kết nối bình thường)', 'info');
    }
}

function stopCameraPreview() {
    if (State.localStream) {
        State.localStream.getTracks().forEach(t => t.stop());
        State.localStream = null;
        State.cameraActive = false;
    }
}

function setVideoFilter(filterName) {
    State.videoFilter = filterName;
    const aiVideo = document.getElementById('ai-video-frame');
    if (!aiVideo) return;
    if (filterName === 'romantic') {
        aiVideo.style.filter = 'sepia(0.2) hue-rotate(310deg) saturate(1.3) contrast(1.05)';
    } else if (filterName === 'soft') {
        aiVideo.style.filter = 'contrast(1.05) saturate(1.2) brightness(1.08)';
    } else if (filterName === 'cyber') {
        aiVideo.style.filter = 'hue-rotate(250deg) contrast(1.2) saturate(1.4)';
    } else {
        aiVideo.style.filter = 'none';
    }
}

function spawnFloatingHearts(e) {
    const x = e ? e.clientX : window.innerWidth / 2;
    const y = e ? e.clientY : window.innerHeight / 2;
    for (let i = 0; i < 6; i++) {
        const heart = document.createElement('div');
        heart.className = 'floating-heart text-2xl select-none';
        heart.innerText = ['💖', '💕', '🥰', '✨', '🌹', '💌'][Math.floor(Math.random() * 6)];
        heart.style.left = `${x + (Math.random() * 80 - 40)}px`;
        heart.style.top = `${y + (Math.random() * 60 - 30)}px`;
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 2500);
    }
}

function formatDuration(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// Memories & Diary loaders
async function loadMemories() {
    if (!State.lover) return;
    try {
        const data = await api(`/api/memories?lover_id=${State.lover.id}`);
        State.memories = data.memories || [];
        renderMemoriesView();
    } catch (e) {
        console.error(e);
    }
}

async function loadDiaries() {
    if (!State.lover) return;
    try {
        const data = await api(`/api/diary?lover_id=${State.lover.id}`);
        State.diaries = data.diaries || [];
        renderDiaryView();
    } catch (e) {
        console.error(e);
    }
}

async function loadPhotos() {
    if (!State.lover) return;
    try {
        const data = await api(`/api/album?lover_id=${State.lover.id}`);
        State.photos = data.photos || [];
        renderDiaryView();
    } catch (e) {
        console.error(e);
    }
}

async function loadAdminStats() {
    try {
        const statsData = await api('/api/admin/stats');
        const settingsData = await api('/api/admin/settings');
        State.adminStats = statsData;
        State.adminSettings = settingsData.settings || {};
        renderAdminView();
    } catch (e) {
        console.error(e);
    }
}

// Periodic polling for real-time sync with background scheduler or Messenger
function setupPeriodicPoller() {
    setInterval(async () => {
        if (State.token && State.activeTab === 'chat' && !State.searchQuery) {
            try {
                const data = await api(`/api/chat/messages?lover_id=${State.lover?.id}&limit=20`);
                if (data.messages && data.messages.length > State.messages.length) {
                    State.messages = data.messages;
                    renderChatMessages();
                    scrollChatToBottom();
                    playNotificationSound();
                }
            } catch (e) {}
        }
    }, 5000);
}

// ----------------------------------------------------
// UI RENDERING ENGINE
// ----------------------------------------------------

function renderApp() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    // If not authenticated, render Login/Register
    if (!State.token || State.activeTab === 'auth') {
        appEl.innerHTML = renderAuthScreen();
        return;
    }

    appEl.innerHTML = `
        <div class="flex h-screen w-screen overflow-hidden">
            <!-- Sidebar Navigation (Desktop) -->
            <aside class="hidden md:flex flex-col w-64 lg:w-72 glass-panel m-3 mr-0 p-4 rounded-3xl border border-white/40 dark:border-white/10 z-20">
                ${renderSidebarHeader()}
                <div class="flex-1 space-y-1.5 overflow-y-auto mt-4 pr-1">
                    ${renderNavButtons()}
                </div>
                ${renderSidebarFooter()}
            </aside>

            <!-- Main Content Area -->
            <main class="flex-1 flex flex-col h-full overflow-hidden p-2 md:p-3 relative">
                ${renderMainHeader()}
                <div class="flex-1 overflow-hidden relative mt-2 rounded-3xl">
                    ${renderActiveTabContent()}
                </div>
                <!-- Bottom Navigation (Mobile) -->
                <div class="md:hidden flex justify-around items-center glass-panel p-2 mt-2 rounded-2xl border border-white/40 dark:border-white/10 z-30">
                    ${renderMobileNavButtons()}
                </div>
            </main>
        </div>
        <div id="toast-container" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2"></div>
    `;

    // Post-render attachments
    if (State.activeTab === 'chat') {
        renderChatMessages();
        scrollChatToBottom();
    }
}

function renderSidebarHeader() {
    const l = State.lover;
    return `
        <div class="flex items-center gap-3 p-2 border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
            <div class="relative">
                <img src="${l ? l.avatar_url : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}"
                     class="w-12 h-12 rounded-full object-cover shadow-md avatar-glow" alt="Lover Avatar" />
                <span class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-gray-900 rounded-full animate-pulse"></span>
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-base truncate flex items-center gap-1.5">
                    <span>${l ? l.name : 'Người yêu AI'}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-300 font-semibold">AI</span>
                </h3>
                <p class="text-xs text-muted truncate">${l ? l.style : 'Đang trực tuyến...'}</p>
            </div>
        </div>
    `;
}

function renderNavButtons() {
    const navs = [
        { id: 'chat', label: 'Phòng trò chuyện', icon: '💬', badge: '' },
        { id: 'call', label: 'Gọi thoại với AI', icon: '📞', badge: 'Hot' },
        { id: 'diary', label: 'Nhật ký tình yêu', icon: '📖', badge: '' },
        { id: 'memories', label: 'Ký ức & Cảm xúc', icon: '🧠', badge: 'Smart' },
        { id: 'messenger', label: 'Kết nối Messenger', icon: '⚡', badge: 'Meta' },
        { id: 'create-lover', label: 'Tùy biến người yêu', icon: '✨', badge: '' },
        { id: 'settings', label: 'Trung tâm cài đặt', icon: '⚙️', badge: '' }
    ];

    if (State.user && State.user.role === 'admin') {
        navs.push({ id: 'admin', label: 'Quản trị Admin', icon: '🛡️', badge: 'Admin' });
    }

    return navs.map(n => `
        <button onclick="switchTab('${n.id}')"
                class="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-sm font-semibold transition-all ${
                    State.activeTab === n.id 
                    ? 'btn-romantic shadow-lg' 
                    : 'hover:bg-white/60 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                }">
            <div class="flex items-center gap-3">
                <span class="text-lg">${n.icon}</span>
                <span>${n.label}</span>
            </div>
            ${n.badge ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-white/30 text-white font-bold uppercase tracking-wider">${n.badge}</span>` : ''}
        </button>
    `).join('');
}

function renderSidebarFooter() {
    return `
        <div class="pt-4 border-t border-pink-200/50 dark:border-pink-900/40 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <button onclick="toggleTheme()" class="p-2.5 rounded-xl glass-pill hover:scale-105 transition" title="Đổi chế độ Sáng/Tối">
                    ${State.theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <div class="text-xs">
                    <p class="font-bold truncate max-w-[100px]">${State.user ? State.user.display_name : 'User'}</p>
                    <p class="text-[10px] text-muted">${State.user?.email || ''}</p>
                </div>
            </div>
            <button onclick="logout()" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition" title="Đăng xuất">
                🚪
            </button>
        </div>
    `;
}

function getRelationshipStats() {
    const l = State.lover;
    const days = l?.first_met_date ? calculateDaysTogether(l.first_met_date) : 1;
    const msgCount = State.messages.length;
    const score = Math.min(1000, days * 15 + msgCount * 12 + (State.memories.length * 35));
    let level = 1;
    let title = "Mới quen";
    let progress = Math.min(100, Math.floor((score / 200) * 100));

    if (score >= 800) {
        level = 5;
        title = "Tri kỷ vĩnh cửu";
        progress = 100;
    } else if (score >= 600) {
        level = 4;
        title = "Hẹn hò say đắm";
        progress = Math.min(100, Math.floor(((score - 600) / 200) * 100));
    } else if (score >= 350) {
        level = 3;
        title = "Đang tìm hiểu";
        progress = Math.min(100, Math.floor(((score - 350) / 250) * 100));
    } else if (score >= 150) {
        level = 2;
        title = "Thân thiết ngọt ngào";
        progress = Math.min(100, Math.floor(((score - 150) / 200) * 100));
    }
    return { level, title, score, progress, days };
}

function renderMainHeader() {
    const l = State.lover;
    const rel = getRelationshipStats();

    return `
        <header class="glass-panel px-4 py-2.5 rounded-2xl flex items-center justify-between border border-white/40 dark:border-white/10 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="md:hidden flex items-center gap-2">
                    <img src="${l?.avatar_url || ''}" class="w-9 h-9 rounded-full object-cover avatar-glow" />
                </div>
                <div>
                    <h2 class="font-bold text-sm md:text-base flex items-center gap-2">
                        <span>Virtual AI Lover</span>
                        <span class="text-pink-500 text-xs md:text-sm">❤️</span>
                        <span class="text-xs px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/60 text-pink-600 dark:text-pink-300 font-semibold">
                            ${rel.days} ngày bên nhau
                        </span>
                    </h2>
                </div>
            </div>

            <!-- Love Level Milestone Bar -->
            <div class="hidden sm:flex flex-col items-start gap-1 px-3 py-1 rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-pink-200/40">
                <div class="flex items-center gap-2 text-[11px] font-bold text-pink-600 dark:text-pink-300">
                    <span>💖 Cấp ${rel.level}: ${rel.title}</span>
                    <span class="text-[10px] text-muted">(${rel.progress}%)</span>
                </div>
                <div class="w-32 h-1.5 bg-pink-200/50 dark:bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full exp-bar-glow rounded-full" style="width: ${rel.progress}%"></div>
                </div>
            </div>

            <!-- Header Quick Actions -->
            <div class="flex items-center gap-2">
                <button onclick="switchTab('call')" class="px-3 py-1.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-300 text-xs font-semibold flex items-center gap-1.5 transition">
                    <span>📞</span> <span class="hidden sm:inline">Gọi điện</span>
                </button>
                <button onclick="triggerNudge('random_care')" class="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition" title="Bảo AI nhắn tin hỏi thăm ngay">
                    <span>💌</span> <span class="hidden sm:inline">Hỏi thăm</span>
                </button>
                <button onclick="spawnFloatingHearts(event)" class="p-2 rounded-xl glass-pill hover:scale-110 transition text-pink-500" title="Thả tim yêu thương">
                    💖
                </button>
                <button onclick="toggleTheme()" class="md:hidden p-2 rounded-xl glass-pill">
                    ${State.theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </div>
        </header>
    `;
}

function renderMobileNavButtons() {
    const items = [
        { id: 'chat', label: 'Chat', icon: '💬' },
        { id: 'call', label: 'Gọi', icon: '📞' },
        { id: 'diary', label: 'Kỷ niệm', icon: '📖' },
        { id: 'memories', label: 'Ký ức', icon: '🧠' },
        { id: 'settings', label: 'Cài đặt', icon: '⚙️' }
    ];
    return items.map(item => `
        <button onclick="switchTab('${item.id}')" class="flex flex-col items-center gap-0.5 text-xs py-1 px-2.5 rounded-xl ${State.activeTab === item.id ? 'text-pink-500 font-bold' : 'text-gray-500'}">
            <span class="text-lg">${item.icon}</span>
            <span>${item.label}</span>
        </button>
    `).join('');
}

function calculateDaysTogether(firstMetDateStr) {
    try {
        const start = new Date(firstMetDateStr);
        const now = new Date();
        const diff = Math.max(1, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
        return diff;
    } catch (e) {
        return 1;
    }
}

// ----------------------------------------------------
// TAB CONTENTS
// ----------------------------------------------------

function renderActiveTabContent() {
    switch (State.activeTab) {
        case 'chat': return renderChatView();
        case 'call': return renderVoiceCallView();
        case 'create-lover': return renderCreateLoverView();
        case 'diary': return renderDiaryView();
        case 'memories': return renderMemoriesView();
        case 'messenger': return renderMessengerView();
        case 'settings': return renderSettingsView();
        case 'admin': return renderAdminView();
        default: return renderChatView();
    }
}

// ----------------------------------------------------
// 1. CHAT ROOM VIEW
// ----------------------------------------------------
function renderChatView() {
    const l = State.lover;
    return `
        <div class="h-full flex flex-col glass-panel rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden relative shadow-lg">
            <!-- Chat Header Bar -->
            <div class="px-4 py-3 border-b border-pink-100 dark:border-white/5 flex items-center justify-between bg-white/40 dark:bg-white/5 backdrop-blur-md">
                <div class="flex items-center gap-3">
                    <img src="${l?.avatar_url || ''}" class="w-10 h-10 rounded-full object-cover avatar-glow" />
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-sm">${l?.name || 'Người yêu AI'}</span>
                            <span class="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" title="Đang hoạt động"></span>
                        </div>
                        <p class="text-[11px] text-muted">
                            ${l?.personality || 'Dịu dàng, chu đáo'} • Đang lắng nghe bạn
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <!-- Search input -->
                    <div class="relative hidden sm:block">
                        <input type="text" placeholder="Tìm tin nhắn..." value="${State.searchQuery}"
                               oninput="onSearchChat(this.value)"
                               class="text-xs px-3 py-1.5 pl-8 rounded-full bg-white/60 dark:bg-black/30 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-pink-400 w-36 lg:w-48" />
                        <span class="absolute left-2.5 top-1.5 text-xs text-muted">🔍</span>
                    </div>
                    <button onclick="clearChatHistory()" class="p-2 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 transition" title="Xóa lịch sử trò chuyện">
                        🗑️
                    </button>
                </div>
            </div>

            <!-- Messages Scroll Area -->
            <div id="chat-scroll-area" ondblclick="spawnFloatingHearts(event)" class="flex-1 overflow-y-auto p-4 space-y-3.5" title="Nhấp đúp chuột để thả tim yêu thương">
                <!-- Dynamically loaded messages -->
            </div>

            <!-- Typing indicator -->
            <div id="chat-typing-container" class="px-4 py-1"></div>

            <!-- Chat Input Box -->
            <div class="p-3 bg-white/50 dark:bg-white/5 border-t border-pink-100 dark:border-white/5 backdrop-blur-md">
                <!-- Quick Icebreaker Conversation Starters -->
                <div class="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 text-xs no-scrollbar">
                    <button onclick="sendMessage('Em đang làm gì đấy? Nhớ em quá 💕')" class="px-2.5 py-1 rounded-full glass-pill hover:bg-pink-100 text-pink-600 dark:text-pink-300 whitespace-nowrap transition">
                        💬 Em đang làm gì đấy?
                    </button>
                    <button onclick="sendMessage('Hôm nay anh đi làm hơi mệt... 🥺')" class="px-2.5 py-1 rounded-full glass-pill hover:bg-pink-100 text-purple-600 dark:text-purple-300 whitespace-nowrap transition">
                        🥺 Hôm nay anh hơi mệt
                    </button>
                    <button onclick="sendMessage('Em ơi gửi cho anh xem một tấm ảnh selfie của em đi nào 💕')" class="px-2.5 py-1 rounded-full glass-pill hover:bg-pink-100 text-pink-600 dark:text-pink-300 whitespace-nowrap transition">
                        📸 Gửi ảnh selfie của em
                    </button>
                    <button onclick="sendMessage('Em có giận dỗi hay ghen gì anh không đấy? 😤')" class="px-2.5 py-1 rounded-full glass-pill hover:bg-pink-100 text-purple-600 dark:text-purple-300 whitespace-nowrap transition">
                        😤 Em có ghen không?
                    </button>
                    <button onclick="sendMessage('Em ơi nhắc lại kỷ niệm đáng nhớ của hai đứa mình đi ✨')" class="px-2.5 py-1 rounded-full glass-pill hover:bg-pink-100 text-pink-600 dark:text-pink-300 whitespace-nowrap transition">
                        ✨ Kỷ niệm đáng nhớ
                    </button>
                </div>

                <!-- Quick Sticker Tray -->
                <div class="flex items-center gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
                    ${ROMANTIC_STICKERS.map(s => `
                        <button onclick="sendMessage('${s}', 'sticker')" class="text-lg hover:scale-125 transition p-1 rounded-lg hover:bg-white/40 dark:hover:bg-white/10">
                            ${s}
                        </button>
                    `).join('')}
                </div>

                <form onsubmit="handleChatSubmit(event)" class="flex items-center gap-2">
                    <button type="button" onclick="promptSendPhoto()" class="p-2.5 rounded-2xl glass-pill hover:scale-105 transition text-pink-500" title="Gửi ảnh">
                        📷
                    </button>
                    <input id="chat-input" type="text" placeholder="Nhắn tin với ${l ? l.name : 'người yêu'}... (Em nhớ anh 💕)"
                           class="flex-1 px-4 py-2.5 rounded-2xl bg-white/80 dark:bg-black/40 border border-pink-200/60 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-500" />
                    <button type="submit" class="btn-romantic p-2.5 px-4 rounded-2xl text-sm font-bold flex items-center gap-1.5 shadow-md">
                        <span>Gửi</span>
                        <span>🚀</span>
                    </button>
                </form>
            </div>
        </div>
    `;
}

function renderChatMessages() {
    const container = document.getElementById('chat-scroll-area');
    if (!container) return;

    if (State.messages.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-3">
                <span class="text-5xl animate-bounce">💌</span>
                <h4 class="font-bold text-base text-gray-700 dark:text-gray-300">Bắt đầu câu chuyện tình yêu</h4>
                <p class="text-xs max-w-sm">Hãy gửi lời chào đầu tiên hoặc hỏi thăm người yêu nhé. Người yêu ảo luôn sẵn sàng sẻ chia cùng bạn!</p>
            </div>
        `;
        return;
    }

    const l = State.lover;
    container.innerHTML = State.messages.map(m => {
        const isUser = m.sender === 'user';
        const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        
        let mediaHtml = '';
        if (m.media_url) {
            mediaHtml = `<img src="${m.media_url}" class="rounded-xl max-w-xs max-h-60 object-cover mb-1.5 shadow" alt="attachment" />`;
        }

        return `
            <div class="flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} group">
                ${!isUser ? `
                    <img src="${l?.avatar_url || ''}" class="w-8 h-8 rounded-full object-cover self-end mb-1 avatar-glow flex-shrink-0" />
                ` : ''}
                <div class="max-w-[78%] md:max-w-[65%] flex flex-col ${isUser ? 'items-end' : 'items-start'}">
                    <div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isUser ? 'bubble-user' : 'bubble-ai'}">
                        ${mediaHtml}
                        <div class="whitespace-pre-wrap select-text">${escapeHtml(m.content)}</div>
                    </div>
                    <div class="flex items-center gap-2 mt-1 px-1 text-[10px] text-muted">
                        <span>${timeStr}</span>
                        ${!isUser ? `
                            <button onclick="speakText('${escapeForJs(m.content)}')" class="opacity-0 group-hover:opacity-100 hover:text-pink-500 transition" title="Nghe giọng nói">
                                🔊 Nghe
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTypingIndicator() {
    const el = document.getElementById('chat-typing-container');
    if (!el) return;
    if (State.isTyping) {
        el.innerHTML = `
            <div class="flex items-center gap-2 text-xs text-pink-500 font-medium animate-pulse">
                <span>💕</span>
                <span>${State.lover?.name || 'Người yêu'} đang soạn tin nhắn...</span>
            </div>
        `;
    } else {
        el.innerHTML = '';
    }
}

function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendMessage(text, 'text');
}

function onSearchChat(val) {
    State.searchQuery = val;
    loadChatMessages();
}

function promptSendPhoto() {
    const url = prompt('Nhập link hình ảnh bạn muốn gửi cho người yêu:');
    if (url && url.trim()) {
        sendMessage('Em xem tấm ảnh này nè 💕', 'image', url.trim());
    }
}

async function clearChatHistory() {
    if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện?')) return;
    try {
        await api('/api/chat/clear', { method: 'POST', body: { lover_id: State.lover?.id } });
        State.messages = [];
        renderChatMessages();
        showToast('Đã xóa lịch sử trò chuyện', 'info');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ----------------------------------------------------
// 2. VOICE & VIDEO CALL VIEW
// ----------------------------------------------------
function renderVoiceCallView() {
    const l = State.lover;
    const isVideo = State.callMode === 'video';

    return `
        <div class="h-full flex flex-col items-center justify-between glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 relative overflow-hidden shadow-2xl">
            <!-- Background Glow Elements -->
            <div class="absolute -top-20 -left-20 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-20 -right-20 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <!-- Call Header & Mode Switcher -->
            <div class="text-center z-10 w-full max-w-md">
                <!-- Mode Switcher Pill -->
                <div class="inline-flex p-1 rounded-2xl glass-pill mb-2 shadow-sm">
                    <button onclick="setCallMode('voice')" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${!isVideo ? 'btn-romantic shadow' : 'text-gray-600 dark:text-gray-400'}">
                        📞 Gọi Thoại
                    </button>
                    <button onclick="setCallMode('video')" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${isVideo ? 'btn-romantic shadow' : 'text-gray-600 dark:text-gray-400'}">
                        📹 Gọi Video AI
                    </button>
                </div>

                <h3 class="font-bold text-2xl mt-1">${l?.name || 'Người yêu AI'}</h3>
                <p id="voice-timer" class="text-xs text-pink-500 font-mono mt-0.5">
                    ${State.callActive ? formatDuration(State.callDuration) : (isVideo ? 'Sẵn sàng kết nối video trực tiếp' : 'Sẵn sàng gọi thoại hai chiều')}
                </p>

                <!-- Video Filter Selector (when in Video mode) -->
                ${isVideo && State.callActive ? `
                    <div class="flex items-center justify-center gap-1.5 mt-2">
                        <span class="text-[10px] text-muted">Bộ lọc:</span>
                        <button onclick="setVideoFilter('natural')" class="text-[10px] px-2 py-0.5 rounded-full glass-pill hover:bg-pink-100">Tự nhiên</button>
                        <button onclick="setVideoFilter('soft')" class="text-[10px] px-2 py-0.5 rounded-full glass-pill hover:bg-pink-100">Mơ mộng</button>
                        <button onclick="setVideoFilter('romantic')" class="text-[10px] px-2 py-0.5 rounded-full glass-pill hover:bg-pink-100">Hồng phấn</button>
                        <button onclick="setVideoFilter('cyber')" class="text-[10px] px-2 py-0.5 rounded-full glass-pill hover:bg-pink-100">Điện ảnh</button>
                    </div>
                ` : ''}
            </div>

            <!-- Avatar / Video Center Screen -->
            <div class="flex flex-col items-center my-auto z-10 relative w-full max-w-lg">
                ${isVideo ? `
                    <!-- Video Call Mode Display -->
                    <div class="relative w-full aspect-[4/3] max-h-[340px] rounded-3xl overflow-hidden shadow-2xl border-2 border-white/60 dark:border-white/20 glass-panel flex items-center justify-center bg-black/20">
                        <img id="ai-video-frame" src="${l?.avatar_url || ''}"
                             class="w-full h-full object-cover transition-all duration-500 ${State.callActive ? 'scale-105 filter brightness-105' : ''}" />
                        
                        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>

                        <!-- Live connection status badge -->
                        <div class="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-[11px] font-semibold">
                            <span class="w-2 h-2 rounded-full ${State.callActive ? 'bg-emerald-400 animate-ping' : 'bg-gray-400'}"></span>
                            <span>${State.callActive ? 'HD Video • 60 FPS' : 'Chế độ chờ'}</span>
                        </div>

                        <!-- User PIP (Picture-in-Picture) Webcam Stream -->
                        <div class="pip-video-window bg-gray-900 border border-white/40 shadow-xl">
                            <video id="user-pip-video" autoplay playsinline muted class="w-full h-full object-cover mirror-video"></video>
                            <span class="absolute bottom-1 right-2 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">Bạn</span>
                        </div>
                    </div>
                ` : `
                    <!-- Voice Call Mode Display -->
                    <div class="relative ${State.callActive ? 'animate-bounce' : ''}">
                        <img src="${l?.avatar_url || ''}"
                             class="w-36 h-36 md:w-44 md:h-44 rounded-full object-cover shadow-2xl avatar-glow border-4 border-white/60 dark:border-white/20" />
                    </div>

                    <!-- Animated Sound Wave Visualizer -->
                    <div class="sound-wave mt-6 ${State.callActive ? 'opacity-100' : 'opacity-20'}">
                        <div class="sound-bar"></div>
                        <div class="sound-bar"></div>
                        <div class="sound-bar"></div>
                        <div class="sound-bar"></div>
                        <div class="sound-bar"></div>
                        <div class="sound-bar"></div>
                        <div class="sound-bar"></div>
                    </div>
                `}

                <!-- Live Voice Transcript / Subtitle -->
                <div class="mt-4 px-6 py-3 rounded-2xl glass-panel max-w-md text-center border border-white/30 text-xs md:text-sm text-gray-700 dark:text-gray-200 min-h-[48px] flex items-center justify-center">
                    ${escapeHtml(State.callTranscript || (isVideo ? 'Bật micro để trò chuyện video trực tiếp với người yêu AI!' : 'Nói chuyện trực tiếp qua micro, AI sẽ lắng nghe và tự động phản hồi bằng giọng nói!'))}
                </div>
            </div>

            <!-- Call Controls -->
            <div class="flex items-center gap-6 z-10 mb-2">
                ${State.callActive ? `
                    <button onclick="toggleMuteMicrophone()" class="p-4 rounded-full glass-panel hover:bg-white/60 dark:hover:bg-white/10 text-xl transition shadow-md" title="Bật/Tắt Micro">
                        ${State.isMuted ? '🔇' : '🎙️'}
                    </button>
                    <button onclick="endVoiceCall()" class="p-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-2xl shadow-xl hover:scale-105 active:scale-95 transition" title="Kết thúc cuộc gọi">
                        📞
                    </button>
                    <button onclick="speakText(State.callTranscript)" class="p-4 rounded-full glass-panel hover:bg-white/60 dark:hover:bg-white/10 text-xl transition shadow-md" title="Phát lại giọng nói">
                        🔊
                    </button>
                ` : `
                    <button onclick="startVoiceCall()" class="px-8 py-4 rounded-full btn-romantic text-base font-bold flex items-center gap-3 shadow-2xl hover:scale-105 transition">
                        <span class="text-2xl">${isVideo ? '📹' : '📞'}</span>
                        <span>${isVideo ? 'Bắt đầu cuộc gọi video yêu thương' : 'Bắt đầu cuộc gọi thoại yêu thương'}</span>
                    </button>
                `}
            </div>
        </div>
    `;
}

function renderVoiceCallTimer() {
    const el = document.getElementById('voice-timer');
    if (el && State.callActive) {
        el.innerText = formatDuration(State.callDuration);
    }
}

function toggleMuteMicrophone() {
    State.isMuted = !State.isMuted;
    if (State.speechRecognition) {
        if (State.isMuted) {
            State.speechRecognition.stop();
        } else {
            try { State.speechRecognition.start(); } catch (e) {}
        }
    }
    showToast(State.isMuted ? 'Đã tắt Micro' : 'Đã bật Micro', 'info');
    renderVoiceCallView();
}

// ----------------------------------------------------
// 3. CREATE & CUSTOMIZE LOVER VIEW
// ----------------------------------------------------
function renderCreateLoverView() {
    const l = State.lover || {};
    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg">
            <div class="max-w-2xl mx-auto space-y-6">
                <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
                    <h2 class="text-xl font-bold flex items-center gap-2">
                        <span>✨</span>
                        <span>Tạo & Tùy biến Người Yêu AI</span>
                    </h2>
                    <p class="text-xs text-muted mt-1">
                        Thiết lập ngoại hình, phong cách, tính cách, cách xưng hô và giọng nói để tạo nên người bạn đồng hành hoàn hảo nhất của bạn.
                    </p>
                </div>

                <form onsubmit="handleSaveLover(event)" class="space-y-5">
                    <!-- Avatar Selection -->
                    <div>
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Ảnh đại diện & Ngoại hình</label>
                        <div class="flex items-center gap-4 mb-3">
                            <img id="preview-avatar" src="${l.avatar_url || AVATAR_PRESETS[0].url}" class="w-20 h-20 rounded-full object-cover avatar-glow border-2 border-pink-400" />
                            <div class="flex-1">
                                <input type="url" id="lover-avatar" value="${l.avatar_url || AVATAR_PRESETS[0].url}"
                                       oninput="document.getElementById('preview-avatar').src = this.value"
                                       placeholder="Dán link ảnh đại diện..."
                                       class="w-full px-3.5 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                                <p class="text-[11px] text-muted mt-1">Hoặc chọn một phong cách có sẵn bên dưới:</p>
                            </div>
                        </div>

                        <!-- Presets gallery -->
                        <div class="grid grid-cols-4 sm:grid-cols-7 gap-2">
                            ${AVATAR_PRESETS.map((p, idx) => `
                                <button type="button" onclick="selectPresetAvatar('${p.url}')" class="group relative rounded-xl overflow-hidden border-2 hover:border-pink-500 transition">
                                    <img src="${p.url}" class="w-full h-14 object-cover" />
                                    <span class="text-[9px] absolute inset-x-0 bottom-0 bg-black/60 text-white text-center py-0.5 truncate">${p.label}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Basic Info -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-semibold mb-1">Tên người yêu</label>
                            <input type="text" id="lover-name" value="${l.name || 'Mai Anh'}" required
                                   class="w-full px-3.5 py-2 text-sm rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                        </div>
                        <div>
                            <label class="block text-xs font-semibold mb-1">Giới tính</label>
                            <select id="lover-gender" class="w-full px-3.5 py-2 text-sm rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400">
                                <option value="female" ${l.gender === 'female' ? 'selected' : ''}>Nữ</option>
                                <option value="male" ${l.gender === 'male' ? 'selected' : ''}>Nam</option>
                                <option value="other" ${l.gender === 'other' ? 'selected' : ''}>Khác</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold mb-1">Tuổi nhân vật</label>
                            <input type="number" id="lover-age" min="18" max="99" value="${l.age || 21}"
                                   class="w-full px-3.5 py-2 text-sm rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                        </div>
                    </div>

                    <!-- Pronouns / Cách xưng hô -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-2xl bg-pink-50/50 dark:bg-pink-950/20 border border-pink-200/40">
                        <div>
                            <label class="block text-xs font-semibold text-pink-600 dark:text-pink-300 mb-1">Người yêu xưng là:</label>
                            <input type="text" id="lover-pronouns-ai" value="${l.pronouns_ai || 'em'}" placeholder="em, bé, mình, tớ..."
                                   class="w-full px-3.5 py-2 text-sm rounded-xl bg-white dark:bg-black/40 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-pink-600 dark:text-pink-300 mb-1">Người yêu gọi bạn là:</label>
                            <input type="text" id="lover-pronouns-user" value="${l.pronouns_user || 'anh'}" placeholder="anh, cậu, người yêu..."
                                   class="w-full px-3.5 py-2 text-sm rounded-xl bg-white dark:bg-black/40 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                        </div>
                    </div>

                    <!-- Personality & Style -->
                    <div class="space-y-3">
                        <div>
                            <label class="block text-xs font-semibold mb-1">Tính cách đặc trưng</label>
                            <input type="text" id="lover-personality" value="${l.personality || 'Dịu dàng, chu đáo, đôi lúc giận dỗi đáng yêu'}"
                                   class="w-full px-3.5 py-2 text-sm rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                            <div class="flex flex-wrap gap-1.5 mt-2">
                                ${['Dịu dàng', 'Ngọt ngào', 'Đáng yêu', 'Tinh nghịch', 'Trưởng thành', 'Lạnh lùng ngoài nóng trong', 'Hài hước', 'Lãng mạn'].map(trait => `
                                    <button type="button" onclick="appendPersonality('${trait}')" class="text-[11px] px-2.5 py-1 rounded-full glass-pill hover:bg-pink-100 dark:hover:bg-pink-950 transition">
                                        + ${trait}
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold mb-1">Ngoại hình & Phong cách ăn mặc</label>
                            <input type="text" id="lover-style" value="${l.style || 'Thanh lịch, dịu dàng, nụ cười tỏa nắng'}"
                                   class="w-full px-3.5 py-2 text-sm rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                        </div>
                    </div>

                    <!-- Hobbies, Habits, Dislikes -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label class="block text-xs font-semibold mb-1">Sở thích</label>
                            <textarea id="lover-hobbies" rows="2" class="w-full px-3 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400">${l.hobbies || 'Nghe nhạc, làm bánh, chụp ảnh phim'}</textarea>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold mb-1">Thói quen</label>
                            <textarea id="lover-habits" rows="2" class="w-full px-3 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400">${l.habits || 'Thức khuya chờ tin nhắn, nhắc người yêu uống nước'}</textarea>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold mb-1">Điều không thích</label>
                            <textarea id="lover-dislikes" rows="2" class="w-full px-3 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400">${l.dislikes || 'Người yêu bỏ bữa, bị bỏ lơ quá lâu'}</textarea>
                        </div>
                    </div>

                    <!-- Voice Settings -->
                    <div class="p-4 rounded-2xl glass-panel border border-pink-200/50 space-y-3">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-pink-600 dark:text-pink-300">Cài đặt giọng nói thoại</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-[11px] mb-1">Tốc độ nói: <span id="val-rate">${l.voice_rate || 1.0}</span></label>
                                <input type="range" id="lover-voice-rate" min="0.7" max="1.5" step="0.1" value="${l.voice_rate || 1.0}"
                                       oninput="document.getElementById('val-rate').innerText = this.value"
                                       class="w-full accent-pink-500" />
                            </div>
                            <div>
                                <label class="block text-[11px] mb-1">Độ cao bổng (Pitch): <span id="val-pitch">${l.voice_pitch || 1.1}</span></label>
                                <input type="range" id="lover-voice-pitch" min="0.8" max="1.6" step="0.1" value="${l.voice_pitch || 1.1}"
                                       oninput="document.getElementById('val-pitch').innerText = this.value"
                                       class="w-full accent-pink-500" />
                            </div>
                        </div>
                        <button type="button" onclick="testVoice()" class="text-xs px-3 py-1.5 rounded-xl glass-pill hover:bg-pink-100 text-pink-500">
                            🔊 Nghe thử giọng nói
                        </button>
                    </div>

                    <div class="pt-2">
                        <button type="submit" class="w-full py-3.5 rounded-2xl btn-romantic text-sm font-bold shadow-xl hover:scale-[1.01] transition">
                            💾 Lưu thông tin người yêu ảo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function selectPresetAvatar(url) {
    const input = document.getElementById('lover-avatar');
    const preview = document.getElementById('preview-avatar');
    if (input) input.value = url;
    if (preview) preview.src = url;
}

function appendPersonality(trait) {
    const el = document.getElementById('lover-personality');
    if (el) {
        if (!el.value.includes(trait)) {
            el.value = el.value ? `${el.value}, ${trait}` : trait;
        }
    }
}

function testVoice() {
    const rate = parseFloat(document.getElementById('lover-voice-rate')?.value || 1.0);
    const pitch = parseFloat(document.getElementById('lover-voice-pitch')?.value || 1.1);
    const text = 'Chào anh yêu! Giọng nói này của em đã đủ ấm áp và ngọt ngào chưa anh?';
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = rate;
    u.pitch = pitch;
    window.speechSynthesis.speak(u);
}

async function handleSaveLover(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('lover-name').value.trim(),
        gender: document.getElementById('lover-gender').value,
        age: parseInt(document.getElementById('lover-age').value) || 21,
        avatar_url: document.getElementById('lover-avatar').value.trim(),
        pronouns_ai: document.getElementById('lover-pronouns-ai').value.trim(),
        pronouns_user: document.getElementById('lover-pronouns-user').value.trim(),
        personality: document.getElementById('lover-personality').value.trim(),
        style: document.getElementById('lover-style').value.trim(),
        hobbies: document.getElementById('lover-hobbies').value.trim(),
        habits: document.getElementById('lover-habits').value.trim(),
        dislikes: document.getElementById('lover-dislikes').value.trim(),
        voice_rate: parseFloat(document.getElementById('lover-voice-rate')?.value || 1.0),
        voice_pitch: parseFloat(document.getElementById('lover-voice-pitch')?.value || 1.1)
    };

    try {
        const res = await api('/api/lover', { method: 'POST', body: payload });
        State.lover = res.lover;
        showToast('Đã lưu thông tin người yêu thành công! 💕', 'success');
        switchTab('chat');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ----------------------------------------------------
// 4. LOVE DIARY & MEMORIES VIEW
// ----------------------------------------------------
function renderDiaryView() {
    const l = State.lover;
    const days = l?.first_met_date ? calculateDaysTogether(l.first_met_date) : 1;

    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <!-- Love Counter Banner -->
            <div class="p-6 rounded-3xl btn-romantic text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="text-center sm:text-left">
                    <span class="text-xs font-semibold bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider">Hành trình tình yêu</span>
                    <h3 class="serif-font text-2xl sm:text-3xl font-bold mt-2">Chúng mình đã bên nhau</h3>
                    <p class="text-xs text-white/80 mt-1">Bắt đầu từ ngày ${l?.first_met_date || 'ngày đầu tiên'}</p>
                </div>
                <div class="text-center bg-white/20 px-6 py-3 rounded-2xl backdrop-blur-md">
                    <span class="text-4xl font-extrabold">${days}</span>
                    <span class="text-xs block font-medium uppercase tracking-wider">Ngày trọn vẹn</span>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <span>📖</span>
                    <span>Nhật ký & Album kỷ niệm</span>
                </h3>
                <div class="flex gap-2">
                    <button onclick="promptNewDiary()" class="px-3.5 py-2 rounded-xl btn-romantic text-xs font-semibold flex items-center gap-1.5 shadow">
                        <span>✍️</span> <span>Viết nhật ký</span>
                    </button>
                    <button onclick="promptNewPhoto()" class="px-3.5 py-2 rounded-xl glass-panel hover:bg-white/60 text-xs font-semibold flex items-center gap-1.5 shadow">
                        <span>📷</span> <span>Thêm ảnh</span>
                    </button>
                </div>
            </div>

            <!-- Diary Entries Grid -->
            <div class="space-y-3.5">
                ${State.diaries.length === 0 ? `
                    <div class="p-6 text-center text-muted glass-panel rounded-2xl">
                        Chưa có trang nhật ký nào. Hãy viết kỷ niệm đầu tiên của hai đứa nhé! 💕
                    </div>
                ` : State.diaries.map(d => `
                    <div class="p-4 rounded-2xl glass-panel border border-white/30 flex flex-col md:flex-row gap-4 relative group">
                        ${d.photo_url ? `
                            <img src="${d.photo_url}" class="w-full md:w-36 h-32 object-cover rounded-xl shadow" />
                        ` : ''}
                        <div class="flex-1">
                            <div class="flex items-center justify-between">
                                <h4 class="font-bold text-base text-pink-600 dark:text-pink-300">${escapeHtml(d.title)}</h4>
                                <span class="text-[11px] text-muted">${d.entry_date} • ${d.mood}</span>
                            </div>
                            <p class="text-xs text-gray-700 dark:text-gray-300 mt-2 leading-relaxed whitespace-pre-wrap">${escapeHtml(d.content)}</p>
                        </div>
                        <button onclick="deleteDiary(${d.id})" class="absolute top-3 right-3 text-xs text-rose-500 opacity-0 group-hover:opacity-100 transition p-1 hover:bg-rose-50 rounded">
                            🗑️
                        </button>
                    </div>
                `).join('')}
            </div>

            <!-- Photo Album Section -->
            <div>
                <h4 class="font-bold text-base mb-3 flex items-center gap-2">
                    <span>🖼️</span> <span>Album ảnh tình yêu</span>
                </h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    ${State.photos.map(p => `
                        <div class="rounded-2xl overflow-hidden glass-panel border border-white/30 group relative shadow">
                            <img src="${p.image_url}" class="w-full h-32 object-cover group-hover:scale-105 transition duration-300" />
                            <div class="p-2 text-[11px] truncate font-medium">${escapeHtml(p.caption)}</div>
                            <button onclick="deletePhoto(${p.id})" class="absolute top-2 right-2 text-xs bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition">
                                ✕
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

async function promptNewDiary() {
    const title = prompt('Tiêu đề nhật ký (ví dụ: Ngày chúng mình dạo phố):');
    if (!title) return;
    const content = prompt('Nội dung kỷ niệm:');
    if (!content) return;
    const mood = prompt('Cảm xúc hôm nay (ví dụ: Hạnh phúc, Ngọt ngào, Bồi hồi):') || 'Hạnh phúc';
    const photo_url = prompt('Link ảnh kèm theo (tùy chọn):') || '';

    try {
        await api('/api/diary', {
            method: 'POST',
            body: { lover_id: State.lover?.id, title, content, mood, photo_url }
        });
        showToast('Đã lưu trang nhật ký mới! ✨', 'success');
        loadDiaries();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function promptNewPhoto() {
    const url = prompt('Dán link ảnh kỷ niệm:');
    if (!url) return;
    const caption = prompt('Chú thích cho bức ảnh:') || 'Kỷ niệm tình yêu';
    try {
        await api('/api/album', {
            method: 'POST',
            body: { lover_id: State.lover?.id, image_url: url, caption }
        });
        showToast('Đã thêm ảnh vào album! 💕', 'success');
        loadPhotos();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteDiary(id) {
    if (!confirm('Xóa trang nhật ký này?')) return;
    try {
        await api(`/api/diary/${id}`, { method: 'DELETE' });
        loadDiaries();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deletePhoto(id) {
    if (!confirm('Xóa ảnh này?')) return;
    try {
        await api(`/api/album/${id}`, { method: 'DELETE' });
        loadPhotos();
    } catch (e) { showToast(e.message, 'error'); }
}

// ----------------------------------------------------
// 5. LONG-TERM MEMORIES & EMOTION VIEW
// ----------------------------------------------------
function renderMemoriesView() {
    const l = State.lover;
    let emo = { mood: 'happy', affection: 90, jealousy: 10, energy: 85 };
    try {
        if (l?.emotion_state) emo = JSON.parse(l.emotion_state);
    } catch (e) {}

    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <!-- Header & Emotion Radar -->
            <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-xl font-bold flex items-center gap-2">
                            <span>🧠</span>
                            <span>Trí Nhớ Dài Hạn & Cảm Xúc AI</span>
                        </h2>
                        <p class="text-xs text-muted mt-1">
                            Hệ thống ghi nhớ các thông tin quan trọng (sinh nhật, sở thích, lời hứa) để AI không bao giờ quên và phản hồi tự nhiên nhất.
                        </p>
                    </div>
                    <button onclick="promptNewMemory()" class="px-4 py-2 rounded-xl btn-romantic text-xs font-bold shadow">
                        + Thêm ký ức
                    </button>
                </div>

                <!-- Emotion Status Meters -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div class="p-3 rounded-2xl glass-panel border border-pink-200/40 text-center">
                        <span class="text-xs text-muted">Trạng thái tâm trạng</span>
                        <h4 class="font-bold text-sm text-pink-600 capitalize mt-1">${emo.mood || 'Hạnh phúc'} ✨</h4>
                    </div>
                    <div class="p-3 rounded-2xl glass-panel border border-pink-200/40 text-center">
                        <span class="text-xs text-muted">Mức độ yêu thương</span>
                        <h4 class="font-bold text-sm text-pink-600 mt-1">${emo.affection || 90}% 💕</h4>
                    </div>
                    <div class="p-3 rounded-2xl glass-panel border border-pink-200/40 text-center">
                        <span class="text-xs text-muted">Mức độ giận dỗi / ghen</span>
                        <h4 class="font-bold text-sm text-purple-600 mt-1">${emo.jealousy || 10}% 😤</h4>
                    </div>
                    <div class="p-3 rounded-2xl glass-panel border border-pink-200/40 text-center">
                        <span class="text-xs text-muted">Năng lượng trò chuyện</span>
                        <h4 class="font-bold text-sm text-emerald-600 mt-1">${emo.energy || 85}% ⚡</h4>
                    </div>
                </div>
            </div>

            <!-- Memories List -->
            <div class="space-y-3">
                <h3 class="font-bold text-sm text-gray-700 dark:text-gray-300">Danh sách ký ức đã lưu (${State.memories.length})</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${State.memories.map(m => `
                        <div class="p-3.5 rounded-2xl glass-panel border border-white/40 dark:border-white/10 flex items-start justify-between gap-3 group">
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 font-semibold uppercase text-[10px]">
                                        ${m.category}
                                    </span>
                                    <span class="text-amber-500 text-xs">${'★'.repeat(m.importance || 3)}</span>
                                </div>
                                <h4 class="font-bold text-sm mt-1 text-gray-800 dark:text-gray-200">${escapeHtml(m.key_fact)}</h4>
                                ${m.detail ? `<p class="text-xs text-muted mt-1">${escapeHtml(m.detail)}</p>` : ''}
                            </div>
                            <button onclick="deleteMemory(${m.id})" class="text-xs text-rose-500 opacity-0 group-hover:opacity-100 hover:bg-rose-50 p-1.5 rounded transition">
                                🗑️
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

async function promptNewMemory() {
    const key_fact = prompt('Thông tin quan trọng cần AI ghi nhớ (ví dụ: Anh thích ăn bún bò Huế):');
    if (!key_fact) return;
    const detail = prompt('Chi tiết bổ sung (tùy chọn):') || '';
    const category = prompt('Danh mục (fact / preference / promise / important_date):') || 'preference';

    try {
        await api('/api/memories', {
            method: 'POST',
            body: { lover_id: State.lover?.id, key_fact, detail, category, importance: 4 }
        });
        showToast('Đã lưu ký ức mới vào bộ nhớ dài hạn!', 'success');
        loadMemories();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteMemory(id) {
    if (!confirm('Xóa ký ức này khỏi bộ nhớ của AI?')) return;
    try {
        await api(`/api/memories/${id}`, { method: 'DELETE' });
        loadMemories();
    } catch (e) { showToast(e.message, 'error'); }
}

// ----------------------------------------------------
// 6. MESSENGER INTEGRATION & SANDBOX VIEW
// ----------------------------------------------------
function renderMessengerView() {
    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
                <div class="flex items-center gap-2">
                    <span class="text-2xl">⚡</span>
                    <div>
                        <h2 class="text-xl font-bold">Tích Hợp Facebook Messenger</h2>
                        <p class="text-xs text-muted mt-0.5">
                            Kết nối thông qua Messenger Platform API chính thức của Meta hoặc kiểm thử ngay với bộ giả lập Webhook Sandbox.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Integration Credentials & Webhook URLs -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-3">
                    <h4 class="font-bold text-sm text-pink-600 dark:text-pink-300">Thông tin cấu hình Webhook (Meta Developer)</h4>
                    
                    <div>
                        <label class="block text-[11px] font-semibold text-muted mb-1">Callback URL (Webhook Endpoint):</label>
                        <div class="flex gap-2">
                            <input id="meta-webhook-url" readonly value="${window.location.origin}/api/messenger/webhook"
                                   class="flex-1 px-3 py-1.5 text-xs rounded-xl bg-white/50 dark:bg-black/30 border border-white/40 font-mono" />
                            <button onclick="copyToClipboard('meta-webhook-url')" class="px-3 py-1.5 rounded-xl glass-pill text-xs font-semibold hover:bg-pink-100">
                                Copy
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="block text-[11px] font-semibold text-muted mb-1">Verify Token:</label>
                        <div class="flex gap-2">
                            <input id="meta-verify-token" readonly value="virtual_ai_lover_verify_2026"
                                   class="flex-1 px-3 py-1.5 text-xs rounded-xl bg-white/50 dark:bg-black/30 border border-white/40 font-mono" />
                            <button onclick="copyToClipboard('meta-verify-token')" class="px-3 py-1.5 rounded-xl glass-pill text-xs font-semibold hover:bg-pink-100">
                                Copy
                            </button>
                        </div>
                    </div>

                    <div class="pt-2">
                        <span class="text-[11px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                            ● Webhook Endpoint sẵn sàng nhận GET/POST
                        </span>
                    </div>
                </div>

                <!-- Token input form -->
                <form onsubmit="handleSaveMessengerConfig(event)" class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-3">
                    <h4 class="font-bold text-sm text-purple-600 dark:text-purple-300">Thông tin xác thực Meta Page</h4>
                    <div>
                        <label class="block text-[11px] font-semibold mb-1">Page Access Token:</label>
                        <input type="password" id="meta-page-token" placeholder="EAA..."
                               class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-[11px] font-semibold mb-1">App Secret:</label>
                        <input type="password" id="meta-app-secret" placeholder="Mã bí mật ứng dụng Meta..."
                               class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <button type="submit" class="w-full py-2 rounded-xl btn-romantic text-xs font-bold shadow">
                        💾 Lưu cấu hình Messenger
                    </button>
                </form>
            </div>

            <!-- Messenger Simulator Sandbox -->
            <div class="p-5 rounded-3xl glass-panel border border-pink-300/60 dark:border-pink-800/60 space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-bold text-base flex items-center gap-2">
                            <span>📱</span>
                            <span>Bộ Giả Lập Messenger Sandbox</span>
                        </h3>
                        <p class="text-xs text-muted">Thử nghiệm gửi tin nhắn từ phía Facebook Messenger để kiểm tra khả năng phản hồi và đồng bộ hội thoại.</p>
                    </div>
                    <span class="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Demo Sandbox</span>
                </div>

                <div class="flex gap-2">
                    <input id="sim-msg-input" type="text" placeholder="Nhập tin nhắn giả lập từ Messenger (Ví dụ: Em ơi anh nhớ em)..."
                           class="flex-1 px-4 py-2.5 text-sm rounded-2xl bg-white/80 dark:bg-black/40 border border-pink-200/50 focus:outline-none focus:ring-1 focus:ring-pink-400" />
                    <button onclick="handleSimulateMessenger()" class="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg transition">
                        Gửi giả lập ⚡
                    </button>
                </div>

                <div id="sim-response-box" class="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-dashed border-gray-300 dark:border-gray-700 text-xs min-h-[60px] flex items-center justify-center text-muted">
                    Chưa có sự kiện giả lập nào được gửi đi.
                </div>
            </div>
        </div>
    `;
}

async function handleSimulateMessenger() {
    const input = document.getElementById('sim-msg-input');
    const box = document.getElementById('sim-response-box');
    if (!input || !box) return;
    const text = input.value.trim();
    if (!text) return;

    box.innerHTML = 'Đang gửi sự kiện Webhook Meta tới backend...';
    try {
        const res = await api('/api/messenger/simulate', {
            method: 'POST',
            body: { text, sender_id: 'fb_user_demo_888' }
        });
        const reply = res.processed?.[0]?.ai_reply || 'Đã xử lý';
        box.innerHTML = `
            <div class="w-full space-y-1 text-left">
                <p class="font-semibold text-blue-600">✓ Webhook nhận tin thành công:</p>
                <p class="text-gray-700 dark:text-gray-300">Tin nhắn người dùng: <strong>"${escapeHtml(text)}"</strong></p>
                <p class="text-pink-600 dark:text-pink-300 font-medium">Người yêu AI phản hồi: <strong>"${escapeHtml(reply)}"</strong></p>
                <p class="text-[10px] text-muted">Đồng bộ tự động vào lịch sử trò chuyện trên website!</p>
            </div>
        `;
        input.value = '';
        showToast('Giả lập Messenger thành công!', 'success');
    } catch (e) {
        box.innerHTML = `<span class="text-rose-500">Lỗi: ${escapeHtml(e.message)}</span>`;
    }
}

async function handleSaveMessengerConfig(e) {
    e.preventDefault();
    const pageToken = document.getElementById('meta-page-token').value.trim();
    const appSecret = document.getElementById('meta-app-secret').value.trim();
    try {
        await api('/api/messenger/config', {
            method: 'POST',
            body: { page_access_token: pageToken, app_secret: appSecret }
        });
        showToast('Đã lưu cấu hình Messenger thành công!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    navigator.clipboard.writeText(el.value);
    showToast('Đã sao chép vào bộ nhớ tạm!', 'success');
}

// ----------------------------------------------------
// 7. SETTINGS VIEW
// ----------------------------------------------------
function renderSettingsView() {
    const l = State.lover;
    const u = State.user;

    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <span>⚙️</span>
                    <span>Trung Tâm Cài Đặt Hệ Thống</span>
                </h2>
                <p class="text-xs text-muted mt-0.5">Quản lý lịch trình nhắn tin chủ động, thông báo và dữ liệu cá nhân.</p>
            </div>

            <!-- Proactive Messaging Scheduler Settings -->
            <div class="p-5 rounded-3xl glass-panel border border-pink-200/40 space-y-4">
                <h3 class="font-bold text-sm text-pink-600 dark:text-pink-300 flex items-center gap-2">
                    <span>⏰</span> <span>Lịch Trình AI Chủ Động Nhắn Tin Hỏi Thăm</span>
                </h3>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="p-3.5 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/30 space-y-2">
                        <label class="flex items-center gap-2 text-xs font-semibold">
                            <input type="checkbox" id="set-morning" ${l?.enable_morning_msg ? 'checked' : ''} class="accent-pink-500 rounded" />
                            <span>Tự động chào buổi sáng</span>
                        </label>
                        <input type="time" id="set-morning-time" value="${l?.morning_greeting_time || '07:30'}"
                               class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/80 dark:bg-black/30 border border-pink-200/50" />
                    </div>

                    <div class="p-3.5 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/30 space-y-2">
                        <label class="flex items-center gap-2 text-xs font-semibold">
                            <input type="checkbox" id="set-night" ${l?.enable_night_msg ? 'checked' : ''} class="accent-pink-500 rounded" />
                            <span>Tự động chúc ngủ ngon</span>
                        </label>
                        <input type="time" id="set-night-time" value="${l?.night_greeting_time || '22:30'}"
                               class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/80 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                </div>

                <div>
                    <label class="flex items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" id="set-random-care" ${l?.enable_random_care ? 'checked' : ''} class="accent-pink-500 rounded" />
                        <span>Chủ động gửi lời nhắc uống nước, ăn cơm và quan tâm bất ngờ trong ngày</span>
                    </label>
                </div>

                <button onclick="saveScheduleSettings()" class="px-5 py-2.5 rounded-xl btn-romantic text-xs font-bold shadow">
                    💾 Cập nhật lịch trình nhắn tin
                </button>
            </div>

            <!-- User Profile Settings -->
            <div class="p-5 rounded-3xl glass-panel border border-pink-200/40 space-y-4">
                <h3 class="font-bold text-sm text-purple-600 dark:text-purple-300">Thông tin cá nhân của bạn</h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-semibold mb-1">Tên bạn</label>
                        <input type="text" id="set-user-name" value="${u?.display_name || ''}" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Ngày sinh nhật</label>
                        <input type="date" id="set-user-bday" value="${u?.birthday || ''}" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Nghề nghiệp / Ngành học</label>
                        <input type="text" id="set-user-job" value="${u?.job || ''}" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                </div>
                <button onclick="saveUserProfile()" class="px-5 py-2 rounded-xl btn-romantic text-xs font-bold shadow">
                    Lưu thông tin cá nhân
                </button>
            </div>

            <!-- Danger Zone -->
            <div class="p-5 rounded-3xl glass-panel border border-rose-300/50 space-y-3">
                <h3 class="font-bold text-sm text-rose-600">Quản lý dữ liệu an toàn</h3>
                <div class="flex flex-wrap gap-3">
                    <button onclick="clearChatHistory()" class="px-4 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-semibold">
                        Xóa toàn bộ lịch sử chat
                    </button>
                    <button onclick="exportChatHistory()" class="px-4 py-2 rounded-xl glass-pill hover:bg-white/60 text-xs font-semibold">
                        Tải về lịch sử trò chuyện (.txt)
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function saveScheduleSettings() {
    const payload = {
        enable_morning_msg: document.getElementById('set-morning').checked,
        morning_greeting_time: document.getElementById('set-morning-time').value,
        enable_night_msg: document.getElementById('set-night').checked,
        night_greeting_time: document.getElementById('set-night-time').value,
        enable_random_care: document.getElementById('set-random-care').checked
    };
    try {
        const res = await api('/api/lover', { method: 'POST', body: payload });
        State.lover = res.lover;
        showToast('Đã lưu lịch trình nhắn tin chủ động!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

async function saveUserProfile() {
    const payload = {
        user_display_name: document.getElementById('set-user-name').value.trim(),
        user_birthday: document.getElementById('set-user-bday').value,
        user_job: document.getElementById('set-user-job').value.trim()
    };
    try {
        await api('/api/lover', { method: 'POST', body: payload });
        State.user.display_name = payload.user_display_name;
        State.user.birthday = payload.user_birthday;
        State.user.job = payload.user_job;
        showToast('Đã cập nhật thông tin cá nhân!', 'success');
        renderApp();
    } catch (e) { showToast(e.message, 'error'); }
}

function exportChatHistory() {
    if (State.messages.length === 0) {
        showToast('Chưa có tin nhắn để xuất', 'info');
        return;
    }
    const lines = State.messages.map(m => `[${m.created_at}] ${m.sender === 'user' ? 'Bạn' : State.lover?.name}: ${m.content}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich_su_tinh_yeu_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống lịch sử trò chuyện!', 'success');
}

// ----------------------------------------------------
// 8. ADMIN DASHBOARD VIEW
// ----------------------------------------------------
function renderAdminView() {
    const s = State.adminStats?.stats || { users: 0, lovers: 0, messages: 0, voice_calls: 0, memories: 0, diaries: 0 };
    const users = State.adminStats?.users || [];
    const cfg = State.adminSettings || {};

    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4 flex items-center justify-between">
                <div>
                    <h2 class="text-xl font-bold flex items-center gap-2">
                        <span>🛡️</span>
                        <span>Trang Quản Trị Hệ Thống (Admin Control Panel)</span>
                    </h2>
                    <p class="text-xs text-muted mt-0.5">Theo dõi hoạt động, quản lý người dùng, cấu hình API AI và kiểm soát vận hành.</p>
                </div>
                <span class="text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-700 font-bold">Admin Zone</span>
            </div>

            <!-- Stats Overview Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div class="p-4 rounded-2xl glass-panel text-center border border-pink-200/40">
                    <span class="text-xs text-muted">Người dùng</span>
                    <h3 class="text-2xl font-black text-pink-600 mt-1">${s.users}</h3>
                </div>
                <div class="p-4 rounded-2xl glass-panel text-center border border-pink-200/40">
                    <span class="text-xs text-muted">Nhân vật AI</span>
                    <h3 class="text-2xl font-black text-purple-600 mt-1">${s.lovers}</h3>
                </div>
                <div class="p-4 rounded-2xl glass-panel text-center border border-pink-200/40">
                    <span class="text-xs text-muted">Tin nhắn</span>
                    <h3 class="text-2xl font-black text-blue-600 mt-1">${s.messages}</h3>
                </div>
                <div class="p-4 rounded-2xl glass-panel text-center border border-pink-200/40">
                    <span class="text-xs text-muted">Cuộc gọi thoại</span>
                    <h3 class="text-2xl font-black text-emerald-600 mt-1">${s.voice_calls}</h3>
                </div>
                <div class="p-4 rounded-2xl glass-panel text-center border border-pink-200/40">
                    <span class="text-xs text-muted">Ký ức lưu trữ</span>
                    <h3 class="text-2xl font-black text-amber-600 mt-1">${s.memories}</h3>
                </div>
                <div class="p-4 rounded-2xl glass-panel text-center border border-pink-200/40">
                    <span class="text-xs text-muted">Trang nhật ký</span>
                    <h3 class="text-2xl font-black text-rose-600 mt-1">${s.diaries}</h3>
                </div>
            </div>

            <!-- AI API & System Prompts Configuration -->
            <form onsubmit="handleSaveAdminSettings(event)" class="p-5 rounded-3xl glass-panel border border-pink-200/40 space-y-4">
                <h3 class="font-bold text-sm text-pink-600 dark:text-pink-300">Cấu hình Mô hình Trí tuệ Nhân tạo (AI LLM Provider)</h3>
                
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-semibold mb-1">Nhà cung cấp AI:</label>
                        <select id="cfg-provider" class="w-full px-3 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50">
                            <option value="gemini" ${cfg.ai_provider === 'gemini' ? 'selected' : ''}>Google Gemini API</option>
                            <option value="openai" ${cfg.ai_provider === 'openai' ? 'selected' : ''}>OpenAI Compatible</option>
                            <option value="mock" ${cfg.ai_provider === 'mock' ? 'selected' : ''}>Chế độ Giả lập Tinh vi (Offline)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold mb-1">Google Gemini API Key:</label>
                        <input type="password" id="cfg-gemini-key" value="${cfg.gemini_api_key || ''}" placeholder="AIzaSy..."
                               class="w-full px-3 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>

                    <div>
                        <label class="block text-xs font-semibold mb-1">Gemini Model:</label>
                        <input type="text" id="cfg-gemini-model" value="${cfg.gemini_model || 'gemini-1.5-flash'}"
                               class="w-full px-3 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-semibold mb-1">System Prompt Nền Tảng (Base Prompt):</label>
                    <textarea id="cfg-prompt" rows="3" class="w-full px-3 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50">${cfg.system_prompt_base || ''}</textarea>
                </div>

                <button type="submit" class="px-6 py-2.5 rounded-xl btn-romantic text-xs font-bold shadow">
                    💾 Lưu cấu hình AI & Hệ thống
                </button>
            </form>

            <!-- User Management Table -->
            <div class="space-y-3">
                <h3 class="font-bold text-sm text-gray-700 dark:text-gray-300">Danh sách người dùng hệ thống</h3>
                <div class="overflow-x-auto rounded-2xl border border-white/40 dark:border-white/10 glass-panel">
                    <table class="w-full text-left text-xs">
                        <thead class="bg-pink-100/50 dark:bg-white/5 uppercase text-gray-600 dark:text-gray-400">
                            <tr>
                                <th class="p-3">ID</th>
                                <th class="p-3">Tên hiển thị</th>
                                <th class="p-3">Email</th>
                                <th class="p-3">Vai trò</th>
                                <th class="p-3">Ngày tạo</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-pink-100/40 dark:divide-white/5">
                            ${users.map(u => `
                                <tr>
                                    <td class="p-3 font-mono font-bold">${u.id}</td>
                                    <td class="p-3 font-semibold">${escapeHtml(u.display_name)}</td>
                                    <td class="p-3 text-muted">${escapeHtml(u.email)}</td>
                                    <td class="p-3"><span class="px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 font-bold' : 'bg-gray-100 text-gray-700'}">${u.role}</span></td>
                                    <td class="p-3 text-muted">${u.created_at || ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

async function handleSaveAdminSettings(e) {
    e.preventDefault();
    const payload = {
        ai_provider: document.getElementById('cfg-provider').value,
        gemini_api_key: document.getElementById('cfg-gemini-key').value.trim(),
        gemini_model: document.getElementById('cfg-gemini-model').value.trim(),
        system_prompt_base: document.getElementById('cfg-prompt').value.trim()
    };
    try {
        await api('/api/admin/settings', { method: 'POST', body: payload });
        showToast('Đã lưu cấu hình Admin thành công! ✨', 'success');
        loadAdminStats();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ----------------------------------------------------
// 9. AUTH SCREEN (LOGIN & REGISTER)
// ----------------------------------------------------
function renderAuthScreen() {
    return `
        <div class="min-h-screen w-screen flex items-center justify-center p-4 relative overflow-hidden">
            <!-- Ambient romantic blobs -->
            <div class="absolute -top-32 -left-32 w-96 h-96 bg-pink-400/20 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl pointer-events-none"></div>

            <div class="w-full max-w-md glass-panel p-8 rounded-3xl border border-white/50 dark:border-white/10 shadow-2xl relative z-10 space-y-6">
                <!-- Brand Header -->
                <div class="text-center space-y-2">
                    <span class="text-5xl inline-block animate-pulse">💕</span>
                    <h1 class="serif-font text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                        Virtual AI Lover
                    </h1>
                    <p class="text-xs text-muted">Người yêu ảo thông minh, biết quan tâm và luôn bên bạn</p>
                </div>

                <!-- Auth Mode Switcher -->
                <div class="flex rounded-2xl glass-pill p-1">
                    <button id="btn-tab-login" onclick="switchAuthTab('login')" class="flex-1 py-2 text-xs font-bold rounded-xl btn-romantic shadow transition">
                        Đăng nhập
                    </button>
                    <button id="btn-tab-register" onclick="switchAuthTab('register')" class="flex-1 py-2 text-xs font-bold rounded-xl text-gray-600 dark:text-gray-400 transition">
                        Đăng ký
                    </button>
                </div>

                <!-- Login Form -->
                <form id="form-login" onsubmit="handleAuthLogin(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Email</label>
                        <input type="email" id="login-email" required value="demo@lover.ai"
                               class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300">Mật khẩu</label>
                            <button type="button" onclick="handleForgotPassword()" class="text-[11px] text-pink-500 hover:underline">Quên mật khẩu?</button>
                        </div>
                        <input type="password" id="login-password" required value="123456"
                               class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    </div>
                    <button type="submit" class="w-full py-3 rounded-2xl btn-romantic text-sm font-bold shadow-lg hover:scale-[1.01] transition">
                        Đăng nhập vào không gian tình yêu 💕
                    </button>
                    <div class="text-[11px] text-center text-muted">
                        Tài khoản mẫu: <strong>demo@lover.ai</strong> | Mật khẩu: <strong>123456</strong>
                    </div>
                </form>

                <!-- Register Form -->
                <form id="form-register" onsubmit="handleAuthRegister(event)" class="space-y-4 hidden">
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Tên của bạn</label>
                        <input type="text" id="reg-name" required placeholder="Ví dụ: Minh Tuấn"
                               class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Email</label>
                        <input type="email" id="reg-email" required placeholder="tuan@example.com"
                               class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Mật khẩu (ít nhất 6 ký tự)</label>
                        <input type="password" id="reg-password" minlength="6" required placeholder="••••••••"
                               class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50 focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    </div>
                    <button type="submit" class="w-full py-3 rounded-2xl btn-romantic text-sm font-bold shadow-lg hover:scale-[1.01] transition">
                        Tạo tài khoản & Bắt đầu ✨
                    </button>
                </form>
            </div>
        </div>
    `;
}

function switchAuthTab(mode) {
    const btnL = document.getElementById('btn-tab-login');
    const btnR = document.getElementById('btn-tab-register');
    const formL = document.getElementById('form-login');
    const formR = document.getElementById('form-register');

    if (mode === 'login') {
        btnL.className = 'flex-1 py-2 text-xs font-bold rounded-xl btn-romantic shadow transition';
        btnR.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-gray-600 dark:text-gray-400 transition';
        formL.classList.remove('hidden');
        formR.classList.add('hidden');
    } else {
        btnR.className = 'flex-1 py-2 text-xs font-bold rounded-xl btn-romantic shadow transition';
        btnL.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-gray-600 dark:text-gray-400 transition';
        formR.classList.remove('hidden');
        formL.classList.add('hidden');
    }
}

async function handleAuthLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    await login(email, password);
}

async function handleAuthRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    await register(email, password, name);
}

async function handleForgotPassword() {
    const email = prompt('Nhập địa chỉ email của bạn để nhận hướng dẫn khôi phục mật khẩu:');
    if (email && email.trim()) {
        try {
            const res = await api('/api/auth/forgot-password', {
                method: 'POST',
                body: { email: email.trim() }
            });
            alert(res.message);
        } catch (e) {
            alert(e.message);
        }
    }
}

// Utility escape functions
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function escapeForJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

// Run app upon DOM ready
window.addEventListener('DOMContentLoaded', initApp);
