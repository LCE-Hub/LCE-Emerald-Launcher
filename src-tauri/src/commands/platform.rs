use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub is_linux: bool,
    pub is_mac: bool,
    pub is_windows: bool,
    pub is_android: bool,
}

#[tauri::command]
pub fn get_platform() -> PlatformInfo {
    #[cfg(target_os = "linux")]
    {
        PlatformInfo { is_linux: true, is_mac: false, is_windows: false, is_android: false }
    }
    #[cfg(target_os = "macos")]
    {
        PlatformInfo { is_linux: false, is_mac: true, is_windows: false, is_android: false }
    }
    #[cfg(target_os = "windows")]
    {
        PlatformInfo { is_linux: false, is_mac: false, is_windows: true, is_android: false }
    }
    #[cfg(target_os = "android")]
    {
        PlatformInfo { is_linux: false, is_mac: false, is_windows: false, is_android: true }
    }
}
