use std::path::Path;
use std::fs;
use tauri::AppHandle;

#[tauri::command]
#[allow(non_snake_case)]
pub async fn import_world(
    _app: AppHandle,
    input_path: String,
    output_path: String,
) -> Result<String, String> {
    let output_parent = Path::new(&output_path).parent();
    if let Some(parent) = output_parent {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory {:?}: {}", parent, e))?;
        }
    }

    fs::copy(&input_path, &output_path)
        .map_err(|e| format!("Failed to copy .ms file: {}", e))?;

    Ok(format!("World imported successfully!\nOutput: {}", output_path))
}
