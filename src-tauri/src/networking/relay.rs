use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_util::sync::CancellationToken;
use crate::state::ProxyGuard;
const PROXY_ADDR: &str = "proxy.mclegacyedition.xyz:2052"; //neo: yeah bro im hardcoding it
async fn read_line(stream: &mut TcpStream) -> Result<String, String> {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        stream.read_exact(&mut byte).await.map_err(|e| e.to_string())?;
        if byte[0] == b'\n' { break; }
        buf.push(byte[0]);
    }
    String::from_utf8(buf).map_err(|e| e.to_string())
}

async fn write_line(stream: &mut TcpStream, line: &str) -> Result<(), String> {
    let data = format!("{}\n", line);
    stream.write_all(data.as_bytes()).await.map_err(|e| e.to_string())
}

async fn run_host_relay(
    _proxy_state: &ProxyGuard,
    proxy_addr: &str,
    auth_token: &str,
    game_port: u16,
    cancel: CancellationToken,
) -> Result<(), String> {
    let mut host_conn = TcpStream::connect(proxy_addr)
        .await
        .map_err(|e| format!("Proxy connect failed: {}", e))?;

    write_line(&mut host_conn, &format!("HOST {} 0", auth_token)).await?;
    let game_stream = loop {
        match TcpStream::connect(format!("127.0.0.1:{}", game_port)).await {
            Ok(s) => break s,
            Err(_) => {
                tokio::select! {
                    _ = cancel.cancelled() => return Err("Cancelled".into()),
                    _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {}
                }
            }
        }
    };

    let client_line = read_line(&mut host_conn).await?;
    let client_parts: Vec<&str> = client_line.split_whitespace().collect();
    if client_parts.len() < 2 || client_parts[0] != "CLIENT" {
        return Err(format!("Expected CLIENT, got: {}", client_line));
    }
    let joiner_id = client_parts[1];
    let mut accept_conn = TcpStream::connect(proxy_addr)
        .await
        .map_err(|e| format!("Proxy connect failed: {}", e))?;
    write_line(&mut accept_conn, &format!("ACCEPT {} 0 {}", auth_token, joiner_id)).await?;
    let (mut g_read, mut g_write) = game_stream.into_split();
    let (mut a_read, mut a_write) = accept_conn.into_split();
    let c1 = cancel.clone();
    let c2 = cancel.clone();
    let t1 = tokio::spawn(async move {
        let mut buf = [0u8; 65536];
        loop {
            tokio::select! {
                r = g_read.read(&mut buf) => {
                    match r {
                        Ok(0) | Err(_) => break,
                        Ok(n) => { if a_write.write_all(&buf[..n]).await.is_err() { break; } }
                    }
                }
                _ = c1.cancelled() => break,
            }
        }
    });

    let t2 = tokio::spawn(async move {
        let mut buf = [0u8; 65536];
        loop {
            tokio::select! {
                r = a_read.read(&mut buf) => {
                    match r {
                        Ok(0) | Err(_) => break,
                        Ok(n) => { if g_write.write_all(&buf[..n]).await.is_err() { break; } }
                    }
                }
                _ = c2.cancelled() => break,
            }
        }
    });

    let _ = tokio::join!(t1, t2);
    Ok(())
}

