use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncRead;
use tokio::io::AsyncReadExt;
use tokio::sync::Mutex;
use crate::commands::runners;
use crate::config;
use crate::types::AppConfig;
#[cfg(target_os = "macos")]
use crate::platform::macos;
#[cfg(unix)]
use crate::platform::linux;
use crate::playtime::{self, PlaytimeResponse, PlaytimeDayEntry};
use crate::state::GameState;
use crate::types::McServer;
use crate::util;
use crate::workshop_server;
#[tauri::command]
#[allow(non_snake_case)]
pub async fn launch_game(
    app: AppHandle,
    state: State<'_, GameState>,
    instance_id: String,
    servers: Vec<McServer>,
    mut extra_args: Vec<String>,
) -> Result<(), String> {
    extra_args.extend(load_instance_args(&app, &instance_id));
    #[cfg(target_os = "android")]
    {
        let _ = state;
        let mut servers = servers;
        let working_dir = util::get_instance_working_dir(&app, &instance_id);
        if !working_dir.join("Minecraft.Client.exe").exists() {
            return Err("Game executable not found in instance folder.".into());
        }

        let config_val = config::load_config_raw(app.clone());
        let lce_online = McServer { name: "LCEOnline Game".into(), ip: "127.0.0.1".into(), port: 61000 };
        if !servers.iter().any(|s| s.ip == lce_online.ip && s.port == lce_online.port) {
            servers.push(lce_online);
        }
        if let Some(ref saved) = config_val.saved_servers {
            for s in saved {
                if !servers.iter().any(|existing| existing.ip == s.ip && existing.port == s.port) {
                    servers.push(s.clone());
                }
            }
        }
        ensure_server_list(&working_dir, servers);

        let result = crate::android_runtime::launch_bridge(
            working_dir.to_string_lossy().to_string(),
            crate::android_runtime::BridgeAction::Play,
            extra_args,
        );
        if result.is_ok() {
            playtime::start_session(&app, &instance_id);
        }
        result
    }
    #[cfg(not(target_os = "android"))]
    launch_game_desktop(app, state, instance_id, servers, extra_args).await
}

