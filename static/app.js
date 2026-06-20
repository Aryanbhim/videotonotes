// Theme Initialization (Apply immediately to prevent page flash)
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
}

// Application State
const state = {
    endpoint: localStorage.getItem('opencode_endpoint') || 'http://127.0.0.1:4096',
    activeVideoId: localStorage.getItem('active_video_id') || '',
    videoData: localStorage.getItem('video_data') ? JSON.parse(localStorage.getItem('video_data')) : null,
    chatHistory: [],
    youtubePlayer: null,
    youtubeApiReady: false,
    activeTab: 'summary',
    typingSessionId: 0
};

// Resolve the API base URL dynamically for local vs public Cloudflare Pages deployment
function getApiBaseUrl() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('trycloudflare.com')) {
        return ''; // relative path for local development and Cloudflare Tunnel
    }
    const cleanDomain = hostname.replace(/^www\./, '');
    return `https://api.${cleanDomain}`;
}

// DOM Elements
const youtubeUrlInput = document.getElementById('youtube-url');
const processForm = document.getElementById('process-form');
const submitBtn = document.getElementById('submit-btn');
const settingsBtn = document.getElementById('settings-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

// Video Player & Placeholders
const videoPlaceholder = document.getElementById('video-placeholder');
const playerContainer = document.getElementById('player-container');
const resizeHandle = document.getElementById('video-resize-handle');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Summary View
const summaryPlaceholder = document.getElementById('summary-placeholder');
const summaryDetails = document.getElementById('summary-details');
const summaryVideoTitle = document.getElementById('summary-video-title');
const summaryExecText = document.getElementById('summary-exec-text');
const chaptersTimeline = document.getElementById('chapters-timeline');

// Takeaways View
const takeawaysPlaceholder = document.getElementById('takeaways-placeholder');
const takeawaysDetails = document.getElementById('takeaways-details');
const takeawaysList = document.getElementById('takeaways-list');

// Transcript View
const transcriptPlaceholder = document.getElementById('transcript-placeholder');
const transcriptDetails = document.getElementById('transcript-details');
const transcriptChunkCount = document.getElementById('transcript-chunk-count');
const transcriptChunksList = document.getElementById('transcript-chunks-list');
const searchTranscriptInput = document.getElementById('search-transcript-input');

// Notes View
const notesTextarea = document.getElementById('notes-textarea');
const downloadPdfBtn = document.getElementById('download-pdf-btn');
const copyNotesBtn = document.getElementById('copy-notes-btn');

// Chat View
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatStatus = document.getElementById('chat-status');
const suggestedQuestionsSection = document.getElementById('suggested-questions');
const suggestionsList = document.getElementById('suggestions-list');

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const endpointInput = document.getElementById('endpoint-input');
const keyStatusMsg = document.getElementById('key-status-msg');
const settingsSave = document.getElementById('settings-save');
const settingsCancel = document.getElementById('settings-cancel');
const closeModalBtn = document.getElementById('close-modal-btn');

const youtubeProxyInput = document.getElementById('youtube-proxy-input');
const youtubeCookiesInput = document.getElementById('youtube-cookies-input');

// --- YouTube Player Lifecycle API ---
window.onYouTubeIframeAPIReady = function() {
    state.youtubeApiReady = true;
};

// Initialize or update the YouTube player
function loadYouTubeVideo(videoId) {
    videoPlaceholder.classList.add('hidden');
    playerContainer.classList.remove('hidden');

    if (state.youtubePlayer && typeof state.youtubePlayer.loadVideoById === 'function') {
        try {
            state.youtubePlayer.loadVideoById(videoId);
            return;
        } catch (e) {
            console.warn("Error reusing player, recreating it...", e);
        }
    }

    // Create a new player
    state.youtubePlayer = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            'playsinline': 1,
            'rel': 0,
            'modestbranding': 1
        },
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
}

// Track and highlight active transcript segment based on playback time
let playbackTrackerInterval = null;

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        startPlaybackTracking();
    } else {
        stopPlaybackTracking();
    }
}

function startPlaybackTracking() {
    if (playbackTrackerInterval) clearInterval(playbackTrackerInterval);
    playbackTrackerInterval = setInterval(() => {
        if (state.youtubePlayer && typeof state.youtubePlayer.getCurrentTime === 'function') {
            const currentSeconds = state.youtubePlayer.getCurrentTime();
            highlightTranscriptChunk(currentSeconds);
        }
    }, 400);
}

function stopPlaybackTracking() {
    if (playbackTrackerInterval) {
        clearInterval(playbackTrackerInterval);
        playbackTrackerInterval = null;
    }
}

function highlightTranscriptChunk(timeSeconds) {
    if (!state.videoData || !state.videoData.chunks) return;
    
    let activeIndex = -1;
    for (let i = 0; i < state.videoData.chunks.length; i++) {
        const chunk = state.videoData.chunks[i];
        if (timeSeconds >= chunk.start && timeSeconds <= chunk.end) {
            activeIndex = i;
            break;
        }
    }
    
    const chunkElements = transcriptChunksList.querySelectorAll('.transcript-chunk-card');
    chunkElements.forEach((el, idx) => {
        if (idx === activeIndex) {
            if (!el.classList.contains('active-playing')) {
                el.classList.add('active-playing');
                // Scroll it gently into view if tab is active
                if (state.activeTab === 'transcript') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        } else {
            el.classList.remove('active-playing');
        }
    });
}

// --- App Navigation and Tab Handling ---
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        state.activeTab = targetTab;
        
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
});

// --- Modal and Settings API Key Handling ---
// --- Modal and Settings API Key Handling ---
function openSettingsModal() {
    endpointInput.value = localStorage.getItem('opencode_endpoint') || 'http://127.0.0.1:4096';
    if (youtubeProxyInput) {
        youtubeProxyInput.value = localStorage.getItem('youtube_proxy') || '';
    }
    if (youtubeCookiesInput) {
        youtubeCookiesInput.value = localStorage.getItem('youtube_cookies') || '';
    }
    keyStatusMsg.className = 'key-status';
    keyStatusMsg.textContent = '';
    settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
    settingsModal.classList.add('hidden');
}

