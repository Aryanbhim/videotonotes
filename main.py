import os
import re
import json
import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
import google.generativeai as genai
from dotenv import load_dotenv

# Load server-side .env file if present
load_dotenv()

app = FastAPI(title="VideoToNotes API", description="AI-powered YouTube transcription and Q&A (Multi-Provider)")

# Enable CORS for frontend/backend decoupled local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---
class ProviderConfig(BaseModel):
    provider: str        # 'gemini', 'openrouter', 'groq', 'ollama', 'openai', 'nvidia', 'opencode', 'cloudflare'
    api_key: str = ""
    model: str = ""      # e.g., 'gemini-1.5-flash', 'meta-llama/llama-3-8b-instruct:free'
    endpoint: str = ""   # e.g., 'http://localhost:11434/v1/chat/completions'

class ProcessRequest(BaseModel):
    youtube_url: str
    config: ProviderConfig | None = None
    language: str = "English"  # Output language for AI-generated content
    youtube_proxy: str | None = None
    youtube_cookies: str | None = None

class ChatMessage(BaseModel):
    role: str  # 'user' or 'model' (client mapped)
    text: str

class ChatRequest(BaseModel):
    video_id: str
    transcript: str
    question: str
    history: list[ChatMessage]
    config: ProviderConfig | None = None
    language: str = "English"  # Output language for AI-generated content


# --- Core Helper Functions ---

def resolve_config(config: ProviderConfig | None, request_headers: dict) -> ProviderConfig:
    """Resolve API configuration from input, request headers, or environment variables."""
    provider = "gemini"
    api_key = ""
    model = ""
    endpoint = ""
    
    if config:
        provider = config.provider.strip().lower() if config.provider else "gemini"
        api_key = config.api_key.strip() if config.api_key else ""
        model = config.model.strip() if config.model else ""
        endpoint = config.endpoint.strip() if config.endpoint else ""
        
    # Check custom headers if config values are empty
    gemini_key_header = request_headers.get("x-gemini-key")
    if gemini_key_header and not api_key:
        api_key = gemini_key_header
        
    provider_header = request_headers.get("x-provider")
    if provider_header:
        provider = provider_header.strip().lower()
        
    api_key_header = request_headers.get("x-api-key")
    if api_key_header and not api_key:
        api_key = api_key_header
        
    # If API key is still empty, resolve from environment variables
    if not api_key:
        if provider == "gemini":
            api_key = os.environ.get("GEMINI_API_KEY", "")
        elif provider == "nvidia":
            api_key = os.environ.get("NVIDIA_API_KEY", "")
        elif provider == "openrouter":
            api_key = os.environ.get("OPENROUTER_API_KEY", "")
        elif provider == "groq":
            api_key = os.environ.get("GROQ_API_KEY", "")
        elif provider == "openai":
            api_key = os.environ.get("OPENAI_API_KEY", "")
        elif provider == "opencode":
            api_key = os.environ.get("OPENCODE_API_KEY", "") or "opencode"
        elif provider == "cloudflare":
            api_key = os.environ.get("CLOUDFLARE_API_TOKEN", "")
            if not endpoint:
                endpoint = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
            
    return ProviderConfig(
        provider=provider,
        api_key=api_key,
        model=model,
        endpoint=endpoint
    )

def extract_video_id(url: str) -> str:
    """Extract 11-character YouTube video ID from various link formats."""
    url = url.strip()
    pattern = r'(?:https?://)?(?:www\.)?(?:youtube\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)|watch\?.*v=)|youtu\.be/|youtube\.com/shorts/)([^"&?/\s]{11})'
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    
    # Fallback if user just enters the 11 character ID
    if len(url) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
        
    raise ValueError("Invalid YouTube URL. Please provide a valid YouTube link.")

