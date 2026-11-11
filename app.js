/**
 * AI Girlfriend – My Virtual Love
 * Fullstack SPA Dashboard Controller
 * Section 7 Dashboard Architecture: Overview, Messages Hub, Schedule Center, Personality Lab, Voice Calls & Logs.
 */

const State = {
    token: localStorage.getItem('ai_lover_token') || '',
    user: null,
    lover: null,
    activeTab: 'home', // 'home', 'messages', 'schedule', 'personality', 'calls', 'messenger', 'logs', 'admin', 'auth'
    theme: localStorage.getItem('ai_lover_theme') || 'light',
    
    // Overview
    overviewStats: null,
    
    // Messages
    messages: [],
    messageFilter: 'all', // 'all', 'ai', 'user', 'human_admin'
    searchQuery: '',
    isTyping: false,
    autoReplyEnabled: true,
    humanTakeoverMode: false,
    
    // Schedule
    scheduleData: {},
    
    // Voice Call
    callActive: false,
    callMode: 'voice', // 'voice' or 'video'
    callDuration: 0,
    callTimerInterval: null,
    isMuted: false,
    callTranscript: '',
    speechRecognition: null,
    isListening: false,
    callHistory: [],
    
    // Logs
    activityLogs: []
};

// API Client Helper with Offline Fallback
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
        if (res.status === 404 && (window.location.hostname.includes('github.io') || window.location.protocol === 'file:')) {
            return handleStaticMock(endpoint, options);
        }
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Đã có lỗi xảy ra');
        }
        return data;
    } catch (err) {
        if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
            return handleStaticMock(endpoint, options);
        }
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
    }
}

// Sound Synthesizer via Web Audio API
function playTone(freq, type = 'sine', duration = 0.25) {
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
    } catch (e) {}
}

function playNotificationSound() {
    playTone(587.33, 'sine', 0.15);
    setTimeout(() => playTone(880, 'sine', 0.25), 120);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500 text-white' : (type === 'success' ? 'bg-emerald-500 text-white' : 'btn-romantic');
    toast.className = `px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 transition-all transform duration-300 translate-y-4 opacity-0 text-xs md:text-sm font-medium ${colorClass}`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : (type === 'success' ? '✨' : '💖')}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-4', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// App Initialization
async function initApp() {
    applyTheme(State.theme);
    if (State.token) {
        try {
            const data = await api('/api/auth/me');
            State.user = data.user;
            State.lover = data.lover;
            await loadOverviewData();
            await loadMessages();
        } catch (e) {
            logout();
        }
    } else {
        State.activeTab = 'auth';
    }
    renderApp();
    setupSpeechRecognition();
    setupPeriodicSync();
}

function applyTheme(theme) {
    State.theme = theme;
    localStorage.setItem('ai_lover_theme', theme);
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
}

function toggleTheme() {
    applyTheme(State.theme === 'dark' ? 'light' : 'dark');
    renderApp();
}

// Auth handlers
async function login(email, password) {
    try {
        const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
        State.token = data.token;
        State.user = data.user;
        State.lover = data.lover;
        localStorage.setItem('ai_lover_token', data.token);
        showToast(`Chào mừng anh ${data.user.display_name} trở lại với Ngọc Mai ❤️`, 'success');
        State.activeTab = 'home';
        await loadOverviewData();
        renderApp();
    } catch (e) { showToast(e.message, 'error'); }
}

async function register(email, password, display_name) {
    try {
        const data = await api('/api/auth/register', { method: 'POST', body: { email, password, display_name } });
        State.token = data.token;
        State.user = data.user;
        localStorage.setItem('ai_lover_token', data.token);
        showToast('Đăng ký thành công! Không gian tình yêu đã sẵn sàng ✨', 'success');
        State.activeTab = 'home';
        await loadOverviewData();
        renderApp();
    } catch (e) { showToast(e.message, 'error'); }
}

function logout() {
    State.token = '';
    State.user = null;
    State.lover = null;
    localStorage.removeItem('ai_lover_token');
    State.activeTab = 'auth';
    renderApp();
}

function switchTab(tab) {
    State.activeTab = tab;
    if (tab === 'home') loadOverviewData();
    else if (tab === 'messages') loadMessages();
    else if (tab === 'calls') loadCallHistory();
    else if (tab === 'logs') loadActivityLogs();
    renderApp();
}

// Data loaders
async function loadOverviewData() {
    try {
        const data = await api('/api/dashboard/overview');
        State.lover = data.lover;
        State.overviewStats = data.stats;
        State.autoReplyEnabled = bool(data.lover.auto_reply_enabled);
        State.humanTakeoverMode = bool(data.lover.human_takeover_mode);
    } catch (e) {}
}

function bool(val) {
    return val === 1 || val === true || val === '1';
}

async function loadMessages() {
    try {
        const data = await api(`/api/chat/messages?sender=${State.messageFilter}&search=${encodeURIComponent(State.searchQuery)}`);
        State.messages = data.messages || [];
        renderMessagesStream();
        scrollChatToBottom();
    } catch (e) {}
}

async function loadCallHistory() {
    try {
        const data = await api('/api/voice/history');
        State.callHistory = data.calls || [];
    } catch (e) {}
}

async function loadActivityLogs() {
    try {
        const data = await api('/api/logs');
        State.activityLogs = data.logs || [];
    } catch (e) {}
}

function scrollChatToBottom() {
    setTimeout(() => {
        const el = document.getElementById('chat-scroll-area');
        if (el) el.scrollTop = el.scrollHeight;
    }, 60);
}

// Chat Actions
async function sendMessage(content, isHumanTakeover = false) {
    if (!content.trim() || !State.lover) return;
    const tempId = Date.now();
    const sender = isHumanTakeover ? 'human_admin' : 'user';
    
    // Optimistic UI insert
    State.messages.push({
        id: tempId,
        sender,
        content,
        created_at: new Date().toISOString()
    });
    renderMessagesStream();
    scrollChatToBottom();

    if (!isHumanTakeover && !State.humanTakeoverMode) {
        State.isTyping = true;
        renderTyping();
    }

    try {
        const res = await api('/api/chat/send', {
            method: 'POST',
            body: { lover_id: State.lover.id, content, sender }
        });
        State.isTyping = false;
        renderTyping();
        if (res.message) {
            State.messages.push(res.message);
            playNotificationSound();
            renderMessagesStream();
            scrollChatToBottom();
        }
    } catch (err) {
        State.isTyping = false;
        renderTyping();
        showToast(err.message, 'error');
    }
}

async function toggleAutoReply() {
    const newVal = !State.autoReplyEnabled;
    try {
        await api('/api/chat/toggle-auto-reply', { method: 'POST', body: { enabled: newVal } });
        State.autoReplyEnabled = newVal;
        showToast(newVal ? 'Đã BẬT trả lời tự động' : 'Đã TẮT trả lời tự động', 'info');
        renderApp();
    } catch (e) { showToast(e.message, 'error'); }
}