settingsSave.addEventListener('click', () => {
    const endpoint = endpointInput.value.trim() || 'http://127.0.0.1:4096';
    
    localStorage.setItem('opencode_endpoint', endpoint);
    
    if (youtubeProxyInput) {
        localStorage.setItem('youtube_proxy', youtubeProxyInput.value.trim());
    }
    if (youtubeCookiesInput) {
        localStorage.setItem('youtube_cookies', youtubeCookiesInput.value.trim());
    }
    
    state.endpoint = endpoint;
    closeSettingsModal();
});

// Auto-open settings if key is missing on first load
window.addEventListener('DOMContentLoaded', () => {
    // Initialize theme toggle icon
    updateThemeIcon(localStorage.getItem('theme') || 'dark');
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            const theme = isLight ? 'light' : 'dark';
            localStorage.setItem('theme', theme);
            updateThemeIcon(theme);
        });
    }

    lucide.createIcons();
    
    // Load persisted notes
    if (notesTextarea) {
        notesTextarea.value = localStorage.getItem('video_user_notes') || '';
    }
    
    // Clear legacy/cached errors from local storage before rendering
    if (state.videoData && state.videoData.summary && state.videoData.summary.executive_summary) {
        const execSummary = state.videoData.summary.executive_summary;
        if (
            execSummary.includes("OpenCode") || 
            execSummary.includes("Nvidia") || 
            execSummary.includes("LLM API") || 
            execSummary.includes("404 models")
        ) {
            localStorage.removeItem('video_data');
            localStorage.removeItem('active_video_id');
            state.videoData = null;
            state.activeVideoId = '';
        }
    }
    
    // Restore video player and summaries if video was previously loaded
    if (state.videoData && state.activeVideoId) {
        setTimeout(() => {
            loadYouTubeVideo(state.activeVideoId);
            renderVideoData(state.videoData, true, false);
        }, 500); // Give player API script a moment to load
    }
    
    // Listen to clicks on timestamps in chat messages
    if (chatMessages) {
        chatMessages.addEventListener('click', (e) => {
            const timestampEl = e.target.closest('.chat-timestamp');
            if (timestampEl) {
                const seconds = parseFloat(timestampEl.getAttribute('data-seconds'));
                if (!isNaN(seconds) && state.youtubePlayer && typeof state.youtubePlayer.seekTo === 'function') {
                    state.youtubePlayer.seekTo(seconds, true);
                    state.youtubePlayer.playVideo();
                }
            }
        });
    }
    
    // Listen to clicks on inline timestamps in chapters timeline
    if (chaptersTimeline) {
        chaptersTimeline.addEventListener('click', (e) => {
            const timestampEl = e.target.closest('.chat-timestamp');
            if (timestampEl) {
                e.stopPropagation(); // Avoid parent card seeking conflict
                const seconds = parseFloat(timestampEl.getAttribute('data-seconds'));
                if (!isNaN(seconds) && state.youtubePlayer && typeof state.youtubePlayer.seekTo === 'function') {
                    state.youtubePlayer.seekTo(seconds, true);
                    state.youtubePlayer.playVideo();
                }
            }
        });
    }
});


settingsBtn.addEventListener('click', openSettingsModal);
closeModalBtn.addEventListener('click', closeSettingsModal);
settingsCancel.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
});

function updateThemeIcon(theme) {
    if (!themeToggleBtn) return;
    const iconEl = themeToggleBtn.querySelector('i');
    if (iconEl) {
        iconEl.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
        if (window.lucide) {
            lucide.createIcons();
        }
    }
}

