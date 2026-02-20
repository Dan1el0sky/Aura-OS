mod ai;
mod commands;

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

Rules:
1. Be extremely concise.
2. If the user wants to perform an action, output the JSON object for that tool on a new line. Format: {"tool": "TOOL_NAME"}.
3. If asked 'what can you do?', list your capabilities.
4. If just chatting, be brief.
5. If the user greets you, reply simply (e.g., 'Ready.')."#;

    let ai_service = Arc::new(Mutex::new(AIService::new("qwen2.5:0.5b".to_string(), SYSTEM_PROMPT)));
    let command_executor = Arc::new(Mutex::new(CommandExecutor::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(ai_service)
        .manage(command_executor)
        .invoke_handler(tauri::generate_handler![send_message, execute_tool])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