def get_video_transcript(video_id: str, cookies_content: str = None, proxy_url: str = None) -> tuple[list, str]:
    """Retrieve subtitles from YouTube, falling back to auto-generated if manual isn't available."""
    import tempfile
    import os
    import requests
    from http.cookiejar import MozillaCookieJar
    
    temp_cookie_path = None
    session = None
    
    try:
        if cookies_content or proxy_url:
            session = requests.Session()
            if proxy_url:
                session.proxies = {
                    "http": proxy_url.strip(),
                    "https": proxy_url.strip()
                }
            if cookies_content:
                fd, temp_cookie_path = tempfile.mkstemp(suffix=".txt", prefix="cookies_")
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as f:
                        f.write(cookies_content)
                    cj = MozillaCookieJar(temp_cookie_path)
                    cj.load(ignore_discard=True, ignore_expires=True)
                    session.cookies = cj
                except Exception as e:
                    if temp_cookie_path and os.path.exists(temp_cookie_path):
                        try:
                            os.remove(temp_cookie_path)
                        except Exception:
                            pass
                        temp_cookie_path = None
                    raise ValueError(f"Invalid cookies.txt content format. Verify it is standard Netscape format. Details: {str(e)}")
            api = YouTubeTranscriptApi(http_client=session)
        else:
            api = YouTubeTranscriptApi()
            
        transcript_list = api.list(video_id)
        # Try fetching manual English transcript, then auto-generated English, then any first available
        try:
            transcript = transcript_list.find_transcript(['en'])
        except Exception:
            try:
                transcript = transcript_list.find_generated_transcript(['en'])
            except Exception:
                transcript = next(iter(transcript_list))
                
        data = transcript.fetch()
        
        # Convert dataclass objects to simple dictionaries to ensure subscriptability
        dict_data = []
        for entry in data:
            dict_data.append({
                "text": entry.text,
                "start": entry.start,
                "duration": entry.duration
            })
            
        full_text = " ".join([entry['text'].replace('\n', ' ') for entry in dict_data])
        return dict_data, full_text
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not retrieve transcript. Subtitles may be disabled or unavailable for this video. Details: {str(e)}"
        )
    finally:
        if temp_cookie_path and os.path.exists(temp_cookie_path):
            try:
                os.remove(temp_cookie_path)
            except Exception:
                pass

def create_time_chunks(transcript_data: list, chunk_size_sec: float = 90.0) -> list:
    """Group individual transcript lines into logical chunks with start and end times."""
    chunks = []
    current_chunk = []
    current_start = None
    
    for entry in transcript_data:
        if current_start is None:
            current_start = entry['start']
        
        current_chunk.append(entry['text'])
        
        # If chunk span exceeds chunk_size_sec
        if (entry['start'] + entry['duration'] - current_start) >= chunk_size_sec:
            chunks.append({
                "start": current_start,
                "end": entry['start'] + entry['duration'],
                "text": " ".join(current_chunk).replace('\n', ' ')
            })
            current_chunk = []
            current_start = None
            
    # Clean up remaining entries
    if current_chunk:
        chunks.append({
            "start": current_start,
            "end": transcript_data[-1]['start'] + transcript_data[-1]['duration'],
            "text": " ".join(current_chunk).replace('\n', ' ')
        })
        
    return chunks


# --- Unified AI LLM Client Handler ---

