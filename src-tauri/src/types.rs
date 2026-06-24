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
    pub path: Option<String>,
    pub category: Option<Vec<String>>,
    pub logo: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationEntry {
    pub title_image: Option<String>,
    pub panorama: Option<String>,
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
    pub customizations: Option<std::collections::HashMap<String, CustomizationEntry>>,
    pub custom_paths: Option<std::collections::HashMap<String, String>>,
    pub profile: Option<String>,
    pub animations_enabled: Option<bool>,
    pub vfx_enabled: Option<bool>,
    pub rpc_enabled: Option<bool>,
    pub start_fullscreen: Option<bool>,
    pub music_vol: Option<u32>,
    pub sfx_vol: Option<u32>,
    pub legacy_mode: Option<bool>,
    pub mangohud_enabled: Option<bool>,
    pub saved_servers: Option<Vec<McServer>>,
    pub extra_launch_args: Option<Vec<String>>,
    pub launch_prefix: Option<String>,
    pub launch_env_vars: Option<std::collections::HashMap<String, String>>,
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
    pub status: u16,
    pub body: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct P2pEndpoint {
    pub ip: String,
    pub port: u16,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[cfg(target_os = "macos")]
pub struct MacosSetupProgressPayload {
    pub stage: String,
    pub message: String,
    pub percent: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopInstallRequest {
    pub instance_id: String,
    pub zips: std::collections::HashMap<String, String>,
    pub package_id: String,
    pub version: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledWorkshopPackage {
    pub id: String,
    pub version: String,
    pub dirs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPackageEntry {
    pub instance_id: String,
    pub package_id: String,
    pub version: String,
}
