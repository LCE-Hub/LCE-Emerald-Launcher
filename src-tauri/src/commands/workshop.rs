use std::fs;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use crate::types::{WorkshopInstallRequest, InstalledWorkshopPackage, InstalledPackageEntry};
use crate::config;
use crate::util;
use super::download::DownloadProgress;
fn group_archives(zips: &std::collections::HashMap<String, String>) -> Vec<(Vec<String>, String)> {
    let mut groups: Vec<(Vec<String>, String)> = Vec::new();
    let mut consumed: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut entries: Vec<(&String, &String)> = zips.iter().collect();
    entries.sort_by(|a, b| a.0.cmp(b.0));
    for &(name, dest) in &entries {
        if consumed.contains(name) {
            continue;
        }
        if !name.to_lowercase().ends_with(".zip") {
            continue;
        }
        let base = &name[..name.len() - 4];
        let mut parts = vec![name.clone()];
        consumed.insert(name.clone());
        let mut n = 1;
        loop {
            let candidate = format!("{}.z{:02}", base, n);
            if zips.contains_key(&candidate) {
                parts.push(candidate.clone());
                consumed.insert(candidate);
                n += 1;
            } else {
                break;
            }
        }
        if parts.len() == 1 {
            let mut n = 1;
            loop {
                let candidate = format!("{}.zip.{:03}", base, n);
                if zips.contains_key(&candidate) {
                    parts.push(candidate.clone());
                    consumed.insert(candidate);
                    n += 1;
                } else {
                    break;
                }
            }
        }
        groups.push((parts, dest.clone()));
    }

    for &(name, dest) in &entries {
        if !consumed.contains(name) {
            consumed.insert(name.clone());
            groups.push((vec![name.clone()], dest.clone()));
        }
    }
    groups
}

async fn download_and_assemble(
    app: &AppHandle,
    tmp_dir: &Path,
    parts: &[String],
    raw_base: &str,
    package_id: &str,
    done: &mut usize,
    total: usize,
) -> Result<PathBuf, String> {
    let mut downloaded: Vec<PathBuf> = Vec::new();
    for part in parts {
        let url = format!("{}/{}", raw_base, part);
        let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to download {}: HTTP {}", part, response.status()));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let part_path = tmp_dir.join(part);
        fs::write(&part_path, &bytes).map_err(|e| e.to_string())?;
        *done += 1;
        let _ = app.emit("workshop-progress", DownloadProgress {
            instance_id: package_id.to_string(),
            percent: (*done as f64 / total.max(1) as f64) * 100.0,
        });
        downloaded.push(part_path);
    }

    if downloaded.len() == 1 {
        return Ok(downloaded.remove(0));
    }

    let combined_dir = tmp_dir.join("_combined");
    fs::create_dir_all(&combined_dir).map_err(|e| e.to_string())?;
    let combined = combined_dir.join(parts[0].clone());
    let mut out = std::io::BufWriter::new(fs::File::create(&combined).map_err(|e| e.to_string())?);
    for path in &downloaded {
        let mut f = std::io::BufReader::new(fs::File::open(path).map_err(|e| e.to_string())?);
        std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
    }
    out.flush().map_err(|e| e.to_string())?;
    Ok(combined)
}

fn extract_archive(zip_tmp: &Path, dest_dir: &Path) -> Result<(Vec<String>, bool), String> {
    let zip_str = zip_tmp.to_str().unwrap_or("");
    if cfg!(target_os = "linux") {
        let mut extract_ok = false;
        let mut files: Vec<String> = Vec::new();
        if let Ok(out) = std::process::Command::new("bsdtar")
            .args(["-tf", zip_str])
            .output()
        {
            if out.status.success() {
                let listing = String::from_utf8_lossy(&out.stdout);
                files = listing.lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty() && !l.ends_with('/'))
                    .map(|l| dest_dir.join(l).to_string_lossy().to_string())
                    .collect();
                let st = std::process::Command::new("bsdtar")
                    .args(["-xf", zip_str, "-C", dest_dir.to_str().unwrap()])
                    .status()
                    .map_err(|e| e.to_string())?;
                extract_ok = st.success();
            }
        }
        if !extract_ok {
            let unzip_list = std::process::Command::new("unzip")
                .args(["-l", zip_str])
                .output()
                .map_err(|e| e.to_string())?;
            if !unzip_list.status.success() {
                return Err(format!("Failed to list contents of {}", zip_str));
            }
            let listing = String::from_utf8_lossy(&unzip_list.stdout);
            files = listing.lines()
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
                .args(["-o", zip_str, "-d", dest_dir.to_str().unwrap()])
                .status()
                .map_err(|e| e.to_string())?;
            extract_ok = st.success();
        }
        Ok((files, extract_ok))
    } else if cfg!(target_os = "android") {
        let unzip_list = std::process::Command::new("unzip")
            .args(["-l", zip_str])
            .output()
            .map_err(|e| e.to_string())?;
        if !unzip_list.status.success() {
            return Err(format!("Failed to list contents of {}", zip_str));
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
            .args(["-o", zip_str, "-d", dest_dir.to_str().unwrap()])
            .status()
            .map_err(|e| e.to_string())?;
        Ok((files, st.success()))
    } else {
        let st = std::process::Command::new("tar")
            .args(["-xf", zip_str, "-C", dest_dir.to_str().unwrap()])
            .output()
            .map_err(|e| e.to_string())?;
        let listing = std::process::Command::new("tar")
            .args(["-tf", zip_str])
            .output()
            .map_err(|e| e.to_string())?;
        let listing_str = String::from_utf8_lossy(&listing.stdout);
        let files: Vec<String> = listing_str.lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.ends_with('/'))
            .map(|l| dest_dir.join(l).to_string_lossy().to_string())
            .collect();
        Ok((files, st.status.success()))
    }
}

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
    let _ = fs::remove_dir_all(&tmp_dir);
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let mut pkg_dirs: Vec<String> = Vec::new();
    let total_parts = request.zips.len();
    let mut done_parts = 0usize;
    for (parts, placeholder) in group_archives(&request.zips) {
        let dest_dir = if placeholder.is_empty() {
            instance_dir.clone()
        } else {
            instance_dir.clone().join(placeholder
                .replace("{MediaDir}", media_dir.to_str().unwrap_or(""))
                .replace("{DLCDir}",   dlc_dir.to_str().unwrap_or(""))
                .replace("{GameHDD}",  game_hdd.to_str().unwrap_or(""))
                .replace("{MobDir}",   mob_dir.to_str().unwrap_or("")))
        };

        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        let archive_tmp = download_and_assemble(&app, &tmp_dir, &parts, &raw_base, &request.package_id, &mut done_parts, total_parts).await?;
        let (extracted_files, extract_ok) = extract_archive(&archive_tmp, &dest_dir)?;
        if !extract_ok {
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(format!("Extraction failed for {}", parts[0]));
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
