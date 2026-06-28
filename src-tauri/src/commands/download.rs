use std::fs;
use std::io::Write;
use std::time::Duration;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
use crate::state::DownloadState;
use crate::util;
async fn stream_download(
    app: &AppHandle,
    state: &DownloadState,
    url: &str,
    dest: &std::path::PathBuf,
    progress_event: &str,
) -> Result<String, String> {
    let token = CancellationToken::new();
    let child_token = token.clone();
    {
        let mut lock = state.token.lock().await;
        if let Some(old_token) = lock.take() {
            old_token.cancel();
        }
        *lock = Some(token);
    }

    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        { *state.token.lock().await = None; }
        return Err(format!("Download failed: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0) as f64;
    let last_modified = response.headers().get(reqwest::header::LAST_MODIFIED)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .to_string();
    let mut file = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut downloaded = 0.0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if child_token.is_cancelled() {
            drop(file);
            let _ = fs::remove_file(dest);
            { *state.token.lock().await = None; }
            return Err("CANCELLED".into());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as f64;
        if total_size > 0.0 {
            let _ = app.emit(progress_event, downloaded / total_size * 100.0);
        }
    }

    drop(file);
    { *state.token.lock().await = None; }
    Ok(last_modified)
}

async fn download_with_retry(
    app: &AppHandle,
    state: &DownloadState,
    url: &str,
    dest: &std::path::PathBuf,
    progress_event: &str,
    max_retries: u32,
) -> Result<String, String> {
    let mut last_error = String::new();
    for attempt in 1..=max_retries {
        if attempt > 1 {
            let backoff = Duration::from_secs(2u64.pow(attempt - 2));
            let cancel = CancellationToken::new();
            {
                let mut lock = state.token.lock().await;
                *lock = Some(cancel.clone());
            }
            let _ = app.emit("download-retry", attempt);
            tokio::select! {
                _ = tokio::time::sleep(backoff) => {}
                _ = cancel.cancelled() => {
                    let _ = fs::remove_file(dest);
                    return Err("CANCELLED".into());
                }
            }
        }
        match stream_download(app, state, url, dest, progress_event).await {
            Ok(result) => return Ok(result),
            Err(e) if e == "CANCELLED" => return Err(e),
            Err(e) => {
                last_error = e;
                let _ = fs::remove_file(dest);
            }
        }
    }
    let _ = app.emit("backend-error", format!("Download failed after {max_retries} attempts: {last_error}"));
    Err(last_error)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn download_and_install(
    app: AppHandle,
    state: State<'_, DownloadState>,
    url: String,
    instance_id: String,
) -> Result<String, String> {
    let instance_dir = util::get_instance_working_dir(&app, &instance_id);
    let root = util::get_app_dir(&app);
    let zip_path = root.join(format!("temp_{}.zip", instance_id));
    let last_modified = download_with_retry(&app, &state, &url, &zip_path, "download-progress", 3).await?;
    let keep_list: std::collections::HashSet<&str> = [
        "Windows64", "Windows64Media", "uid.dat", "username.txt", "settings.dat",
        "servers.dat", "servers.txt", "server.properties", "options.txt", "servers.db",
        "workshop_files.json", "screenshots", "update_timestamp.txt",
        "profile0.dat", "profile1.dat", "profile2.dat", "profile3.dat",
        "profile4.dat", "profile5.dat", "profile6.dat", "profile7.dat",
        "profile8.dat", "profile9.dat", "profile10.dat", "proton_prefix"
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

    if !last_modified.is_empty() {
        let _ = fs::write(instance_dir.join("update_timestamp.txt"), &last_modified);
    }

    #[cfg(target_os = "linux")]
    {
        let bsdtar_ok = std::process::Command::new("bsdtar")
            .args(["-xf", zip_path.to_str().unwrap(), "-C", instance_dir.to_str().unwrap()])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        if !bsdtar_ok {
            let unzip_ok = std::process::Command::new("unzip")
                .args(["-o", zip_path.to_str().unwrap(), "-d", instance_dir.to_str().unwrap()])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);

            if !unzip_ok {
                return Err("Extraction failed".into());
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let mut cmd = std::process::Command::new("tar");
        cmd.args(["-xf", zip_path.to_str().unwrap(), "-C", instance_dir.to_str().unwrap()]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let status = cmd.status().map_err(|e| e.to_string())?;
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
                                    let _ = util::copy_dir_all(inner_entry.path(), &dest_path);
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

#[tauri::command]
pub async fn cancel_download(state: State<'_, DownloadState>) -> Result<(), String> {
    if let Some(token) = state.token.lock().await.take() { token.cancel(); }
    Ok(())
}

#[tauri::command]
pub async fn download_runner(
    app: AppHandle,
    state: State<'_, DownloadState>,
    name: String,
    url: String,
) -> Result<String, String> {
    let runners_dir = util::get_app_dir(&app).join("runners");
    fs::create_dir_all(&runners_dir).map_err(|e| e.to_string())?;
    let runner_dir = runners_dir.join(&name);
    if runner_dir.exists() {
        let _ = fs::remove_dir_all(&runner_dir);
    }
    fs::create_dir_all(&runner_dir).map_err(|e| e.to_string())?;

    let tarball_path = runners_dir.join(format!("{}.tar.gz", name));
    download_with_retry(&app, &state, &url, &tarball_path, "runner-download-progress", 3).await?;

    let status = std::process::Command::new("tar")
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
pub async fn check_game_update(
    app: AppHandle,
    instance_id: String,
    url: String,
) -> Result<bool, String> {
    let instance_dir = util::get_instance_working_dir(&app, &instance_id);
    let timestamp_file = instance_dir.join("update_timestamp.txt");
    let local_timestamp = fs::read_to_string(&timestamp_file).unwrap_or_default();
    if url.is_empty() {
        return Ok(false);
    }
    if local_timestamp.is_empty() {
        return Ok(true);
    }

    let response = reqwest::Client::new()
        .head(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(remote_header) = response.headers().get(reqwest::header::LAST_MODIFIED) {
        if let Ok(remote_timestamp) = remote_header.to_str() {
            if remote_timestamp != local_timestamp {
                return Ok(true);
            }
        }
    }

    Ok(false)
}
