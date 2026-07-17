use std::fs;
#[tauri::command]
pub fn pick_folder() -> Result<String, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Select Export Folder")
        .pick_folder();

    if let Some(path) = folder {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err("CANCELED".into())
    }
}

#[tauri::command]
pub fn pick_file(title: String, filters: Vec<String>) -> Result<String, String> {
    let mut dialog = rfd::FileDialog::new().set_title(&title);
    if !filters.is_empty() {
        let filters_ref: Vec<&str> = filters.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter("Files", &filters_ref);
    }
    if let Some(path) = dialog.pick_file() {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err("CANCELED".into())
    }
}

#[tauri::command]
pub fn save_file_dialog(title: String, filename: String, filters: Vec<String>) -> Result<String, String> {
    let mut dialog = rfd::FileDialog::new().set_title(&title).set_file_name(&filename);
    if !filters.is_empty() {
        let filters_ref: Vec<&str> = filters.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter("Files", &filters_ref);
    }
    if let Some(path) = dialog.save_file() {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err("CANCELED".into())
    }
}

// security: write_binary_file / read_binary_file used to accept arbitrary
// paths with no validation, no dialog, no scope. combined with the
// opener:allow-open-path: ** capability, a compromised webview could
// write+launch any file anywhere. (LCEL-01)
// scope to the launcher's app data dir. legitimate callers (plugin
// loading) operate inside this dir anyway.
use tauri::Manager;

fn is_path_scoped(path: &std::path::Path, app: &tauri::AppHandle) -> bool {
    let canonical = match std::fs::canonicalize(path) {
        Ok(p) => p,
        Err(_) => return false,
    };
    if let Ok(app_dir) = app.path().app_data_dir() {
        let app_canonical = std::fs::canonicalize(&app_dir).unwrap_or(app_dir);
        return canonical.starts_with(&app_canonical);
    }
    false
}

#[tauri::command]
pub fn write_binary_file(
    app: tauri::AppHandle,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !is_path_scoped(p, &app) {
        return Err(format!("path outside app dir: {}", path));
    }
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_binary_file(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<u8>, String> {
    let p = std::path::Path::new(&path);
    if !is_path_scoped(p, &app) {
        return Err(format!("path outside app dir: {}", path));
    }
    fs::read(path).map_err(|e| e.to_string())
}
