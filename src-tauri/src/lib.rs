use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use steam_shortcuts_util::{Shortcut, parse_shortcuts, shortcuts_to_bytes};

#[cfg(target_os = "macos")]
use std::process::Stdio;

use tauri::{AppHandle, Emitter, State, Manager};
use futures_util::{StreamExt, SinkExt};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;
use tauri_plugin_opener::OpenerExt;
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McServer {
    pub name: String,
    pub ip: String,
    pub port: u16,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkinLibraryItem {
    pub id: String,
    pub name: String,
    pub skin_base64: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CustomEdition {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub url: String,
    pub path: Option<String>,
    pub category: Option<Vec<String>>,
    pub logo: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub username: String,
    pub linux_runner: Option<String>,
    pub skin_base64: Option<String>,
    pub skin_library: Option<Vec<SkinLibraryItem>>,
    pub theme_style_id: Option<String>,
    pub theme_palette_id: Option<String>,
    pub apple_silicon_performance_boost: Option<bool>,
    pub custom_editions: Option<Vec<CustomEdition>>,
    pub profile: Option<String>,
    pub animations_enabled: Option<bool>,
    pub vfx_enabled: Option<bool>,
    pub rpc_enabled: Option<bool>,
    pub music_vol: Option<u32>,
    pub sfx_vol: Option<u32>,
    pub legacy_mode: Option<bool>,
    pub mangohud_enabled: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThemePalette {
    pub id: String,
    pub name: String,
    pub colors: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Runner {
    pub id: String,
    pub name: String,
    pub path: String,
    pub r#type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotInfo {
    pub path: String,
    pub instance_id: String,
    pub name: String,
    pub date: u64,
}

#[derive(Serialize)]
pub struct HttpResponse {
    status: u16,
    body: String,
}

pub struct DownloadState { pub token: Arc<Mutex<Option<CancellationToken>>> }
pub struct GameState { pub child: Arc<Mutex<Option<tokio::process::Child>>> }

pub struct ProxyGuard {
    pub cancel_token: Arc<Mutex<Option<CancellationToken>>>,
    pub local_port: Arc<Mutex<Option<u16>>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[cfg(target_os = "macos")]
struct MacosSetupProgressPayload {
    stage: String,
    message: String,
    percent: Option<f64>,
}

fn get_app_dir(app: &AppHandle) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_else(|_| {
        std::env::current_dir().unwrap_or_default()
    })
}

#[cfg(target_os = "macos")]
fn get_macos_runtime_dir(app: &AppHandle) -> PathBuf {
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

fn get_instance_working_dir(app: &AppHandle, instance_id: &str) -> PathBuf {
    let root = get_app_dir(app);
    let config = load_config(app.clone());
    if let Some(ref editions) = config.custom_editions {
        if let Some(edition) = editions.iter().find(|e| e.id == instance_id) {
            if let Some(ref path) = edition.path {
                return PathBuf::from(path);
            }
        }
    }
    root.join("instances").join(instance_id)
}

#[cfg(target_os = "macos")]
fn emit_macos_setup_progress(window: &tauri::Window, stage: &str, message: String, percent: Option<f64>) {
    let _ = window.emit(
        "macos-setup-progress",
        MacosSetupProgressPayload {
            stage: stage.to_string(),
            message,
            percent,
        },
    );
}

#[cfg(target_os = "macos")]
fn find_executable_recursive(root: &PathBuf, file_name: &str) -> Option<PathBuf> {
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

fn is_macos_runtime_installed(_app: &AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        let runtime_dir = get_macos_runtime_dir(_app);
        let toolkit_dir = runtime_dir.join("toolkit");
        if !toolkit_dir.exists() {
            return false;
        }

        let candidates = [
            "Game Porting Toolkit.app",
        ];

        return candidates.iter().any(|name| find_executable_recursive(&toolkit_dir, name).is_some());
    }

    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[tauri::command]
fn check_macos_runtime_installed(app: AppHandle) -> bool {
    is_macos_runtime_installed(&app)
}

#[tauri::command]
fn check_macos_runtime_installed_fast(app: AppHandle) -> bool {
    is_macos_runtime_installed(&app)
}

#[cfg(unix)]
fn unix_path_to_wine_z_path(unix_path: &PathBuf) -> String {
    let p = unix_path.to_string_lossy();
    let mut out = String::with_capacity(p.len() + 3);
    out.push_str("Z:");
    for ch in p.chars() {
        if ch == '/' {
            out.push('\\');
        } else {
            out.push(ch);
        }
    }
    out
}

fn get_config_path(app: &AppHandle) -> PathBuf {
    get_app_dir(app).join("emerald_legacy_config.json")
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) {
    let path = get_config_path(&app);
    let _ = fs::create_dir_all(path.parent().unwrap());
    if let Ok(json) = serde_json::to_string(&config) {
        let _ = fs::write(path, json);
    }
}

#[tauri::command]
fn load_config(app: AppHandle) -> AppConfig {
    let path = get_config_path(&app);
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(config) = serde_json::from_str(&content) {
            return config;
        }
    }

    let old_path = get_app_dir(&app).join("emerald_legacy_config.txt");
    let username = fs::read_to_string(old_path).unwrap_or_else(|_| "Player".into());
    AppConfig {
        username,
        linux_runner: None,
        skin_base64: None,
        skin_library: None,
        theme_style_id: None,
        theme_palette_id: None,
        apple_silicon_performance_boost: None,
        custom_editions: None,
        profile: Some("legacy_evolved".into()),
        animations_enabled: Some(true),
        vfx_enabled: Some(true),
        rpc_enabled: Some(true),
        music_vol: Some(50),
        sfx_vol: Some(100),
        legacy_mode: Some(false),
        mangohud_enabled: None,
    }
}

#[tauri::command]
fn get_external_palettes(app: AppHandle) -> Vec<ThemePalette> {
    let themes_dir = get_app_dir(&app).join("themes");
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

#[tauri::command]
fn import_theme(app: AppHandle) -> Result<String, String> {
    let file = rfd::FileDialog::new()
        .add_filter("JSON Theme", &["json"])
        .set_title("Import Theme Palette")
        .pick_file();

    if let Some(src_path) = file {
        let content = fs::read_to_string(&src_path).map_err(|e| e.to_string())?;
        let palette: ThemePalette = serde_json::from_str(&content).map_err(|_| "Invalid theme JSON format".to_string())?;

        let themes_dir = get_app_dir(&app).join("themes");
        let _ = fs::create_dir_all(&themes_dir);

        let dest_path = themes_dir.join(format!("{}.json", palette.id));
        fs::write(dest_path, content).map_err(|e| e.to_string())?;

        Ok(palette.name)
    } else {
        Err("CANCELED".into())
    }
}

#[tauri::command]
fn pick_folder() -> Result<String, String> {
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
fn pick_file(title: String, filters: Vec<String>) -> Result<String, String> {
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
fn save_file_dialog(title: String, filename: String, filters: Vec<String>) -> Result<String, String> {
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
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_screenshot_as_data_url(path: String) -> Result<String, String> {
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
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn get_available_runners(app: AppHandle) -> Vec<Runner> {
    let mut runners = Vec::new();
    let mut seen_paths: std::collections::HashSet<String> = std::collections::HashSet::new();

    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("which").arg("wine").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !seen_paths.contains(&path) {
                    seen_paths.insert(path.clone());
                    runners.push(Runner {
                        id: "wine".to_string(),
                        name: "System Wine".to_string(),
                        path,
                        r#type: "wine".to_string(),
                    });
                }
            }
        }

        if let Ok(output) = Command::new("ls").arg("/usr/share/emerald-legacy-launcher/wine/bin/wine").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !seen_paths.contains(&path) {
                    seen_paths.insert(path.clone());
                    runners.push(Runner {
                        id: "flatpaksucks".to_string(),
                        name: "Default for Flatpak".to_string(),
                        path,
                        r#type: "wine".to_string(),
                    });
                }
            }
        }

        let home = std::env::var("HOME").unwrap_or_default();
        let steam_paths = [
            format!("{}/.local/share/Steam/compatibilitytools.d", home),
            format!("{}/.local/share/Steam/steamapps/common", home),
            "/usr/share/Steam/compatibilitytools.d".to_string()
        ];

        for base_path in steam_paths {
            if let Ok(entries) = fs::read_dir(base_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.to_lowercase().contains("proton") {
                            let path_str = path.to_string_lossy().to_string();
                            if !seen_paths.contains(&path_str) {
                                seen_paths.insert(path_str.clone());
                                runners.push(Runner {
                                    id: format!("proton_{}", name),
                                    name: name,
                                    path: path_str,
                                    r#type: "proton".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }

        let runners_dir = get_app_dir(&app).join("runners");
        let _ = fs::create_dir_all(&runners_dir);
        if let Ok(entries) = fs::read_dir(&runners_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    let wine_bin = path.join("bin").join("wine");
                    let proton_bin = path.join("proton");
                    if proton_bin.exists() {
                        let path_str = path.to_string_lossy().to_string();
                        if !seen_paths.contains(&path_str) {
                            seen_paths.insert(path_str.clone());
                            runners.push(Runner {
                                id: format!("downloaded_{}", dir_name),
                                name: format!("{} (downloaded)", dir_name),
                                path: path_str,
                                r#type: "proton".to_string(),
                            });
                        }
                    } else if wine_bin.exists() {
                        let path_str = wine_bin.to_string_lossy().to_string();
                        if !seen_paths.contains(&path_str) {
                            seen_paths.insert(path_str.clone());
                            runners.push(Runner {
                                id: format!("downloaded_{}", dir_name),
                                name: format!("{} (downloaded)", dir_name),
                                path: path_str,
                                r#type: "wine".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    runners
}

#[tauri::command]
async fn download_runner(app: AppHandle, state: State<'_, DownloadState>, name: String, url: String) -> Result<String, String> {
    let runners_dir = get_app_dir(&app).join("runners");
    fs::create_dir_all(&runners_dir).map_err(|e| e.to_string())?;

    let runner_dir = runners_dir.join(&name);
    if runner_dir.exists() {
        let _ = fs::remove_dir_all(&runner_dir);
    }
    fs::create_dir_all(&runner_dir).map_err(|e| e.to_string())?;

    let token = CancellationToken::new();
    let child_token = token.clone();
    {
        let mut lock = state.token.lock().await;
        if let Some(old_token) = lock.take() {
            old_token.cancel();
        }
        *lock = Some(token);
    }

    let tarball_path = runners_dir.join(format!("{}.tar.gz", name));
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0) as f64;
    let mut file = fs::File::create(&tarball_path).map_err(|e| e.to_string())?;
    let mut downloaded = 0.0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if child_token.is_cancelled() {
            drop(file);
            let _ = fs::remove_file(&tarball_path);
            let _ = fs::remove_dir_all(&runner_dir);
            return Err("CANCELLED".into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as f64;
        if total_size > 0.0 {
            let _ = app.emit("runner-download-progress", downloaded / total_size * 100.0);
        }
    }

    drop(file);
    { *state.token.lock().await = None; }

    let status = Command::new("tar")
        .args(["-zxf", tarball_path.to_str().unwrap(), "-C", runner_dir.to_str().unwrap(), "--strip-components=1"])
        .status()
        .map_err(|e| e.to_string())?;

    let _ = fs::remove_file(&tarball_path);

    if !status.success() {
        let _ = fs::remove_dir_all(&runner_dir);
        return Err("Extraction failed".into());
    }

    Ok(name)
}

#[tauri::command]
#[allow(non_snake_case)]
fn check_game_installed(app: AppHandle, instance_id: String) -> bool {
    get_instance_working_dir(&app, &instance_id).join("Minecraft.Client.exe").exists()
}

#[tauri::command]
#[allow(non_snake_case)]
fn open_instance_folder(app: AppHandle, instance_id: String) {
    let folder = get_instance_working_dir(&app, &instance_id);
    if folder.exists() {
        let _ = app.opener().open_path(folder.to_str().unwrap(), None::<&str>);
    }
}

#[tauri::command]
#[allow(non_snake_case)]
fn delete_instance(app: AppHandle, instance_id: String) -> Result<(), String> {
    let config = load_config(app.clone());
    if let Some(ref editions) = config.custom_editions {
        if let Some(edition) = editions.iter().find(|e| e.id == instance_id) {
            if edition.path.is_some() {
                return Ok(());
            }
        }
    }
    let dir = get_app_dir(&app).join("instances").join(&instance_id);
    if dir.exists() {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(())
}

#[tauri::command]
async fn cancel_download(state: State<'_, DownloadState>) -> Result<(), String> {
    if let Some(token) = state.token.lock().await.take() { token.cancel(); }
    Ok(())
}

#[tauri::command]
async fn setup_macos_runtime(window: tauri::Window, app: AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        let _ = app;
        return Err("macOS runtime setup is only supported on macOS.".into());
    }

    #[cfg(target_os = "macos")]
    {
        #[derive(Deserialize)]
        struct GithubAsset {
            name: String,
            browser_download_url: String,
        }

        #[derive(Deserialize)]
        struct GithubRelease {
            tag_name: String,
            assets: Vec<GithubAsset>,
        }

        emit_macos_setup_progress(&window, "resolving", "Resolving macOS compatibility runtime…".into(), None);

        let client = reqwest::Client::new();
        let release_text = client
            .get("https://api.github.com/repos/Gcenx/game-porting-toolkit/releases/latest")
            .header("User-Agent", "Emerald-Legacy-Launcher")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        let release: GithubRelease = serde_json::from_str(&release_text).map_err(|e| e.to_string())?;
        let asset = release
            .assets
            .iter()
            .find(|a| a.name.ends_with(".tar.xz") || a.name.ends_with(".tar.gz"))
            .ok_or_else(|| "No compatible runtime asset found in latest release.".to_string())?;

        let runtime_dir = get_macos_runtime_dir(&app);
        let toolkit_dir = runtime_dir.join("toolkit");
        let prefix_dir = runtime_dir.join("prefix");
        fs::create_dir_all(&runtime_dir).map_err(|e| e.to_string())?;

        if toolkit_dir.exists() {
            let _ = fs::remove_dir_all(&toolkit_dir);
        }
        fs::create_dir_all(&toolkit_dir).map_err(|e| e.to_string())?;

        emit_macos_setup_progress(
            &window,
            "downloading",
            format!("Downloading runtime ({})…", release.tag_name),
            Some(0.0),
        );

        let archive_path = runtime_dir.join(format!("gptk_{}", asset.name));
        let response = client
            .get(&asset.browser_download_url)
            .header("User-Agent", "Emerald-Legacy-Launcher")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        let total_size = response.content_length().unwrap_or(0) as f64;
        let mut file = fs::File::create(&archive_path).map_err(|e| e.to_string())?;
        let mut downloaded = 0.0;
        let mut last_percent_sent: i64 = -1;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as f64;

            if total_size > 0.0 {
                let percent = (downloaded / total_size * 100.0).clamp(0.0, 100.0);
                let rounded = percent.floor() as i64;
                if rounded != last_percent_sent {
                    last_percent_sent = rounded;
                    emit_macos_setup_progress(
                        &window,
                        "downloading",
                        format!("Downloading runtime… {}%", rounded),
                        Some(percent),
                    );
                }
            }
        }
        drop(file);

        emit_macos_setup_progress(&window, "extracting", "Extracting runtime…".into(), None);

        let archive_metadata = fs::metadata(&archive_path).map_err(|e| format!("Cannot read archive: {}", e))?;
        println!("Archive size: {} bytes", archive_metadata.len());

        if archive_metadata.len() < 100_000_000 {
            return Err(format!("Archive too small: {} bytes", archive_metadata.len()));
        }

        let status = Command::new("tar")
            .args([
                "-xf",
                archive_path.to_str().ok_or_else(|| "Invalid archive path".to_string())?,
                "-C",
                toolkit_dir.to_str().ok_or_else(|| "Invalid toolkit path".to_string())?,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .map_err(|e| e.to_string())?;

        println!("Tar exit status: {:?}", status);

        let _ = fs::remove_file(&archive_path);
        if !status.success() {
            return Err(format!("Extraction failed with status: {:?}", status));
        }

        fs::create_dir_all(&prefix_dir).map_err(|e| e.to_string())?;

        let wine_binary = find_executable_recursive(&toolkit_dir, "wine64")
            .or_else(|| find_executable_recursive(&toolkit_dir, "wine"))
            .ok_or_else(|| "Unable to locate wine binary inside runtime.".to_string())?;

        let wine_bin_dir = wine_binary
            .parent()
            .map(|pp| pp.to_path_buf())
            .ok_or_else(|| "Unable to locate wine bin directory inside runtime.".to_string())?;

        emit_macos_setup_progress(&window, "initializing", "Initializing Wine prefix…".into(), None);

        let mut cmd = Command::new(&wine_binary);
        cmd.arg("wineboot");
        cmd.arg("-u");
        cmd.env("WINEPREFIX", &prefix_dir);
        cmd.env("WINEARCH", "win64");
        cmd.env("WINEDEBUG", "-all");
        cmd.env("WINEESYNC", "1");
        cmd.env("WINEDLLOVERRIDES", "winemenubuilder.exe=d;mscoree,mshtml=");
        cmd.env("MTL_HUD_ENABLED", "0");
        cmd.env(
            "PATH",
            format!(
                "{}:{}",
                wine_bin_dir.to_string_lossy(),
                std::env::var("PATH").unwrap_or_default()
            ),
        );
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let status = cmd.status().map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Wine prefix initialization failed".into());
        }

        emit_macos_setup_progress(&window, "done", "Setup complete.".into(), Some(100.0));
        Ok(())
    }
}

fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}
#[tauri::command]
#[allow(non_snake_case)]
async fn download_and_install(app: AppHandle, state: State<'_, DownloadState>, url: String, instance_id: String) -> Result<String, String> {
    let root = get_app_dir(&app);
    let instance_dir = root.join("instances").join(&instance_id);
    let token = CancellationToken::new();
    let child_token = token.clone();
    {
        let mut lock = state.token.lock().await;
        if let Some(old_token) = lock.take() {
            old_token.cancel();
        }
        *lock = Some(token);
    }

    let keep_list: std::collections::HashSet<&str> = [
        "Windows64", "Windows64Media", "uid.dat", "username.txt", "settings.dat",
        "servers.dat", "servers.txt", "server.properties", "options.txt", "servers.db",
        "workshop_files.json", "screenshots", "update_timestamp.txt",
        "profile0.dat", "profile1.dat", "profile2.dat", "profile3.dat",
        "profile4.dat", "profile5.dat", "profile6.dat", "profile7.dat",
        "profile8.dat", "profile9.dat", "profile10.dat"
    ].iter().copied().collect();
    if !instance_dir.exists() {
        fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;
    } else {
        let workshop_files: std::collections::HashSet<String> = {
            let wf_path = instance_dir.join("workshop_files.json");
            fs::read_to_string(&wf_path)
                .ok()
                .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
                .unwrap_or_default()
                .into_iter()
                .collect()
        };

        if let Ok(entries) = fs::read_dir(&instance_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name();
                let name_str = file_name.to_string_lossy();
                let entry_path_str = entry.path().to_string_lossy().to_string();
                let is_workshop_file = workshop_files.iter().any(|wf| entry_path_str.starts_with(wf) || wf.starts_with(&entry_path_str));
                if !keep_list.contains(name_str.as_ref()) && !is_workshop_file {
                    let path = entry.path();
                    if path.is_dir() {
                        let _ = fs::remove_dir_all(path);
                    } else {
                        let _ = fs::remove_file(path);
                    }
                }
            }
        }
    }

    let zip_path = root.join(format!("temp_{}.zip", instance_id));
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }

    let last_modified = response.headers().get(reqwest::header::LAST_MODIFIED)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !last_modified.is_empty() {
        let _ = fs::write(instance_dir.join("update_timestamp.txt"), last_modified);
    }

    let total_size = response.content_length().unwrap_or(0) as f64;
    let mut file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut downloaded = 0.0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if child_token.is_cancelled() {
            drop(file);
            let _ = fs::remove_file(&zip_path);
            return Err("CANCELLED".into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as f64;
        if total_size > 0.0 {
            let _ = app.emit("download-progress", downloaded / total_size * 100.0);
        }
    }

    drop(file);
    { *state.token.lock().await = None; }
    #[cfg(target_os = "linux")]
    {
        let unzip_check = Command::new("unzip").arg("-v").status();
        if unzip_check.is_err() || !unzip_check.unwrap().success() {
            return Err("The 'unzip' command was not found. Please install it (e.g., 'sudo apt install unzip') to continue.".into());
        }

        let status = Command::new("unzip")
            .args(["-o", "-q", zip_path.to_str().unwrap(), "-d", instance_dir.to_str().unwrap()])
            .status()
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Err("Extraction failed".into());
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let status = Command::new("tar")
            .args(["-xf", zip_path.to_str().unwrap(), "-C", instance_dir.to_str().unwrap()])
            .status()
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Err("Extraction failed".into());
        }
    }

    let _ = fs::remove_file(&zip_path);
    if let Ok(entries) = fs::read_dir(&instance_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let check_exe = path.join("Minecraft.Client.exe");
                if check_exe.exists() {
                    let inner_dir = path;
                    if let Ok(inner_entries) = fs::read_dir(&inner_dir) {
                        for inner_entry in inner_entries.flatten() {
                            let file_name = inner_entry.file_name();
                            let name_str = file_name.to_string_lossy();
                            let dest_path = instance_dir.join(&file_name);
                            if keep_list.contains(name_str.as_ref()) && dest_path.exists() {
                                continue;
                            }
                            if fs::rename(inner_entry.path(), &dest_path).is_err() {
                                if inner_entry.path().is_dir() {
                                    let _ = copy_dir_all(inner_entry.path(), &dest_path);
                                    let _ = fs::remove_dir_all(inner_entry.path());
                                } else {
                                    let _ = fs::copy(inner_entry.path(), &dest_path);
                                    let _ = fs::remove_file(inner_entry.path());
                                }
                            }
                        }
                    }
                    let _ = fs::remove_dir_all(&inner_dir);
                    break;
                }
            }
        }
    }

    Ok("Success".into())
}

fn ensure_server_list(instance_dir: &PathBuf, servers: Vec<McServer>) {
    let servers_db = instance_dir.join("servers.db");
    let mut all_servers = Vec::new();
    if let Ok(content) = fs::read(&servers_db) {
        if content.len() >= 12 && &content[0..4] == b"MCSV" {
            let count = u32::from_le_bytes(content[8..12].try_into().unwrap_or([0; 4]));
            let mut pos = 12;
            for _ in 0..count {
                if pos + 2 > content.len() { break; }
                let ip_len = u16::from_le_bytes(content[pos..pos+2].try_into().unwrap_or([0; 2])) as usize;
                pos += 2;
                if pos + ip_len > content.len() { break; }
                let ip = String::from_utf8_lossy(&content[pos..pos+ip_len]).to_string();
                pos += ip_len;
                if pos + 2 > content.len() { break; }
                let port = u16::from_le_bytes(content[pos..pos+2].try_into().unwrap_or([0; 2]));
                pos += 2;
                if pos + 2 > content.len() { break; }
                let name_len = u16::from_le_bytes(content[pos..pos+2].try_into().unwrap_or([0; 2])) as usize;
                pos += 2;
                if pos + name_len > content.len() { break; }
                let name = String::from_utf8_lossy(&content[pos..pos+name_len]).to_string();
                pos += name_len;

                all_servers.push(McServer { name, ip, port });
            }
        }
    }

    for s in servers {
        all_servers.push(s);
    }

    let mut unique_servers = Vec::new();
    let mut seen: std::collections::HashSet<(String, u16)> = std::collections::HashSet::new();
    for s in all_servers {
        let key = (s.ip.clone(), s.port);
        if seen.insert(key) {
            unique_servers.push(s);
        }
    }

    let mut file_content = Vec::new();
    file_content.extend_from_slice(b"MCSV");
    file_content.extend_from_slice(&1u32.to_le_bytes());
    file_content.extend_from_slice(&(unique_servers.len() as u32).to_le_bytes());
    for server in unique_servers {
        let ip_bytes = server.ip.as_bytes();
        let name_bytes = server.name.as_bytes();
        file_content.extend_from_slice(&(ip_bytes.len() as u16).to_le_bytes());
        file_content.extend_from_slice(ip_bytes);
        file_content.extend_from_slice(&server.port.to_le_bytes());
        file_content.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        file_content.extend_from_slice(name_bytes);
    }
    let _ = fs::create_dir_all(instance_dir);
    let _ = fs::write(&servers_db, file_content);
}

fn perform_dlc_sync(app: &AppHandle, instance_dir: &PathBuf) -> Result<(), String> {
    let mut dlc_src = None;
    let root = get_app_dir(app);

    use tauri::path::BaseDirectory;
    if let Ok(p) = app.path().resolve("resources/DLC", BaseDirectory::Resource) {
        if p.exists() {
            dlc_src = Some(p);
        } else {
            if let Ok(p2) = app.path().resolve("DLC", BaseDirectory::Resource) {
                if p2.exists() { dlc_src = Some(p2); }
            }
        }
    }

    if dlc_src.is_none() {
        let current = std::env::current_dir().unwrap_or_default();
        let p3 = current.join("src-tauri").join("resources").join("DLC");
        let p4 = current.join("resources").join("DLC");
        if p3.exists() { dlc_src = Some(p3); }
        else if p4.exists() { dlc_src = Some(p4); }
    }

    if dlc_src.is_none() {
        let p5 = root.join("DLC");
        if p5.exists() { dlc_src = Some(p5); }
    }

    match dlc_src {
        Some(src) => {
            let dlc_dest = instance_dir.join("Windows64Media").join("DLC");
            let _ = fs::create_dir_all(&dlc_dest);

            if let Ok(entries) = fs::read_dir(&src) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let dest_path = dlc_dest.join(&name);

                    if !dest_path.exists() {
                        if let Err(e) = if entry.path().is_dir() {
                            copy_dir_all(entry.path(), &dest_path)
                        } else {
                            fs::copy(entry.path(), &dest_path).map(|_| ())
                        } {
                            eprintln!("[DLC Sync] Failed to copy {:?} to {:?}: {}", entry.path(), dest_path, e);
                        } else {
                            println!("[DLC Sync] Copied to {:?}", dest_path);
                        }
                    } else {
                        println!("[DLC Sync] Skipping {:?}: Already exists in instance", name);
                    }
                }
            }
            Ok(())
        },
        None => {
            println!("[DLC Sync] Skipping sync: No DLC source found.");
            Ok(())
        }
    }
}

async fn perform_instance_sync(app: &AppHandle, instance_id: &str) -> Result<(), String> {
    let target_dir = get_instance_working_dir(app, instance_id);
    if !target_dir.exists() {
        return Err("Instance directory not found".into());
    }

    let config = load_config(app.clone());
    let _ = fs::write(target_dir.join("username.txt"), &config.username);

    let skin_pck_path = get_app_dir(app).join("Skin.pck");
    if skin_pck_path.exists() {
        let skin_dlc_dir = target_dir.join("Windows64Media").join("DLC").join("Custom Skins");
        let _ = fs::create_dir_all(&skin_dlc_dir);
        let _ = fs::copy(&skin_pck_path, skin_dlc_dir.join("Skin.pck"));
    }

    perform_dlc_sync(app, &target_dir)?;
    Ok(())
}

#[tauri::command]
async fn sync_dlc(app: AppHandle, instance_id: String) -> Result<(), String> {
    perform_instance_sync(&app, &instance_id).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkshopInstallRequest {
    instance_id: String,
    zips: std::collections::HashMap<String, String>,
    package_id: String,
    version: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct InstalledWorkshopPackage {
    id: String,
    version: String,
    dirs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct InstalledPackageEntry {
    instance_id: String,
    package_id: String,
    version: String,
}

#[tauri::command]
async fn workshop_install(app: AppHandle, request: WorkshopInstallRequest) -> Result<(), String> {
    let instance_dir = get_instance_working_dir(&app, &request.instance_id);
    if !instance_dir.exists() {
        return Err("Instance not installed".into());
    }
    let root = get_app_dir(&app);

    let media_dir = instance_dir.join("Windows64Media");
    let dlc_dir   = media_dir.join("DLC");
    let game_hdd  = instance_dir.join("Windows64").join("GameHDD");
    let mob_dir   = instance_dir.join("Common").join("res").join("mob");
    let wf_path   = instance_dir.join("workshop_files.json");
    let wp_path   = instance_dir.join("workshop_packages.json");

    let mut workshop_files: Vec<String> = fs::read_to_string(&wf_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let mut workshop_packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    workshop_packages.retain(|p| p.id != request.package_id);
    let raw_base = format!("https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/{}", request.package_id);
    let tmp_dir  = root.join(format!("workshop_tmp_{}", request.package_id));
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let mut pkg_dirs: Vec<String> = Vec::new();
    for (zip_name, placeholder) in &request.zips {
        let zip_url = format!("{}/{}", raw_base, zip_name);
        let zip_tmp = tmp_dir.join(zip_name);
        let response = reqwest::get(&zip_url).await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(format!("Failed to download {}: HTTP {}", zip_name, response.status()));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        fs::write(&zip_tmp, &bytes).map_err(|e| e.to_string())?;

        let dest_dir = if placeholder.is_empty() {
            instance_dir.clone()
        } else {
            let resolved = instance_dir.clone().join(placeholder
                .replace("{MediaDir}", media_dir.to_str().unwrap_or(""))
                .replace("{DLCDir}",   dlc_dir.to_str().unwrap_or(""))
                .replace("{GameHDD}",  game_hdd.to_str().unwrap_or(""))
                .replace("{MobDir}",   mob_dir.to_str().unwrap_or("")));
            PathBuf::from(resolved)
        };

        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

        #[cfg(target_os = "linux")]
        {
            let status = Command::new("unzip")
                .args(["-o", "-q", zip_tmp.to_str().unwrap(), "-d", dest_dir.to_str().unwrap()])
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                let _ = fs::remove_dir_all(&tmp_dir);
                return Err(format!("Extraction failed for {}", zip_name));
            }
        }
        #[cfg(not(target_os = "linux"))]
        {
            let status = Command::new("tar")
                .args(["-xf", zip_tmp.to_str().unwrap(), "-C", dest_dir.to_str().unwrap()])
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                let _ = fs::remove_dir_all(&tmp_dir);
                return Err(format!("Extraction failed for {}", zip_name));
            }
        }

        let dest_str = dest_dir.to_string_lossy().to_string();
        if !workshop_files.contains(&dest_str) {
            workshop_files.push(dest_str.clone());
        }
        if !pkg_dirs.contains(&dest_str) {
            pkg_dirs.push(dest_str);
        }
    }

    let _ = fs::remove_dir_all(&tmp_dir);

    if let Ok(json) = serde_json::to_string(&workshop_files) {
        let _ = fs::write(&wf_path, json);
    }

    workshop_packages.push(InstalledWorkshopPackage {
        id: request.package_id.clone(),
        version: request.version.clone(),
        dirs: pkg_dirs,
    });
    if let Ok(json) = serde_json::to_string(&workshop_packages) {
        let _ = fs::write(&wp_path, json);
    }

    Ok(())
}

#[tauri::command]
async fn workshop_uninstall(app: AppHandle, instance_id: String, package_id: String) -> Result<(), String> {
    let instance_dir = get_instance_working_dir(&app, &instance_id);
    let wp_path = instance_dir.join("workshop_packages.json");
    let wf_path = instance_dir.join("workshop_files.json");

    let mut packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    if let Some(pkg) = packages.iter().find(|p| p.id == package_id) {
        for dir in &pkg.dirs {
            let path = PathBuf::from(dir);
            if path.is_dir() {
                let _ = fs::remove_dir_all(&path);
            } else if path.is_file() {
                let _ = fs::remove_file(&path);
            }
        }
    }

    let removed_dirs: std::collections::HashSet<String> = packages
        .iter()
        .find(|p| p.id == package_id)
        .map(|p| p.dirs.iter().cloned().collect())
        .unwrap_or_default();

    packages.retain(|p| p.id != package_id);

    if let Ok(json) = serde_json::to_string(&packages) {
        let _ = fs::write(&wp_path, json);
    }

    let mut workshop_files: Vec<String> = fs::read_to_string(&wf_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    workshop_files.retain(|f| !removed_dirs.contains(f));
    if let Ok(json) = serde_json::to_string(&workshop_files) {
        let _ = fs::write(&wf_path, json);
    }

    Ok(())
}

#[tauri::command]
fn workshop_list_installed(app: AppHandle) -> Vec<InstalledPackageEntry> {
    let root = get_app_dir(&app);
    let mut result = Vec::new();
    let mut instance_dirs = vec![root.join("instances")];

    let config = load_config(app.clone());
    if let Some(editions) = config.custom_editions {
        for ed in editions {
            if let Some(path) = ed.path {
                instance_dirs.push(PathBuf::from(path));
            }
        }
    }

    for base_dir in instance_dirs {
        if base_dir.ends_with("instances") {
            if let Ok(entries) = fs::read_dir(&base_dir) {
                for entry in entries.flatten() {
                    if !entry.path().is_dir() { continue; }
                    let instance_id = entry.file_name().to_string_lossy().to_string();
                    let wp_path = entry.path().join("workshop_packages.json");
                    let packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
                        .ok()
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default();
                    for pkg in packages {
                        result.push(InstalledPackageEntry {
                            instance_id: instance_id.clone(),
                            package_id: pkg.id,
                            version: pkg.version,
                        });
                    }
                }
            }
        } else {
            let instance_id = base_dir.file_name().and_then(|n| n.to_str()).unwrap_or("custom").to_string(); //neo: this is just fallback
            let config = load_config(app.clone());
            let final_id = config.custom_editions.as_ref()
                .and_then(|eds| eds.iter().find(|e| e.path.as_deref() == base_dir.to_str()).map(|e| e.id.clone()))
                .unwrap_or(instance_id);

            let wp_path = base_dir.join("workshop_packages.json");
            let packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
            for pkg in packages {
                result.push(InstalledPackageEntry {
                    instance_id: final_id.clone(),
                    package_id: pkg.id,
                    version: pkg.version,
                });
            }
        }
    }
    result
}

#[tauri::command]
async fn check_game_update(app: AppHandle, instance_id: String, url: String) -> Result<bool, String> {
    let instance_dir = get_instance_working_dir(&app, &instance_id);
    let timestamp_file = instance_dir.join("update_timestamp.txt");

    let local_timestamp = fs::read_to_string(&timestamp_file).unwrap_or_default();
    if local_timestamp.is_empty() {
        return Ok(true);
    }

    let response = reqwest::Client::new().head(&url).send().await.map_err(|e| e.to_string())?;
    if let Some(remote_header) = response.headers().get(reqwest::header::LAST_MODIFIED) {
        if let Ok(remote_timestamp) = remote_header.to_str() {
            if remote_timestamp != local_timestamp {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

#[tauri::command]
#[allow(non_snake_case)]
async fn launch_game(app: AppHandle, state: State<'_, GameState>, instance_id: String, servers: Vec<McServer>) -> Result<(), String> {
    perform_instance_sync(&app, &instance_id).await?;
    let working_dir = get_instance_working_dir(&app, &instance_id);
    let config = load_config(app.clone());
    ensure_server_list(&working_dir, servers);
    let game_exe = working_dir.join("Minecraft.Client.exe");
    if !game_exe.exists() {
        return Err("Game executable not found in instance folder.".into());
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(runner_id) = config.linux_runner {
            let runners = get_available_runners(app.clone());
            if let Some(runner) = runners.into_iter().find(|r| r.id == runner_id) {
                let is_proton = runner.r#type == "proton";
                let program = if is_proton {
                    PathBuf::from(&runner.path).join("proton").to_string_lossy().to_string()
                } else {
                    runner.path.clone()
                };
                let mut args: Vec<String> = Vec::new();
                if is_proton {
                    args.push("run".to_string());
                }
                let compat_data = if is_proton {
                    let cd = working_dir.join("proton_prefix");
                    fs::create_dir_all(&cd).map_err(|e| e.to_string())?;
                    Some(cd)
                } else {
                    None
                };

                let mangohud = config.mangohud_enabled.unwrap_or(false);
                let (prog, extra_args): (&str, &[&str]) = if mangohud {
                    ("mangohud", &[&program])
                } else {
                    (&program, &[])
                };

                let mut cmd = tokio::process::Command::new(prog);
                for a in extra_args {
                    cmd.arg(a);
                }
                for a in &args {
                    cmd.arg(a);
                }

                if is_proton {
                    let cd = compat_data.as_ref().unwrap();
                    if std::env::var("STEAM_COMPAT_CLIENT_INSTALL_PATH").is_err() {
                        cmd.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", "");
                    }
                    cmd.env("STEAM_COMPAT_DATA_PATH", cd.to_str().unwrap());
                    if std::env::var("SteamAppId").is_err() {
                        cmd.env("SteamAppId", "480");
                    }
                }

                #[cfg(unix)]
                {
                    cmd.process_group(0);
                    cmd.env_remove("LD_PRELOAD");
                    cmd.env_remove("PYTHONPATH");
                    cmd.env_remove("PYTHONHOME");
                    cmd.env_remove("LD_LIBRARY_PATH");
                    cmd.env_remove("QT_PLUGIN_PATH");
                }

                cmd.arg(&game_exe)
                   .current_dir(&working_dir);

                let child = cmd.spawn().map_err(|e| e.to_string())?;
                {
                    let mut lock = state.child.lock().await;
                    *lock = Some(child);
                }

                let status = loop {
                    {
                        let mut lock = state.child.lock().await;
                        if let Some(ref mut c) = *lock {
                            if let Some(s) = c.try_wait().map_err(|e| e.to_string())? {
                                break s;
                            }
                        } else {
                            return Ok(());
                        }
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                };

                {
                    let mut lock = state.child.lock().await;
                    *lock = None;
                }

                return if status.success() || status.code() == Some(253) || status.code() == Some(96) { Ok(()) } else { Err(format!("Game exited with status: {}", status)) };
            }
        }
        Err("No Linux runner selected in settings.".into())
    }

    #[cfg(not(target_os = "linux"))]
    {
        #[cfg(target_os = "macos")]
        {
            let runtime_dir = get_macos_runtime_dir(&app);
            let toolkit_dir = runtime_dir.join("toolkit");
            let prefix_dir = runtime_dir.join("prefix");

            if !toolkit_dir.exists() || !prefix_dir.exists() {
                return Err("macOS Compatibility is not set up. Open Settings and run Setup macOS Compatibility.".into());
            }

            let gptk_no_hud = find_executable_recursive(&toolkit_dir, "gameportingtoolkit-no-hud")
                .or_else(|| find_executable_recursive(&toolkit_dir, "gameportingtoolkit"));

            let wine_binary = find_executable_recursive(&toolkit_dir, "wine64")
                .or_else(|| find_executable_recursive(&toolkit_dir, "wine"))
                .ok_or_else(|| "Unable to locate wine binary inside runtime.".to_string())?;

            let wine_bin_dir = wine_binary
                .parent()
                .map(|pp| pp.to_path_buf())
                .ok_or_else(|| "Unable to locate wine bin directory inside runtime.".to_string())?;

            let mut cmd = if let Some(wrapper) = gptk_no_hud {
                let win_path = unix_path_to_wine_z_path(&game_exe);
                let mut c = tokio::process::Command::new(wrapper);
                c.arg(&prefix_dir);
                c.arg(win_path);
                c
            } else {
                let mut c = tokio::process::Command::new(&wine_binary);
                c.env("WINEPREFIX", &prefix_dir);
                c.arg(&game_exe);
                c
            };

            #[cfg(unix)]
            cmd.process_group(0);

            cmd.current_dir(&working_dir);
            cmd.env("WINEPREFIX", &prefix_dir);
            cmd.env("WINEDEBUG", "-all");
            let perf_boost = config.apple_silicon_performance_boost.unwrap_or(false);
            if perf_boost {
                #[cfg(target_arch = "aarch64")]
                {
                    cmd.env("WINE_MSYNC", "1");
                    cmd.env("MVK_ALLOW_METAL_FENCES", "1");
                }
                #[cfg(not(target_arch = "aarch64"))]
                {
                    cmd.env("WINEESYNC", "1");
                }
            } else {
                cmd.env("WINEESYNC", "1");
            }
            cmd.env("WINEDLLOVERRIDES", "winemenubuilder.exe=d;mscoree,mshtml=");
            cmd.env("MTL_HUD_ENABLED", "0");
            cmd.env("MVK_CONFIG_RESUME_LOST_DEVICE", "1");
            cmd.env(
                "PATH",
                format!(
                    "{}:{}",
                    wine_bin_dir.to_string_lossy(),
                    std::env::var("PATH").unwrap_or_default()
                ),
            );
            cmd.stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());

            let child = cmd.spawn().map_err(|e| e.to_string())?;
            {
                let mut lock = state.child.lock().await;
                *lock = Some(child);
            }

            let status = loop {
                {
                    let mut lock = state.child.lock().await;
                    if let Some(ref mut c) = *lock {
                        if let Some(s) = c.try_wait().map_err(|e| e.to_string())? {
                            break s;
                        }
                    } else {
                        return Ok(());
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            };

            {
                let mut lock = state.child.lock().await;
                *lock = None;
            }

            return if status.success() || status.code() == Some(253) || status.code() == Some(96) { Ok(()) } else { Err(format!("Game exited with status: {}", status)) };
        }

        #[cfg(all(not(target_os = "macos"), not(target_os = "linux")))]
        {
            let mut cmd = tokio::process::Command::new(&game_exe);
            #[cfg(unix)]
            cmd.process_group(0);
            cmd.current_dir(&working_dir);
            let child = cmd.spawn().map_err(|e| e.to_string())?;
            {
                let mut lock = state.child.lock().await;
                *lock = Some(child);
            }
            let status = loop {
                {
                    let mut lock = state.child.lock().await;
                    if let Some(ref mut c) = *lock {
                        if let Some(s) = c.try_wait().map_err(|e| e.to_string())? {
                            break s;
                        }
                    } else {
                        return Ok(());
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            };
            {
                let mut lock = state.child.lock().await;
                *lock = None;
            }
            return if status.success() || status.code() == Some(253) || status.code() == Some(96) { Ok(()) } else { Err(format!("Game exited with status: {}", status)) };
        }
    }
}

#[cfg(unix)]
fn kill_process_tree(app: &AppHandle, instance_id: &str) {
    let root = get_app_dir(&app);
    let instance_dir = root.join("instances").join(instance_id);
    let target = unix_path_to_wine_z_path(&instance_dir.join("Minecraft.Client.exe"));
    let Ok(entries) = fs::read_dir("/proc") else { return };
    for entry in entries.flatten() {
        let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else { continue };
        let cmdline = fs::read_to_string(format!("/proc/{}/cmdline", pid))
            .unwrap_or_default();
        if cmdline.contains(&*target) {
            unsafe { libc::kill(pid as i32, libc::SIGKILL); }
        }
    }
}

#[tauri::command]
async fn stop_game(#[allow(unused_variables)] app: AppHandle, #[allow(unused_variables)] instance_id: String, state: State<'_, GameState>) -> Result<(), String> {
    let mut lock = state.child.lock().await;
    if let Some(mut child) = lock.take() {
        #[cfg(unix)] kill_process_tree(&app, &instance_id);
        let _ = child.kill().await;
    }
    Ok(())
}

#[tauri::command]
async fn fetch_skin(username: String) -> Result<(String, String), String> {
    let client = reqwest::Client::new();
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
async fn download_logo(app: AppHandle, id: String, url: String) -> Result<String, String> {
    let logos_dir = get_app_dir(&app).join("logos");
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
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Failed to download logo: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_screenshots(app: AppHandle) -> Vec<ScreenshotInfo> {
    let mut screenshots = Vec::new();
    let root = get_app_dir(&app);
    let mut instance_dirs = vec![root.join("instances")];

    let config = load_config(app.clone());
    if let Some(ref editions) = config.custom_editions {
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
            let final_id = config.custom_editions.as_ref()
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
fn delete_screenshot(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_to_steam(
    _app: AppHandle,
    instance_id: String,
    name: String,
    title_base64: String,
    panorama_base64: String,
) -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path.to_string_lossy().to_string();
    let launch_options = format!("\"{}\"", instance_id);
    let start_dir = exe_path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let app_id_32 = steam_shortcuts_util::app_id_generator::calculate_app_id(&exe_str, &name);
    //let app_id_64 = ((app_id_32 as u64) << 32) | 0x02000000; //neo: just in case we'll need later.
    let mut userdata_dirs: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let h = PathBuf::from(home);
            userdata_dirs.push(h.join(".steam/steam/userdata"));
            userdata_dirs.push(h.join(".local/share/Steam/userdata"));
            userdata_dirs.push(h.join(".var/app/com.valvesoftware.Steam/.local/share/Steam/userdata"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        userdata_dirs.push(PathBuf::from("C:\\Program Files\\Steam\\userdata"));
        userdata_dirs.push(PathBuf::from("C:\\Program Files (x86)\\Steam\\userdata"));
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let h = PathBuf::from(home);
            userdata_dirs.push(h.join("Library/Application Support/Steam/userdata"));
        }
    }

    let valid_userdata_dirs: Vec<PathBuf> = userdata_dirs.into_iter().filter(|d| d.exists()).collect();
    if valid_userdata_dirs.is_empty() {
        return Err("Steam userdata directory not found.".into());
    }

    for userdata_root in valid_userdata_dirs {
        let entries = fs::read_dir(&userdata_root).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let user_config_dir = entry.path().join("config");
                let shortcuts_path = user_config_dir.join("shortcuts.vdf");
                if !user_config_dir.exists() { continue; }
                let content = if shortcuts_path.exists() {
                    fs::read(&shortcuts_path).unwrap_or_default()
                } else {
                    Vec::new()
                };

                let shortcuts = if !content.is_empty() {
                    parse_shortcuts(&content).map_err(|e| e.to_string())?
                } else {
                    Vec::new()
                };

                let mut owned_shortcuts: Vec<steam_shortcuts_util::shortcut::ShortcutOwned> = shortcuts.iter().map(|s| s.to_owned()).collect();
                if owned_shortcuts.iter().any(|s| s.app_name == name && s.exe == exe_str) {
                    continue;
                }

                owned_shortcuts.push(steam_shortcuts_util::shortcut::ShortcutOwned {
                    order: owned_shortcuts.len().to_string(),
                    app_id: app_id_32,
                    app_name: name.clone(),
                    exe: exe_str.clone(),
                    start_dir: start_dir.clone(),
                    icon: "".to_string(),
                    shortcut_path: "".to_string(),
                    launch_options: launch_options.clone(),
                    is_hidden: false,
                    allow_desktop_config: true,
                    allow_overlay: true,
                    open_vr: 0,
                    dev_kit: 0,
                    dev_kit_game_id: "".to_string(),
                    dev_kit_overrite_app_id: 0,
                    last_play_time: 0,
                    tags: Vec::new(),
                });

                let final_shortcuts: Vec<Shortcut> = owned_shortcuts.iter().map(|s| s.borrow()).collect();
                let new_content = shortcuts_to_bytes(&final_shortcuts);
                fs::write(&shortcuts_path, new_content).map_err(|e| e.to_string())?;
                let grid_dir = user_config_dir.join("grid");
                if !grid_dir.exists() {
                    let _ = fs::create_dir_all(&grid_dir);
                }

                if grid_dir.exists() {
                    let panorama_data = general_purpose::STANDARD.decode(panorama_base64.clone()).map_err(|e| e.to_string())?;
                    let title_data = general_purpose::STANDARD.decode(title_base64.clone()).map_err(|e| e.to_string())?;
                    let _ = fs::write(grid_dir.join(format!("{}p.png", app_id_32)), &panorama_data);
                    let _ = fs::write(grid_dir.join(format!("{}_hero.png", app_id_32)), &panorama_data);
                    let _ = fs::write(grid_dir.join(format!("{}.png", app_id_32)), &panorama_data);
                    let _ = fs::write(grid_dir.join(format!("{}_logo.png", app_id_32)), &title_data);
                    let _ = fs::write(grid_dir.join(format!("{}.json", app_id_32)), "{\"nVersion\":1,\"logoPosition\":{\"pinnedPosition\":\"CenterCenter\",\"nWidthPct\":50,\"nHeightPct\":50}}".as_bytes()); //neo: if you're confused, this is for logo position
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn open_screenshot_folder(app: AppHandle, path: String) {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if parent.exists() {
            let _ = app.opener().open_path(parent.to_str().unwrap(), None::<&str>);
        }
    }
}

#[tauri::command]
async fn save_global_skin_pck(app: AppHandle, pck_data: Vec<u8>) -> Result<(), String> {
    let app_dir = get_app_dir(&app);
    let _ = fs::write(app_dir.join("Skin.pck"), pck_data);
    Ok(())
}

#[tauri::command]
async fn http_proxy_request(method: String, url: String, body: Option<String>, headers: std::collections::HashMap<String, String>) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;
    
    Ok(HttpResponse {
        status,
        body: text,
    })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct P2pEndpoint {
    pub ip: String,
    pub port: u16,
}

fn ws_base_url(api_base_url: &str) -> String {
    if api_base_url.starts_with("https") {
        api_base_url.replace("https", "wss")
    } else {
        api_base_url.replace("http", "ws")
    }
}

async fn stun_discover_impl() -> Result<P2pEndpoint, String> {
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await.map_err(|e| e.to_string())?;
    let stun_addr = tokio::net::lookup_host("stun.l.google.com:19302").await
        .map_err(|e| format!("STUN DNS lookup failed: {}", e))?
        .next()
        .ok_or_else(|| "STUN DNS returned no addresses".to_string())?;

    let magic_cookie: u32 = 0x2112A442;
    let mut trans_id = [0u8; 12];
    rand::Rng::fill(&mut rand::thread_rng(), &mut trans_id);

    let mut req = Vec::with_capacity(20);
    req.extend_from_slice(&0x0001u16.to_be_bytes());
    req.extend_from_slice(&0x0000u16.to_be_bytes());
    req.extend_from_slice(&magic_cookie.to_be_bytes());
    req.extend_from_slice(&trans_id);

    socket.send_to(&req, stun_addr).await.map_err(|e| format!("STUN send: {}", e))?;

    let mut buf = [0u8; 512];
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        socket.recv_from(&mut buf)
    ).await.map_err(|_| "STUN request timed out (5s)".to_string())?
     .map_err(|e| format!("STUN recv: {}", e))?;

    let msg_type = u16::from_be_bytes([buf[0], buf[1]]);
    let rcvd_cookie = u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]);

    if msg_type != 0x0101 || rcvd_cookie != magic_cookie {
        return Err(format!("Invalid STUN response (type=0x{:04X}, cookie=0x{:08X})", msg_type, rcvd_cookie));
    }

    let mut pos = 20;
    while pos + 4 <= buf.len() {
        let attr_type = u16::from_be_bytes([buf[pos], buf[pos+1]]);
        let attr_len = u16::from_be_bytes([buf[pos+2], buf[pos+3]]) as usize;
        pos += 4;
        if attr_type == 0x0020 && attr_len >= 8 && pos + 8 <= buf.len() {
            let _family = buf[pos+1];
            let xport = u16::from_be_bytes([buf[pos+2], buf[pos+3]]);
            let port = xport ^ (magic_cookie >> 16) as u16;
            let ip_bytes = [
                buf[pos+4] ^ (magic_cookie >> 24) as u8,
                buf[pos+5] ^ (magic_cookie >> 16) as u8,
                buf[pos+6] ^ (magic_cookie >> 8) as u8,
                buf[pos+7] ^ magic_cookie as u8,
            ];
            return Ok(P2pEndpoint {
                ip: format!("{}.{}.{}.{}", ip_bytes[0], ip_bytes[1], ip_bytes[2], ip_bytes[3]),
                port,
            });
        }
        pos += attr_len;
    }

    Err("No XOR-MAPPED-ADDRESS in STUN response".into())
}

#[tauri::command]
async fn stun_discover() -> Result<P2pEndpoint, String> {
    stun_discover_impl().await
}

async fn run_relay_proxy(
    proxy_state: &ProxyGuard,
    ws_url: &str,
    auth_token: &str,
    cancel: CancellationToken,
) -> Result<u16, String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let mut request = ws_url
        .into_client_request()
        .map_err(|e| format!("Failed to build WS request: {}", e))?;
    request.headers_mut().insert(
        http::header::AUTHORIZATION,
        format!("Bearer {}", auth_token)
            .parse()
            .map_err(|_| "Invalid auth header value".to_string())?,
    );
    request.headers_mut().insert(
        http::header::USER_AGENT,
        "MCLCE-LceLive/1.0"
            .parse()
            .map_err(|_| "Invalid UA header value".to_string())?,
    );

    let (ws_stream, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("Relay WS connect failed: {}", e))?;

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Bind failed: {}", e))?;
    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    {
        let mut port = proxy_state.local_port.lock().await;
        *port = Some(local_port);
    }

    tokio::spawn(async move {
        let (tcp_stream, _) = tokio::select! {
            result = listener.accept() => result.map_err(|e| format!("Accept failed: {}", e)).unwrap(),
            _ = cancel.cancelled() => return,
        };

        let (tcp_read, tcp_write) = tcp_stream.into_split();
        let (ws_write, ws_read) = ws_stream.split();

        let cancel_ws = cancel.clone();
        let forward_tcp = tokio::spawn(async move {
            let mut ws_write = ws_write;
            let mut tcp_read = tcp_read;
            let mut buf = [0u8; 65536];
            loop {
                tokio::select! {
                    result = tcp_read.read(&mut buf) => {
                        match result {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                if ws_write.send(tokio_tungstenite::tungstenite::Message::Binary(buf[..n].to_vec())).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    _ = cancel_ws.cancelled() => break,
                }
            }
        });

        let cancel_tcp = cancel.clone();
        let forward_ws = tokio::spawn(async move {
            let ws_read = ws_read;
            let mut tcp_write = tcp_write;
            tokio::pin!(ws_read);
            loop {
                tokio::select! {
                    result = ws_read.next() => {
                        match result {
                            Some(Ok(tokio_tungstenite::tungstenite::Message::Binary(data))) => {
                                if tcp_write.write_all(&data).await.is_err() {
                                    break;
                                }
                            }
                            Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) | None => break,
                            _ => {}
                        }
                    }
                    _ = cancel_tcp.cancelled() => break,
                }
            }
        });

        tokio::select! {
            _ = forward_tcp => {},
            _ = forward_ws => {},
            _ = cancel.cancelled() => {},
        }
    });

    Ok(local_port)
}

async fn run_host_relay(
    _proxy_state: &ProxyGuard,
    ws_url: &str,
    auth_token: &str,
    game_port: u16,
    cancel: CancellationToken,
) -> Result<(), String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let mut request = ws_url
        .into_client_request()
        .map_err(|e| format!("Failed to build WS request: {}", e))?;
    request.headers_mut().insert(
        http::header::AUTHORIZATION,
        format!("Bearer {}", auth_token)
            .parse()
            .map_err(|_| "Invalid auth header value".to_string())?,
    );
    request.headers_mut().insert(
        http::header::USER_AGENT,
        "MCLCE-LceLive/1.0"
            .parse()
            .map_err(|_| "Invalid UA header value".to_string())?,
    );

    let (ws_stream, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("Host relay WS connect failed: {}", e))?;

    let game_stream = loop {
        match tokio::net::TcpStream::connect(format!("127.0.0.1:{}", game_port)).await {
            Ok(stream) => break stream,
            Err(_) => {
                tokio::select! {
                    _ = cancel.cancelled() => return Err("Host relay cancelled".into()),
                    _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {}
                }
            }
        }
    };

    let (game_read, game_write) = game_stream.into_split();
    let (ws_write, ws_read) = ws_stream.split();

    let cancel_ws = cancel.clone();
    let forward_game = tokio::spawn(async move {
        let mut ws_write = ws_write;
        let mut game_read = game_read;
        let mut buf = [0u8; 65536];
        loop {
            tokio::select! {
                result = game_read.read(&mut buf) => {
                    match result {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            if ws_write.send(tokio_tungstenite::tungstenite::Message::Binary(buf[..n].to_vec())).await.is_err() {
                                break;
                            }
                        }
                    }
                }
                _ = cancel_ws.cancelled() => break,
            }
        }
    });

    let cancel_ws2 = cancel.clone();
    let forward_ws = tokio::spawn(async move {
        let ws_read = ws_read;
        let mut game_write = game_write;
        tokio::pin!(ws_read);
        loop {
            tokio::select! {
                result = ws_read.next() => {
                    match result {
                        Some(Ok(tokio_tungstenite::tungstenite::Message::Binary(data))) => {
                            if game_write.write_all(&data).await.is_err() {
                                break;
                            }
                        }
                        Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) | None => break,
                        _ => {}
                    }
                }
                _ = cancel_ws2.cancelled() => break,
            }
        }
    });

    tokio::select! {
        _ = forward_game => {},
        _ = forward_ws => {},
        _ = cancel.cancelled() => {},
    }

    Ok(())
}

async fn run_direct_proxy(
    proxy_state: &ProxyGuard,
    target_ip: &str,
    target_port: u16,
    cancel: CancellationToken,
) -> Result<u16, String> {
    let remote = tokio::net::TcpStream::connect(format!("{}:{}", target_ip, target_port))
        .await
        .map_err(|e| format!("Direct TCP connect failed: {}", e))?;

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Bind failed: {}", e))?;
    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    {
        let mut port = proxy_state.local_port.lock().await;
        *port = Some(local_port);
    }

    let (local_stream, _) = tokio::select! {
        result = listener.accept() => result.map_err(|e| format!("Accept failed: {}", e))?,
        _ = cancel.cancelled() => return Err("Proxy cancelled".into()),
    };

    let (mut a_read, mut a_write) = remote.into_split();
    let (mut b_read, mut b_write) = local_stream.into_split();
    let cancel_a = cancel.clone();

    let task_a = tokio::spawn(async move {
        let mut buf = [0u8; 65536];
        loop {
            tokio::select! {
                result = a_read.read(&mut buf) => {
                    match result {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            if b_write.write_all(&buf[..n]).await.is_err() { break; }
                        }
                    }
                }
                _ = cancel_a.cancelled() => break,
            }
        }
    });

    let cancel_b = cancel.clone();
    let task_b = tokio::spawn(async move {
        let mut buf = [0u8; 65536];
        loop {
            tokio::select! {
                result = b_read.read(&mut buf) => {
                    match result {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            if a_write.write_all(&buf[..n]).await.is_err() { break; }
                        }
                    }
                }
                _ = cancel_b.cancelled() => break,
            }
        }
    });

    tokio::select! {
        _ = task_a => {},
        _ = task_b => {},
        _ = cancel.cancelled() => {},
    }

    Ok(local_port)
}

#[tauri::command]
async fn start_direct_proxy(
    proxy_state: State<'_, ProxyGuard>,
    target_ip: String,
    target_port: u16,
) -> Result<u16, String> {
    let cancel = CancellationToken::new();
    {
        let mut token = proxy_state.cancel_token.lock().await;
        if let Some(old) = token.take() {
            old.cancel();
        }
        *token = Some(cancel.clone());
    }

    let local_port = run_direct_proxy(&proxy_state, &target_ip, target_port, cancel).await?;
    Ok(local_port)
}

#[tauri::command]
async fn start_relay_proxy(
    proxy_state: State<'_, ProxyGuard>,
    api_base_url: String,
    access_token: String,
    session_id: String,
) -> Result<u16, String> {
    let ws_base = ws_base_url(&api_base_url);
    let ws_url = format!("{}/api/relay/ws?sessionId={}&role=joiner", ws_base, session_id);

    let cancel = CancellationToken::new();
    {
        let mut token = proxy_state.cancel_token.lock().await;
        if let Some(old) = token.take() {
            old.cancel();
        }
        *token = Some(cancel.clone());
    }

    let local_port = run_relay_proxy(&proxy_state, &ws_url, &access_token, cancel).await?;
    Ok(local_port)
}

#[tauri::command]
async fn start_host_relay(
    proxy_state: State<'_, ProxyGuard>,
    api_base_url: String,
    access_token: String,
    session_id: String,
    game_port: u16,
) -> Result<(), String> {
    let ws_base = ws_base_url(&api_base_url);
    let ws_url = format!("{}/api/relay/ws?sessionId={}&role=host", ws_base, session_id);

    let cancel = CancellationToken::new();
    {
        let mut token = proxy_state.cancel_token.lock().await;
        if let Some(old) = token.take() {
            old.cancel();
        }
        *token = Some(cancel.clone());
    }

    run_host_relay(&proxy_state, &ws_url, &access_token, game_port, cancel).await
}

#[tauri::command]
async fn stop_proxy(proxy_state: State<'_, ProxyGuard>) -> Result<(), String> {
    let mut token = proxy_state.cancel_token.lock().await;
    if let Some(t) = token.take() {
        t.cancel();
    }
    let mut port = proxy_state.local_port.lock().await;
    *port = None;
    Ok(())
}

#[tauri::command]
async fn join_game(
    app: AppHandle,
    game_state: State<'_, GameState>,
    proxy_state: State<'_, ProxyGuard>,
    api_base_url: String,
    access_token: String,
    host_ip: String,
    host_port: u16,
    session_id: String,
    instance_id: String,
) -> Result<(), String> {
    let cancel = CancellationToken::new();
    {
        let mut token = proxy_state.cancel_token.lock().await;
        if let Some(old) = token.take() {
            old.cancel();
        }
        *token = Some(cancel.clone());
    }

    let ws_base = ws_base_url(&api_base_url);
    let relay_url = format!("{}/api/relay/ws?sessionId={}&role=joiner", ws_base, session_id);

    let host_ip_clone = host_ip.clone();
    let cancel_clone = cancel.clone();
    let proxy_state_ref: &ProxyGuard = &*proxy_state;
    let proxy_fut = async move {
        let direct = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            run_direct_proxy(proxy_state_ref, &host_ip_clone, host_port, cancel_clone.clone()),
        ).await;

        match direct {
            Ok(Ok(port)) => Ok(port),
            _ => {
                run_relay_proxy(proxy_state_ref, &relay_url, &access_token, cancel_clone).await
            }
        }
    };

    let proxy_port = proxy_fut.await?;

    let server = McServer {
        name: host_ip.clone(),
        ip: "127.0.0.1".into(),
        port: proxy_port,
    };

    launch_game(app, game_state, instance_id, vec![server]).await
}

#[tauri::command]
fn get_instance_path(app: tauri::AppHandle, instance_id: String) -> String {
    get_instance_working_dir(&app, &instance_id).to_string_lossy().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DownloadState { token: Arc::new(Mutex::new(None)) })
        .manage(GameState { child: Arc::new(Mutex::new(None)) })
        .manage(ProxyGuard { cancel_token: Arc::new(Mutex::new(None)), local_port: Arc::new(Mutex::new(None)) })
        .plugin(tauri_plugin_gamepad::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drpc::init())
        .invoke_handler(tauri::generate_handler![setup_macos_runtime, launch_game, stop_game, check_game_installed, save_config, load_config, download_and_install, open_instance_folder, cancel_download, get_available_runners, get_external_palettes, import_theme, pick_folder, download_runner, delete_instance, sync_dlc, fetch_skin, workshop_install, workshop_uninstall, workshop_list_installed, get_screenshots, delete_screenshot, open_screenshot_folder, save_global_skin_pck, check_game_update, check_macos_runtime_installed, check_macos_runtime_installed_fast, download_logo, pick_file, save_file_dialog, write_binary_file, read_binary_file, read_screenshot_as_data_url, add_to_steam, http_proxy_request, get_instance_path, stun_discover, start_direct_proxy, start_relay_proxy, start_host_relay, stop_proxy, join_game])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 && !args[1].starts_with('-') {
                let instance_id = args[1].clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    let state = app_handle.state::<GameState>();
                    match launch_game(app_handle.clone(), state, instance_id, Vec::new()).await {
                        Ok(_) => { app_handle.exit(0); }
                        Err(e) => {
                            eprintln!("Auto-launch error: {}", e);
                            app_handle.exit(1);
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
