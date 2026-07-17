use serde::Serialize;
use std::fs;
#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn get_plugins_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = crate::util::get_app_dir(&app).join("plugins");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    // security: list_directory used to accept arbitrary paths with no
    // validation. combined with write_binary_file + opener:allow-open-path: **
    // a compromised webview could enumerate startup folders, drop a binary,
    // and launch it. (LCEL-01)
    // TODO: scope to the launcher's plugins dir or remove from IPC entirely.
    // for now, refuse all paths.
    Err("list_directory disabled: use get_plugins_dir instead".into())
}

#[tauri::command]
pub fn create_plugin_dir(app: tauri::AppHandle, plugin_id: String) -> Result<String, String> {
    let dir = crate::util::get_app_dir(&app)
        .join("plugins")
        .join(&plugin_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn remove_plugin_dir(app: tauri::AppHandle, plugin_id: String) -> Result<(), String> {
    let dir = crate::util::get_app_dir(&app)
        .join("plugins")
        .join(&plugin_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
