use std::fs;
use tauri::AppHandle;
use crate::types::AppConfig;
use crate::util;
pub fn load_config_raw(app: AppHandle) -> AppConfig {
    let path = util::get_config_path(&app);
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(config) = serde_json::from_str(&content) {
            return config;
        }
    }

    let old_path = util::get_app_dir(&app).join("emerald_legacy_config.txt");
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
        customizations: None,
        profile: Some("legacy_evolved".into()),
        animations_enabled: Some(true),
        vfx_enabled: Some(true),
        rpc_enabled: Some(true),
        start_fullscreen: Some(false),
        music_vol: Some(50),
        sfx_vol: Some(100),
        legacy_mode: Some(false),
        mangohud_enabled: None,
        saved_servers: None,
        extra_launch_args: None,
        launch_prefix: None,
        launch_env_vars: None,
    }
}

pub fn save_config_raw(app: &AppHandle, config: &AppConfig) {
    let path = util::get_config_path(app);
    let _ = fs::create_dir_all(path.parent().unwrap());
    if let Ok(json) = serde_json::to_string(config) {
        let _ = fs::write(path, json);
    }
}