// Draggable corner resize handle for video container height and width
if (resizeHandle) {
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    const videoCard = document.querySelector('.video-card');
    const leftPanel = document.querySelector('.left-panel');
    const appMain = document.querySelector('.app-main');

    const onMouseMove = (e) => {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newWidth = startWidth + deltaX;
        let newHeight = startHeight + deltaY;
        
        // Enforce boundary limits (min 200px, max 800px for height)
        if (newHeight < 200) newHeight = 200;
        if (newHeight > 800) newHeight = 800;
        
        // Enforce boundary limits (min 300px, max 1000px for left panel width)
        if (newWidth < 300) newWidth = 300;
        if (newWidth > 1000) newWidth = 1000;
        
        if (videoCard) {
            videoCard.style.height = `${newHeight}px`;
        }
        
        if (appMain) {
            appMain.style.gridTemplateColumns = `${newWidth}px 1fr`;
        }
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Restore pointer events on the iframe so it's interactive again
        if (videoCard) {
            const iframe = videoCard.querySelector('iframe');
            if (iframe) {
                iframe.style.pointerEvents = 'auto';
            }
        }
    };

    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevents cursor text-selection behavior while dragging
        startX = e.clientX;
        startY = e.clientY;
        
        if (videoCard) {
            startHeight = videoCard.offsetHeight;
        }
        if (leftPanel) {
            startWidth = leftPanel.offsetWidth;
        }
        
        // Disable pointer events on the iframe during drag to prevent mouse events hijacking
        if (videoCard) {
            const iframe = videoCard.querySelector('iframe');
            if (iframe) {
                iframe.style.pointerEvents = 'none';
            }
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function getProviderConfig() {
    const endpoint = localStorage.getItem('opencode_endpoint') || 'http://127.0.0.1:4096';
    return {
        endpoint: endpoint
    };
}

// Helper for HTTP headers
function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const config = getProviderConfig();
    if (config.endpoint) {
        headers['X-Endpoint'] = config.endpoint;
    }
    return headers;
}

// --- Processing Video Pipeline ---
let progressInterval = null;

const originalPlaceholders = {
    summary: `
        <i data-lucide="sparkle" class="sparkle-loader"></i>
        <h3>AI-Generated Summary</h3>
        <p>Provide a YouTube link above to see the AI summaries, chapters, and key points of the video.</p>
    `,
    takeaways: `
        <i data-lucide="lightbulb"></i>
        <h3>Key Takeaways</h3>
        <p>Extract key lessons, metrics, and quotes from the video transcript once loaded.</p>
    `,
    transcript: `
        <i data-lucide="align-left"></i>
        <h3>Interactive Transcript</h3>
        <p>Browse and read the transcript divided into neat timestamped chunks.</p>
    `
};

function showTabShimmers() {
    takeawaysPlaceholder.classList.remove('hidden');
    takeawaysDetails.classList.add('hidden');
    
    transcriptPlaceholder.classList.remove('hidden');
    transcriptDetails.classList.add('hidden');
    
    takeawaysPlaceholder.innerHTML = `
        <div class="shimmer-container" style="width: 100%; text-align: left; padding: 10px 0;">
            <div class="shimmer-line" style="width: 35%; height: 22px; margin-bottom: 20px; border-radius: 4px;"></div>
            <div style="display: flex; gap: 15px; margin-bottom: 15px; align-items: center;">
                <div class="shimmer-line" style="width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;"></div>
                <div class="shimmer-line" style="width: 80%; height: 16px; border-radius: 4px;"></div>
            </div>
            <div style="display: flex; gap: 15px; margin-bottom: 15px; align-items: center;">
                <div class="shimmer-line" style="width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;"></div>
                <div class="shimmer-line" style="width: 85%; height: 16px; border-radius: 4px;"></div>
            </div>
        </div>
    `;
    
    transcriptPlaceholder.innerHTML = `
        <div class="shimmer-container" style="width: 100%; text-align: left; padding: 10px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; align-items: center;">
                <div class="shimmer-line" style="width: 80px; height: 16px; border-radius: 4px;"></div>
                <div class="shimmer-line" style="width: 200px; height: 32px; border-radius: var(--radius-sm);"></div>
            </div>
            <div class="shimmer-line" style="width: 100%; height: 60px; margin-bottom: 15px; border-radius: var(--radius-md);"></div>
            <div class="shimmer-line" style="width: 100%; height: 60px; margin-bottom: 15px; border-radius: var(--radius-md);"></div>
        </div>
    `;
}

const loaderTexts = {
    title: 'Analyzing Video...',
    exec: 'The AI is currently fetching and reading the video transcript. It will summarize the key concepts here shortly...',
    bullet1: 'Analyzing transcript chunks...',
    bullet2: 'Structuring logical timeline events...'
};

function showSummaryLoaderTyping() {
    summaryPlaceholder.classList.add('hidden');
    summaryDetails.classList.remove('hidden');
    
    // Initialize empty content structure
    summaryVideoTitle.textContent = '';
    summaryExecText.innerHTML = '<p></p>';
    
    chaptersTimeline.innerHTML = `
        <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div class="timeline-header">
                    <span class="timeline-title">Generating Chapters</span>
                    <span class="timeline-time">[00:00]</span>
                </div>
                <div class="timeline-body">
                    <ul>
                        <li id="loader-chap-bullet-1"></li>
                        <li id="loader-chap-bullet-2"></li>
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    state.typingSessionId = (state.typingSessionId || 0) + 1;
    
    // Initial draw at 0%
    updateSummaryLoaderProgress(0);
}

function updateSummaryLoaderProgress(percent) {
    const titleContainer = summaryVideoTitle;
    const execContainer = summaryExecText.querySelector('p');
    const bullet1 = document.getElementById('loader-chap-bullet-1');
    const bullet2 = document.getElementById('loader-chap-bullet-2');
    
    if (!titleContainer || !execContainer || !bullet1 || !bullet2) return;
    
    // Find or create the active cursor element
    let cursor = document.getElementById('summary-loader-cursor');
    if (!cursor) {
        cursor = document.createElement('span');
        cursor.id = 'summary-loader-cursor';
        cursor.className = 'typing-cursor';
    }
    
    // 0% - 15%: Title
    let titleLen = 0;
    if (percent > 0) {
        titleLen = Math.min(loaderTexts.title.length, Math.floor(loaderTexts.title.length * (percent / 15)));
    }
    titleContainer.textContent = loaderTexts.title.substring(0, titleLen);
    
    // 15% - 60%: Executive Summary
    let execLen = 0;
    if (percent > 15) {
        execLen = Math.min(loaderTexts.exec.length, Math.floor(loaderTexts.exec.length * ((percent - 15) / 45)));
    }
    execContainer.textContent = loaderTexts.exec.substring(0, execLen);
    
    // 60% - 80%: Bullet 1
    let bullet1Len = 0;
    if (percent > 60) {
        bullet1Len = Math.min(loaderTexts.bullet1.length, Math.floor(loaderTexts.bullet1.length * ((percent - 60) / 20)));
    }
    bullet1.textContent = loaderTexts.bullet1.substring(0, bullet1Len);
    
    // 80% - 100%: Bullet 2
    let bullet2Len = 0;
    if (percent > 80) {
        bullet2Len = Math.min(loaderTexts.bullet2.length, Math.floor(loaderTexts.bullet2.length * ((percent - 80) / 20)));
    }
    bullet2.textContent = loaderTexts.bullet2.substring(0, bullet2Len);
    
    // Append cursor to the active typing section
    if (percent < 15) {
        titleContainer.appendChild(cursor);
    } else if (percent < 60) {
        execContainer.appendChild(cursor);
    } else if (percent < 80) {
        bullet1.appendChild(cursor);
    } else if (percent < 100) {
        bullet2.appendChild(cursor);
    } else {
        if (cursor.parentNode) {
            cursor.remove();
        }
    }
}

function restoreTabPlaceholders() {
    summaryPlaceholder.classList.remove('hidden');
    summaryDetails.classList.add('hidden');
    summaryPlaceholder.innerHTML = originalPlaceholders.summary;
    
    takeawaysPlaceholder.classList.remove('hidden');
    takeawaysDetails.classList.add('hidden');
    takeawaysPlaceholder.innerHTML = originalPlaceholders.takeaways;
    
    transcriptPlaceholder.classList.remove('hidden');
    transcriptDetails.classList.add('hidden');
    transcriptPlaceholder.innerHTML = originalPlaceholders.transcript;
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

function extractVideoId(url) {
    url = url.trim();
    const pattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)|watch\?.*v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?/\s]{11})/;
    const match = url.match(pattern);
    if (match) return match[1];
    if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    throw new Error("Invalid YouTube URL. Please provide a valid YouTube link.");
}

function setFormDisabled(disabled) {
    youtubeUrlInput.disabled = disabled;
    submitBtn.disabled = disabled;
}

function updateChatProgress(percent, message) {
    const chatProgressBar = document.getElementById('chat-progress-bar');
    const chatProgressPercent = document.getElementById('chat-progress-percent');
    const chatProgressStep = document.getElementById('chat-progress-step');
    
    if (chatProgressBar) {
        chatProgressBar.style.width = `${percent}%`;
    }
    if (chatProgressPercent) {
        chatProgressPercent.textContent = `${percent}%`;
    }
    if (chatProgressStep) {
        chatProgressStep.textContent = message;
    }
}

function showLoader(show, success = true) {
    if (show) {
        if (progressInterval) clearInterval(progressInterval);
        
        // Disable search controls
        setFormDisabled(true);
        
        // Show shimmers in takeaways/transcript dashboards and start typing loader in Summary tab
        showTabShimmers();
        showSummaryLoaderTyping();
        
        // Set Chat pane to loading status
        chatStatus.textContent = "AI is thinking...";
        chatStatus.className = "status-badge processing";
        
        // Clear chat messages and append modern in-line progress card
        chatMessages.innerHTML = `
            <div class="message system-msg chat-loader-msg" id="chat-loader-msg">
                <i data-lucide="bot"></i>
                <div class="msg-content-wrapper">
                    <div class="msg-content">
                        <div class="chat-loader-header">
                            <i data-lucide="sparkles" class="animate-spin" style="color: var(--primary);"></i>
                            <strong>Analyzing Video... <span id="chat-progress-percent">0%</span></strong>
                        </div>
                        <div class="chat-loader-bar">
                            <div id="chat-progress-bar" class="chat-loader-progress" style="width: 0%;"></div>
                        </div>
                        <p id="chat-progress-step" class="loader-step">Connecting to YouTube...</p>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) {
            lucide.createIcons();
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        const startTime = Date.now();
        const expectedDuration = 20000; // Optimized LLM takes ~15-20s
        let percent = 0;
        
        progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (percent < 95) {
                let ratio = elapsed / expectedDuration;
                if (ratio > 1) ratio = 1;
                
                let calculated = Math.floor(95 * (1 - Math.pow(1 - ratio, 2.5)));
                if (calculated > percent) {
                    percent = calculated;
                } else if (percent < 95) {
                    percent += (Math.random() > 0.7 ? 1 : 0);
                }
            } else {
                if (percent < 98 && Math.random() > 0.95) {
                    percent += 1;
                }
            }
            
            let message = "Extracting video details...";
            if (percent >= 15 && percent < 35) {
                message = "Fetching video transcript details...";
            } else if (percent >= 35 && percent < 60) {
                message = "Analyzing transcript content with OpenCode AI...";
            } else if (percent >= 60 && percent < 80) {
                message = "Structuring chapters & timelines...";
            } else if (percent >= 80) {
                message = "Generating key insights and takeaways...";
            }
            
            updateChatProgress(percent, message);
            updateSummaryLoaderProgress(percent);
        }, 150);
    } else {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        
        // Re-enable form controls
        setFormDisabled(false);
        
        const loaderCard = document.getElementById('chat-loader-msg');
        if (loaderCard) {
            loaderCard.remove();
        }
        
        if (success) {
            chatStatus.textContent = "Online";
            chatStatus.className = "status-badge";
        } else {
            chatStatus.textContent = "Ready";
            chatStatus.className = "status-badge";
            restoreTabPlaceholders();
        }
    }
}

processForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = youtubeUrlInput.value.trim();
    if (!url) return;

    let videoId;
    try {
        videoId = extractVideoId(url);
    } catch (err) {
        alert(err.message);
        return;
    }

    // Instantly load player to decrease perceived latency
    loadYouTubeVideo(videoId);

    // Get config
    const config = getProviderConfig();

    showLoader(true);
    
    try {
        const youtubeProxy = localStorage.getItem('youtube_proxy') || '';
        const youtubeCookies = localStorage.getItem('youtube_cookies') || '';
        
        const apiBase = getApiBaseUrl();
        const response = await fetch(`${apiBase}/api/process`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ 
                youtube_url: url,
                config: config,
                youtube_proxy: youtubeProxy || null,
                youtube_cookies: youtubeCookies || null
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Failed to process YouTube link.');
        }

        // Set state
        state.activeVideoId = data.video_id;
        state.videoData = data;
        state.chatHistory = [];
        
        localStorage.setItem('active_video_id', data.video_id);
        localStorage.setItem('video_data', JSON.stringify(data));
        
        // Render panels
        renderVideoData(data, false, true);
        
        showLoader(false, true);
        
        // Print success in chat
        appendMessage('system', `✅ **Analysis Complete!**\n\nI have successfully loaded the transcript for **"${data.summary.title || 'this video'}"**. You can now ask me questions about it, or browse the Summary, Takeaways, and Transcript tabs!`);
    } catch (err) {
        showLoader(false, false);
        appendMessage('system', `❌ **Processing Failed**\n\nError details: \`${err.message}\`\n\nPlease check your OpenCode server settings and try again.`);
    }
});

// Helper to format timestamp float to MM:SS or HH:MM:SS
function formatTime(seconds) {
    const secs = Math.floor(seconds);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    
    const formattedM = m < 10 ? `0${m}` : m;
    const formattedS = s < 10 ? `0${s}` : s;
    
    if (h > 0) {
        return `${h}:${formattedM}:${formattedS}`;
    }
    return `${formattedM}:${formattedS}`;
}

