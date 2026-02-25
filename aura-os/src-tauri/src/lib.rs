mod ai;
mod commands;
mod ollama;

use ai::AIService;
use commands::{CommandExecutor, SystemControl};
use tauri::{State, Emitter};
use std::sync::Arc;
use tokio::sync::Mutex;
use futures::StreamExt;
use std::sync::atomic::Ordering;

#[tauri::command]
async fn send_message(
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<Mutex<AIService>>>,
    message: String,
) -> Result<(), String> {
    let ai_service_clone = {
        let ai_service = state.lock().await;
        // Reset abort flag
        ai_service.abort_flag.store(false, Ordering::Relaxed);
        // Add user message
        ai_service.add_message("user", &message).await;
        ai_service.clone()
    }; // Drop lock here

    // Start chat stream
    let mut stream = ai_service_clone.chat().await.map_err(|e| e.to_string())?;

    let mut full_response = String::new();

    while let Some(chunk) = stream.next().await {
        // Check for abort
        if ai_service_clone.abort_flag.load(Ordering::Relaxed) {
             break;
        }

        if !chunk.is_empty() {
             full_response.push_str(&chunk);
             app_handle.emit("chat-stream", &chunk).map_err(|e| e.to_string())?;
        }
    }

    // Add assistant response to history (shared history via Arc<Mutex>)
    ai_service_clone.add_message("assistant", &full_response).await;

    // Check for tool call
    // Note: If multiple tools are outputted, extract_tool_json might fail if it naively takes first '{' and last '}'.
    // The previous implementation took outer braces.
    // If output is `{"tool":...}{"tool":...}`, start=0, end=last.
    // serde_json::from_str might fail on concatenated JSONs.
    // Ideally we should look for individual objects or handle concatenated JSON.
    // But given the system prompt asks for "concise" and "STRICTLY OUTPUT JSON ONLY",
    // and usually one tool per turn, we will try to make extract_tool_json robust enough.
    // If it fails to parse the whole string, we could try to find the FIRST valid JSON.
    // But for now, let's stick to the simple fix for the panic.
    if let Some(tool_json) = extract_tool_json(&full_response) {
        app_handle.emit("tool-detected", &tool_json).map_err(|e| e.to_string())?;
    }

    app_handle.emit("chat-done", ()).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn stop_generation(
    state: State<'_, Arc<Mutex<AIService>>>
) -> Result<(), String> {
    let ai_service = state.lock().await;
    ai_service.abort_flag.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
async fn execute_tool(
    state: State<'_, Arc<Mutex<CommandExecutor>>>,
    tool_name: String,
    params: Option<serde_json::Value>
) -> Result<String, String> {
    let executor = state.lock().await;
    executor.execute(&tool_name, params.as_ref())
}

#[tauri::command]
async fn get_ollama_models() -> Result<Vec<String>, String> {
    ollama::list_models()
}

#[tauri::command]
async fn set_ollama_model(
    state: State<'_, Arc<Mutex<AIService>>>,
    model: String,
) -> Result<(), String> {
    let mut ai_service = state.lock().await;
    ai_service.model = model;
    Ok(())
}

#[tauri::command]
async fn reset_chat(
    state: State<'_, Arc<Mutex<AIService>>>
) -> Result<(), String> {
    let ai_service = state.lock().await;
    ai_service.reset_history().await;
    Ok(())
}

fn extract_tool_json(text: &str) -> Option<serde_json::Value> {
    // Attempt to clean the text to find the JSON object.
    // Sometimes models output extra whitespace or text like "Here is the tool: { ... }"
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            if end >= start {
                // If end is the last char, end+1 is out of bounds for slice if we use `..=end+1` which implies `end+1` is included in the range to be checked?
                // Wait, rust slice `[a..b]` includes a, excludes b.
                // `[a..=b]` includes a and b.
                // If I want to include the char at index `end`, I should use `[start..=end]`.
                // Why did the previous code use `end+1`? Maybe confusion with Python or `..` range.
                // The error was "byte index 47 out of bounds" for a string of len 46.
                // Index 46 is out of bounds. `end` was 45. `end+1` was 46.
                // `start..=end+1` tries to include index 46. That's the bug.
                // I want to include index `end`. So `start..=end`.

                let json_str = &text[start..=end];
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if val.get("tool").is_some() {
                        return Some(val);
                    }
                }
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    const SYSTEM_PROMPT: &str = r#"You are Aura, an advanced AI system control interface for Windows.
Capabilities:
- mute: Mute/Unmute audio.
- lock: Lock workstation.
- clean_desktop: Move all files from Desktop to Documents/DesktopArchive.
- dark_mode: Enable Dark Mode.
- set_volume: Set audio volume. Format: {"tool": "set_volume", "params": {"level": 0-100}}.

Rules:
1. Be extremely concise.
2. STRICTLY OUTPUT JSON ONLY for tools. NO prose before or after.
3. Allowed tools: [mute, lock, clean_desktop, dark_mode, set_volume].
4. DO NOT invent tools. If asked for time/weather/etc, just answer normally.
5. Format: {"tool": "TOOL_NAME", "params": {...} (optional)}.
6. If asked 'what can you do?', list your capabilities.
7. If just chatting, be brief.
8. If the user greets you (e.g., 'hi', 'hello'), DO NOT use a tool. Just reply 'Ready.' or 'Hello.'.
9. ONLY use a tool if the user EXPLICITLY asks for an action (e.g., 'mute', 'lock')."#;

    let ai_service = Arc::new(Mutex::new(AIService::new("qwen2.5:0.5b".to_string(), SYSTEM_PROMPT)));
    let command_executor = Arc::new(Mutex::new(CommandExecutor::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(ai_service)
        .manage(command_executor)
        .invoke_handler(tauri::generate_handler![
            send_message,
            stop_generation,
            execute_tool,
            get_ollama_models,
            set_ollama_model,
            reset_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