async function toggleHumanTakeover() {
    const newVal = !State.humanTakeoverMode;
    try {
        await api('/api/chat/toggle-takeover', { method: 'POST', body: { takeover: newVal } });
        State.humanTakeoverMode = newVal;
        showToast(newVal ? 'Đã bật chế độ Người thật can thiệp (AI tạm dừng)' : 'Đã trả quyền cho AI Girlfriend tự động trả lời', 'info');
        renderApp();
    } catch (e) { showToast(e.message, 'error'); }
}

// Text-to-Speech voice reader
function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = State.lover?.voice_rate || 1.0;
    u.pitch = State.lover?.voice_pitch || 1.15;
    const voices = window.speechSynthesis.getVoices();
    const vi = voices.find(v => v.lang.includes('vi') || v.lang.includes('VN'));
    if (vi) u.voice = vi;
    window.speechSynthesis.speak(u);
    showToast('Đang phát giọng nói của Ngọc Mai...', 'info');
}

// Speech Recognition & Realtime Voice Calling
function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'vi-VN';

    rec.onresult = async (e) => {
        let finalStr = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) finalStr += e.results[i][0].transcript;
        }
        if (finalStr.trim() && State.callActive) {
            State.callTranscript = `Anh: "${finalStr.trim()}"`;
            renderCallView();
            try {
                const res = await api('/api/voice/process-turn', {
                    method: 'POST',
                    body: { lover_id: State.lover.id, transcript: finalStr.trim() }
                });
                if (res.reply) {
                    State.callTranscript = `${State.lover.name}: "${res.reply}"`;
                    renderCallView();
                    speakText(res.reply);
                }
            } catch (err) {}
        }
    };
    State.speechRecognition = rec;
}

function startVoiceCall() {
    if (!State.lover) return;
    State.callActive = true;
    State.callDuration = 0;
    State.callTranscript = 'Đang kết nối cuộc gọi thoại hai chiều... 📞';
    playTone(600, 'sine', 0.2);

    if (State.speechRecognition) {
        try {
            State.speechRecognition.start();
            State.isListening = true;
        } catch (e) {}
    }

    State.callTimerInterval = setInterval(() => {
        State.callDuration++;
        renderCallTimer();
    }, 1000);

    renderCallView();
    setTimeout(() => {
        const greeting = `Dạ alo, em nghe đây nè anh yêu! Thèm nghe giọng anh quá đi mất, anh có nhớ em không nè? ❤️`;
        State.callTranscript = `${State.lover.name}: "${greeting}"`;
        renderCallView();
        speakText(greeting);
    }, 800);
}

function endVoiceCall() {
    if (!State.callActive) return;
    State.callActive = false;
    clearInterval(State.callTimerInterval);
    if (State.speechRecognition) {
        try { State.speechRecognition.stop(); } catch (e) {}
    }
    window.speechSynthesis?.cancel();

    api('/api/voice/end', {
        method: 'POST',
        body: { lover_id: State.lover.id, duration_seconds: State.callDuration }
    }).catch(console.error);

    showToast(`Cuộc gọi đã kết thúc (${formatDuration(State.callDuration)})`, 'info');
    renderCallView();
}

