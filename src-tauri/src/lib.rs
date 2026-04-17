use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "macos")]
use std::process::Stdio;

use tauri::{AppHandle, Emitter, State, Manager};
use futures_util::StreamExt;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tauri_plugin_opener::OpenerExt;
use serde::{Deserialize, Serialize};

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

pub struct DownloadState { pub token: Arc<Mutex<Option<CancellationToken>>> }
pub struct GameState { pub child: Arc<Mutex<Option<tokio::process::Child>>> }

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
        if path.is_dir() {
            if let Some(found) = find_executable_recursive(&path, file_name) {
                return Some(found);
            }
            continue;
        }

        if path.file_name().and_then(|n| n.to_str()) == Some(file_name) {
            return Some(path);
        }
    }
    None
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
        ];

        for base_path in steam_paths {
            if let Ok(entries) = fs::read_dir(base_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.contains("Proton") {
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
    get_app_dir(&app).join("instances").join(&instance_id).join("Minecraft.Client.exe").exists()
}

#[tauri::command]
#[allow(non_snake_case)]
fn open_instance_folder(app: AppHandle, instance_id: String) {
    let dir = get_app_dir(&app).join("instances").join(&instance_id);
    if dir.exists() {
        let _ = app.opener().open_path(dir.to_str().unwrap(), None::<&str>);
    }
}

#[tauri::command]
#[allow(non_snake_case)]
fn delete_instance(app: AppHandle, instance_id: String) -> Result<(), String> {
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

                let keep_list = ["Windows64", "Windows64Media", "uid.dat", "username.txt", "settings.dat", "servers.dat", "servers.txt", "server.properties", "options.txt", "servers.db", "workshop_files.json", "screenshots"];
                let entry_path_str = entry.path().to_string_lossy().to_string();
                let is_workshop_file = workshop_files.iter().any(|wf| entry_path_str.starts_with(wf) || wf.starts_with(&entry_path_str));
                if !keep_list.contains(&name_str.as_ref()) && !is_workshop_file {
                    let path = entry.path();
                    if path.is_dir() {
                        let _ = fs::remove_dir_all(path);
                    } else {
                        let _ = fs::remove_file(path);
                    }
                }            }
        }
    }

    let zip_path = root.join(format!("temp_{}.zip", instance_id));
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0) as f64;
    let mut file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut downloaded = 0.0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if child_token.is_cancelled() {
            drop(file); let _ = fs::remove_file(&zip_path);
            return Err("CANCELLED".into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as f64;
        if total_size > 0.0 { let _ = app.emit("download-progress", downloaded / total_size * 100.0); }
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
                            let dest_path = instance_dir.join(file_name);
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

#[tauri::command]
async fn sync_dlc(app: AppHandle, instance_id: String) -> Result<(), String> {
    let root = get_app_dir(&app);
    let instance_dir = root.join("instances").join(&instance_id);
    perform_dlc_sync(&app, &instance_dir)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkshopInstallRequest {
    instance_id: String,
    zips: std::collections::HashMap<String, String>,
    package_id: String,
}

#[tauri::command]
async fn workshop_install(app: AppHandle, request: WorkshopInstallRequest) -> Result<(), String> {
    let root = get_app_dir(&app);
    let instance_dir = root.join("instances").join(&request.instance_id);
    if !instance_dir.exists() {
        return Err("Instance not installed".into());
    }

    let media_dir   = instance_dir.join("Windows64Media");
    let dlc_dir     = media_dir.join("DLC");
    let game_hdd    = instance_dir.join("Windows64").join("GameHDD");
    let mob_dir     = instance_dir.join("Common").join("res").join("mob");
    let wf_path = instance_dir.join("workshop_files.json");
    let mut workshop_files: Vec<String> = fs::read_to_string(&wf_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let raw_base = format!("https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/{}", request.package_id);
    let tmp_dir = root.join(format!("workshop_tmp_{}", request.package_id));
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
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
            let resolved = placeholder
                .replace("{MediaDir}", media_dir.to_str().unwrap_or(""))
                .replace("{DLCDir}",   dlc_dir.to_str().unwrap_or(""))
                .replace("{GameHDD}",  game_hdd.to_str().unwrap_or(""))
                .replace("{MobDir}",   mob_dir.to_str().unwrap_or(""));
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
            workshop_files.push(dest_str);
        }
    }

    let _ = fs::remove_dir_all(&tmp_dir);
    if let Ok(json) = serde_json::to_string(&workshop_files) {
        let _ = fs::write(&wf_path, json);
    }

    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
async fn launch_game(app: AppHandle, state: State<'_, GameState>, instance_id: String, servers: Vec<McServer>) -> Result<(), String> {
    let root = get_app_dir(&app);
    let instance_dir = root.join("instances").join(&instance_id);
    let config = load_config(app.clone());
    let username = config.username;
    let _ = fs::write(instance_dir.join("username.txt"), &username);
    ensure_server_list(&instance_dir, servers);
    let skin_pck_path = root.join("Skin.pck");
    if skin_pck_path.exists() {
        let skin_dlc_dir = instance_dir.join("Windows64Media").join("DLC").join("Custom Skins");
        let _ = fs::create_dir_all(&skin_dlc_dir);
        let _ = fs::copy(&skin_pck_path, skin_dlc_dir.join("Skin.pck"));
    }

    let _ = perform_dlc_sync(&app, &instance_dir)?;
    let game_exe = instance_dir.join("Minecraft.Client.exe");
    if !game_exe.exists() {
        return Err("Game executable not found in instance folder.".into());
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(runner_id) = config.linux_runner {
            let runners = get_available_runners(app.clone());
            if let Some(runner) = runners.into_iter().find(|r| r.id == runner_id) {
                let mut cmd = if runner.r#type == "proton" {
                    let proton_exe = PathBuf::from(&runner.path).join("proton");
                    let mut c = tokio::process::Command::new(proton_exe);
                    let compat_data = instance_dir.join("proton_prefix");
                    fs::create_dir_all(&compat_data).map_err(|e| e.to_string())?;
                    if std::env::var("STEAM_COMPAT_CLIENT_INSTALL_PATH").is_err() {
                        c.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", "");
                    }
                    c.env("STEAM_COMPAT_DATA_PATH", compat_data.to_str().unwrap());
                    if std::env::var("SteamAppId").is_err() {
                        c.env("SteamAppId", "480");
                    }
                    c.arg("run");
                    c
                } else {
                    tokio::process::Command::new(runner.path)
                };

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
                   .current_dir(&instance_dir);

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

            cmd.current_dir(&instance_dir);
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
            cmd.current_dir(&instance_dir);
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
fn get_screenshots(app: AppHandle) -> Vec<ScreenshotInfo> {
    let mut screenshots = Vec::new();
    let instances_dir = get_app_dir(&app).join("instances");
    let _ = fs::create_dir_all(&instances_dir);
    if let Ok(entries) = fs::read_dir(instances_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let instance_id = entry.file_name().to_string_lossy().to_string();
                let screenshots_dir = entry.path().join("screenshots");
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
    screenshots.sort_by(|a, b| b.date.cmp(&a.date));
    screenshots
}

#[tauri::command]
fn delete_screenshot(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_global_skin_pck(app: AppHandle, pck_data: Vec<u8>) -> Result<(), String> {
    let app_dir = get_app_dir(&app);
    let _ = fs::write(app_dir.join("Skin.pck"), pck_data);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DownloadState { token: Arc::new(Mutex::new(None)) })
        .manage(GameState { child: Arc::new(Mutex::new(None)) })
        .plugin(tauri_plugin_gamepad::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drpc::init())
        .register_uri_scheme_protocol("screenshots", |_app, request| {
            let uri = request.uri().path();
            let decoded_path = percent_encoding::percent_decode_str(uri).decode_utf8_lossy();
            let path = std::path::Path::new(&*decoded_path);
            
            match std::fs::read(path) {
                Ok(data) => {
                    tauri::http::Response::builder()
                        .header("Content-Type", "image/png")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(data)
                        .unwrap()
                }
                Err(_) => {
                    tauri::http::Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap()
                }
            }
        })
        .invoke_handler(tauri::generate_handler![setup_macos_runtime, launch_game, stop_game, check_game_installed, save_config, load_config, download_and_install, open_instance_folder, cancel_download, get_available_runners, get_external_palettes, import_theme, download_runner, delete_instance, sync_dlc, fetch_skin, workshop_install, get_screenshots, delete_screenshot, save_global_skin_pck])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
