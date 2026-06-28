use once_cell::sync::Lazy;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use tauri::{AppHandle, Emitter};
const REGISTRY_URL: &str = "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main";
static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| reqwest::Client::new());
pub struct Guard {
    cancel: Option<CancellationToken>,
}

impl Guard {
    pub fn new(cancel: CancellationToken) -> Self {
        Self { cancel: Some(cancel) }
    }
}

impl Drop for Guard {
    fn drop(&mut self) {
        if let Some(cancel) = self.cancel.take() {
            cancel.cancel();
        }
    }
}

pub async fn start(app: AppHandle) -> CancellationToken {
    let cancel = CancellationToken::new();
    let server_cancel = cancel.clone();
    tokio::spawn(async move {
        serve(app, server_cancel).await;
    });

    cancel
}

async fn serve(app: AppHandle, cancel: CancellationToken) {
    let listener = match TcpListener::bind("127.0.0.1:5582").await {
        Ok(l) => l,
        Err(e) => {
            let _ = app.emit("backend-error", format!("Workshop server failed to bind: {e}"));
            eprintln!("[WorkshopServer] Failed to bind: {e}");
            return;
        }
    };

    loop {
        tokio::select! {
            result = listener.accept() => {
                match result {
                    Ok((stream, _)) => {
                        tokio::spawn(handle(stream));
                    }
                    Err(e) => {
                        let _ = app.emit("backend-error", format!("Workshop server accept error: {e}"));
                        eprintln!("[WorkshopServer] Accept error: {e}");
                    }
                }
            }
            _ = cancel.cancelled() => break,
        }
    }
}

async fn handle(stream: tokio::net::TcpStream) {
    let (reader, mut writer) = stream.into_split();
    let mut buf_reader = BufReader::new(reader);
    let mut request_line = String::new();
    if buf_reader.read_line(&mut request_line).await.is_err() {
        return;
    }
    let request_line = request_line.trim();
    loop {
        let mut line = String::new();
        if buf_reader.read_line(&mut line).await.is_err() {
            return;
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
    }

    if request_line.starts_with("GET /workshop/") && request_line.ends_with(" HTTP/1.1") {
        let path = &request_line["GET /workshop/".len()..request_line.len() - " HTTP/1.1".len()];
        match fetch_workshop_file(path).await {
            Ok(body) => {
                let body_bytes = &body;
                let content_type = if path.ends_with(".json") {
                    "application/json"
                } else if path.ends_with(".png") {
                    "image/png"
                } else {
                    "application/octet-stream"
                };
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                    content_type,
                    body.len(),
                );
                let _ = writer.write_all(response.as_bytes()).await;
                let _ = writer.write_all(body_bytes).await;
            }
            Err(e) => {
                    let status = if e.contains("404") { 404 } else { 502 };
                    let body = format!("{{\"error\": \"{e}\"}}");
                    let response = format!(
                        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        status,
                        if status == 404 { "Not Found" } else { "Bad Gateway" },
                        body.len(),
                        body
                    );
                let _ = writer.write_all(response.as_bytes()).await;
            }
        }
    } else {
        let body = "{\"error\": \"not found\"}";
        let response = format!(
            "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = writer.write_all(response.as_bytes()).await;
    }
}

async fn fetch_workshop_file(path: &str) -> Result<Vec<u8>, String> {
    let url = format!("{}/{}", REGISTRY_URL, path);
    let resp = CLIENT.get(&url).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
    } else {
        Err(format!("GitHub returned {}", resp.status()))
    }
}
