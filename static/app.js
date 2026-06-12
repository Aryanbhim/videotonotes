// Application State
const state = {
    provider: localStorage.getItem('api_provider') || 'opencode',
    apiKey: localStorage.getItem(`api_key_${localStorage.getItem('api_provider') || 'opencode'}`) || localStorage.getItem('gemini_api_key') || '',
    activeVideoId: '',
    videoData: null,
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
const apiKeyGroup = document.getElementById('api-key-group');

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
    
    apiKeyInput.value = localStorage.getItem(`api_key_${provider}`) || '';
    modelInput.value = localStorage.getItem(`api_model_${provider}`) || '';
    endpointInput.value = localStorage.getItem(`api_endpoint_${provider}`) || '';
    
    if (provider === 'gemini' && !apiKeyInput.value) {
        apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
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
    
    state.provider = provider;
    state.apiKey = key;
    closeSettingsModal();
});

// Auto-open settings if key is missing on first load
window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    const activeProvider = state.provider;
    const key = localStorage.getItem(`api_key_${activeProvider}`) || localStorage.getItem('gemini_api_key');
    if (!key && activeProvider !== 'ollama' && activeProvider !== 'opencode') {
        setTimeout(openSettingsModal, 1000);
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
    if (config.provider !== 'ollama' && config.provider !== 'opencode' && !config.api_key) {
        alert('Please configure your API settings panel to summarize videos.');
        openSettingsModal();
        return;
    }

    showLoader(true, "Extracting YouTube details...");
    
    try {
        // Step 1: Request backend processing
        loadingStepText.textContent = "Fetching transcripts and compiling notes...";
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ 
                youtube_url: url,
                config: config
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
    
    const content = document.createElement('div');
    content.className = 'msg-content';
    
    // Parse simple Markdown elements for answers (bold, list items)
    if (role === 'system') {
        content.innerHTML = formatMarkdown(text);
    } else {
        content.textContent = text;
    }
    
    msgDiv.appendChild(icon);
    msgDiv.appendChild(content);
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
