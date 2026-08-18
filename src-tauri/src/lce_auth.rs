use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::Wry;
pub struct LceAuthState(pub PluginHandle<Wry>);
pub fn init() -> TauriPlugin<Wry> {
    Builder::new("emerald-lce-auth")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = api.register_android_plugin("com.emerald.legacy", "LceAuthPlugin")?;
                app.manage(LceAuthState(handle));
            }
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn start_lce_auth(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<LceAuthState>();
        state
            .0
            .run_mobile_plugin_async("startAuth", ())
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("LCE Online auth is only supported on Android".into()) //neo: erm, rust-side only. its supported on desktop on the typescript side.
    }
}
