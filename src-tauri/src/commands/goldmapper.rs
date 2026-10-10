use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use crate::config;
use crate::types::{AppConfig, GoldMapperMapping};
use crate::util;

const CONTROLLER_TARGETS: [&str; 14] = [
    "PAD_A",
    "PAD_B",
    "PAD_X",
    "PAD_Y",
    "PAD_LB",
    "PAD_RB",
    "PAD_BACK",
    "PAD_START",
    "PAD_LTHUMB",
    "PAD_RTHUMB",
    "PAD_DPAD_UP",
    "PAD_DPAD_DOWN",
    "PAD_DPAD_LEFT",
    "PAD_DPAD_RIGHT",
];

fn push_key(mappings: &mut Vec<GoldMapperMapping>, name: String) {
    mappings.push(GoldMapperMapping {
        to: name.clone(),
        from: name,
    });
}

pub fn default_mappings() -> Vec<GoldMapperMapping> {
    let mut mappings = Vec::new();
    for b in b'A'..=b'Z' {
        push_key(&mut mappings, format!("KEY_{}", b as char));
    }
    for n in 0..=9 {
        push_key(&mut mappings, format!("KEY_{n}"));
    }
    for f in 1..=12 {
        push_key(&mut mappings, format!("KEY_F{f}"));
    }
    for k in [
        "KEY_SPACE",
        "KEY_RETURN",
        "KEY_ESCAPE",
        "KEY_TAB",
        "KEY_BACKSPACE",
        "KEY_DELETE",
        "KEY_INSERT",
        "KEY_HOME",
        "KEY_END",
        "KEY_PAGEUP",
        "KEY_PAGEDOWN",
        "KEY_UP",
        "KEY_DOWN",
        "KEY_LEFT",
        "KEY_RIGHT",
        "KEY_PRINTSCREEN",
        "KEY_PAUSE",
        "KEY_CAPSLOCK",
        "KEY_NUMLOCK",
        "KEY_SCROLLLOCK",
        "KEY_LSHIFT",
        "KEY_RSHIFT",
        "KEY_LCTRL",
        "KEY_RCTRL",
        "KEY_LALT",
        "KEY_RALT",
        "KEY_LWIN",
        "KEY_RWIN",
        "KEY_APPS",
    ] {
        push_key(&mut mappings, k.to_string());
    }
    for n in 0..=9 {
        push_key(&mut mappings, format!("KEY_NUMPAD{n}"));
    }
    for k in [
        "KEY_MULTIPLY",
        "KEY_ADD",
        "KEY_SUBTRACT",
        "KEY_DECIMAL",
        "KEY_DIVIDE",
        "KEY_SEMICOLON",
        "KEY_EQUALS",
        "KEY_COMMA",
        "KEY_MINUS",
        "KEY_PERIOD",
        "KEY_SLASH",
        "KEY_GRAVE",
        "KEY_LBRACKET",
        "KEY_BACKSLASH",
        "KEY_RBRACKET",
        "KEY_APOSTROPHE",
    ] {
        push_key(&mut mappings, k.to_string());
    }
    for m in ["MOUSE_LEFT", "MOUSE_RIGHT", "MOUSE_MIDDLE"] {
        push_key(&mut mappings, m.to_string());
    }
    for (i, target) in CONTROLLER_TARGETS.iter().enumerate() {
        mappings.push(GoldMapperMapping {
            from: format!("DINPUT_{i}"),
            to: (*target).to_string(),
        });
    }
    mappings
}

pub fn resolve_resource(app: &AppHandle, name: &str) -> Option<PathBuf> {
    use tauri::path::BaseDirectory;
    if let Ok(p) = app.path().resolve(format!("resources/{name}"), BaseDirectory::Resource) {
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(current) = std::env::current_dir() {
        let p = current.join("src-tauri").join("resources").join(name);
        if p.exists() {
            return Some(p);
        }
        let p = current.join("resources").join(name);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

pub fn write_runtime_config(app: &AppHandle, config_val: &AppConfig) -> Result<PathBuf, String> {
    let dir = util::get_app_dir(app).join("GoldMapper");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("config.json");
    let mappings = config_val
        .goldmapper_mappings
        .clone()
        .unwrap_or_else(default_mappings);
    let json = serde_json::to_string(&serde_json::json!({ "mappings": mappings }))
        .map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path)
}

pub fn build_launch_args(
    app: &AppHandle,
    config_val: &AppConfig,
    game_exe: &PathBuf,
    extra_args: &[String],
) -> Result<Option<Vec<String>>, String> {
    if !config_val.goldmapper_enabled.unwrap_or(true) {
        return Ok(None);
    }
    let launcher =
        resolve_resource(app, "GoldMapperLauncher.exe").ok_or_else(|| "GoldMapperLauncher.exe not found in resources".to_string())?;
    let config_path = write_runtime_config(app, config_val)?;
    #[cfg(windows)]
    {
        let mut args = vec![
            launcher.to_string_lossy().to_string(),
            config_path.to_string_lossy().to_string(),
            game_exe.to_string_lossy().to_string(),
        ];
        args.extend(extra_args.iter().cloned());
        Ok(Some(args))
    }
    #[cfg(unix)]
    {
        let mut args = vec![
            util::unix_path_to_wine_z_path(&launcher),
            util::unix_path_to_wine_z_path(&config_path),
            util::unix_path_to_wine_z_path(game_exe),
        ];
        args.extend(extra_args.iter().cloned());
        Ok(Some(args))
    }
}

#[tauri::command]
pub fn goldmapper_get_defaults() -> Vec<GoldMapperMapping> {
    default_mappings()
}

#[tauri::command]
pub fn goldmapper_load_config(app: AppHandle) -> Vec<GoldMapperMapping> {
    config::load_config_raw(app.clone())
        .goldmapper_mappings
        .unwrap_or_else(default_mappings)
}

#[tauri::command]
pub fn goldmapper_save_config(
    app: AppHandle,
    mappings: Vec<GoldMapperMapping>,
) -> Result<(), String> {
    let mut config_val = config::load_config_raw(app.clone());
    config_val.goldmapper_mappings = Some(mappings);
    println!(
        "[GoldMapper] config saved: {}",
        serde_json::json!({ "mappings": config_val.goldmapper_mappings })
    );
    config::save_config_raw(&app, &config_val);
    Ok(())
}

#[tauri::command]
pub fn goldmapper_reset_config(app: AppHandle) -> Vec<GoldMapperMapping> {
    let mut config_val = config::load_config_raw(app.clone());
    config_val.goldmapper_mappings = None;
    config::save_config_raw(&app, &config_val);
    default_mappings()
}
