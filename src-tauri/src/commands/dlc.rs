use std::fs;
use serde::Serialize;
use tauri::AppHandle;
use crate::util;
#[derive(Serialize)]
pub struct GitEntry {
    pub name: String,
    pub is_dir: bool,
}

fn parse_git_url(url: &str) -> Result<(String, String, String, bool), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    let host = parsed.host_str().ok_or("No host in URL")?.to_string();
    let segments: Vec<&str> = parsed.path().split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 2 {
        return Err("Invalid repo URL: need owner and repo".into());
    }
    let owner = segments[0].to_string();
    let repo = segments[1].trim_end_matches(".git").to_string();
    let is_github = host == "github.com" || host == "raw.githubusercontent.com";
    Ok((owner, repo, host, is_github))
}

fn get_api_url(host: &str, owner: &str, repo: &str, path: &str, branch: &str, is_github: bool) -> String {
    let api_path = if path.is_empty() || path == "." || path == "/" {
        String::new()
    } else {
        format!("/{}", path.trim_start_matches('/'))
    };
    if is_github {
        format!("https://api.github.com/repos/{}/{}/contents{}?ref={}", owner, repo, api_path, branch)
    } else {
        format!("https://{}/api/v1/repos/{}/{}/contents{}?ref={}", host, owner, repo, api_path, branch)
    }
}

fn get_raw_url(host: &str, owner: &str, repo: &str, branch: &str, path: &str, is_github: bool) -> String {
    if is_github {
        format!("https://raw.githubusercontent.com/{}/{}/{}/{}", owner, repo, branch, path)
    } else {
        format!("https://{}/{}/{}/raw/branch/{}/{}", host, owner, repo, branch, path)
    }
}

#[tauri::command]
pub async fn list_git_directory(
    repo_url: String,
    branch: String,
    path: String,
) -> Result<Vec<GitEntry>, String> {
    list_git_directory_inner(repo_url, branch, path).await
}

fn list_git_directory_inner(
    repo_url: String,
    branch: String,
    path: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<GitEntry>, String>> + Send>> {
    Box::pin(async move {
        let (owner, repo, host, is_github) = parse_git_url(&repo_url)?;
        let api_url = get_api_url(&host, &owner, &repo, &path, &branch, is_github);
        let client = reqwest::Client::new();
        let response = client.get(&api_url)
            .header("User-Agent", "Emerald-Launcher")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch directory listing: {}", e))?;

        if !response.status().is_success() {
            if response.status().as_u16() == 404 {
                return Ok(Vec::new());
            }
            return Err(format!("Git API returned {}", response.status()));
        }

        let text = response.text().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {}", e))?;
        let entries = match &json {
            serde_json::Value::Array(arr) => arr.clone(),
            serde_json::Value::Object(_) => {
                let is_dir = json.get("type").and_then(|v| v.as_str()) == Some("dir");
                if is_dir {
                    let sub_path = json.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    return list_git_directory_inner(repo_url, branch, sub_path).await;
                }
                return Ok(Vec::new());
            }
            _ => return Ok(Vec::new()),
        };

        let mut result = Vec::new();
        for entry in &entries {
            if let (Some(name), Some(type_val)) = (
                entry.get("name").and_then(|v| v.as_str()),
                entry.get("type").and_then(|v| v.as_str()),
            ) {
                result.push(GitEntry {
                    name: name.to_string(),
                    is_dir: type_val == "dir",
                });
            }
        }

        Ok(result)
    })
}

async fn collect_files(
    host: &str,
    owner: &str,
    repo: &str,
    branch: &str,
    root_path: &str,
    is_github: bool,
) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let mut dirs_to_list = vec![root_path.to_string()];
    let client = reqwest::Client::new();
    while let Some(dir) = dirs_to_list.pop() {
        let api_url = get_api_url(host, owner, repo, &dir, branch, is_github);
        let response = client.get(&api_url)
            .header("User-Agent", "Emerald-Launcher")
            .send()
            .await
            .map_err(|e| format!("Failed to list {}: {}", dir, e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to list {}: HTTP {}", dir, response.status()));
        }

        let text = response.text().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Failed to parse: {}", e))?;
        let entries = match &json {
            serde_json::Value::Array(arr) => arr.clone(),
            serde_json::Value::Object(_) => {
                let entry_type = json.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if entry_type == "dir" {
                    dirs_to_list.push(dir.clone());
                    continue;
                }
                files.push(dir.clone());
                continue;
            }
            _ => continue,
        };

        for entry in &entries {
            if let (Some(name), Some(type_val)) = (
                entry.get("name").and_then(|v| v.as_str()),
                entry.get("type").and_then(|v| v.as_str()),
            ) {
                let full_path = if dir.is_empty() { name.to_string() } else { format!("{}/{}", dir, name) };
                if type_val == "dir" {
                    dirs_to_list.push(full_path);
                } else {
                    files.push(full_path);
                }
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn download_dlc_files(
    app: AppHandle,
    instance_id: String,
    repo_url: String,
    branch: String,
    dlc_folder: String,
) -> Result<(), String> {
    let instance_dir = util::get_instance_working_dir(&app, &instance_id);
    let dlc_dest = instance_dir.join("Windows64Media").join("DLC").join(&dlc_folder);
    let (owner, repo, host, is_github) = parse_git_url(&repo_url)?;
    let files_to_download = collect_files(&host, &owner, &repo, &branch, &dlc_folder, is_github).await?;
    if files_to_download.is_empty() {
        return Err(format!("No files found in '{}' folder", dlc_folder));
    }

    fs::create_dir_all(&dlc_dest).map_err(|e| e.to_string())?;
    let client = reqwest::Client::new();
    for file_path in &files_to_download {
        let raw_url = get_raw_url(&host, &owner, &repo, &branch, file_path, is_github);
        let response = client.get(&raw_url)
            .header("User-Agent", "Emerald-Launcher")
            .send()
            .await
            .map_err(|e| format!("Failed to download {}: {}", file_path, e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to download {}: HTTP {}", file_path, response.status()));
        }

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let relative_path = file_path.strip_prefix(&format!("{}/", dlc_folder)).unwrap_or(file_path);
        let dest_path = dlc_dest.join(relative_path);
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&dest_path, &bytes).map_err(|e| format!("Failed to write {}: {}", file_path, e))?;
    }

    Ok(())
}
