use std::fs;
#[cfg(desktop)]
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

#[cfg(desktop)]
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

#[cfg(desktop)]
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

#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}
