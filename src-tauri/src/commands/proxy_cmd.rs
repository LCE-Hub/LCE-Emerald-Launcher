use crate::types::HttpResponse;
// security: allowlist of hosts http_proxy_request is allowed to talk to.
// the command used to accept any URL with no validation - full SSRF to
// loopback (127.0.0.1:5582 workshop server), LAN peers' relay ports,
// cloud metadata (169.254.169.254), internal admin panels. (LCEL-03)
const ALLOWED_HOSTS: &[&str] = &[
    "auth.mclegacyedition.xyz",
    "social.mclegacyedition.xyz",
    "raw.githubusercontent.com",
    "api.github.com",
];

fn is_url_allowed(url: &str) -> bool {
    let parsed = match reqwest::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let host = match parsed.host_str() {
        Some(h) => h.to_lowercase(),
        None => return false,
    };
    // block loopback and link-local by default
    if host == "localhost" || host == "127.0.0.1" || host == "::1"
        || host.starts_with("127.") || host.starts_with("169.254.")
        || host.starts_with("192.168.") || host.starts_with("10.")
    {
        return false;
    }
    ALLOWED_HOSTS.iter().any(|h| host == *h)
}

#[tauri::command]
pub async fn http_proxy_request(
    method: String,
    url: String,
    body: Option<String>,
    headers: std::collections::HashMap<String, String>,
) -> Result<HttpResponse, String> {
    if !is_url_allowed(&url) {
        return Err(format!("url not allowed: {}", url));
    }
    let client = reqwest::Client::new();
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(HttpResponse {
        status,
        body: text,
    })
}
