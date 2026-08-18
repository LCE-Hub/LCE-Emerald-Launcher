use std::fs;
use std::path::PathBuf;
use base64::Engine;
use steam_shortcuts_util::{Shortcut, parse_shortcuts, shortcuts_to_bytes};
use tauri::AppHandle;
#[tauri::command]
pub async fn add_to_steam(
    _app: AppHandle,
    instance_id: String,
    name: String,
    title_base64: String,
    panorama_base64: String,
) -> Result<(), String> {
    let in_flatpak = std::path::Path::new("/.flatpak-info").exists();
    let (exe_str, launch_options, start_dir) = if in_flatpak {
        (
            "/usr/bin/flatpak".to_string(),
            format!("run io.github.Emerald_Legacy_Launcher.Emerald_Legacy_Launcher \"{}\"", instance_id), //neo: yes i'm hardcoding it lmfao
            std::env::var("HOME").unwrap_or_default(),
        )
    } else {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let s = exe_path.to_string_lossy().to_string();
        let dir = exe_path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        (s, format!("\"{}\"", instance_id), dir)
    };
    let app_id_32 = steam_shortcuts_util::app_id_generator::calculate_app_id(&exe_str, &name);
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
                    let panorama_data = base64::engine::general_purpose::STANDARD.decode(panorama_base64.clone()).map_err(|e| e.to_string())?;
                    let title_data = base64::engine::general_purpose::STANDARD.decode(title_base64.clone()).map_err(|e| e.to_string())?;
                    let _ = fs::write(grid_dir.join(format!("{}p.png", app_id_32)), &panorama_data);
                    let _ = fs::write(grid_dir.join(format!("{}_hero.png", app_id_32)), &panorama_data);
                    let _ = fs::write(grid_dir.join(format!("{}.png", app_id_32)), &panorama_data);
                    let _ = fs::write(grid_dir.join(format!("{}_logo.png", app_id_32)), &title_data);
                    let _ = fs::write(grid_dir.join(format!("{}.json", app_id_32)), "{\"nVersion\":1,\"logoPosition\":{\"pinnedPosition\":\"CenterCenter\",\"nWidthPct\":50,\"nHeightPct\":50}}".as_bytes());
                }
            }
        }
    }

    Ok(())
}