// Render video payload into UI
function renderVideoData(data, loadInitialChat = true, runTypewriter = true) {
    const summary = data.summary;
    
    // 1. Summary Pane
    summaryPlaceholder.classList.add('hidden');
    summaryDetails.classList.remove('hidden');
    
    summaryVideoTitle.textContent = summary.title || "Video Analysis";
    summaryExecText.textContent = summary.executive_summary || "No executive summary generated.";
    
    // Prompt to open settings if OpenCode connection fails
    if (summary.executive_summary && (summary.executive_summary.includes("OpenCode API call failed") || summary.executive_summary.includes("unable to compile"))) {
        setTimeout(() => {
            const openSettings = confirm(
                "Could not connect to OpenCode. Please ensure OpenCode is running locally (e.g. opencode serve --port 4096).\n\nWould you like to open Settings now?"
            );
            if (openSettings) {
                openSettingsModal();
            }
        }, 500);
    }
    
    // Chapters
    chaptersTimeline.innerHTML = '';
    if (summary.chapters && summary.chapters.length > 0) {
        summary.chapters.forEach(chap => {
            const item = document.createElement('div');
            item.className = runTypewriter ? 'timeline-item pending' : 'timeline-item';
            
            const dot = document.createElement('div');
            dot.className = 'timeline-dot';
            
            const content = document.createElement('div');
            content.className = 'timeline-content';
            
            let summaryContent = '';
            if (Array.isArray(chap.summary)) {
                const markdownLines = chap.summary.map(point => {
                    let trimmed = point.trim();
                    if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('+') || point.startsWith(' ')) {
                        return point;
                    }
                    return `- ${point}`;
                });
                summaryContent = formatMarkdown(markdownLines.join('\n'));
            } else {
                summaryContent = formatMarkdown(chap.summary);
            }

            content.innerHTML = `
                <div class="timeline-header">
                    <span class="timeline-title">${chap.title}</span>
                    <span class="timeline-time">[${formatTime(chap.start_time)}]</span>
                </div>
                <div class="timeline-body">${summaryContent}</div>
            `;
            
            // Seeking logic on chapter click
            content.addEventListener('click', () => {
                if (state.youtubePlayer && typeof state.youtubePlayer.seekTo === 'function') {
                    state.youtubePlayer.seekTo(chap.start_time, true);
                    state.youtubePlayer.playVideo();
                }
            });
            
            item.appendChild(dot);
            item.appendChild(content);
            chaptersTimeline.appendChild(item);
        });

        if (runTypewriter) {
            // Trigger sequential typewriter effect on chapters timeline body
            const timelineBodies = Array.from(chaptersTimeline.querySelectorAll('.timeline-body'));
            
            state.typingSessionId = (state.typingSessionId || 0) + 1;
            const currentSessionId = state.typingSessionId;
            
            (async () => {
                for (const body of timelineBodies) {
                    // If the session has changed, abort the sequential chain
                    if (state.typingSessionId !== currentSessionId) break;
                    
                    const item = body.closest('.timeline-item');
                    if (item) {
                        // Reveal the card with slide-up and fade-in transitions
                        item.classList.remove('pending');
                        
                        // Delay slightly to let the card slide-up start before characters type out
                        await new Promise(resolve => setTimeout(resolve, 250));
                    }
                    
                    if (state.typingSessionId !== currentSessionId) break;
                    
                    // Typewrite this body
                    await typewriteHtmlElement(body, 8, currentSessionId);
                    
                    // Small pause between chapters
                    if (state.typingSessionId !== currentSessionId) break;
                    await new Promise(resolve => setTimeout(resolve, 400));
                }
            })();
        }
    } else {
        chaptersTimeline.innerHTML = '<p class="text-muted">No chapters detected in this video.</p>';
    }
    
    // 2. Takeaways Pane
    takeawaysPlaceholder.classList.add('hidden');
    takeawaysDetails.classList.remove('hidden');
    
    takeawaysList.innerHTML = '';
    if (summary.key_takeaways && summary.key_takeaways.length > 0) {
        summary.key_takeaways.forEach(takeaway => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="takeaway-bullet-circle"><i data-lucide="check"></i></div>
                <p>${takeaway}</p>
            `;
            takeawaysList.appendChild(li);
        });
    } else {
        takeawaysList.innerHTML = '<li><p>No major insights generated.</p></li>';
    }
    
    // 3. Transcript Pane
    transcriptPlaceholder.classList.add('hidden');
    transcriptDetails.classList.remove('hidden');
    transcriptChunkCount.textContent = `Chunks: ${data.chunks.length}`;
    
    renderTranscriptChunks(data.chunks);
    
    // 4. Enable Chat components
    chatInput.disabled = false;
    chatInput.placeholder = "Ask something about the video...";
    chatSendBtn.disabled = false;
    chatStatus.textContent = "Online";
    chatStatus.className = "status-badge";
    
    // Initial clear of chat history
    if (loadInitialChat) {
        chatMessages.innerHTML = `
            <div class="message system-msg">
                <i data-lucide="bot"></i>
                <div class="msg-content-wrapper">
                    <div class="msg-content">
                        <p>Hello! I have loaded the transcript for <strong>"${summary.title || 'the video'}"</strong>. Feel free to ask me questions like: </p>
                        <ul>
                            <li>What is the core argument of this video?</li>
                            <li>Summarize the key findings.</li>
                            <li>Can you explain what the speaker says about the main topic?</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Populate suggested questions
    suggestedQuestionsSection.classList.remove('hidden');
    suggestionsList.innerHTML = '';
    const suggestions = [
        "Give me a 1-minute summary",
        "What is the main conclusion?",
        "Explain the key takeaways"
    ];
    suggestions.forEach(question => {
        const chip = document.createElement('button');
        chip.className = 'suggestion-chip';
        chip.textContent = question;
        chip.addEventListener('click', () => {
            chatInput.value = question;
            submitChatMessage();
        });
        suggestionsList.appendChild(chip);
    });
    
    lucide.createIcons();
}

// Render chunks list in interactive transcript
function renderTranscriptChunks(chunks, filterText = "") {
    transcriptChunksList.innerHTML = '';
    
    const term = filterText.toLowerCase().trim();
    
    chunks.forEach((chunk, index) => {
        // If searching, check if match
        if (term && !chunk.text.toLowerCase().includes(term)) {
            return;
        }
        
        const card = document.createElement('div');
        card.className = 'transcript-chunk-card';
        
        let chunkTextHtml = chunk.text;
        if (term) {
            // Safe highlighted text rendering using regex
            const regex = new RegExp(`(${term})`, 'gi');
            chunkTextHtml = chunk.text.replace(regex, '<mark>$1</mark>');
        }
        
        card.innerHTML = `
            <button class="chunk-timestamp-btn">
                <i data-lucide="play" style="width: 10px; height: 10px;"></i>
                <span>${formatTime(chunk.start)}</span>
            </button>
            <div class="chunk-text">${chunkTextHtml}</div>
        `;
        
        // Setup click handler to jump in video player
        card.addEventListener('click', (e) => {
            if (state.youtubePlayer && typeof state.youtubePlayer.seekTo === 'function') {
                state.youtubePlayer.seekTo(chunk.start, true);
                state.youtubePlayer.playVideo();
            }
        });
        
        transcriptChunksList.appendChild(card);
    });
    
    if (transcriptChunksList.children.length === 0) {
        transcriptChunksList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No transcript segments match your search query.</div>';
    }
    
    lucide.createIcons();
}

// Transcript search filtering
searchTranscriptInput.addEventListener('input', (e) => {
    if (!state.videoData || !state.videoData.chunks) return;
    renderTranscriptChunks(state.videoData.chunks, e.target.value);
});

// --- Chat Q&A Logic ---
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitChatMessage();
});

