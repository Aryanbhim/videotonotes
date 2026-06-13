// Application State
const state = {
    provider: localStorage.getItem('api_provider') || 'opencode',
    apiKey: localStorage.getItem(`api_key_${localStorage.getItem('api_provider') || 'opencode'}`) || '',
    activeVideoId: localStorage.getItem('active_video_id') || '',
    videoData: localStorage.getItem('video_data') ? JSON.parse(localStorage.getItem('video_data')) : null,
    chatHistory: [],
    youtubePlayer: null,
    youtubeApiReady: false,
    activeTab: 'summary'
};

// DOM Elements
const youtubeUrlInput = document.getElementById('youtube-url');
const processForm = document.getElementById('process-form');
const submitBtn = document.getElementById('submit-btn');
const settingsBtn = document.getElementById('settings-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStepText = document.getElementById('loading-step');

// Video Player & Placeholders
const videoPlaceholder = document.getElementById('video-placeholder');
const playerContainer = document.getElementById('player-container');

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
const clearNotesBtn = document.getElementById('clear-notes-btn');

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
const apiKeyInput = document.getElementById('api-key-input');
const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
const keyStatusMsg = document.getElementById('key-status-msg');
const settingsSave = document.getElementById('settings-save');
const settingsCancel = document.getElementById('settings-cancel');
const closeModalBtn = document.getElementById('close-modal-btn');

const providerSelect = document.getElementById('provider-select');
const apiKeyLabel = document.getElementById('api-key-label');
const modelInput = document.getElementById('model-input');
const endpointInput = document.getElementById('endpoint-input');
const helperTextSpan = document.getElementById('helper-text-span');
const modelGroup = document.getElementById('model-group');
const endpointGroup = document.getElementById('endpoint-group');
const endpointLabel = document.getElementById('endpoint-label');
const apiKeyGroup = document.getElementById('api-key-group');
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
function openSettingsModal() {
    providerSelect.value = state.provider;
    updateModalFields(state.provider);
    keyStatusMsg.className = 'key-status';
    keyStatusMsg.textContent = '';
    settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
    settingsModal.classList.add('hidden');
}

function updateModalFields(provider) {
    let keyLabel = 'API Key';
    let keyPlaceholder = 'Enter API Key...';
    let helperHtml = '';
    let showKey = true;
    let showModel = true;
    let showEndpoint = true;
    
    if (provider === 'gemini') {
        keyLabel = 'Gemini API Key';
        keyPlaceholder = 'Enter GEMINI_API_KEY...';
        helperHtml = `Don't have a key? Get one for free at the <a href="https://aistudio.google.com/" target="_blank">Google AI Studio</a>.`;
        showModel = false;
        showEndpoint = false;
    } else if (provider === 'nvidia') {
        keyLabel = 'Nvidia API Key';
        keyPlaceholder = 'Enter NVIDIA_API_KEY...';
        helperHtml = `Don't have a key? Get one at the <a href="https://build.nvidia.com/" target="_blank">Nvidia API Catalog</a>.`;
        showModel = true;
        showEndpoint = false;
    } else if (provider === 'openai') {
        keyLabel = 'OpenAI API Key';
        keyPlaceholder = 'Enter OPENAI_API_KEY...';
        helperHtml = `Configure OpenAI key. Get one at the <a href="https://platform.openai.com/" target="_blank">OpenAI Developer Platform</a>.`;
        showModel = true;
        showEndpoint = false;
    } else if (provider === 'groq') {
        keyLabel = 'Groq API Key';
        keyPlaceholder = 'Enter GROQ_API_KEY...';
        helperHtml = `Get a free API key at the <a href="https://console.groq.com/" target="_blank">Groq Console</a>.`;
        showModel = true;
        showEndpoint = false;
    } else if (provider === 'openrouter') {
        keyLabel = 'OpenRouter API Key';
        keyPlaceholder = 'Enter OpenRouter API Key...';
        helperHtml = `Configure OpenRouter API. Get a key at <a href="https://openrouter.ai/" target="_blank">OpenRouter</a>.`;
        showModel = true;
        showEndpoint = false;
    } else if (provider === 'ollama') {
        showKey = false;
        showModel = true;
        showEndpoint = true;
        helperHtml = `Ensure Ollama is running locally. Learn more at <a href="https://ollama.com/" target="_blank">Ollama</a>.`;
    } else if (provider === 'opencode') {
        showKey = false;
        showModel = true;
        showEndpoint = true;
        helperHtml = `Ensure OpenCode is running locally. Learn more at <a href="https://opencode.ai/" target="_blank">OpenCode</a>. Try running: <code>opencode serve --port 4096</code>.`;
    } else if (provider === 'cloudflare') {
        keyLabel = 'Cloudflare API Token';
        keyPlaceholder = 'Enter Cloudflare API Token...';
        helperHtml = `Get your API Token at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">Cloudflare API Tokens</a>. Enable <strong>Workers AI</strong> permissions.`;
        showModel = true;
        showEndpoint = true;
    }
    
    apiKeyLabel.textContent = keyLabel;
    apiKeyInput.placeholder = keyPlaceholder;
    helperTextSpan.innerHTML = helperHtml;
    
    if (showKey) apiKeyGroup.classList.remove('hidden');
    else apiKeyGroup.classList.add('hidden');
    
    if (showModel) modelGroup.classList.remove('hidden');
    else modelGroup.classList.add('hidden');
    
    if (showEndpoint) endpointGroup.classList.remove('hidden');
    else endpointGroup.classList.add('hidden');
    
    // Dynamically relabel the endpoint field for Cloudflare
    if (endpointLabel) {
        endpointLabel.textContent = provider === 'cloudflare' ? 'Account ID' : 'Endpoint URL (Optional)';
    }
    if (endpointInput) {
        endpointInput.placeholder = provider === 'cloudflare' ? 'Enter your Cloudflare Account ID...' : 'Default endpoint will be used if blank';
    }
    
    apiKeyInput.value = localStorage.getItem(`api_key_${provider}`) || '';
    modelInput.value = localStorage.getItem(`api_model_${provider}`) || '';
    endpointInput.value = localStorage.getItem(`api_endpoint_${provider}`) || '';
    
    if (provider === 'gemini' && !apiKeyInput.value) {
        apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
    }
    
    if (youtubeProxyInput) {
        youtubeProxyInput.value = localStorage.getItem('youtube_proxy') || '';
    }
    if (youtubeCookiesInput) {
        youtubeCookiesInput.value = localStorage.getItem('youtube_cookies') || '';
    }
}

providerSelect.addEventListener('change', (e) => {
    updateModalFields(e.target.value);
});

toggleKeyVisibility.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    const icon = toggleKeyVisibility.querySelector('i');
    icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    lucide.createIcons();
});