async fn run_relay_proxy(
    proxy_state: &ProxyGuard,
    proxy_addr: &str,
    auth_token: &str,
    target_session: &str,
    cancel: CancellationToken,
) -> Result<u16, String> {
    let mut stream = TcpStream::connect(proxy_addr)
        .await
        .map_err(|e| format!("Proxy connect failed: {}", e))?;

    write_line(&mut stream, &format!("JOIN {} {}", auth_token, target_session)).await?;
    let listener = TcpListener::bind("0.0.0.0:61000")
        .await
        .map_err(|e| format!("Bind failed: {}", e))?;
    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    {
        let mut port = proxy_state.local_port.lock().await;
        *port = Some(local_port);
    }

    let (local_stream, _) = tokio::select! {
        r = listener.accept() => r.map_err(|e| format!("Accept failed: {}", e))?,
        _ = cancel.cancelled() => return Err("Cancelled".into()),
    };

    let (mut l_read, mut l_write) = local_stream.into_split();
    let (mut s_read, mut s_write) = stream.into_split();
    let c1 = cancel.clone();
    let c2 = cancel.clone();
    let t1 = tokio::spawn(async move {
        let mut buf = [0u8; 65536];
        loop {
            tokio::select! {
                r = l_read.read(&mut buf) => {
                    match r {
                        Ok(0) | Err(_) => break,
                        Ok(n) => { if s_write.write_all(&buf[..n]).await.is_err() { break; } }
                    }
                }
                _ = c1.cancelled() => break,
            }
        }
    });

    let t2 = tokio::spawn(async move {
        let mut buf = [0u8; 65536];
        loop {
            tokio::select! {
                r = s_read.read(&mut buf) => {
                    match r {
                        Ok(0) | Err(_) => break,
                        Ok(n) => { if l_write.write_all(&buf[..n]).await.is_err() { break; } }
                    }
                }
                _ = c2.cancelled() => break,
            }
        }
    });

    let _ = tokio::join!(t1, t2);
    Ok(local_port)
}

#[tauri::command]
pub async fn start_host_relay(
    proxy_state: State<'_, ProxyGuard>,
    auth_token: String,
    game_port: u16,
) -> Result<(), String> {
    let addr = PROXY_ADDR;
    let cancel = CancellationToken::new();
    let session_id = "__host__".to_string();
    {
        let mut tokens = proxy_state.cancel_tokens.lock().await;
        tokens.insert(session_id.clone(), cancel.clone());
    }

    let result = run_host_relay(&proxy_state, &addr, &auth_token, game_port, cancel).await;
    {
        let mut tokens = proxy_state.cancel_tokens.lock().await;
        tokens.remove(&session_id);
    }

    result
}

#[tauri::command]
pub async fn start_relay_proxy(
    proxy_state: State<'_, ProxyGuard>,
    auth_token: String,
    target_session: String,
) -> Result<u16, String> {
    let addr = PROXY_ADDR;
    let cancel = CancellationToken::new();
    let session_id = target_session.clone();
    {
        let mut tokens = proxy_state.cancel_tokens.lock().await;
        tokens.insert(session_id.clone(), cancel.clone());
    }

    let local_port = run_relay_proxy(&proxy_state, &addr, &auth_token, &target_session, cancel).await?;
    {
        let mut tokens = proxy_state.cancel_tokens.lock().await;
        tokens.remove(&session_id);
    }

    Ok(local_port)
}

#[tauri::command]
pub async fn stop_proxy(proxy_state: State<'_, ProxyGuard>, session_id: String) -> Result<(), String> {
    let mut tokens = proxy_state.cancel_tokens.lock().await;
    if let Some(token) = tokens.remove(&session_id) {
        token.cancel();
    }
    let mut port = proxy_state.local_port.lock().await;
    *port = None;
    Ok(())
}

#[tauri::command]
pub async fn stop_all_proxies(proxy_state: State<'_, ProxyGuard>) -> Result<(), String> {
    let mut tokens = proxy_state.cancel_tokens.lock().await;
    for (_, token) in tokens.drain() {
        token.cancel();
    }
    let mut port = proxy_state.local_port.lock().await;
    *port = None;
    Ok(())
}

#[tauri::command]
pub async fn join_game(
    app: tauri::AppHandle,
    game_state: State<'_, crate::state::GameState>,
    _proxy_state: State<'_, ProxyGuard>,
    _api_base_url: String,
    _auth_token: String,
    host_ip: String,
    host_port: u16,
    _target_session: String,
    instance_id: String,
) -> Result<(), String> {
    let server = crate::types::McServer {
        name: host_ip.clone(),
        ip: host_ip,
        port: host_port,
    };
    crate::commands::game::launch_game(app, game_state, instance_id, vec![server], vec![]).await
}