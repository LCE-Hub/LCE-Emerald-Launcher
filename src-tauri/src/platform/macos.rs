use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use crate::types::MacosSetupProgressPayload;
pub fn get_macos_runtime_dir(app: &AppHandle) -> PathBuf {
    let home = app
        .path()
        .home_dir()
        .ok()
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("/"));
    home.join("Library")
        .join("Application Support")
        .join("com.emerald.legacy")
        .join("runtime")
}

pub fn find_executable_recursive(root: &PathBuf, file_name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name == file_name {
                return Some(path);
            }
        }
        if path.is_dir() {
            if let Some(found) = find_executable_recursive(&path, file_name) {
                return Some(found);
            }
        }
    }
    None
}

pub fn emit_macos_setup_progress(window: &tauri::Window, stage: &str, message: String, percent: Option<f64>) {
    let _ = window.emit(
        "macos-setup-progress",
        MacosSetupProgressPayload {
            stage: stage.to_string(),
            message,
            percent,
        },
    );
}

pub fn is_macos_runtime_installed(app: &AppHandle) -> bool {
    let runtime_dir = get_macos_runtime_dir(app);
    let toolkit_dir = runtime_dir.join("toolkit");
    if !toolkit_dir.exists() {
        return false;
    }
    if find_executable_recursive(&toolkit_dir, "Game Porting Toolkit.app").is_some() {
        return true;
    }
    find_executable_recursive(&toolkit_dir, "wine").is_some()
        || find_executable_recursive(&toolkit_dir, "wine64").is_some()
}