settingsSave.addEventListener('click', () => {
    const provider = providerSelect.value;
    const key = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const endpoint = endpointInput.value.trim();
    
    localStorage.setItem('api_provider', provider);
    localStorage.setItem(`api_key_${provider}`, key);
    localStorage.setItem(`api_model_${provider}`, model);
    localStorage.setItem(`api_endpoint_${provider}`, endpoint);
    
    if (provider === 'gemini') {
        localStorage.setItem('gemini_api_key', key);
    }
    
    if (youtubeProxyInput) {
        localStorage.setItem('youtube_proxy', youtubeProxyInput.value.trim());
    }
    if (youtubeCookiesInput) {
        localStorage.setItem('youtube_cookies', youtubeCookiesInput.value.trim());
    }
    
    state.provider = provider;
    state.apiKey = key;
    closeSettingsModal();
});

// Auto-open settings if key is missing on first load
window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Pre-configure OpenCode endpoint if not already set (for public visitors)
    if (!localStorage.getItem('api_endpoint_opencode')) {
        localStorage.setItem('api_endpoint_opencode', 'http://127.0.0.1:4096');
    }
    if (!localStorage.getItem('api_provider')) {
        localStorage.setItem('api_provider', 'opencode');
    }

    const activeProvider = state.provider;
    const key = localStorage.getItem(`api_key_${activeProvider}`) || localStorage.getItem('gemini_api_key');
    if (!key && activeProvider !== 'ollama' && activeProvider !== 'opencode') {
        setTimeout(openSettingsModal, 1000);
    }
    
    // Load persisted notes
    if (notesTextarea) {
        notesTextarea.value = localStorage.getItem('video_user_notes') || '';
    }
    
    // Restore video player and summaries if video was previously loaded
    if (state.videoData && state.activeVideoId) {
        setTimeout(() => {
            loadYouTubeVideo(state.activeVideoId);
            renderVideoData(state.videoData);
        }, 500); // Give player API script a moment to load
    }
});


settingsBtn.addEventListener('click', openSettingsModal);
closeModalBtn.addEventListener('click', closeSettingsModal);
settingsCancel.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
});