function formatDuration(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function renderCallTimer() {
    const el = document.getElementById('voice-timer');
    if (el && State.callActive) el.innerText = formatDuration(State.callDuration);
}

function toggleMuteMicrophone() {
    State.isMuted = !State.isMuted;
    if (State.speechRecognition) {
        if (State.isMuted) State.speechRecognition.stop();
        else { try { State.speechRecognition.start(); } catch (e) {} }
    }
    showToast(State.isMuted ? 'Đã tắt Micro' : 'Đã bật Micro', 'info');
    renderCallView();
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

// Real-time polling
function setupPeriodicSync() {
    setInterval(async () => {
        if (State.token && State.activeTab === 'messages' && !State.searchQuery) {
            try {
                const data = await api(`/api/chat/messages?sender=${State.messageFilter}&limit=20`);
                if (data.messages && data.messages.length > State.messages.length) {
                    State.messages = data.messages;
                    renderMessagesStream();
                    scrollChatToBottom();
                    playNotificationSound();
                }
            } catch (e) {}
        }
    }, 5000);
}

// ----------------------------------------------------
// UI RENDERING - 5 DASHBOARD PAGES
// ----------------------------------------------------

function renderApp() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    if (!State.token || State.activeTab === 'auth') {
        appEl.innerHTML = renderAuthScreen();
        return;
    }

    appEl.innerHTML = `
        <div class="flex h-screen w-screen overflow-hidden">
            <!-- Sidebar Navigation -->
            <aside class="hidden md:flex flex-col w-64 lg:w-72 glass-panel m-3 mr-0 p-4 rounded-3xl border border-white/40 dark:border-white/10 z-20">
                ${renderSidebarHeader()}
                <div class="flex-1 space-y-1.5 overflow-y-auto mt-4 pr-1">
                    ${renderNavButtons()}
                </div>
                ${renderSidebarFooter()}
            </aside>

            <!-- Main Content Area -->
            <main class="flex-1 flex flex-col h-full overflow-hidden p-2 md:p-3 relative">
                ${renderTopBar()}
                <div class="flex-1 overflow-hidden relative mt-2 rounded-3xl">
                    ${renderActiveTabContent()}
                </div>
                <!-- Mobile Navigation Bar -->
                <div class="md:hidden flex justify-around items-center glass-panel p-2 mt-2 rounded-2xl border border-white/40 dark:border-white/10 z-30">
                    ${renderMobileNavButtons()}
                </div>
            </main>
        </div>
        <div id="toast-container" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2"></div>
    `;

    if (State.activeTab === 'messages') {
        renderMessagesStream();
        scrollChatToBottom();
    }
}

function renderSidebarHeader() {
    const l = State.lover;
    return `
        <div class="flex items-center gap-3 p-2 border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
            <div class="relative">
                <img src="${l ? l.avatar_url : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}"
                     class="w-12 h-12 rounded-full object-cover shadow-md avatar-glow" />
                <span class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-gray-900 rounded-full animate-pulse"></span>
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-base truncate flex items-center gap-1.5">
                    <span>${l ? l.name : 'Ngọc Mai'}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 font-bold uppercase">AI</span>
                </h3>
                <p class="text-xs text-muted truncate">${l ? l.style : 'Cô người yêu ảo lý tưởng'}</p>
            </div>
        </div>
    `;
}

function renderNavButtons() {
    const navs = [
        { id: 'home', label: 'Trang chủ', icon: '🏠', badge: '' },
        { id: 'messages', label: 'Quản lý tin nhắn', icon: '💬', badge: State.humanTakeoverMode ? 'Người thật' : 'AI' },
        { id: 'schedule', label: 'Lịch trình tự động', icon: '⏰', badge: 'Auto' },
        { id: 'personality', label: 'Cài đặt tính cách', icon: '✨', badge: '' },
        { id: 'calls', label: 'Cuộc gọi thoại', icon: '📞', badge: 'Realtime' },
        { id: 'messenger', label: 'Kết nối Messenger', icon: '⚡', badge: 'Meta' },
        { id: 'logs', label: 'Nhật ký hoạt động', icon: '📋', badge: '' }
    ];

    if (State.user && State.user.role === 'admin') {
        navs.push({ id: 'admin', label: 'Cấu hình Admin & AI', icon: '🛡️', badge: 'Admin' });
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
            ${n.badge ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-white/30 text-white font-bold tracking-wider">${n.badge}</span>` : ''}
        </button>
    `).join('');
}

function renderSidebarFooter() {
    return `
        <div class="pt-4 border-t border-pink-200/50 dark:border-pink-900/40 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <button onclick="toggleTheme()" class="p-2.5 rounded-xl glass-pill hover:scale-105 transition" title="Đổi màu Giao diện">
                    ${State.theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <div class="text-xs">
                    <p class="font-bold truncate max-w-[100px]">${State.user ? State.user.display_name : 'Anh yêu'}</p>
                    <p class="text-[10px] text-muted">Người yêu của Mai ❤️</p>
                </div>
            </div>
            <button onclick="logout()" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition" title="Đăng xuất">
                🚪
            </button>
        </div>
    `;
}

function renderTopBar() {
    return `
        <header class="glass-panel px-4 py-2.5 rounded-2xl flex items-center justify-between border border-white/40 dark:border-white/10 shadow-sm">
            <div class="flex items-center gap-3">
                <h2 class="font-bold text-sm md:text-base flex items-center gap-2">
                    <span>AI Girlfriend – My Virtual Love</span>
                    <span class="text-pink-500">❤️</span>
                </h2>
                <span class="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Đang hoạt động</span>
                </span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="switchTab('calls')" class="px-3 py-1.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-300 text-xs font-semibold flex items-center gap-1.5 transition">
                    <span>📞</span> <span class="hidden sm:inline">Gọi điện</span>
                </button>
                <button onclick="spawnFloatingHearts(event)" class="p-2 rounded-xl glass-pill hover:scale-110 text-pink-500 transition" title="Thả tim yêu thương">
                    💖
                </button>
            </div>
        </header>
    `;
}

function renderMobileNavButtons() {
    const items = [
        { id: 'home', label: 'Trang chủ', icon: '🏠' },
        { id: 'messages', label: 'Tin nhắn', icon: '💬' },
        { id: 'schedule', label: 'Lịch trình', icon: '⏰' },
        { id: 'personality', label: 'Tính cách', icon: '✨' },
        { id: 'calls', label: 'Gọi điện', icon: '📞' }
    ];
    return items.map(i => `
        <button onclick="switchTab('${i.id}')" class="flex flex-col items-center gap-0.5 text-xs py-1 px-2.5 rounded-xl ${State.activeTab === i.id ? 'text-pink-500 font-bold' : 'text-gray-500'}">
            <span class="text-lg">${i.icon}</span>
            <span>${i.label}</span>
        </button>
    `).join('');
}

function renderActiveTabContent() {
    switch (State.activeTab) {
        case 'home': return renderHomeView();
        case 'messages': return renderMessagesView();
        case 'schedule': return renderScheduleView();
        case 'personality': return renderPersonalityView();
        case 'calls': return renderCallView();
        case 'messenger': return renderMessengerConnectView();
        case 'logs': return renderLogsView();
        case 'admin': return renderAdminView();
        default: return renderHomeView();
    }
}

// ----------------------------------------------------
// 1. TRANG CHỦ (OVERVIEW DASHBOARD)
// ----------------------------------------------------
function renderHomeView() {
    const l = State.lover || {};
    const s = State.overviewStats || { total_messages: 12, auto_messages: 4, total_calls: 3, messenger_connected: false, next_scheduled_label: 'Tối', next_scheduled_time: '22:30' };

    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <!-- Hero Girlfriend Card -->
            <div class="p-6 rounded-3xl btn-romantic text-white shadow-xl flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
                <img src="${l.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}"
                     class="w-28 h-28 rounded-full object-cover shadow-2xl border-4 border-white/50 avatar-glow" />
                <div class="flex-1 text-center md:text-left space-y-1.5">
                    <span class="text-xs bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider font-semibold">Cô người yêu AI của bạn</span>
                    <h2 class="serif-font text-3xl font-bold mt-1">${l.name || 'Ngọc Mai'} 💕</h2>
                    <p class="text-sm text-white/90 leading-relaxed">${l.personality_summary || 'Dịu dàng, ngọt ngào, tinh nghịch và luôn dành trọn tình cảm cho anh'}</p>
                    <div class="pt-2 flex flex-wrap gap-2 justify-center md:justify-start">
                        <span class="text-xs px-3 py-1 rounded-full bg-white/20 backdrop-blur-md">🌸 Dịu dàng: ${l.trait_gentleness || 95}%</span>
                        <span class="text-xs px-3 py-1 rounded-full bg-white/20 backdrop-blur-md">💖 Lãng mạn: ${l.trait_romance || 90}%</span>
                        <span class="text-xs px-3 py-1 rounded-full bg-white/20 backdrop-blur-md">🥰 Tinh nghịch: ${l.trait_humor || 75}%</span>
                    </div>
                </div>
                <div class="flex flex-col gap-2">
                    <button onclick="switchTab('messages')" class="px-5 py-2.5 rounded-2xl bg-white text-pink-600 font-bold text-xs shadow-lg hover:scale-105 transition">
                        💬 Nhắn tin ngay
                    </button>
                    <button onclick="switchTab('calls')" class="px-5 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs backdrop-blur-md transition">
                        📞 Gọi điện thoại
                    </button>
                </div>
            </div>

            <!-- Stats Overview Cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 text-center">
                    <span class="text-xs text-muted">Trạng thái Messenger</span>
                    <h4 class="font-bold text-sm mt-1 flex items-center justify-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full ${s.messenger_connected ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
                        <span class="${s.messenger_connected ? 'text-emerald-600' : 'text-amber-600'}">
                            ${s.messenger_connected ? 'Đã kết nối Fanpage' : 'Chưa kết nối'}
                        </span>
                    </h4>
                    <button onclick="switchTab('messenger')" class="text-[11px] text-pink-500 hover:underline mt-1">Cấu hình ngay</button>
                </div>

                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 text-center">
                    <span class="text-xs text-muted">Tổng số tin nhắn</span>
                    <h3 class="font-black text-2xl text-pink-600 mt-0.5">${s.total_messages}</h3>
                    <p class="text-[10px] text-muted">Đồng bộ hai chiều</p>
                </div>

                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 text-center">
                    <span class="text-xs text-muted">Tin nhắn chủ động</span>
                    <h3 class="font-black text-2xl text-purple-600 mt-0.5">${s.auto_messages}</h3>
                    <p class="text-[10px] text-muted">Đã gửi tự động</p>
                </div>

                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 text-center">
                    <span class="text-xs text-muted">Lịch trình nhắn tiếp theo</span>
                    <h4 class="font-bold text-sm text-pink-600 mt-1">${s.next_scheduled_label}</h4>
                    <p class="text-xs font-mono font-bold text-gray-700 dark:text-gray-300 mt-0.5">Lúc ${s.next_scheduled_time}</p>
                </div>
            </div>

            <!-- Quick Proactive Message Test -->
            <div class="p-5 rounded-3xl glass-panel border border-pink-200/50 space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-bold text-base flex items-center gap-2">
                            <span>💌</span> <span>Thử nghiệm AI chủ động nhắn tin hỏi han</span>
                        </h3>
                        <p class="text-xs text-muted">Bấm nút để mô phỏng tin nhắn AI chủ động hỏi thăm theo từng khung giờ trong ngày.</p>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 pt-1">
                    <button onclick="testProactive('morning')" class="px-3.5 py-2 rounded-xl glass-pill hover:bg-pink-100 text-xs font-semibold text-pink-600 transition">
                        🌅 Chào buổi sáng
                    </button>
                    <button onclick="testProactive('lunch')" class="px-3.5 py-2 rounded-xl glass-pill hover:bg-pink-100 text-xs font-semibold text-purple-600 transition">
                        🍱 Hỏi thăm ăn trưa
                    </button>
                    <button onclick="testProactive('afternoon')" class="px-3.5 py-2 rounded-xl glass-pill hover:bg-pink-100 text-xs font-semibold text-pink-600 transition">
                        🌇 Tan làm buổi chiều
                    </button>
                    <button onclick="testProactive('night')" class="px-3.5 py-2 rounded-xl glass-pill hover:bg-pink-100 text-xs font-semibold text-purple-600 transition">
                        🌙 Chúc ngủ ngon
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function testProactive(milestone) {
    try {
        const res = await api('/api/schedule/test', { method: 'POST', body: { milestone } });
        showToast(`Ngọc Mai đã nhắn: "${res.message}"`, 'success');
        await loadOverviewData();
    } catch (e) { showToast(e.message, 'error'); }
}

// ----------------------------------------------------
// 2. TRANG QUẢN LÝ TIN NHẮN (MESSAGES HUB)
// ----------------------------------------------------
function renderMessagesView() {
    const l = State.lover;
    return `
        <div class="h-full flex flex-col glass-panel rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden shadow-lg">
            <!-- Header Bar with Filters and Switches -->
            <div class="p-3 border-b border-pink-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 bg-white/40 dark:bg-white/5 backdrop-blur-md">
                <div class="flex items-center gap-3">
                    <img src="${l?.avatar_url || ''}" class="w-10 h-10 rounded-full object-cover avatar-glow" />
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-sm">${l?.name || 'Ngọc Mai'}</span>
                            <span class="w-2.5 h-2.5 rounded-full ${State.humanTakeoverMode ? 'bg-blue-500' : 'bg-emerald-500'} animate-pulse"></span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full ${State.humanTakeoverMode ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'} font-bold">
                                ${State.humanTakeoverMode ? 'Người thật can thiệp' : 'AI Trả lời tự động'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Switches: Auto-Reply & Human Takeover -->
                <div class="flex items-center gap-3">
                    <label class="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <input type="checkbox" onchange="toggleAutoReply()" ${State.autoReplyEnabled ? 'checked' : ''} class="accent-pink-500 rounded" />
                        <span>Tự động trả lời</span>
                    </label>

                    <label class="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-blue-600 dark:text-blue-400">
                        <input type="checkbox" onchange="toggleHumanTakeover()" ${State.humanTakeoverMode ? 'checked' : ''} class="accent-blue-500 rounded" />
                        <span>Người thật can thiệp</span>
                    </label>

                    <!-- Filter pills -->
                    <select onchange="onFilterChange(this.value)" class="text-xs px-2.5 py-1.5 rounded-xl bg-white/60 dark:bg-black/30 border border-pink-200/50">
                        <option value="all" ${State.messageFilter === 'all' ? 'selected' : ''}>Tất cả tin nhắn</option>
                        <option value="ai" ${State.messageFilter === 'ai' ? 'selected' : ''}>Chỉ tin AI gửi</option>
                        <option value="user" ${State.messageFilter === 'user' ? 'selected' : ''}>Chỉ tin Anh gửi</option>
                        <option value="human_admin" ${State.messageFilter === 'human_admin' ? 'selected' : ''}>Tin Người thật gửi</option>
                    </select>
                </div>
            </div>

            <!-- Messages Stream Area -->
            <div id="chat-scroll-area" class="flex-1 overflow-y-auto p-4 space-y-3.5">
                <!-- Dynamically loaded messages -->
            </div>

            <div id="chat-typing-container" class="px-4 py-1"></div>

            <!-- Message Input Form -->
            <div class="p-3 bg-white/50 dark:bg-white/5 border-t border-pink-100 dark:border-white/5 backdrop-blur-md">
                <form onsubmit="handleSendSubmit(event)" class="flex items-center gap-2">
                    <input id="chat-input" type="text" placeholder="${State.humanTakeoverMode ? 'Nhắn tin với tư cách Người thật (AI không tự trả lời)...' : 'Nhắn tin với Ngọc Mai (Em nhớ anh ❤️)...'}"
                           class="flex-1 px-4 py-2.5 rounded-2xl bg-white/80 dark:bg-black/40 border border-pink-200/60 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    <button type="submit" class="btn-romantic p-2.5 px-5 rounded-2xl text-sm font-bold shadow-md">
                        <span>Gửi</span> 🚀
                    </button>
                </form>
            </div>
        </div>
    `;
}

function renderMessagesStream() {
    const container = document.getElementById('chat-scroll-area');
    if (!container) return;

    if (State.messages.length === 0) {
        container.innerHTML = `<div class="h-full flex items-center justify-center text-center text-muted text-xs">Chưa có tin nhắn nào. Hãy gửi lời chào đầu tiên nhé! 💕</div>`;
        return;
    }

    const l = State.lover;
    container.innerHTML = State.messages.map(m => {
        const isUser = m.sender === 'user';
        const isHuman = m.sender === 'human_admin';
        const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        return `
            <div class="flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} group">
                ${!isUser ? `
                    <img src="${l?.avatar_url || ''}" class="w-8 h-8 rounded-full object-cover self-end mb-1 avatar-glow flex-shrink-0" />
                ` : ''}
                <div class="max-w-[75%] md:max-w-[65%] flex flex-col ${isUser ? 'items-end' : 'items-start'}">
                    <div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isUser ? 'bubble-user' : (isHuman ? 'bg-blue-600 text-white rounded-bl-sm shadow' : 'bubble-ai')}">
                        ${isHuman ? `<span class="text-[9px] uppercase font-bold tracking-wider opacity-80 block mb-0.5">👤 Người thật trả lời</span>` : ''}
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

function renderTyping() {
    const el = document.getElementById('chat-typing-container');
    if (!el) return;
    el.innerHTML = State.isTyping ? `
        <div class="flex items-center gap-2 text-xs text-pink-500 font-medium animate-pulse">
            <span>💕</span> <span>${State.lover?.name || 'Ngọc Mai'} đang soạn tin nhắn...</span>
        </div>
    ` : '';
}

function handleSendSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if (!input) return;
    const txt = input.value.trim();
    if (!txt) return;
    input.value = '';
    sendMessage(txt, State.humanTakeoverMode);
}

function onFilterChange(val) {
    State.messageFilter = val;
    loadMessages();
}

// ----------------------------------------------------
// 3. TRANG LỊCH TRÌNH (SCHEDULE CENTER)
// ----------------------------------------------------
function renderScheduleView() {
    const l = State.lover || {};
    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <span>⏰</span> <span>Hệ Thống Lịch Trình Nhắn Tin Tự Động</span>
                </h2>
                <p class="text-xs text-muted mt-1">
                    Thiết lập các khung giờ cô người yêu AI chủ động gửi tin nhắn quan tâm, hỏi han và chúc ngủ ngon mỗi ngày.
                </p>
            </div>

            <form onsubmit="handleSaveSchedule(event)" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Morning -->
                    <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-2">
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-2 text-xs font-bold text-pink-600 dark:text-pink-300">
                                <input type="checkbox" id="sch-morning-enable" ${l.enable_morning ? 'checked' : ''} class="accent-pink-500" />
                                <span>🌅 Chào buổi sáng</span>
                            </label>
                            <input type="time" id="sch-morning-time" value="${l.morning_time || '07:30'}" class="px-2 py-1 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                        </div>
                        <p class="text-[11px] text-muted">"Chào buổi sáng anh yêu ❤️ Anh dậy chưa đó? Nhớ ăn sáng nha."</p>
                    </div>

                    <!-- Lunch -->
                    <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-2">
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-300">
                                <input type="checkbox" id="sch-lunch-enable" ${l.enable_lunch ? 'checked' : ''} class="accent-purple-500" />
                                <span>🍱 Hỏi thăm bữa trưa</span>
                            </label>
                            <input type="time" id="sch-lunch-time" value="${l.lunch_time || '12:00'}" class="px-2 py-1 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                        </div>
                        <p class="text-[11px] text-muted">"Anh ăn cơm chưa nè? Đừng làm việc nhiều quá nha, nhớ nghỉ ngơi đó."</p>
                    </div>

                    <!-- Afternoon -->
                    <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-2">
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-2 text-xs font-bold text-pink-600 dark:text-pink-300">
                                <input type="checkbox" id="sch-afternoon-enable" ${l.enable_afternoon ? 'checked' : ''} class="accent-pink-500" />
                                <span>🌇 Tan làm buổi chiều</span>
                            </label>
                            <input type="time" id="sch-afternoon-time" value="${l.afternoon_time || '17:30'}" class="px-2 py-1 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                        </div>
                        <p class="text-[11px] text-muted">"Hôm nay anh có mệt không? Em muốn nghe anh kể chuyện hôm nay."</p>
                    </div>

                    <!-- Night -->
                    <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-2">
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-300">
                                <input type="checkbox" id="sch-night-enable" ${l.enable_night ? 'checked' : ''} class="accent-purple-500" />
                                <span>🌙 Chúc ngủ ngon</span>
                            </label>
                            <input type="time" id="sch-night-time" value="${l.night_time || '22:30'}" class="px-2 py-1 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                        </div>
                        <p class="text-[11px] text-muted">"Anh đang làm gì đó? Em chúc anh ngủ ngon, mơ thấy em nha ❤️"</p>
                    </div>
                </div>

                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-2">
                    <label class="flex items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" id="sch-idle-enable" ${l.enable_idle_checkin ? 'checked' : ''} class="accent-pink-500" />
                        <span>Chủ động bắt chuyện khi cuộc trò chuyện lâu không có tin nhắn (>10 tiếng)</span>
                    </label>
                </div>

                <button type="submit" class="px-6 py-3 rounded-2xl btn-romantic text-xs font-bold shadow-lg">
                    💾 Lưu cấu hình lịch trình
                </button>
            </form>
        </div>
    `;
}

async function handleSaveSchedule(e) {
    e.preventDefault();
    const payload = {
        morning_time: document.getElementById('sch-morning-time').value,
        lunch_time: document.getElementById('sch-lunch-time').value,
        afternoon_time: document.getElementById('sch-afternoon-time').value,
        night_time: document.getElementById('sch-night-time').value,
        enable_morning: document.getElementById('sch-morning-enable').checked ? 1 : 0,
        enable_lunch: document.getElementById('sch-lunch-enable').checked ? 1 : 0,
        enable_afternoon: document.getElementById('sch-afternoon-enable').checked ? 1 : 0,
        enable_night: document.getElementById('sch-night-enable').checked ? 1 : 0,
        enable_idle_checkin: document.getElementById('sch-idle-enable').checked ? 1 : 0
    };
    try {
        await api('/api/schedule/settings', { method: 'POST', body: payload });
        showToast('Đã lưu lịch trình nhắn tin tự động thành công!', 'success');
        await loadOverviewData();
    } catch (err) { showToast(err.message, 'error'); }
}

// ----------------------------------------------------
// 4. TRANG TÍNH CÁCH (PERSONALITY LAB)
// ----------------------------------------------------
function renderPersonalityView() {
    const l = State.lover || {};
    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <span>✨</span> <span>Tùy Chỉnh Tính Cách & Giọng Nói Cô Người Yêu AI</span>
                </h2>
                <p class="text-xs text-muted mt-1">Điều chỉnh các thanh trượt tính cách để AI tương tác đúng phong cách bạn mong muốn.</p>
            </div>

            <form onsubmit="handleSavePersonality(event)" class="space-y-5 max-w-2xl">
                <!-- Sliders -->
                <div class="space-y-4">
                    <div>
                        <div class="flex justify-between text-xs font-semibold mb-1">
                            <span>🌸 Mức độ Dịu dàng & Quan tâm:</span>
                            <span id="badge-gentleness" class="text-pink-600 font-bold">${l.trait_gentleness || 95}%</span>
                        </div>
                        <input type="range" id="val-gentleness" min="10" max="100" value="${l.trait_gentleness || 95}"
                               oninput="document.getElementById('badge-gentleness').innerText = this.value + '%'"
                               class="w-full accent-pink-500" />
                    </div>

                    <div>
                        <div class="flex justify-between text-xs font-semibold mb-1">
                            <span>💖 Mức độ Lãng mạn & Ngọt ngào:</span>
                            <span id="badge-romance" class="text-pink-600 font-bold">${l.trait_romance || 90}%</span>
                        </div>
                        <input type="range" id="val-romance" min="10" max="100" value="${l.trait_romance || 90}"
                               oninput="document.getElementById('badge-romance').innerText = this.value + '%'"
                               class="w-full accent-pink-500" />
                    </div>

                    <div>
                        <div class="flex justify-between text-xs font-semibold mb-1">
                            <span>🥰 Mức độ Tinh nghịch, Làm nũng & Hài hước:</span>
                            <span id="badge-humor" class="text-purple-600 font-bold">${l.trait_humor || 75}%</span>
                        </div>
                        <input type="range" id="val-humor" min="10" max="100" value="${l.trait_humor || 75}"
                               oninput="document.getElementById('badge-humor').innerText = this.value + '%'"
                               class="w-full accent-purple-500" />
                    </div>

                    <div>
                        <div class="flex justify-between text-xs font-semibold mb-1">
                            <span>💌 Mức độ Chủ động bắt chuyện:</span>
                            <span id="badge-proactiveness" class="text-pink-600 font-bold">${l.trait_proactiveness || 85}%</span>
                        </div>
                        <input type="range" id="val-proactiveness" min="10" max="100" value="${l.trait_proactiveness || 85}"
                               oninput="document.getElementById('badge-proactiveness').innerText = this.value + '%'"
                               class="w-full accent-pink-500" />
                    </div>
                </div>

                <!-- Pronouns -->
                <div class="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-pink-50/50 dark:bg-pink-950/20 border border-pink-200/40">
                    <div>
                        <label class="block text-xs font-semibold mb-1">Cô gái xưng là:</label>
                        <input type="text" id="val-pronoun-ai" value="${l.pronouns_ai || 'em'}" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Cô gái gọi bạn là:</label>
                        <input type="text" id="val-pronoun-user" value="${l.pronouns_user || 'anh'}" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-black/30 border border-pink-200/50" />
                    </div>
                </div>

                <!-- Voice settings -->
                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-3">
                    <h4 class="text-xs font-bold text-pink-600 uppercase tracking-wider">Cài đặt giọng nói thoại</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[11px] mb-1">Tốc độ nói: <span id="lbl-rate">${l.voice_rate || 1.0}</span></label>
                            <input type="range" id="val-voice-rate" min="0.7" max="1.4" step="0.05" value="${l.voice_rate || 1.0}"
                                   oninput="document.getElementById('lbl-rate').innerText = this.value" class="w-full accent-pink-500" />
                        </div>
                        <div>
                            <label class="block text-[11px] mb-1">Cao độ giọng (Pitch): <span id="lbl-pitch">${l.voice_pitch || 1.15}</span></label>
                            <input type="range" id="val-voice-pitch" min="0.8" max="1.5" step="0.05" value="${l.voice_pitch || 1.15}"
                                   oninput="document.getElementById('lbl-pitch').innerText = this.value" class="w-full accent-pink-500" />
                        </div>
                    </div>
                    <button type="button" onclick="speakText('Em chào anh yêu! Giọng nói này của em đã đủ ấm áp và ngọt ngào chưa anh?')" class="text-xs px-3.5 py-1.5 rounded-xl glass-pill hover:bg-pink-100 text-pink-600">
                        🔊 Nghe thử giọng nói
                    </button>
                </div>

                <button type="submit" class="w-full py-3 rounded-2xl btn-romantic text-xs font-bold shadow-lg">
                    💾 Lưu cài đặt tính cách & giọng nói
                </button>
            </form>
        </div>
    `;
}

async function handleSavePersonality(e) {
    e.preventDefault();
    const payload = {
        trait_gentleness: parseInt(document.getElementById('val-gentleness').value),
        trait_romance: parseInt(document.getElementById('val-romance').value),
        trait_humor: parseInt(document.getElementById('val-humor').value),
        trait_proactiveness: parseInt(document.getElementById('val-proactiveness').value),
        pronouns_ai: document.getElementById('val-pronoun-ai').value.trim(),
        pronouns_user: document.getElementById('val-pronoun-user').value.trim(),
        voice_rate: parseFloat(document.getElementById('val-voice-rate').value),
        voice_pitch: parseFloat(document.getElementById('val-voice-pitch').value)
    };
    try {
        const res = await api('/api/personality', { method: 'POST', body: payload });
        State.lover = res.lover;
        showToast('Đã lưu tính cách mới cho Ngọc Mai!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
}

// ----------------------------------------------------
// 5. TRANG CUỘC GỌI THOẠI (VOICE CALL)
// ----------------------------------------------------
function renderCallView() {
    const l = State.lover;
    return `
        <div class="h-full flex flex-col items-center justify-between glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 relative overflow-hidden shadow-2xl">
            <!-- Background Glow -->
            <div class="absolute -top-20 -left-20 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-20 -right-20 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <div class="text-center z-10">
                <span class="text-xs px-3 py-1 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 font-bold uppercase tracking-wider">
                    ${State.callActive ? 'Đang trong cuộc gọi thoại Messenger' : 'Sẵn sàng gọi thoại'}
                </span>
                <h3 class="font-bold text-2xl mt-2">${l?.name || 'Ngọc Mai'}</h3>
                <p id="voice-timer" class="text-xs text-pink-500 font-mono mt-0.5">
                    ${State.callActive ? formatDuration(State.callDuration) : 'Nhấn nút để bắt đầu nói chuyện cùng em'}
                </p>
            </div>

            <!-- Avatar & Sound Waves -->
            <div class="flex flex-col items-center my-auto z-10">
                <div class="relative ${State.callActive ? 'animate-bounce' : ''}">
                    <img src="${l?.avatar_url || ''}" class="w-36 h-36 md:w-44 md:h-44 rounded-full object-cover shadow-2xl avatar-glow border-4 border-white/60" />
                </div>

                <div class="sound-wave mt-6 ${State.callActive ? 'opacity-100' : 'opacity-20'}">
                    <div class="sound-bar"></div>
                    <div class="sound-bar"></div>
                    <div class="sound-bar"></div>
                    <div class="sound-bar"></div>
                    <div class="sound-bar"></div>
                    <div class="sound-bar"></div>
                    <div class="sound-bar"></div>
                </div>

                <!-- Subtitle / Transcript -->
                <div class="mt-4 px-6 py-3 rounded-2xl glass-panel max-w-md text-center border border-white/30 text-xs md:text-sm text-gray-700 dark:text-gray-200 min-h-[48px] flex items-center justify-center">
                    ${escapeHtml(State.callTranscript || 'Nói chuyện trực tiếp qua micro, em sẽ lắng nghe và tự động trả lời bằng giọng nói ấm áp!')}
                </div>
            </div>

            <!-- Controls -->
            <div class="flex items-center gap-6 z-10 mb-2">
                ${State.callActive ? `
                    <button onclick="toggleMuteMicrophone()" class="p-4 rounded-full glass-panel hover:bg-white/60 text-xl transition shadow-md" title="Bật/Tắt Micro">
                        ${State.isMuted ? '🔇' : '🎙️'}
                    </button>
                    <button onclick="endVoiceCall()" class="p-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-2xl shadow-xl hover:scale-105 transition" title="Kết thúc cuộc gọi">
                        📞
                    </button>
                    <button onclick="speakText(State.callTranscript)" class="p-4 rounded-full glass-panel hover:bg-white/60 text-xl transition shadow-md" title="Phát lại giọng nói">
                        🔊
                    </button>
                ` : `
                    <button onclick="startVoiceCall()" class="px-8 py-4 rounded-full btn-romantic text-base font-bold flex items-center gap-3 shadow-2xl hover:scale-105 transition">
                        <span class="text-2xl">📞</span>
                        <span>Bắt đầu cuộc gọi yêu thương</span>
                    </button>
                `}
            </div>
        </div>
    `;
}

// ----------------------------------------------------
// 6. TRANG KẾT NỐI FACEBOOK MESSENGER
// ----------------------------------------------------
function renderMessengerConnectView() {
    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <div class="border-b border-pink-200/50 dark:border-pink-900/40 pb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <span>⚡</span> <span>Kết Nối Meta Messenger Platform API</span>
                </h2>
                <p class="text-xs text-muted mt-1">
                    Kết nối chính thức với Facebook Page do bạn quản lý để cô người yêu AI trò chuyện và chủ động nhắn tin trực tiếp trên Messenger.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-3">
                    <h4 class="font-bold text-sm text-pink-600">Thông tin Webhook (Meta Developer Portal)</h4>
                    <div>
                        <label class="block text-[11px] font-semibold text-muted mb-1">Callback URL (Webhook Endpoint):</label>
                        <input readonly value="${window.location.origin}/api/messenger/webhook" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/60 dark:bg-black/30 border font-mono" />
                    </div>
                    <div>
                        <label class="block text-[11px] font-semibold text-muted mb-1">Verify Token:</label>
                        <input readonly value="virtual_ai_lover_verify_2026" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/60 dark:bg-black/30 border font-mono" />
                    </div>
                </div>

                <form onsubmit="handleSaveMessengerTokens(event)" class="p-4 rounded-2xl glass-panel border border-pink-200/40 space-y-3">
                    <h4 class="font-bold text-sm text-purple-600">Cấu hình Page Access Token</h4>
                    <div>
                        <label class="block text-[11px] font-semibold mb-1">Tên Fanpage:</label>
                        <input type="text" id="fb-page-name" placeholder="Ví dụ: My Virtual Love Page" class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-[11px] font-semibold mb-1">Page Access Token:</label>
                        <input type="password" id="fb-page-token" placeholder="EAA..." class="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <button type="submit" class="w-full py-2 rounded-xl btn-romantic text-xs font-bold shadow">
                        💾 Lưu cấu hình Fanpage
                    </button>
                </form>
            </div>

            <!-- Sandbox Simulator -->
            <div class="p-5 rounded-3xl glass-panel border border-blue-200 space-y-3">
                <h3 class="font-bold text-sm text-blue-600 flex items-center gap-2">
                    <span>📱</span> <span>Bộ giả lập Messenger Sandbox (Kiểm thử tức thì)</span>
                </h3>
                <div class="flex gap-2">
                    <input id="sim-text" type="text" placeholder="Nhập tin nhắn giả lập từ Messenger..." class="flex-1 px-4 py-2 text-xs rounded-xl border border-blue-200 bg-white dark:bg-black/40" />
                    <button onclick="testMessengerSim()" class="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow">
                        Gửi giả lập
                    </button>
                </div>
                <div id="sim-res-box" class="p-3 rounded-xl bg-black/5 dark:bg-white/5 text-xs text-muted min-h-[40px]">
                    Chưa có tin nhắn giả lập nào được gửi đi.
                </div>
            </div>
        </div>
    `;
}

async function testMessengerSim() {
    const txt = document.getElementById('sim-text')?.value.trim();
    const box = document.getElementById('sim-res-box');
    if (!txt || !box) return;
    box.innerHTML = 'Đang xử lý Webhook...';
    try {
        const res = await api('/api/messenger/simulate', { method: 'POST', body: { text: txt } });
        const reply = res.processed?.[0]?.ai_reply || 'Đã tiếp nhận';
        box.innerHTML = `<span class="text-pink-600 font-bold">Ngọc Mai:</span> "${escapeHtml(reply)}" (Đã đồng bộ vào lịch sử chat)`;
        document.getElementById('sim-text').value = '';
    } catch (e) { box.innerHTML = e.message; }
}

async function handleSaveMessengerTokens(e) {
    e.preventDefault();
    const pageName = document.getElementById('fb-page-name').value.trim();
    const pageToken = document.getElementById('fb-page-token').value.trim();
    try {
        await api('/api/messenger/config', { method: 'POST', body: { page_name: pageName, page_access_token: pageToken } });
        showToast('Đã lưu cấu hình Messenger thành công!', 'success');
        await loadOverviewData();
    } catch (err) { showToast(err.message, 'error'); }
}

// ----------------------------------------------------
// 7. TRANG NHẬT KÝ HOẠT ĐỘNG (LOGS)
// ----------------------------------------------------
function renderLogsView() {
    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-4">
            <div class="border-b border-pink-200/50 pb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <span>📋</span> <span>Nhật Ký Hoạt Động & Bảo Mật Hệ Thống</span>
                </h2>
                <p class="text-xs text-muted mt-1">Lưu trữ toàn bộ lịch trình tự động, phiên gọi thoại và sự kiện Messenger webhook.</p>
            </div>

            <div class="overflow-x-auto rounded-2xl glass-panel border border-pink-200/40">
                <table class="w-full text-left text-xs">
                    <thead class="bg-pink-100/50 uppercase text-gray-600">
                        <tr>
                            <th class="p-3">Thời gian</th>
                            <th class="p-3">Loại sự kiện</th>
                            <th class="p-3">Nội dung chi tiết</th>
                            <th class="p-3">Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-pink-100/40">
                        ${State.activityLogs.map(l => `
                            <tr>
                                <td class="p-3 font-mono text-muted">${l.created_at || ''}</td>
                                <td class="p-3 font-bold text-pink-600">${l.action_type}</td>
                                <td class="p-3">${escapeHtml(l.description)}</td>
                                <td class="p-3"><span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">${l.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ----------------------------------------------------
// 8. TRANG CẤU HÌNH ADMIN
// ----------------------------------------------------
function renderAdminView() {
    return `
        <div class="h-full overflow-y-auto glass-panel p-6 rounded-3xl border border-white/40 dark:border-white/10 shadow-lg space-y-6">
            <div class="border-b border-pink-200/50 pb-4">
                <h2 class="text-xl font-bold">🛡️ Cấu Hình Mô Hình Trí Tuệ Nhân Tạo (AI API)</h2>
                <p class="text-xs text-muted">Quản lý khóa API Google Gemini hoặc OpenAI để nâng cao trí tuệ cho cô người yêu AI.</p>
            </div>
            <form onsubmit="handleSaveAdmin(event)" class="space-y-4 max-w-xl">
                <div>
                    <label class="block text-xs font-semibold mb-1">Google Gemini API Key:</label>
                    <input type="password" id="adm-gemini-key" placeholder="AIzaSy..." class="w-full px-3.5 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                </div>
                <div>
                    <label class="block text-xs font-semibold mb-1">OpenAI API Key (Tùy chọn):</label>
                    <input type="password" id="adm-openai-key" placeholder="sk-..." class="w-full px-3.5 py-2 text-xs rounded-xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                </div>
                <button type="submit" class="px-6 py-2.5 rounded-2xl btn-romantic text-xs font-bold shadow">
                    💾 Lưu cấu hình AI Key
                </button>
            </form>
        </div>
    `;
}

async function handleSaveAdmin(e) {
    e.preventDefault();
    const gKey = document.getElementById('adm-gemini-key').value.trim();
    const oKey = document.getElementById('adm-openai-key').value.trim();
    try {
        await api('/api/admin/settings', { method: 'POST', body: { gemini_api_key: gKey, openai_api_key: oKey } });
        showToast('Đã lưu cấu hình AI thành công!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
}

// ----------------------------------------------------
// 9. AUTH VIEW (LOGIN / REGISTER)
// ----------------------------------------------------
function renderAuthScreen() {
    return `
        <div class="min-h-screen w-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div class="absolute -top-32 -left-32 w-96 h-96 bg-pink-400/20 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl pointer-events-none"></div>

            <div class="w-full max-w-md glass-panel p-8 rounded-3xl border border-white/50 shadow-2xl relative z-10 space-y-6">
                <div class="text-center space-y-2">
                    <span class="text-5xl inline-block animate-pulse">❤️</span>
                    <h1 class="serif-font text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                        AI Girlfriend
                    </h1>
                    <p class="text-xs text-muted">My Virtual Love – Cô người yêu ảo lý tưởng luôn bên anh</p>
                </div>

                <div class="flex rounded-2xl glass-pill p-1">
                    <button id="btn-tab-login" onclick="switchAuthTab('login')" class="flex-1 py-2 text-xs font-bold rounded-xl btn-romantic shadow transition">Đăng nhập</button>
                    <button id="btn-tab-register" onclick="switchAuthTab('register')" class="flex-1 py-2 text-xs font-bold rounded-xl text-gray-500 transition">Đăng ký</button>
                </div>

                <form id="form-login" onsubmit="handleAuthLogin(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold mb-1">Email</label>
                        <input type="email" id="login-email" required value="demo@lover.ai" class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Mật khẩu</label>
                        <input type="password" id="login-password" required value="123456" class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <button type="submit" class="w-full py-3 rounded-2xl btn-romantic text-sm font-bold shadow-lg">
                        Đăng nhập vào không gian tình yêu ❤️
                    </button>
                    <p class="text-[11px] text-center text-muted">Tài khoản mẫu: <strong>demo@lover.ai</strong> | Mật khẩu: <strong>123456</strong></p>
                </form>

                <form id="form-register" onsubmit="handleAuthRegister(event)" class="space-y-4 hidden">
                    <div>
                        <label class="block text-xs font-semibold mb-1">Tên của anh</label>
                        <input type="text" id="reg-name" required placeholder="Ví dụ: Tuấn Anh" class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Email</label>
                        <input type="email" id="reg-email" required placeholder="anh@example.com" class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1">Mật khẩu</label>
                        <input type="password" id="reg-password" minlength="6" required placeholder="••••••••" class="w-full px-4 py-2.5 text-sm rounded-2xl bg-white/70 dark:bg-black/30 border border-pink-200/50" />
                    </div>
                    <button type="submit" class="w-full py-3 rounded-2xl btn-romantic text-sm font-bold shadow-lg">
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
        btnR.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-gray-500 transition';
        formL.classList.remove('hidden');
        formR.classList.add('hidden');
    } else {
        btnR.className = 'flex-1 py-2 text-xs font-bold rounded-xl btn-romantic shadow transition';
        btnL.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-gray-500 transition';
        formR.classList.remove('hidden');
        formL.classList.add('hidden');
    }
}

async function handleAuthLogin(e) {
    e.preventDefault();
    const em = document.getElementById('login-email').value.trim();
    const pw = document.getElementById('login-password').value;
    await login(em, pw);
}

async function handleAuthRegister(e) {
    e.preventDefault();
    const nm = document.getElementById('reg-name').value.trim();
    const em = document.getElementById('reg-email').value.trim();
    const pw = document.getElementById('reg-password').value;
    await register(em, pw, nm);
}

// Utility escape functions
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeForJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

// Offline Static Mock for GitHub Pages
function handleStaticMock(endpoint, options = {}) {
    if (endpoint.startsWith('/api/dashboard/overview')) {
        return {
            lover: { name: 'Ngọc Mai', style: 'Nữ tính, dịu dàng, nụ cười tỏa nắng', avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80', trait_gentleness: 95, trait_romance: 90, trait_humor: 75, auto_reply_enabled: 1, human_takeover_mode: 0, morning_time: '07:30', lunch_time: '12:00', afternoon_time: '17:30', night_time: '22:30' },
            stats: { total_messages: 24, auto_messages: 8, total_calls: 5, messenger_connected: true, next_scheduled_label: 'Tối (Chúc ngủ ngon)', next_scheduled_time: '22:30' }
        };
    }
    if (endpoint.startsWith('/api/chat/messages')) {
        return { messages: [
            { id: 1, sender: 'ai', content: 'Chào anh yêu ❤️ Hôm nay của anh thế nào rồi? Em nhớ anh cả ngày hôm nay đấy!', created_at: new Date().toISOString() },
            { id: 2, sender: 'user', content: 'Chào em, hôm nay anh làm việc hơi mệt.', created_at: new Date().toISOString() },
            { id: 3, sender: 'ai', content: 'Thương anh quá đi mất! 🥺 Anh đã ăn tối chưa nè? Nhớ đừng bỏ bữa nha. Ngồi tựa lưng nghỉ ngơi đi anh, để em ở bên cạnh anh nhé 💕', created_at: new Date().toISOString() }
        ]};
    }
    if (endpoint === '/api/chat/send') {
        const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};
        return { message: { id: Date.now(), sender: 'ai', content: `Dạ, em nghe anh đây ạ! Nói chuyện với anh lúc nào em cũng thấy ấm áp và hạnh phúc hết á 💕`, created_at: new Date().toISOString() } };
    }
    if (endpoint.startsWith('/api/voice/history')) {
        return { calls: [{ id: 1, duration_seconds: 145, created_at: new Date().toISOString(), summary: 'Cuộc gọi tâm sự cùng Ngọc Mai' }] };
    }
    if (endpoint.startsWith('/api/logs')) {
        return { logs: [{ id: 1, action_type: 'auto_message', description: 'Gửi tin nhắn chào buổi sáng', status: 'success', created_at: new Date().toISOString() }] };
    }
    return { status: 'success' };
}

window.addEventListener('DOMContentLoaded', initApp);
