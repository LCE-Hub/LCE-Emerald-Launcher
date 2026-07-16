use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use crate::types::{WorkshopInstallRequest, InstalledWorkshopPackage, InstalledPackageEntry};
use crate::config;
use crate::util;
#[tauri::command]
pub async fn workshop_install(app: AppHandle, request: WorkshopInstallRequest) -> Result<(), String> {
    let instance_dir = util::get_instance_working_dir(&app, &request.instance_id);
    if !instance_dir.exists() {
        return Err("Instance not installed".into());
    }
    let root = util::get_app_dir(&app);
    let media_dir = instance_dir.join("Windows64Media");
    let dlc_dir   = media_dir.join("DLC");
    let game_hdd  = instance_dir.join("Windows64").join("GameHDD");
    let mob_dir   = instance_dir.join("Common").join("res").join("mob");
    let wf_path   = instance_dir.join("workshop_files.json");
    let wp_path   = instance_dir.join("workshop_packages.json");
    let mut workshop_files: Vec<String> = fs::read_to_string(&wf_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let mut workshop_packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    workshop_packages.retain(|p| p.id != request.package_id);
    let raw_base = format!("https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/{}", request.package_id);
    let tmp_dir  = root.join(format!("workshop_tmp_{}", request.package_id));
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let mut pkg_dirs: Vec<String> = Vec::new();
    for (zip_name, placeholder) in &request.zips {
        let zip_url = format!("{}/{}", raw_base, zip_name);
        let zip_tmp = tmp_dir.join(zip_name);
        // security: zip_name is user/registry-controlled. reject any path
        // separator or .. segment so the downloaded archive can't escape
        // tmp_dir. (LCEL-02)
        if zip_name.contains("..") || zip_name.contains('/') || zip_name.contains('\\')
            || zip_name.starts_with('/') || zip_name.starts_with('\\')
        {
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(format!("invalid zip_name: {}", zip_name));
        }
        let response = reqwest::get(&zip_url).await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(format!("Failed to download {}: HTTP {}", zip_name, response.status()));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        fs::write(&zip_tmp, &bytes).map_err(|e| e.to_string())?;
        let dest_dir = if placeholder.is_empty() {
            instance_dir.clone()
        } else {
            // security: placeholder is user/registry-controlled. reject any
            // .. segment or absolute path before joining to instance_dir.
            // (LCEL-02)
            if placeholder.contains("..") || placeholder.starts_with('/')
                || placeholder.starts_with('\\')
            {
                let _ = fs::remove_dir_all(&tmp_dir);
                return Err(format!("invalid placeholder: {}", placeholder));
            }
            let resolved = instance_dir.clone().join(placeholder
                .replace("{MediaDir}", media_dir.to_str().unwrap_or(""))
                .replace("{DLCDir}",   dlc_dir.to_str().unwrap_or(""))
                .replace("{GameHDD}",  game_hdd.to_str().unwrap_or(""))
                .replace("{MobDir}",   mob_dir.to_str().unwrap_or("")));
            // security: assert the resolved path stays inside instance_dir.
            // canonicalize() requires the path to exist, so we canonicalize
            // the existing parent and append the basename. (LCEL-02)
            let instance_canon = instance_dir.canonicalize()
                .unwrap_or_else(|_| instance_dir.clone());
            let check_path = if let Some(parent) = resolved.parent() {
                let parent_canon = parent.canonicalize()
                    .unwrap_or_else(|_| parent.to_path_buf());
                let basename = resolved.file_name()
                    .ok_or_else(|| format!("invalid placeholder: {}", placeholder))?;
                parent_canon.join(basename)
            } else {
                resolved.clone()
            };
            if !check_path.starts_with(&instance_canon) {
                let _ = fs::remove_dir_all(&tmp_dir);
                return Err(format!("placeholder escapes instance dir: {}", placeholder));
            }
            PathBuf::from(resolved)
        };

        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        let (extracted_files, extract_ok) = if cfg!(target_os = "linux") {
            let bsdtar_list = std::process::Command::new("bsdtar")
                .args(["-tf", zip_tmp.to_str().unwrap()])
                .output();
            if let Ok(out) = bsdtar_list {
                if out.status.success() {
                    let listing = String::from_utf8_lossy(&out.stdout);
                    let files: Vec<String> = listing.lines()
                        .map(|l| l.trim())
                        .filter(|l| !l.is_empty() && !l.ends_with('/'))
                        .map(|l| dest_dir.join(l).to_string_lossy().to_string())
                        .collect();
                    let st = std::process::Command::new("bsdtar")
                        .args(["-xf", zip_tmp.to_str().unwrap(), "-C", dest_dir.to_str().unwrap()])
                        .status()
                        .map_err(|e| e.to_string())?;
                    (files, st.success())
                } else {
                    (Vec::new(), false)
                }
            } else {
                (Vec::new(), false)
            }
        } else {
            (Vec::new(), false)
        };

        #[cfg(target_os = "linux")]
        let (extracted_files, extract_ok) = if !extract_ok {
            let unzip_list = std::process::Command::new("unzip")
                .args(["-l", zip_tmp.to_str().unwrap()])
                .output()
                .map_err(|e| e.to_string())?;
            if !unzip_list.status.success() {
                let _ = fs::remove_dir_all(&tmp_dir);
                return Err(format!("Failed to list contents of {}", zip_name));
            }
            let listing = String::from_utf8_lossy(&unzip_list.stdout);
            let files: Vec<String> = listing.lines()
                .filter_map(|l| {
                    let mut parts = l.trim().split_whitespace();
                    let size_str = parts.next()?;
                    size_str.parse::<u64>().ok()?;
                    parts.next()?;
                    parts.next()?;
                    Some(parts.collect::<Vec<&str>>().join(" "))
                })
                .filter(|l| !l.ends_with('/') && !l.contains('*'))
                .map(|l| dest_dir.join(l).to_string_lossy().to_string())
                .collect();
            let st = std::process::Command::new("unzip")
                .args(["-o", zip_tmp.to_str().unwrap(), "-d", dest_dir.to_str().unwrap()])
                .status()
                .map_err(|e| e.to_string())?;
            (files, st.success())
        } else {
            (extracted_files, extract_ok)
        };

        #[cfg(not(target_os = "linux"))]
        let (extracted_files, extract_ok) = {
            let st = std::process::Command::new("tar")
                .args(["-xf", zip_tmp.to_str().unwrap(), "-C", dest_dir.to_str().unwrap()])
                .output()
                .map_err(|e| e.to_string())?;
            let listing = std::process::Command::new("tar")
                .args(["-tf", zip_tmp.to_str().unwrap()])
                .output()
                .map_err(|e| e.to_string())?;
            let listing_str = String::from_utf8_lossy(&listing.stdout);
            let files: Vec<String> = listing_str.lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty() && !l.ends_with('/'))
                .map(|l| dest_dir.join(l).to_string_lossy().to_string())
                .collect();
            (files, st.status.success())
        };

        if !extract_ok {
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(format!("Extraction failed for {}", zip_name));
        }

        for f in &extracted_files {
            if !workshop_files.contains(f) {
                workshop_files.push(f.clone());
            }
            if !pkg_dirs.contains(f) {
                pkg_dirs.push(f.clone());
            }
        }
    }

    let _ = fs::remove_dir_all(&tmp_dir);

    if let Ok(json) = serde_json::to_string(&workshop_files) {
        let _ = fs::write(&wf_path, json);
    }

    workshop_packages.push(InstalledWorkshopPackage {
        id: request.package_id.clone(),
        version: request.version.clone(),
        dirs: pkg_dirs,
    });
    if let Ok(json) = serde_json::to_string(&workshop_packages) {
        let _ = fs::write(&wp_path, json);
    }

    Ok(())
}

