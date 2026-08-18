use std::fs;
use tauri::AppHandle;
use crate::config;
use crate::types::{AppConfig, ThemePalette};
use crate::util;
#[tauri::command]
pub fn save_config(app: AppHandle, config_val: AppConfig) {
    config::save_config_raw(&app, &config_val);
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> AppConfig {
    config::load_config_raw(app)
}

#[tauri::command]
pub fn get_external_palettes(app: AppHandle) -> Vec<ThemePalette> {
    let themes_dir = util::get_app_dir(&app).join("themes");
    let _ = fs::create_dir_all(&themes_dir);
    let mut palettes = Vec::new();
    if let Ok(entries) = fs::read_dir(themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(palette) = serde_json::from_str::<ThemePalette>(&content) {
                        palettes.push(palette);
                    }
                }
            }
        }
    }
    palettes
}

#[cfg(desktop)]
#[tauri::command]
pub fn import_theme(app: AppHandle) -> Result<String, String> {
    let file = rfd::FileDialog::new()
        .add_filter("JSON Theme", &["json"])
        .set_title("Import Theme Palette")
        .pick_file();

    if let Some(src_path) = file {
        let content = fs::read_to_string(&src_path).map_err(|e| e.to_string())?;
        let palette: ThemePalette =
            serde_json::from_str(&content).map_err(|_| "Invalid theme JSON format".to_string())?;
        let themes_dir = util::get_app_dir(&app).join("themes");
        let _ = fs::create_dir_all(&themes_dir);
        let dest_path = themes_dir.join(format!("{}.json", palette.id));
        fs::write(dest_path, content).map_err(|e| e.to_string())?;
        Ok(palette.name)
    } else {
        Err("CANCELED".into())
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn export_settings(app: AppHandle) -> Result<(), String> {
    let config = config::load_config_raw(app.clone());
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let file = rfd::FileDialog::new()
        .add_filter("Emerald Settings", &["json"])
        .set_title("Export Launcher Settings")
        .set_file_name("emerald_settings.json")
        .save_file();

    if let Some(path) = file {
        fs::write(&path, &json).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("CANCELED".into())
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn import_settings(app: AppHandle) -> Result<String, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Emerald Settings", &["json"])
        .set_title("Import Launcher Settings")
        .pick_file();

    if let Some(path) = file {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let config: AppConfig =
            serde_json::from_str(&content).map_err(|_| "Invalid settings JSON format".to_string())?;
        config::save_config_raw(&app, &config);
        Ok("Settings imported successfully! Restart the launcher to apply.".into())
    } else {
        Err("CANCELED".into())
    }
}
