use serde::{Deserialize, Serialize};
use reqwest::Client;
use futures::StreamExt;
use std::pin::Pin;
use futures::stream::Stream;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Debug)]
pub struct OllamaRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
}

#[derive(Deserialize, Debug)]
pub struct OllamaResponse {
    pub message: ChatMessage,
}

#[derive(Clone)]
pub struct AIService {
    client: Client,
    pub history: Arc<Mutex<Vec<ChatMessage>>>,
    pub model: String,
}

impl AIService {
    pub fn new(model: String, system_prompt: &str) -> Self {
        let history = vec![ChatMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        }];
        Self {
            client: Client::new(),
            history: Arc::new(Mutex::new(history)),
            model,
        }
    }

    pub async fn add_message(&self, role: &str, content: &str) {
        let mut history = self.history.lock().await;
        history.push(ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
        });
    }

    pub async fn chat(&self) -> Result<Pin<Box<dyn Stream<Item = String> + Send>>, reqwest::Error> {
        let history = self.history.lock().await.clone();
        let request = OllamaRequest {
            model: self.model.clone(),
            messages: history,
            stream: true,
        };

        let res = self.client.post("http://localhost:11434/api/chat")
            .json(&request)
            .send()
            .await?;

        let stream = res.bytes_stream();

        let output_stream = stream.filter_map(|chunk_res| async move {
            match chunk_res {
                Ok(bytes) => {
                    let s = String::from_utf8_lossy(&bytes).to_string();
                    let mut combined = String::new();
                    for line in s.lines() {
                        if !line.trim().is_empty() {
                            if let Ok(json) = serde_json::from_str::<OllamaResponse>(line) {
                                combined.push_str(&json.message.content);
                            }
                        }
                    }
                    if combined.is_empty() { None } else { Some(combined) }
                },
                Err(_) => None,
            }
        });

        Ok(Box::pin(output_stream))
    }
}
