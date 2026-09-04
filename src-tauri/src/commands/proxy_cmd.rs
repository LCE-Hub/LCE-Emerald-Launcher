use crate::types::HttpResponse;
use crate::util;
#[tauri::command]
pub async fn http_proxy_request(
    app: tauri::AppHandle,
    method: String,
    url: String,
    body: Option<String>,
    headers: std::collections::HashMap<String, String>,
) -> Result<HttpResponse, String> {
    let client = util::build_http_client_from_app(&app)?;
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
