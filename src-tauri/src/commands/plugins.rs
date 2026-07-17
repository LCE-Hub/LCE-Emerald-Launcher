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
pub fn list_directory(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<DirEntry>, String> {
    // security: list_directory used to accept arbitrary paths with no
    // validation. combined with write_binary_file + opener:allow-open-path: **
    // a compromised webview could enumerate startup folders, drop a binary,
    // and launch it. (LCEL-01)
    // scope to the launcher's app data dir. legitimate callers (plugin
    // discovery) operate inside this dir anyway.
    use tauri::Manager;
    let p = std::path::Path::new(&path);
    let canonical = match std::fs::canonicalize(p) {
        Ok(c) => c,
        Err(e) => return Err(format!("path not found: {}", e)),
    };
    if let Ok(app_dir) = app.path().app_data_dir() {
        let app_canonical = std::fs::canonicalize(&app_dir).unwrap_or(app_dir);
        if !canonical.starts_with(&app_canonical) {
            return Err(format!("path outside app dir: {}", path));
        }
    } else {
        return Err("no app dir".into());
    }
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        results.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        });
    }
    Ok(results)
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
