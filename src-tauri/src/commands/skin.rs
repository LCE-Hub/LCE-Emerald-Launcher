use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use base64::Engine;
use crate::types::ScreenshotInfo;
use crate::config;
use crate::util;
#[tauri::command]
pub async fn fetch_skin(app: AppHandle, username: String) -> Result<(String, String), String> {
    let client = util::build_http_client_from_app(&app).map_err(|e| e.to_string())?;
    let mojang_url = format!("https://api.mojang.com/users/profiles/minecraft/{}", username);
    let mojang_res = client.get(&mojang_url).send().await.map_err(|e| format!("Failed request to mojang: {}", e))?;
    if !mojang_res.status().is_success() {
        return Err("Player not found".to_string());
    }
    let mojang_text = mojang_res.text().await.map_err(|e| format!("Failed to read mojang text: {}", e))?;
    let mojang_data: serde_json::Value = serde_json::from_str(&mojang_text).map_err(|e| format!("Invalid Mojang JSON: {}", e))?;
    let id = mojang_data.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Invalid Moajng response format".to_string())?;
    let name_exact = mojang_data.get("name").and_then(|v| v.as_str()).unwrap_or(&username).to_string();
    let mc_api_url = format!("https://api.minecraftapi.net/v3/profile/{}", id);
    let mc_api_res = client.get(&mc_api_url).send().await.map_err(|e| format!("Failed request to mc api: {}", e))?;
    if !mc_api_res.status().is_success() {
        return Err("Error fetching skin data".to_string());
    }
    let mc_api_text = mc_api_res.text().await.map_err(|e| format!("Failed to read mc api text: {}", e))?;
    let mc_api_data: serde_json::Value = serde_json::from_str(&mc_api_text).map_err(|e| format!("Invalid MC API JSON: {}", e))?;
    let image_b64 = mc_api_data.get("skin")
        .and_then(|s| s.get("image"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No skin found".to_string())?;

    Ok((image_b64.to_string(), name_exact))
}

#[tauri::command]
pub async fn download_logo(app: AppHandle, id: String, url: String) -> Result<String, String> {
    let logos_dir = util::get_app_dir(&app).join("logos");
    fs::create_dir_all(&logos_dir).map_err(|e| e.to_string())?;
    let file_ext = if url.to_lowercase().ends_with(".png") {
        "png"
    } else if url.to_lowercase().ends_with(".jpg") || url.to_lowercase().ends_with(".jpeg") {
        "jpg"
    } else {
        "png"
    };

    let filename = format!("{}.{}", id, file_ext);
    let dest_path = logos_dir.join(&filename);
    let client = util::build_http_client_from_app(&app).map_err(|e| e.to_string())?;
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Failed to download logo: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_screenshots(app: AppHandle) -> Vec<ScreenshotInfo> {
    let mut screenshots = Vec::new();
    let root = util::get_app_dir(&app);
    let mut instance_dirs = vec![root.join("instances")];
    let config_val = config::load_config_raw(app.clone());
    if let Some(ref editions) = config_val.custom_editions {
        for ed in editions {
            if let Some(path) = &ed.path {
                instance_dirs.push(PathBuf::from(path));
            }
        }
    }

    for base_dir in instance_dirs {
        if base_dir.ends_with("instances") {
            if let Ok(entries) = fs::read_dir(&base_dir) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let instance_id = entry.file_name().to_string_lossy().to_string();
                        let dirs_to_check = [
                            entry.path().join("screenshots"),
                            entry.path().join("Windows64").join("GameHDD"),
                        ];
                        for screenshots_dir in dirs_to_check {
                            if let Ok(files) = fs::read_dir(screenshots_dir) {
                                for file in files.flatten() {
                                    let path = file.path();
                                    if path.extension().and_then(|s| s.to_str()) == Some("png") {
                                        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                        let date = path.metadata().and_then(|m| m.modified()).ok()
                                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                            .map(|d| d.as_secs())
                                            .unwrap_or(0);
                                        screenshots.push(ScreenshotInfo {
                                            path: path.to_string_lossy().to_string(),
                                            instance_id: instance_id.clone(),
                                            name,
                                            date,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            let instance_id = base_dir.file_name().and_then(|n| n.to_str()).unwrap_or("custom").to_string();
            let final_id = config_val.custom_editions.as_ref()
                .and_then(|eds| eds.iter().find(|e| e.path.as_deref() == base_dir.to_str()).map(|e| e.id.clone()))
                .unwrap_or(instance_id);

            let dirs_to_check = [
                base_dir.join("screenshots"),
                base_dir.join("Windows64").join("GameHDD"),
            ];
            for screenshots_dir in dirs_to_check {
                if let Ok(files) = fs::read_dir(screenshots_dir) {
                    for file in files.flatten() {
                        let path = file.path();
                        if path.extension().and_then(|s| s.to_str()) == Some("png") {
                            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let date = path.metadata().and_then(|m| m.modified()).ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0);
                            screenshots.push(ScreenshotInfo {
                                path: path.to_string_lossy().to_string(),
                                instance_id: final_id.clone(),
                                name,
                                date,
                            });
                        }
                    }
                }
            }
        }
    }
    screenshots.sort_by(|a, b| b.date.cmp(&a.date));
    screenshots
}

#[tauri::command]
pub fn delete_screenshot(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_screenshot_folder(app: AppHandle, path: String) {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if parent.exists() {
            let _ = app.opener().open_path(parent.to_str().unwrap(), None::<&str>);
        }
    }
}

#[tauri::command]
pub async fn save_global_skin_pck(app: AppHandle, pck_data: Vec<u8>) -> Result<(), String> {
    let app_dir = util::get_app_dir(&app);
    let _ = fs::write(app_dir.join("Skin.pck"), pck_data);
    Ok(())
}

#[tauri::command]
pub fn read_screenshot_as_data_url(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let mime = if path.to_lowercase().ends_with(".png") {
        "image/png"
    } else if path.to_lowercase().ends_with(".jpg") || path.to_lowercase().ends_with(".jpeg") {
        "image/jpeg"
    } else if path.to_lowercase().ends_with(".gif") {
        "image/gif"
    } else if path.to_lowercase().ends_with(".webp") {
        "image/webp"
    } else if data.len() > 4 && data[..4] == [0x89, 0x50, 0x4E, 0x47] {
        "image/png"
    } else if data.len() > 2 && data[..2] == [0xFF, 0xD8] {
        "image/jpeg"
    } else {
        "image/png"
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}