def call_llm_api(
    config: ProviderConfig,
    system_prompt: str,
    user_prompt: str,
    chat_history: list[ChatMessage] = None,
    json_response: bool = False
) -> str:
    """Unified routing function to call different LLM providers."""
    provider = config.provider.lower().strip()
    
    # 1. Native Gemini SDK Integration
    if provider == "gemini":
        api_key = config.api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Gemini API Key is missing. Please provide it in the settings panel.")
            
        genai.configure(api_key=api_key)
        model_name = config.model or "gemini-1.5-flash"
        model = genai.GenerativeModel(model_name)
        
        # Build standard system instructions prompt
        full_prompt = f"{system_prompt}\n\n"
        if chat_history:
            for msg in chat_history:
                role = "User" if msg.role == "user" else "Assistant"
                full_prompt += f"{role}: {msg.text}\n"
        full_prompt += f"User: {user_prompt}\nAssistant:"
        
        generation_cfg = {}
        if json_response:
            generation_cfg["response_mime_type"] = "application/json"
            
        response = model.generate_content(full_prompt, generation_config=generation_cfg)
        return response.text
        
    # 1b. Native OpenCode Server Integration
    elif provider == "opencode":
        endpoint = config.endpoint.strip()
        if not endpoint:
            endpoint = "http://127.0.0.1:4096"
        else:
            # Strip trailing slash or common open-ai paths
            endpoint = re.sub(r"/v1(/chat/completions)?/?$", "", endpoint)
            endpoint = endpoint.rstrip("/")
            
        try:
            # Create a session
            session_res = requests.post(f"{endpoint}/session", json={}, timeout=10)
            session_res.raise_for_status()
            session_id = session_res.json()["id"]
            
            # Build standard message prompt
            full_prompt = ""
            if chat_history:
                for msg in chat_history:
                    role = "User" if msg.role == "user" else "Assistant"
                    full_prompt += f"{role}: {msg.text}\n"
            full_prompt += f"User: {user_prompt}"
            
            # Post message
            payload = {
                "parts": [{"type": "text", "text": full_prompt}],
                "system": system_prompt
            }
            msg_res = requests.post(f"{endpoint}/session/{session_id}/message", json=payload, timeout=60)
            msg_res.raise_for_status()
            res_json = msg_res.json()
            
            # Extract and join text parts
            text_parts = [part["text"] for part in res_json.get("parts", []) if part.get("type") == "text" and "text" in part]
            return "".join(text_parts)
        except Exception as e:
            raise RuntimeError(f"OpenCode API call failed: {str(e)}")
            
    # 2. OpenAI Compatible APIs (OpenRouter, Groq, OpenAI, Ollama, Cloudflare)
    else:
        # Resolve Endpoints
        endpoint = config.endpoint.strip()
        if provider == "cloudflare":
            # endpoint field holds the Cloudflare Account ID
            account_id = endpoint or os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
            if not account_id:
                raise ValueError("Cloudflare Account ID is missing. Please enter it in the Endpoint / Account ID field.")
            endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions"
        elif not endpoint:
            if provider == "openrouter":
                endpoint = "https://openrouter.ai/api/v1/chat/completions"
            elif provider == "groq":
                endpoint = "https://api.groq.com/openai/v1/chat/completions"
            elif provider == "openai":
                endpoint = "https://api.openai.com/v1/chat/completions"
            elif provider == "ollama":
                endpoint = "http://localhost:11434/v1/chat/completions"
            elif provider == "nvidia":
                endpoint = "https://integrate.api.nvidia.com/v1/chat/completions"
            else:
                raise ValueError(f"Unknown API Provider: {config.provider}")
                
        # Resolve API Keys
        api_key = config.api_key.strip()
        if not api_key:
            if provider == "openrouter":
                api_key = os.environ.get("OPENROUTER_API_KEY", "")
            elif provider == "groq":
                api_key = os.environ.get("GROQ_API_KEY", "")
            elif provider == "openai":
                api_key = os.environ.get("OPENAI_API_KEY", "")
            elif provider == "nvidia":
                api_key = os.environ.get("NVIDIA_API_KEY", "")
            elif provider == "cloudflare":
                api_key = os.environ.get("CLOUDFLARE_API_TOKEN", "")
                
        if not api_key and provider not in ("ollama",):
            raise ValueError(f"API Key is missing for {config.provider.capitalize()}. Please configure it.")
            
        # Resolve Model Names
        model_name = config.model.strip()
        if not model_name:
            if provider == "openrouter":
                model_name = "meta-llama/llama-3-8b-instruct:free"
            elif provider == "groq":
                model_name = "llama3-8b-8192"
            elif provider == "openai":
                model_name = "gpt-4o-mini"
            elif provider == "ollama":
                model_name = "llama3"
            elif provider == "nvidia":
                model_name = "moonshotai/kimi-k2.6"
            elif provider == "cloudflare":
                model_name = "@cf/meta/llama-3.1-8b-instruct"
                
        # Format OpenAI message payloads
        messages = [{"role": "system", "content": system_prompt}]
        if chat_history:
            for msg in chat_history:
                role = "user" if msg.role == "user" else "assistant"
                messages.append({"role": role, "content": msg.text})
        messages.append({"role": "user", "content": user_prompt})
        
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": 0.2 if json_response else 0.5
        }
        
        if provider == "nvidia":
            payload["max_tokens"] = 16384
            payload["temperature"] = 1.00
            payload["top_p"] = 1.00
            
        if json_response and provider in ["openai", "groq", "openrouter", "nvidia", "cloudflare"]:
            payload["response_format"] = {"type": "json_object"}
            
        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            result_json = response.json()
            return result_json["choices"][0]["message"]["content"]
        except Exception as e:
            raise RuntimeError(f"HTTP call to {provider.capitalize()} API failed: {str(e)}")


def get_youtube_video_title(video_id: str) -> str:
    """Retrieve the actual YouTube video title via oEmbed API."""
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        response = requests.get(url, timeout=10)
        if response.ok:
            data = response.json()
            return data.get("title", f"Video Summary ({video_id})")
    except Exception as e:
        print(f"Error fetching oEmbed details: {e}")
    return f"Video Summary ({video_id})"


# --- API Endpoints ---