function getProviderConfig() {
    const provider = state.provider;
    const key = localStorage.getItem(`api_key_${provider}`) || localStorage.getItem('gemini_api_key') || '';
    const model = localStorage.getItem(`api_model_${provider}`) || '';
    const endpoint = localStorage.getItem(`api_endpoint_${provider}`) || '';
    
    return {
        provider: provider,
        api_key: key,
        model: model,
        endpoint: endpoint
    };
}

// Helper for HTTP headers
function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const config = getProviderConfig();
    if (config.api_key) {
        headers['X-Gemini-Key'] = config.api_key;
        headers['X-API-Key'] = config.api_key;
        headers['X-Provider'] = config.provider;
    }
    return headers;
}

// --- Processing Video Pipeline ---
processForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = youtubeUrlInput.value.trim();
    if (!url) return;

    // Check if configuration is set
    const config = getProviderConfig();
    // Allow keyless requests to proceed so they can fall back to the server-side environment keys.

    showLoader(true, "Extracting YouTube details...");
    
    try {
        // Step 1: Request backend processing
        loadingStepText.textContent = "Fetching transcripts and compiling notes...";
        
        const youtubeProxy = localStorage.getItem('youtube_proxy') || '';
        const youtubeCookies = localStorage.getItem('youtube_cookies') || '';
        
        const response = await fetch('/api/process', {
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
        loadingStepText.textContent = "Loading embedded video player...";
        loadYouTubeVideo(data.video_id);
        
        loadingStepText.textContent = "Rendering AI summary panels...";
        renderVideoData(data);
        
        showLoader(false);
    } catch (err) {
        showLoader(false);
        alert(`Error processing video: ${err.message}`);
    }
});

function showLoader(show, message = "") {
    if (show) {
        loadingStepText.textContent = message;
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// Helper to format timestamp float to MM:SS or HH:MM:SS
function formatTime(seconds) {
    const secs = Math.floor(seconds);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    
    const formattedS = s < 10 ? `0${s}` : s;
    if (h > 0) {
        const formattedM = m < 10 ? `0${m}` : m;
        return `${h}:${formattedM}:${formattedS}`;
    }
    return `${m}:${formattedS}`;
}

// Render video payload into UI
function renderVideoData(data) {
    const summary = data.summary;
    
    // 1. Summary Pane
    summaryPlaceholder.classList.add('hidden');
    summaryDetails.classList.remove('hidden');
    
    summaryVideoTitle.textContent = summary.title || "Video Analysis";
    summaryExecText.textContent = summary.executive_summary || "No executive summary generated.";
    
    // Chapters
    chaptersTimeline.innerHTML = '';
    if (summary.chapters && summary.chapters.length > 0) {
        summary.chapters.forEach(chap => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            
            const dot = document.createElement('div');
            dot.className = 'timeline-dot';
            
            const content = document.createElement('div');
            content.className = 'timeline-content';
            
            content.innerHTML = `
                <div class="timeline-header">
                    <span class="timeline-title">${chap.title}</span>
                    <span class="timeline-time">${formatTime(chap.start_time)}</span>
                </div>
                <div class="timeline-body">${chap.summary}</div>
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
    chatMessages.innerHTML = `
        <div class="message system-msg">
            <i data-lucide="bot"></i>
            <div class="msg-content">
                <p>Hello! I have loaded the transcript for <strong>"${summary.title || 'the video'}"</strong>. Feel free to ask me questions like: </p>
                <ul>
                    <li>What is the core argument of this video?</li>
                    <li>Summarize the key findings.</li>
                    <li>Can you explain what the speaker says about the main topic?</li>
                </ul>
            </div>
        </div>
    `;
    
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
        
        const response = await fetch('/api/chat', {
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
    let html = text
        // Bold tags
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Inline code
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // Bullet list points
        .replace(/^\s*[\-\*]\s+(.*)$/gm, '<li>$1</li>');
        
    // Wrap lists in ul
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    
    // Format paragraph newlines
    html = html.split('\n\n').map(p => {
        if (p.startsWith('<ul>') || p.startsWith('<li>') || p.startsWith('<ol>')) return p;
        return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    
    return html;
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

if (clearNotesBtn) {
    clearNotesBtn.addEventListener('click', () => {
        if (notesTextarea && notesTextarea.value.trim() && confirm('Are you sure you want to clear all your notes? This cannot be undone.')) {
            notesTextarea.value = '';
            localStorage.removeItem('video_user_notes');
            localStorage.removeItem('active_video_id');
            localStorage.removeItem('video_data');
            state.activeVideoId = '';
            state.videoData = null;
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