#[cfg(not(target_os = "android"))]
async fn launch_game_desktop(
    app: AppHandle,
    state: State<'_, GameState>,
    instance_id: String,
    mut servers: Vec<McServer>,
    extra_args: Vec<String>,
) -> Result<(), String> {
    state.manual_stop.store(false, Ordering::SeqCst);
    perform_instance_sync(&app, &instance_id).await?;
    let working_dir = util::get_instance_working_dir(&app, &instance_id);
    let config_val = config::load_config_raw(app.clone());
    let lce_online = McServer { name: "LCEOnline Game".into(), ip: "127.0.0.1".into(), port: 61000 };
    if !servers.iter().any(|s| s.ip == lce_online.ip && s.port == lce_online.port) {
        servers.push(lce_online);
    }
    if let Some(ref saved) = config_val.saved_servers {
        for s in saved {
            if !servers.iter().any(|existing| existing.ip == s.ip && existing.port == s.port) {
                servers.push(s.clone());
            }
        }
    }
    ensure_server_list(&working_dir, servers);
    let ws_cancel = workshop_server::start(app.clone()).await;
    let _ws_guard = workshop_server::Guard::new(ws_cancel.clone());
    {
        let mut lock = state.workshop_cancel.lock().await;
        *lock = Some(ws_cancel);
    }

    let game_exe = working_dir.join("Minecraft.Client.exe");
    if !game_exe.exists() {
        return Err("Game executable not found in instance folder.".into());
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(ref runner_id) = config_val.linux_runner {
            let runners_list = runners::get_available_runners(app.clone());
            if let Some(runner) = runners_list.into_iter().find(|r| r.id == *runner_id) {
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

                let mangohud = config_val.mangohud_enabled.unwrap_or(false);
                let (prog, runner_args): (&str, &[&str]) = if mangohud {
                    ("mangohud", &[&program])
                } else {
                    (&program, &[])
                };

                let mut all_args: Vec<String> = Vec::new();
                for a in runner_args {
                    all_args.push(a.to_string());
                }
                all_args.extend(args.clone());
                all_args.push(game_exe.to_string_lossy().to_string());
                all_args.extend(extra_args.clone());
                let (final_prog, final_args) = apply_launch_prefix(prog, all_args, &config_val);
                let mut cmd = tokio::process::Command::new(&final_prog);
                for a in &final_args {
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

                apply_launch_env_vars(&mut cmd, &config_val);
                cmd.current_dir(&working_dir);
                cmd.env("WINEDEBUG", "+debugstr");
                let playtime_start = std::time::Instant::now();
                let Some(result) = run_game_and_capture(&state, cmd).await? else {
                    return Ok(());
                };

                let duration = playtime_start.elapsed();
                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                let start = now - duration.as_secs();
                playtime::record_session(&app, &instance_id, start, now);

                return handle_game_exit(&app, &state, result);
            }
        }
        Err("No Linux runner selected in settings.".into())
    }

    #[cfg(not(target_os = "linux"))]
    {
        #[cfg(target_os = "macos")]
        {
            let runtime_dir = macos::get_macos_runtime_dir(&app);
            let toolkit_dir = runtime_dir.join("toolkit");
            let prefix_dir = runtime_dir.join("prefix");
            if !toolkit_dir.exists() || !prefix_dir.exists() {
                return Err("macOS Compatibility is not set up. Open Settings and run Setup macOS Compatibility.".into());
            }

            let gptk_no_hud = macos::find_executable_recursive(&toolkit_dir, "gameportingtoolkit-no-hud")
                .or_else(|| macos::find_executable_recursive(&toolkit_dir, "gameportingtoolkit"));

            let is_intel = std::env::consts::ARCH == "x86_64";
            let wine_binary = if is_intel {
                macos::find_executable_recursive(&toolkit_dir, "wine")
                    .or_else(|| macos::find_executable_recursive(&toolkit_dir, "wine64"))
            } else {
                macos::find_executable_recursive(&toolkit_dir, "wine64")
                    .or_else(|| macos::find_executable_recursive(&toolkit_dir, "wine"))
            }
            .ok_or_else(|| "Unable to locate wine binary inside runtime.".to_string())?;

            let wine_bin_dir = wine_binary
                .parent()
                .map(|pp| pp.to_path_buf())
                .ok_or_else(|| "Unable to locate wine bin directory inside runtime.".to_string())?;

            let (mac_prog, mut mac_args): (String, Vec<String>) = if let Some(ref wrapper) = gptk_no_hud {
                let win_path = util::unix_path_to_wine_z_path(&game_exe);
                (wrapper.to_string_lossy().to_string(), vec![
                    prefix_dir.to_string_lossy().to_string(),
                    win_path,
                ])
            } else {
                (wine_binary.to_string_lossy().to_string(), vec![
                    game_exe.to_string_lossy().to_string(),
                ])
            };

            mac_args.extend(extra_args.clone());

            let (final_prog, final_args) = apply_launch_prefix(&mac_prog, mac_args, &config_val);
            let mut cmd = tokio::process::Command::new(&final_prog);
            for a in &final_args {
                cmd.arg(a);
            }

            #[cfg(unix)]
            cmd.process_group(0);

            apply_launch_env_vars(&mut cmd, &config_val);
            cmd.current_dir(&working_dir);
            cmd.env("WINEPREFIX", &prefix_dir);
            cmd.env("WINEDEBUG", "+debugstr");
            let perf_boost = config_val.apple_silicon_performance_boost.unwrap_or(false);
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
            cmd.stdin(std::process::Stdio::null());

            let playtime_start = std::time::Instant::now();
            let Some(result) = run_game_and_capture(&state, cmd).await? else {
                return Ok(());
            };

            let duration = playtime_start.elapsed();
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            let start = now - duration.as_secs();
            playtime::record_session(&app, &instance_id, start, now);

            return handle_game_exit(&app, &state, result);
        }

        #[cfg(all(
            not(target_os = "macos"),
            not(target_os = "linux"),
            not(target_os = "android")
        ))]
        {
            let exe_str = game_exe.to_string_lossy().to_string();
            let all_args: Vec<String> = extra_args.clone();
            let (final_prog, final_args) = apply_launch_prefix(&exe_str, all_args, &config_val);
            let mut cmd = tokio::process::Command::new(&final_prog);
            for a in &final_args {
                cmd.arg(a);
            }
            #[cfg(unix)]
            cmd.process_group(0);
            apply_launch_env_vars(&mut cmd, &config_val);
            cmd.current_dir(&working_dir);
            let playtime_start = std::time::Instant::now();
            let Some(result) = run_game_and_capture(&state, cmd).await? else {
                return Ok(());
            };
            let duration = playtime_start.elapsed();
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            let start = now - duration.as_secs();
            playtime::record_session(&app, &instance_id, start, now);
            return handle_game_exit(&app, &state, result);
        }
    }
}

