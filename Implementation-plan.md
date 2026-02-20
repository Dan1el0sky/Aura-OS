Aura-OS Implementation Plan
Project Overview: A lightweight Windows automation tool that uses Small Language Models (SLMs) to turn natural language into system actions via PowerShell.

1. System Architecture & Tech Stack
Framework: Tauri (Rust Backend + React/TypeScript Frontend).

AI Engine: Ollama (Local API).

Automation: Windows PowerShell.

Model Strategy:

Fast Model: qwen2.5:0.5b (Uses ~400MB RAM). Stays loaded for instant command parsing.

Smart Model: llama3.2:1b (Uses ~1.3GB RAM). Loaded on-demand for complex reasoning.

2. Setup & Installation
Environment: Install Node.js, Rust, and Ollama.

Model Acquisition: Run the following in your terminal:

ollama pull qwen2.5:0.5b

ollama pull llama3.2:1b

Project Init: Run npm create tauri-app@latest and follow the prompts for React/TS.

3. Backend Implementation (Rust)
Global Hotkey: Use tauri-plugin-global-shortcut to map Alt + Space to toggle the app window.

PowerShell Command: Create a function in main.rs to execute system scripts:

Rust
#[tauri::command]
fn run_command(script: String) {
    std::process::Command::new("powershell")
        .args(["-Command", &script])
        .spawn()
        .expect("Failed to execute");
}
Window Config: Set the window to be "transparent," "always on top," and "decorations: false" in tauri.conf.json.

4. AI Logic (The "Brain")
Intent Library: Create a JSON file mapping "Intents" to scripts.

Example: {"MUTE": "Set-AudioDevice -Mute $true"}.

Inference Logic: * Send user input to qwen2.5:0.5b via http://localhost:11434/api/generate.

System Prompt: "Classify user intent into one word from this list: [MUTE, LOCK, CLEAN_DESKTOP]. If unknown, return 'UNKNOWN'."

RAM Optimization: Set the keep_alive parameter to 300s in the Ollama API call so models unload when not in use.

5. Frontend Implementation (React)
UI Design: A single, centered <input> field with an "Acrylic/Blur" background.

State Management:

Show a loading spinner while the Fast Model is thinking.

If "UNKNOWN" is returned, show a "Switching to Smart Model..." message and re-query using Llama 3.2 1B.

Execution: Call the Rust run_command function once the model identifies the intent.

6. Core Command Library (First Actions)
Lock Workstation: rundll32.exe user32.dll,LockWorkStation

Empty Recycle Bin: Clear-RecycleBin -Force -ErrorAction SilentlyContinue

Dark Mode Toggle: Set-ItemProperty -Path HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize -Name AppsUseLightTheme -Value 0

Clean Desktop: Move-Item -Path ~/Desktop/* -Destination ~/Documents/DesktopArchive/

7. Testing & Deployment
Build: Run npm run tauri build to create a lightweight .msi installer.

RAM Check: Monitor Task Manager to ensure Ollama unloads the 1B model after 5 minutes of inactivity.
