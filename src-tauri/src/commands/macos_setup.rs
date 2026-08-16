//neo: TODO: Intel macOS support

use tauri::AppHandle;
#[cfg(target_os = "macos")]
use std::io::Write;
#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::process::Stdio;
#[cfg(target_os = "macos")]
use futures_util::StreamExt;
#[cfg(target_os = "macos")]
use tauri::Emitter;
#[cfg(target_os = "macos")]
use serde::Deserialize;
#[cfg(target_os = "macos")]
use crate::platform::macos;
#[cfg(target_os = "macos")]
use std::fs;

#[tauri::command]
pub fn check_macos_runtime_installed(_app: AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    { macos::is_macos_runtime_installed(&_app) }
    #[cfg(not(target_os = "macos"))]
    { false }
}

#[tauri::command]
pub fn check_macos_runtime_installed_fast(_app: AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    { macos::is_macos_runtime_installed(&_app) }
    #[cfg(not(target_os = "macos"))]
    { false }
}

#[tauri::command]
pub async fn setup_macos_runtime(window: tauri::Window, app: AppHandle) -> Result<(), String> {
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

        macos::emit_macos_setup_progress(
            &window,
            "resolving",
            "Resolving macOS compatibility runtime…".into(),
            None,
        );

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

        let release: GithubRelease =
            serde_json::from_str(&release_text).map_err(|e| e.to_string())?;
        let asset = release
            .assets
            .iter()
            .find(|a| a.name.ends_with(".tar.xz") || a.name.ends_with(".tar.gz"))
            .ok_or_else(|| "No compatible runtime asset found in latest release.".to_string())?;

        let runtime_dir = macos::get_macos_runtime_dir(&app);
        let toolkit_dir = runtime_dir.join("toolkit");
        let prefix_dir = runtime_dir.join("prefix");
        fs::create_dir_all(&runtime_dir).map_err(|e| e.to_string())?;
        if toolkit_dir.exists() {
            let _ = fs::remove_dir_all(&toolkit_dir);
        }
        fs::create_dir_all(&toolkit_dir).map_err(|e| e.to_string())?;

        macos::emit_macos_setup_progress(
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
                    macos::emit_macos_setup_progress(
                        &window,
                        "downloading",
                        format!("Downloading runtime… {}%", rounded),
                        Some(percent),
                    );
                }
            }
        }
        drop(file);
        macos::emit_macos_setup_progress(
            &window,
            "extracting",
            "Extracting runtime…".into(),
            None,
        );

        let archive_metadata =
            fs::metadata(&archive_path).map_err(|e| format!("Cannot read archive: {}", e))?;
        println!("Archive size: {} bytes", archive_metadata.len());
        if archive_metadata.len() < 100_000_000 {
            return Err(format!("Archive too small: {} bytes", archive_metadata.len()));
        }

        let status = Command::new("tar")
            .args([
                "-xf",
                archive_path
                    .to_str()
                    .ok_or_else(|| "Invalid archive path".to_string())?,
                "-C",
                toolkit_dir
                    .to_str()
                    .ok_or_else(|| "Invalid toolkit path".to_string())?,
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
        let wine_binary = macos::find_executable_recursive(&toolkit_dir, "wine64")
            .or_else(|| macos::find_executable_recursive(&toolkit_dir, "wine"))
            .ok_or_else(|| "Unable to locate wine binary inside runtime.".to_string())?;

        let wine_bin_dir = wine_binary
            .parent()
            .map(|pp| pp.to_path_buf())
            .ok_or_else(|| "Unable to locate wine bin directory inside runtime.".to_string())?;

        macos::emit_macos_setup_progress(
            &window,
            "initializing",
            "Initializing Wine prefix…".into(),
            None,
        );

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

        macos::emit_macos_setup_progress(&window, "done", "Setup complete.".into(), Some(100.0));
        Ok(())
    }
}