#[tauri::command]
pub async fn stop_game(
    app: AppHandle,
    instance_id: String,
    state: State<'_, GameState>,
) -> Result<(), String> {
    state.manual_stop.store(true, Ordering::SeqCst);
    let mut lock = state.child.lock().await;
    if let Some(mut child) = lock.take() {
        #[cfg(unix)]
        linux::kill_process_tree(&app, &instance_id);
        let _ = child.kill().await;
    }
    drop(lock);

    let mut lock = state.workshop_cancel.lock().await;
    if let Some(cancel) = lock.take() {
        cancel.cancel();
    }
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn check_game_installed(app: AppHandle, instance_id: String) -> bool {
    util::get_instance_working_dir(&app, &instance_id)
        .join("Minecraft.Client.exe")
        .exists()
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn open_instance_folder(app: AppHandle, instance_id: String) {
    let folder = util::get_instance_working_dir(&app, &instance_id);
    #[cfg(target_os = "android")]
    {
        let _ = std::fs::create_dir_all(&folder);
        let _ = crate::android_runtime::launch_bridge(
            folder.to_string_lossy().to_string(),
            crate::android_runtime::BridgeAction::OpenContainer,
            Vec::new(),
        );
    }
    #[cfg(not(target_os = "android"))]
    {
        if folder.exists() {
            let _ = app.opener().open_path(folder.to_str().unwrap(), None::<&str>);
        }
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn open_container_settings(app: AppHandle, instance_id: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let folder = util::get_instance_working_dir(&app, &instance_id);
        crate::android_runtime::launch_bridge(
            folder.to_string_lossy().to_string(),
            crate::android_runtime::BridgeAction::OpenSettings,
            Vec::new(),
        )
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, instance_id);
        Err("Only supported on Android".into())
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_instance(app: AppHandle, instance_id: String) -> Result<(), String> {
    let config_val = config::load_config_raw(app.clone());
    if let Some(ref editions) = config_val.custom_editions {
        if let Some(edition) = editions.iter().find(|e| e.id == instance_id) {
            if edition.path.is_some() {
                return Ok(());
            }
        }
    }
    if let Some(ref custom_paths) = config_val.custom_paths {
        if custom_paths.contains_key(&instance_id) {
            return Ok(());
        }
    }
    let dir = util::get_app_dir(&app).join("instances").join(&instance_id);
    if dir.exists() {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_dlc(app: AppHandle, instance_id: String) -> Result<(), String> {
    perform_instance_sync(&app, &instance_id).await
}

#[tauri::command]
pub fn get_instance_path(app: AppHandle, instance_id: String) -> String {
    util::get_instance_working_dir(&app, &instance_id)
        .to_string_lossy()
        .to_string()
}

fn load_instance_args(app: &AppHandle, instance_id: &str) -> Vec<String> {
    let config_val = config::load_config_raw(app.clone());
    config_val
        .instance_launch_args
        .and_then(|m| m.get(instance_id).cloned())
        .map(|entry| entry.args)
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_instance_args_schema(app: AppHandle, instance_id: String) -> Option<String> {
    let dir = util::get_instance_working_dir(&app, &instance_id);
    fs::read_to_string(dir.join("Arguments.Schema.json")).ok()
}

#[tauri::command]
pub fn get_playtime(app: AppHandle, instance_id: String) -> PlaytimeResponse {
    playtime::get_playtime(&app, &instance_id)
}

#[tauri::command]
pub fn get_playtime_daily(app: AppHandle, instance_id: String, days: u64) -> Vec<PlaytimeDayEntry> {
    playtime::get_playtime_daily(&app, &instance_id, days)
}

#[cfg(desktop)]
#[tauri::command]
pub fn backup_instance(app: AppHandle, instance_id: String) -> Result<(), String> {
    let instance_dir = util::get_instance_working_dir(&app, &instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let backup_name = format!("{}_backup.tar.gz", instance_id);
    let file = rfd::FileDialog::new()
        .set_title("Save Instance Backup")
        .set_file_name(&backup_name)
        .add_filter("Tar Gzip Archive", &["tar.gz"])
        .save_file();

    if let Some(path) = file {
        let parent = instance_dir.parent().ok_or("Invalid instance path")?;
        let dir_name = instance_dir.file_name().ok_or("Invalid dir name")?;

        let status = std::process::Command::new("tar")
            .args(["-czf", path.to_str().unwrap(), "-C", parent.to_str().unwrap(), dir_name.to_str().unwrap()])
            .status()
            .map_err(|e| format!("Failed to create backup: {}", e))?;

        if status.success() {
            Ok(())
        } else {
            Err("Backup command failed".into())
        }
    } else {
        Err("CANCELED".into())
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn restore_instance(app: AppHandle) -> Result<String, String> {
    let file = rfd::FileDialog::new()
        .set_title("Restore Instance Backup")
        .add_filter("Tar Gzip Archive", &["tar.gz"])
        .add_filter("Zip Archive", &["zip"])
        .pick_file();

    if let Some(path) = file {
        let instances_dir = util::get_app_dir(&app).join("instances");
        std::fs::create_dir_all(&instances_dir).map_err(|e| e.to_string())?;

        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        let status = if ext == "zip" {
            std::process::Command::new("unzip")
                .arg("-o")
                .arg(path.to_str().unwrap())
                .arg("-d")
                .arg(instances_dir.to_str().unwrap())
                .status()
                .map_err(|e| format!("Failed to extract backup: {}", e))?
        } else {
            std::process::Command::new("tar")
                .args(["-xzf", path.to_str().unwrap(), "-C", instances_dir.to_str().unwrap()])
                .status()
                .map_err(|e| format!("Failed to extract backup: {}", e))?
        };

        if status.success() {
            let extracted: Vec<_> = std::fs::read_dir(&instances_dir)
                .map_err(|e| e.to_string())?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir() && e.path().join("Minecraft.Client.exe").exists())
                .collect();

            if let Some(new_instance) = extracted.into_iter().next() {
                let id = new_instance.file_name().to_string_lossy().to_string();
                Ok(id)
            } else {
                Ok("restored".into())
            }
        } else {
            Err("Restore command failed".into())
        }
    } else {
        Err("CANCELED".into())
    }
}

pub fn ensure_server_list(instance_dir: &PathBuf, servers: Vec<McServer>) {
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
    let root = util::get_app_dir(app);
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
                            util::copy_dir_all(entry.path(), &dest_path)
                        } else {
                            fs::copy(entry.path(), &dest_path).map(|_| ())
                        } {
                            let _ = app.emit("backend-error", format!("DLC Sync: Failed to copy {:?}: {}", entry.path(), e));
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

fn apply_launch_prefix(program: &str, args: Vec<String>, config: &AppConfig) -> (String, Vec<String>) {
    if let Some(ref prefix) = config.launch_prefix {
        let trimmed = prefix.trim();
        if !trimmed.is_empty() {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if !parts.is_empty() {
                let mut all_args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();
                all_args.push(program.to_string());
                all_args.extend(args);
                return (parts[0].to_string(), all_args);
            }
        }
    }
    (program.to_string(), args)
}

fn apply_launch_env_vars(cmd: &mut tokio::process::Command, config: &AppConfig) {
    if let Some(ref env_vars) = config.launch_env_vars {
        for (k, v) in env_vars {
            cmd.env(k, v);
        }
    }
}

const MAX_LOG_BYTES: usize = 1024 * 1024;
struct GameRunResult {
    log: String,
    exit_code: i32,
}

fn spawn_log_reader<R>(mut reader: R, log: Arc<Mutex<Vec<u8>>>) -> tokio::task::JoinHandle<()> where R: AsyncRead + Unpin + Send + 'static, {
    tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let mut guard = log.lock().await;
                    guard.extend_from_slice(&buf[..n]);
                    if guard.len() > MAX_LOG_BYTES {
                        let remove = guard.len() - MAX_LOG_BYTES;
                        guard.drain(..remove);
                    }
                }
            }
        }
    })
}

async fn run_game_and_capture(
    state: &State<'_, GameState>,
    mut cmd: tokio::process::Command,
) -> Result<Option<GameRunResult>, String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut handles = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        handles.push(spawn_log_reader(stdout, log.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        handles.push(spawn_log_reader(stderr, log.clone()));
    }
    {
        let mut lock = state.child.lock().await;
        *lock = Some(child);
    }
    let exit_code;
    loop {
        {
            let mut lock = state.child.lock().await;
            if let Some(ref mut c) = *lock {
                if let Some(status) = c.try_wait().map_err(|e| e.to_string())? {
                    exit_code = status.code().unwrap_or(1);
                    break;
                }
            } else {
                return Ok(None);
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
    {
        let mut lock = state.child.lock().await;
        *lock = None;
    }
    for handle in handles {
        let _ = handle.await;
    }
    let bytes = log.lock().await.clone();
    let log_str = String::from_utf8_lossy(&bytes).to_string();
    Ok(Some(GameRunResult { log: log_str, exit_code }))
}

fn game_exited_ok(result: &GameRunResult) -> bool {
    #[cfg(not(target_os = "windows"))]
    {
        result.log.lines()
            .rev()
            .take(3)
            .any(|line| line.contains("AppPolicyGetProcessTerminationMethod"))
    }
    #[cfg(target_os = "windows")]
    {
        result.exit_code == 0
    }
}

fn handle_game_exit(
    app: &AppHandle,
    state: &State<'_, GameState>,
    result: GameRunResult,
) -> Result<(), String> {
    if state.manual_stop.swap(false, Ordering::SeqCst) || game_exited_ok(&result) {
        return Ok(());
    }
    let _ = app.emit("game-log", result.log);
    Err("The game exited unexpectedly. Check the crash log for details.".into())
}

async fn perform_instance_sync(app: &AppHandle, instance_id: &str) -> Result<(), String> {
    let target_dir = util::get_instance_working_dir(app, instance_id);
    if !target_dir.exists() {
        return Err("Instance directory not found".into());
    }

    let config_val = config::load_config_raw(app.clone());
    let _ = fs::write(target_dir.join("username.txt"), &config_val.username);
    let skin_pck_path = util::get_app_dir(app).join("Skin.pck");
    if skin_pck_path.exists() {
        let skin_dlc_dir = target_dir.join("Windows64Media").join("DLC").join("Custom Skins");
        let _ = fs::create_dir_all(&skin_dlc_dir);
        let _ = fs::copy(&skin_pck_path, skin_dlc_dir.join("Skin.pck"));
    }

    perform_dlc_sync(app, &target_dir)?;
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "android")]
pub fn switch_proton(app: AppHandle, version: String) -> Result<(), String> {
    let instance_id = {
        let config_val = config::load_config_raw(app.clone());
        config_val.profile.unwrap_or_else(|| "legacy_evolved".into())
    };
    crate::android_runtime::launch_bridge(
        instance_id,
        crate::android_runtime::BridgeAction::SwitchProton,
        vec![version],
    )
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub fn switch_proton(_app: AppHandle, _version: String) -> Result<(), String> {
    Err("Only supported on Android".into())
}

#[tauri::command]
#[cfg(target_os = "android")]
pub fn install_latest_driver(app: AppHandle) -> Result<(), String> {
    let instance_id = {
        let config_val = config::load_config_raw(app.clone());
        config_val.profile.unwrap_or_else(|| "legacy_evolved".into())
    };
    crate::android_runtime::launch_bridge(
        instance_id,
        crate::android_runtime::BridgeAction::InstallDriver,
        Vec::new(),
    )
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub fn install_latest_driver(_app: AppHandle) -> Result<(), String> {
    Err("Only supported on Android".into())
}

#[tauri::command]
#[cfg(target_os = "android")]
pub fn set_audio_backend(app: AppHandle, backend: String) -> Result<(), String> {
    let instance_id = {
        let config_val = config::load_config_raw(app.clone());
        config_val.profile.unwrap_or_else(|| "legacy_evolved".into())
    };
    crate::android_runtime::launch_bridge(
        instance_id,
        crate::android_runtime::BridgeAction::SetAudioBackend,
        vec![backend],
    )
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub fn set_audio_backend(_app: AppHandle, _backend: String) -> Result<(), String> {
    Err("Only supported on Android".into())
}
