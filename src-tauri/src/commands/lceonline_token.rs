use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

// security: store the LCEOnline access token in a file under app_data_dir
// with 0600 permissions instead of localStorage. localStorage is readable
// by any JS in the webview origin (XSS exposure). the file is only
// readable by the user account that runs the launcher. (LCEL-08)
const TOKEN_FILE: &str = "session.json";

fn token_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(TOKEN_FILE))
}

#[tauri::command]
pub fn lceonline_token_store(app: AppHandle, token: String, username: String) -> Result<(), String> {
    let path = token_path(&app)?;
    let json = serde_json::json!({
        "token": token,
        "username": username,
    })
    .to_string();
    fs::write(&path, json).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn lceonline_token_load(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = token_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(v))
}

#[tauri::command]
pub fn lceonline_token_clear(app: AppHandle) -> Result<(), String> {
    let path = token_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