@app.post("/api/process")
async def process_video(request: ProcessRequest, http_request: Request):
    try:
        video_id = extract_video_id(request.youtube_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # Fetch actual YouTube video title
    actual_title = get_youtube_video_title(video_id)
        
    # Get subtitles and full text
    transcript_data, full_text = get_video_transcript(
        video_id,
        cookies_content=request.youtube_cookies,
        proxy_url=request.youtube_proxy
    )
    
    # Chunk transcript
    chunks = create_time_chunks(transcript_data)
    
    # Resolve API Config
    resolved_config = resolve_config(request.config, dict(http_request.headers))
    
    # AI summary generation
    output_language = request.language.strip() if request.language else "English"
    try:
        system_prompt = f"""You are an expert video analyst. Analyze the transcript and generate a comprehensive summary in JSON format.
You MUST write ALL output text — including the title, executive_summary, key_takeaways, chapter titles, chapter summaries, and the mindmap — ENTIRELY in {output_language}.
Do NOT mix languages. Every single word in the JSON values must be in {output_language}.
The transcript may be in a different language; translate and re-express all content in {output_language}."""
        user_prompt = f"""
Analyze the following YouTube video transcript and generate a structured JSON summary.
Identify the main topics and divide the video into logical chapters with summaries and timestamps (start_time in seconds).
Also generate an interactive hierarchical markdown mindmap string representing the key concepts and flow of the video.

IMPORTANT: Write every single value in the JSON in {output_language} only.

Here is the transcript:
{full_text}

JSON Output Schema:
{{
  "title": "A highly descriptive and interesting title for the video summary (in {output_language})",
  "executive_summary": "A detailed 3-4 sentence paragraph summarizing the overall topic, context, and key conclusions (in {output_language}).",
  "key_takeaways": [
    "Key lesson or fact 1 from the video (in {output_language})",
    "Key lesson or fact 2 from the video (in {output_language})",
    "Key lesson or fact 3 (in {output_language}, add more if appropriate)"
  ],
  "chapters": [
    {{
      "title": "Chapter Title (in {output_language})",
      "summary": "Clear summary of this chapter section (in {output_language}).",
      "start_time": 0.0
    }}
  ],
  "mindmap": "# Video Title\\n## Branch 1\\n- Subtopic A\\n  - Details\\n- Subtopic B\\n## Branch 2\\n- Subtopic C (all in {output_language})"
}}

Provide ONLY raw JSON output. Do not include markdown formatting or ```json codeblock wrappers.
"""
        response_text = call_llm_api(
            config=resolved_config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_response=True
        )
        # Parse clean text
        # If response starts with markdown syntax ```json, strip it (just in case LLM didn't follow instruction)
        clean_text = response_text.strip()
        if clean_text.startswith("```"):
            clean_text = re.sub(r"^```[a-zA-Z]*\n", "", clean_text)
            clean_text = re.sub(r"\n```$", "", clean_text)
            clean_text = clean_text.strip()
            
        summary_json = json.loads(clean_text)
        summary_json["title"] = actual_title
    except Exception as e:
        # Graceful fallback if JSON parsing or API fails
        summary_json = {
            "title": actual_title,
            "executive_summary": f"We successfully retrieved the video details, but were unable to compile the AI summary using your API settings. Error: {str(e)}",
            "key_takeaways": [
                "Could not load AI takeaways. Verify your API Key configuration, model choice, or connection status.",
                "Verify local Ollama status if using Ollama."
            ],
            "chapters": [],
            "mindmap": f"# Video Summary ({video_id})\\n## Error\\n- Could not compile AI Mindmap"
        }
        
    return {
        "video_id": video_id,
        "chunks": chunks,
        "summary": summary_json
    }

@app.post("/api/chat")
async def chat_with_video(request: ChatRequest, http_request: Request):
    try:
        # Resolve API Config
        resolved_config = resolve_config(request.config, dict(http_request.headers))
        
        chat_language = request.language.strip() if request.language else "English"
        system_prompt = f"""You are an expert AI assistant answering questions about a specific YouTube video.
Your answers must be strictly grounded in the provided transcript context. If the information is not in the transcript, state that clearly.
Do not hallucinate or use external knowledge. Formulate your response in Markdown, referencing timestamps if helpful.
You MUST write ALL your responses entirely in {chat_language}. Do not use any other language — not even for a single word.
If the user's question is in a different language, still answer in {chat_language}.

Transcript:
{request.transcript}"""

        response_text = call_llm_api(
            config=resolved_config,
            system_prompt=system_prompt,
            user_prompt=request.question,
            chat_history=request.history,
            json_response=False
        )
        return {"answer": response_text}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM API Chat failed: {str(e)}")

# Mount static folder for web app files
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