async function submitChatMessage() {
    const question = chatInput.value.trim();
    if (!question || !state.videoData) return;
    
    // Append user message
    appendMessage('user', question);
    chatInput.value = '';
    
    // Add AI skeleton/loading loader
    const loadingMessageEl = appendMessage('system', `
        <div class="shimmer-msg">
            <div class="shimmer-line w1"></div>
            <div class="shimmer-line w2"></div>
            <div class="shimmer-line w3"></div>
        </div>
    `);
    
    chatStatus.textContent = "AI is thinking...";
    chatStatus.className = "status-badge processing";
    
    try {
        // Concatenate transcript chunks for full context text
        const fullTranscript = state.videoData.chunks.map(c => `[${formatTime(c.start)}] ${c.text}`).join('\n');
        const config = getProviderConfig();
        
        const apiBase = getApiBaseUrl();
        const response = await fetch(`${apiBase}/api/chat`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                video_id: state.activeVideoId,
                transcript: fullTranscript,
                question: question,
                history: state.chatHistory,
                config: config
            })
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "Failed to get AI answer.");
        }
        
        // Remove loading state message
        loadingMessageEl.remove();
        
        // Append actual response
        appendMessage('system', data.answer);
        
        // Save history (excluding prompt context itself)
        state.chatHistory.push({ role: 'user', text: question });
        state.chatHistory.push({ role: 'model', text: data.answer });
        
    } catch (err) {
        loadingMessageEl.remove();
        appendMessage('system', `⚠️ **Error generating response:** ${err.message}`);
    } finally {
        chatStatus.textContent = "Online";
        chatStatus.className = "status-badge";
    }
}

function appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role === 'user' ? 'user-msg' : 'system-msg'}`;
    
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', role === 'user' ? 'user' : 'bot');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'msg-content-wrapper';
    
    const content = document.createElement('div');
    content.className = 'msg-content';
    
    // Parse simple Markdown elements for answers (bold, list items)
    if (role === 'system') {
        content.innerHTML = formatMarkdown(text);
    } else {
        content.textContent = text;
    }
    
    wrapper.appendChild(content);
    
    // Add "Add to Notes" button (only if not a skeleton loader / error check)
    if (text && !text.includes('shimmer-msg') && role !== 'loading') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        
        const addToNotesBtn = document.createElement('button');
        addToNotesBtn.className = 'add-to-notes-btn';
        addToNotesBtn.title = 'Add this message to My Notes';
        addToNotesBtn.innerHTML = '<i data-lucide="clipboard-plus"></i>Add to Notes';
        
        addToNotesBtn.addEventListener('click', () => {
            appendChatToNotes(role, text);
        });
        
        actionsDiv.appendChild(addToNotesBtn);
        wrapper.appendChild(actionsDiv);
    }
    
    msgDiv.appendChild(icon);
    msgDiv.appendChild(wrapper);
    chatMessages.appendChild(msgDiv);
    
    // Auto-scroll chat
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    lucide.createIcons();
    return msgDiv;
}

// Lightweight Markdown Formatter
function formatMarkdown(text) {
    if (!text) return '';
    
    // Helper to parse timestamps into seconds
    function timestampToSeconds(timeStr) {
        const parts = timeStr.replace(/[\[\]]/g, '').split(':').map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
        return 0;
    }
    
    // 1. Replace bold and inline code
    let processedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
        
    // 2. Replace Markdown style links: [Text](Url)
    processedText = processedText.replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" class="chat-link">$1</a>');
    
    // 3. Replace raw HTTP links (not inside existing tags/attributes)
    processedText = processedText.replace(/(?<!href=")(?<!src=")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="chat-link">$1</a>');
    
    // 4. Replace bracketed timestamps like [12:34] or [01:02:03]
    processedText = processedText.replace(/\[(\d{1,2}(?::\d{2}){1,2})\]/g, (match, p1) => {
        const secs = timestampToSeconds(p1);
        return `<span class="chat-timestamp" data-seconds="${secs}">[${p1}]</span>`;
    });
    
    // 5. Replace raw timestamps like 12:34 or 01:02:03 (not inside tags/attributes/brackets)
    processedText = processedText.replace(/(?<!data-seconds=")(?<!\d)(?<!:)\b(\d{1,2}(?::\d{2}){1,2})\b(?!:)(?!\d)(?!\])(?!<\/span>)/g, (match, p1) => {
        const secs = timestampToSeconds(p1);
        return `<span class="chat-timestamp" data-seconds="${secs}">${p1}</span>`;
    });
        
    const lines = processedText.split('\n');
    let html = '';
    let listStack = []; // Keep track of open list levels (indentation counts)
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();
        
        if (!trimmed) {
            continue;
        }
        
        // Detect bullet list items: matches spaces followed by '-' or '*' or '+'
        let bulletMatch = line.match(/^(\s*)([\-\*\+])\s+(.*)$/);
        
        if (bulletMatch) {
            let indent = bulletMatch[1].length;
            let content = bulletMatch[3];
            
            // Determine the level based on indentation width (2 spaces per level)
            let level = 0;
            if (indent > 0) {
                level = Math.floor(indent / 2);
            }
            
            // Close deeper lists if we went back up
            while (listStack.length > level + 1) {
                html += listStack.pop();
            }
            
            // Open new sub-lists if we went down
            while (listStack.length < level + 1) {
                html += '<ul>';
                listStack.push('</ul>');
            }
            
            html += `<li>${content}</li>`;
        } else {
            // Non-list line: close all open lists first
            while (listStack.length > 0) {
                html += listStack.pop();
            }
            html += `<p>${trimmed}</p>`;
        }
    }
    
    // Close any remaining open lists
    while (listStack.length > 0) {
        html += listStack.pop();
    }
    
    return html;
}

function typewriteHtmlElement(element, speedMs = 12, sessionId = null) {
    return new Promise((resolve) => {
        const textNodes = [];
        function findTextNodes(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.nodeValue.trim().length > 0) {
                    textNodes.push({
                        node: node,
                        fullText: node.nodeValue,
                        currentLength: 0
                    });
                    node.nodeValue = '';
                }
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    findTextNodes(node.childNodes[i]);
                }
            }
        }
        
        findTextNodes(element);
        
        if (textNodes.length === 0) {
            resolve();
            return;
        }
        
        // Create typing cursor element
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        
        let nodeIndex = 0;
        let charIndex = 0;
        
        function typeNextChar() {
            // Check session ID to support cancellation
            if (sessionId !== null && state.typingSessionId !== sessionId) {
                if (cursor.parentNode) {
                    cursor.remove();
                }
                resolve();
                return;
            }
            
            if (nodeIndex >= textNodes.length) {
                if (cursor.parentNode) {
                    cursor.remove();
                }
                resolve();
                return;
            }
            
            const currentNodeObj = textNodes[nodeIndex];
            const textNode = currentNodeObj.node;
            const fullText = currentNodeObj.fullText;
            
            // Move cursor to follow active node
            if (textNode.parentNode && (cursor.parentNode !== textNode.parentNode || cursor.previousSibling !== textNode)) {
                textNode.parentNode.insertBefore(cursor, textNode.nextSibling);
            }
            
            const nextChar = fullText.charAt(charIndex);
            textNode.nodeValue = fullText.substring(0, charIndex + 1);
            charIndex++;
            
            let currentDelay = speedMs;
            
            // Add custom delays to mimic human/ChatGPT typing flow
            if (nextChar === '.' || nextChar === '?' || nextChar === '!') {
                currentDelay = speedMs + 320; // Pause at end of sentences
            } else if (nextChar === ',' || nextChar === ';' || nextChar === ':') {
                currentDelay = speedMs + 120; // Pause at sub-clauses/commas
            }
            
            if (charIndex >= fullText.length) {
                nodeIndex++;
                charIndex = 0;
                currentDelay = speedMs + 180; // Pause at element/paragraph transitions
            }
            
            setTimeout(typeNextChar, currentDelay);
        }
        
        typeNextChar();
    });
}

// --- Notes Feature Handlers & Listeners ---

if (notesTextarea) {
    notesTextarea.addEventListener('input', () => {
        localStorage.setItem('video_user_notes', notesTextarea.value);
    });
}

if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', downloadNotesAsPDF);
}

if (copyNotesBtn) {
    copyNotesBtn.addEventListener('click', async () => {
        if (!notesTextarea || !notesTextarea.value.trim()) {
            alert('Notes are empty! Type something first.');
            return;
        }
        try {
            await navigator.clipboard.writeText(notesTextarea.value);
            
            // Premium micro-interaction: temporary success feedback
            const originalIconHTML = copyNotesBtn.innerHTML;
            copyNotesBtn.innerHTML = '<i data-lucide="check" style="color: var(--success); width: 20px; height: 20px;"></i>';
            if (window.lucide) lucide.createIcons();
            
            setTimeout(() => {
                copyNotesBtn.innerHTML = originalIconHTML;
                if (window.lucide) lucide.createIcons();
            }, 1500);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy notes to clipboard.');
        }
    });
}

function appendChatToNotes(role, text) {
    if (!notesTextarea) return;
    
    const sender = role === 'user' ? 'User' : 'AI Assistant';
    // Remove standard html tag wrappers if matching
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const noteEntry = `\n\n--- [${sender} - ${timestampStr}] ---\n${cleanText}\n`;
    
    notesTextarea.value = notesTextarea.value + noteEntry;
    localStorage.setItem('video_user_notes', notesTextarea.value);
    
    // Switch active tab view to notes
    const notesTabBtn = document.querySelector('.tab-btn[data-tab="notes"]');
    if (notesTabBtn) {
        notesTabBtn.click();
    }
    
    // Scroll notes textarea to the end
    notesTextarea.scrollTop = notesTextarea.scrollHeight;
}

function decodeHTMLEntities(text) {
    if (!text) return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    return tempDiv.textContent || tempDiv.innerText || '';
}

async function downloadNotesAsPDF() {
    if (!notesTextarea) return;
    let notesText = notesTextarea.value;
    if (!notesText.trim()) {
        alert('Notes are empty! Type something first.');
        return;
    }
    
    // Disable download button and show loading state
    const originalBtnText = downloadPdfBtn.innerHTML;
    downloadPdfBtn.disabled = true;
    downloadPdfBtn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"></i><span>Loading Font...</span>';
    if (window.lucide) {
        lucide.createIcons();
    }
    
    try {
        // Clean smart quotes, dashes, tabs, non-breaking spaces
        notesText = notesText
            .replace(/\u00a0/g, ' ')
            .replace(/\t/g, '    ')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/[\u2022]/g, '*')
            .replace(/[\u2026]/g, '...');
            
        // Strip only surrogate pairs / complex emojis that jsPDF / Poppins cannot render
        notesText = notesText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\u200D|[\u2700-\u27BF]|[\u2600-\u26FF]|[\u2B50]/g, '');
        
        // Safe check of loaded jsPDF namespace
        let jsPDFConstructor;
        if (window.jspdf && window.jspdf.jsPDF) {
            jsPDFConstructor = window.jspdf.jsPDF;
        } else if (window.jsPDF) {
            jsPDFConstructor = window.jsPDF;
        } else {
            alert("The PDF export library is not loaded yet. Please check your internet connection.");
            return;
        }
        
        const doc = new jsPDFConstructor();
        
        // Load custom Unicode font Poppins (supports Latin and Devanagari/Hindi) dynamically from Google Fonts CDN
        let fontName = 'helvetica';
        try {
            const regularUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf";
            const boldUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf";
            
            const [regRes, boldRes] = await Promise.all([
                fetch(regularUrl).then(r => r.arrayBuffer()),
                fetch(boldUrl).then(r => r.arrayBuffer())
            ]);
            
            const arrayBufferToBase64 = (buffer) => {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return window.btoa(binary);
            };
            
            const regBase64 = arrayBufferToBase64(regRes);
            const boldBase64 = arrayBufferToBase64(boldRes);
            
            doc.addFileToVFS('Poppins-Regular.ttf', regBase64);
            doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
            
            doc.addFileToVFS('Poppins-Bold.ttf', boldBase64);
            doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
            
            fontName = 'Poppins';
        } catch (err) {
            console.warn("Failed to load Poppins Unicode font, falling back to Helvetica:", err);
            // Fallback: strip non-ASCII characters if we can't load the custom font
            notesText = notesText.replace(/[^\x00-\x7F]/g, function(char) {
                const code = char.charCodeAt(0);
                if (code >= 128 && code <= 255) return char;
                return '';
            });
        }
        
        const margin = 20; // 20mm left/right margins
        const topMargin = 25; // 25mm top margin to prevent clipping
        const bottomMargin = 20; // 20mm bottom margin
        
        const pageWidth = 210; // A4 standard width in mm
        const maxLineWidth = pageWidth - (margin * 2); // 170mm text printable width
        const pageHeight = 297; // A4 standard height in mm
        const maxPageHeight = pageHeight - bottomMargin; // 277mm bottom margin boundary
    
        // Helper function to draw running page header containing ONLY the video title
        function drawPageHeader(docInstance, titleText) {
            docInstance.setFont(fontName, "bold");
            docInstance.setFontSize(14); // bold and larger than normal writing font size (11pt)
            
            let sanitizedTitle = decodeHTMLEntities(titleText).replace(/\u00a0/g, ' ');
            if (fontName === 'helvetica') {
                sanitizedTitle = sanitizedTitle.replace(/[^\x00-\x7F]/g, function(char) {
                    const code = char.charCodeAt(0);
                    if (code >= 128 && code <= 255) return char;
                    return '';
                });
            }
            
            const titleLines = docInstance.splitTextToSize(sanitizedTitle, maxLineWidth);
            
            let currentY = topMargin;
            titleLines.forEach(line => {
                docInstance.text(line, margin, currentY);
                currentY += 7.5; // line spacing for headline
            });
            
            return currentY + 5; // Return y position below header for notes content to start
        }
        
        let yPos;
        if (state.videoData && state.videoData.summary && state.videoData.summary.title) {
            yPos = drawPageHeader(doc, state.videoData.summary.title);
        } else {
            yPos = topMargin;
        }
        
        // Render notes content in standard font
        doc.setFont(fontName, "normal");
        doc.setFontSize(11);
        
        // Split the notes by newlines to respect paragraph breaks exactly how user wrote them
        const paragraphs = notesText.split(/\r?\n/);
        
        paragraphs.forEach(para => {
            if (para === "") {
                // Handle explicit blank line: just advance yPos
                yPos += 6.5;
                return;
            }
            
            // Wrap the paragraph text to fit the page width
            const lines = doc.splitTextToSize(para, maxLineWidth);
            
            lines.forEach(line => {
                if (yPos > maxPageHeight) {
                    doc.addPage();
                    if (state.videoData && state.videoData.summary && state.videoData.summary.title) {
                        yPos = drawPageHeader(doc, state.videoData.summary.title);
                    } else {
                        yPos = topMargin;
                    }
                    // Re-apply fonts specifically on the new page, otherwise they reset to defaults!
                    doc.setFont(fontName, "normal");
                    doc.setFontSize(11);
                }
                doc.text(line, margin, yPos);
                yPos += 6.5; // Line height spacing
            });
        });
        
        // Export file name formatting
        let filename = "my_notes.pdf";
        if (state.videoData && state.videoData.summary && state.videoData.summary.title) {
            const decodedTitle = decodeHTMLEntities(state.videoData.summary.title);
            filename = decodedTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .substring(0, 30) + "_notes.pdf";
        }
        
        // Trigger Save File Picker to allow user to choose download directory and filename
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'PDF Document',
                        accept: {
                            'application/pdf': ['.pdf'],
                        },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(doc.output('blob'));
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') {
                    return; // User cancelled saving
                }
                console.warn("showSaveFilePicker failed, using fallback:", err);
            }
        }
        
        // Fallback standard download if picker API is not supported or was blocked
        doc.save(filename);
    } catch (error) {
        console.error("PDF download error:", error);
        alert("An error occurred while exporting the PDF: " + error.message);
    } finally {
        // Restore download button original state
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.innerHTML = originalBtnText;
        if (window.lucide) {
            lucide.createIcons();
        }
    }
}
