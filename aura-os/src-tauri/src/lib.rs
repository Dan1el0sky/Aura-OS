mod ai;
mod commands;
mod ollama;

use ai::AIService;
use commands::{CommandExecutor, SystemControl};
use tauri::{State, Emitter};
use std::sync::Arc;
use tokio::sync::Mutex;
use futures::StreamExt;

#[tauri::command]
async fn send_message(
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<Mutex<AIService>>>,
    message: String,
) -> Result<(), String> {
    let ai_service = state.lock().await;

    // Add user message
    ai_service.add_message("user", &message).await;

    // Start chat stream
    let mut stream = ai_service.chat().await.map_err(|e| e.to_string())?;

    let mut full_response = String::new();

    while let Some(chunk) = stream.next().await {
        if !chunk.is_empty() {
             full_response.push_str(&chunk);
             app_handle.emit("chat-stream", &chunk).map_err(|e| e.to_string())?;
        }
    }

    // Add assistant response to history
    ai_service.add_message("assistant", &full_response).await;

    // Check for tool call
    if let Some(tool_json) = extract_tool_json(&full_response) {
        app_handle.emit("tool-detected", &tool_json).map_err(|e| e.to_string())?;
    }

    app_handle.emit("chat-done", ()).map_err(|e| e.to_string())?;

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

fn extract_tool_json(text: &str) -> Option<serde_json::Value> {
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            let json_str = &text[start..=end];
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                if val.get("tool").is_some() {
                    return Some(val);
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
8. If the user greets you, reply simply (e.g., 'Ready.')."#;

    let ai_service = Arc::new(Mutex::new(AIService::new("qwen2.5:0.5b".to_string(), SYSTEM_PROMPT)));
    let command_executor = Arc::new(Mutex::new(CommandExecutor::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(ai_service)
        .manage(command_executor)
        .invoke_handler(tauri::generate_handler![
            send_message,
            execute_tool,
            get_ollama_models,
            set_ollama_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