#[tauri::command]
pub async fn workshop_uninstall(app: AppHandle, instance_id: String, package_id: String) -> Result<(), String> {
    let instance_dir = util::get_instance_working_dir(&app, &instance_id);
    let wp_path = instance_dir.join("workshop_packages.json");
    let wf_path = instance_dir.join("workshop_files.json");
    let mut packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    if let Some(pkg) = packages.iter().find(|p| p.id == package_id) {
        for file in &pkg.dirs {
            let path = PathBuf::from(file);
            // security: re-validate that the persisted path stays inside
            // instance_dir before removing. if an attacker injected paths
            // into workshop_packages.json (via the install traversals above
            // or via LCEL-01's write primitive), uninstall used to delete
            // arbitrary files. (LCEL-02)
            let path_canon = match path.canonicalize() {
                Ok(p) => p,
                Err(_) => continue,
            };
            let instance_canon = instance_dir
                .canonicalize()
                .unwrap_or_else(|_| instance_dir.clone());
            if !path_canon.starts_with(&instance_canon) {
                continue;
            }
            if path.is_file() {
                let _ = fs::remove_file(&path);
            }
        }
    }

    let removed_dirs: std::collections::HashSet<String> = packages
        .iter()
        .find(|p| p.id == package_id)
        .map(|p| p.dirs.iter().cloned().collect())
        .unwrap_or_default();

    packages.retain(|p| p.id != package_id);
    if let Ok(json) = serde_json::to_string(&packages) {
        let _ = fs::write(&wp_path, json);
    }

    let mut workshop_files: Vec<String> = fs::read_to_string(&wf_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    workshop_files.retain(|f| !removed_dirs.contains(f));
    if let Ok(json) = serde_json::to_string(&workshop_files) {
        let _ = fs::write(&wf_path, json);
    }

    Ok(())
}

#[tauri::command]
pub fn workshop_list_installed(app: AppHandle) -> Vec<InstalledPackageEntry> {
    let root = util::get_app_dir(&app);
    let mut result = Vec::new();
    let mut instance_dirs = vec![root.join("instances")];
    let config_val = config::load_config_raw(app.clone());
    if let Some(editions) = config_val.custom_editions {
        for ed in editions {
            if let Some(path) = ed.path {
                instance_dirs.push(PathBuf::from(path));
            }
        }
    }

    for base_dir in instance_dirs {
        if base_dir.ends_with("instances") {
            if let Ok(entries) = fs::read_dir(&base_dir) {
                for entry in entries.flatten() {
                    if !entry.path().is_dir() { continue; }
                    let instance_id = entry.file_name().to_string_lossy().to_string();
                    let wp_path = entry.path().join("workshop_packages.json");
                    let packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
                        .ok()
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default();
                    for pkg in packages {
                        result.push(InstalledPackageEntry {
                            instance_id: instance_id.clone(),
                            package_id: pkg.id,
                            version: pkg.version,
                        });
                    }
                }
            }
        } else {
            let instance_id = base_dir.file_name().and_then(|n| n.to_str()).unwrap_or("custom").to_string();
            let config_val = config::load_config_raw(app.clone());
            let final_id = config_val.custom_editions.as_ref()
                .and_then(|eds| eds.iter().find(|e| e.path.as_deref() == base_dir.to_str()).map(|e| e.id.clone()))
                .unwrap_or(instance_id);

            let wp_path = base_dir.join("workshop_packages.json");
            let packages: Vec<InstalledWorkshopPackage> = fs::read_to_string(&wp_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
            for pkg in packages {
                result.push(InstalledPackageEntry {
                    instance_id: final_id.clone(),
                    package_id: pkg.id,
                    version: pkg.version,
                });
            }
        }
    }
    result
}
