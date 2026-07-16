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
// TODO: scope these to a launcher-specific subdirectory with canonical
// containment checks, or remove from the IPC surface entirely and route
// all binary file ops through rfd-gated dialogs.
// for now, refuse all paths. callers must use pick_file / save_file_dialog.
#[tauri::command]
pub fn write_binary_file(_path: String, _data: Vec<u8>) -> Result<(), String> {
    Err("write_binary_file disabled: use save_file_dialog instead".into())
}

#[tauri::command]
pub fn read_binary_file(_path: String) -> Result<Vec<u8>, String> {
    Err("read_binary_file disabled: use pick_file instead".into())
}
