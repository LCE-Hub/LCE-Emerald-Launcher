mod types;
mod state;
mod config;
mod util;
mod platform;
mod networking;
mod commands;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;
use commands::config as config_cmds;
use commands::download;
use commands::file_dialogs;
use commands::game;
use commands::macos_setup;
use commands::proxy_cmd;
use commands::runners;
use commands::skin;
use commands::steam;
use commands::workshop;
use networking::direct;
use networking::relay;
use networking::stun;
use state::{DownloadState, GameState, ProxyGuard};
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DownloadState {
            token: Arc::new(Mutex::new(None)),
        })
        .manage(GameState {
            child: Arc::new(Mutex::new(None)),
        })
        .manage(ProxyGuard {
            cancel_tokens: Arc::new(Mutex::new(HashMap::new())),
            local_port: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_gamepad::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drpc::init())
        .invoke_handler(tauri::generate_handler![
            macos_setup::setup_macos_runtime,
            game::launch_game,
            game::stop_game,
            game::check_game_installed,
            config_cmds::save_config,
            config_cmds::load_config,
            download::download_and_install,
            game::open_instance_folder,
            download::cancel_download,
            runners::get_available_runners,
            config_cmds::get_external_palettes,
            config_cmds::import_theme,
            file_dialogs::pick_folder,
            download::download_runner,
            game::delete_instance,
            game::sync_dlc,
            skin::fetch_skin,
            workshop::workshop_install,
            workshop::workshop_uninstall,
            workshop::workshop_list_installed,
            skin::get_screenshots,
            skin::delete_screenshot,
            skin::open_screenshot_folder,
            skin::save_global_skin_pck,
            download::check_game_update,
            macos_setup::check_macos_runtime_installed,
            macos_setup::check_macos_runtime_installed_fast,
            skin::download_logo,
            file_dialogs::pick_file,
            file_dialogs::save_file_dialog,
            file_dialogs::write_binary_file,
            file_dialogs::read_binary_file,
            skin::read_screenshot_as_data_url,
            steam::add_to_steam,
            proxy_cmd::http_proxy_request,
            game::get_instance_path,
            commands::console2lce::import_world,
            stun::stun_discover,
            direct::start_direct_proxy,
            relay::start_relay_proxy,
            relay::start_host_relay,
            relay::stop_proxy,
            relay::stop_all_proxies,
            relay::join_game,
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 && !args[1].starts_with('-') {
                let instance_id = args[1].clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    let state = app_handle.state::<GameState>();
                    match game::launch_game(app_handle.clone(), state, instance_id, Vec::new(), vec![]).await {
                        Ok(_) => app_handle.exit(0),
                        Err(e) => {
                            eprintln!("Auto-launch error: {}", e);
                            app_handle.exit(1);
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
