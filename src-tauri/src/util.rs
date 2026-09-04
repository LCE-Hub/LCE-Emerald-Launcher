use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use crate::config;
pub fn get_app_dir(app: &AppHandle) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_else(|_| {
        std::env::current_dir().unwrap_or_default()
    })
}

pub fn get_config_path(app: &AppHandle) -> PathBuf {
    get_app_dir(app).join("emerald_legacy_config.json")
}

pub fn get_instance_working_dir(app: &AppHandle, instance_id: &str) -> PathBuf {
    let root = get_app_dir(app);
    let config = config::load_config_raw(app.clone());
    if let Some(ref editions) = config.custom_editions {
        if let Some(edition) = editions.iter().find(|e| e.id == instance_id) {
            if let Some(ref path) = edition.path {
                return PathBuf::from(path);
            }
        }
    }
    if let Some(ref custom_paths) = config.custom_paths {
        if let Some(path) = custom_paths.get(instance_id) {
            return PathBuf::from(path);
        }
    }
    root.join("instances").join(instance_id)
}

pub fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

pub fn build_http_client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();
    builder = builder.user_agent("Emerald-Launcher");
    if let Some(p) = proxy {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let proxy = reqwest::Proxy::all(trimmed).map_err(|e| format!("Invalid proxy: {e}"))?;
            builder = builder.proxy(proxy);
        }
    }
    builder.build().map_err(|e| e.to_string())
}

pub fn build_http_client_from_app(app: &AppHandle) -> Result<reqwest::Client, String> {
    let config = config::load_config_raw(app.clone());
    build_http_client(config.http_proxy.as_deref())
}

#[cfg(unix)]
pub fn unix_path_to_wine_z_path(unix_path: &PathBuf) -> String {
    let p = unix_path.to_string_lossy();
    let mut out = String::with_capacity(p.len() + 3);
    out.push_str("Z:");
    for ch in p.chars() {
        if ch == '/' {
            out.push('\\');
        } else {
            out.push(ch);
        }
    }
    out
}
