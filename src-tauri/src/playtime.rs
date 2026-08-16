use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use serde::{Serialize, Deserialize};
use crate::util;
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaytimeSession {
    pub start: u64,
    pub end: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaytimeData {
    pub sessions: HashMap<String, Vec<PlaytimeSession>>,
}

#[derive(Serialize, Deserialize)]
struct ActiveSession {
    instance_id: String,
    start: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlaytimeResponse {
    pub total_seconds: u64,
    pub week_seconds: u64,
    pub day_seconds: u64,
}

fn playtime_path(app: &AppHandle) -> PathBuf {
    util::get_app_dir(app).join("playtime.json")
}

pub fn load(app: &AppHandle) -> PlaytimeData {
    let path = playtime_path(app);
    if path.exists() {
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(PlaytimeData { sessions: HashMap::new() })
    } else {
        PlaytimeData { sessions: HashMap::new() }
    }
}

pub fn save(app: &AppHandle, data: &PlaytimeData) {
    let path = playtime_path(app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(data) {
        let _ = std::fs::write(&path, content);
    }
}

pub fn record_session(app: &AppHandle, instance_id: &str, start: u64, end: u64) {
    let mut data = load(app);
    let sessions = data.sessions.entry(instance_id.to_string()).or_default();
    sessions.push(PlaytimeSession { start, end });
    save(app, &data);
}

const MAX_SESSION_SECONDS: u64 = 12 * 60 * 60;
fn active_session_path(app: &AppHandle) -> PathBuf {
    util::get_app_dir(app).join("active_session.json")
}

pub fn start_session(app: &AppHandle, instance_id: &str) {
    let start = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let active = ActiveSession { instance_id: instance_id.to_string(), start };
    let path = active_session_path(app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string(&active) {
        let _ = std::fs::write(&path, content);
    }
}

pub fn finish_active_session(app: &AppHandle) {
    let path = active_session_path(app);
    let Ok(content) = std::fs::read_to_string(&path) else { return };
    let _ = std::fs::remove_file(&path);
    let Ok(active) = serde_json::from_str::<ActiveSession>(&content) else { return };
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    if now > active.start && now - active.start <= MAX_SESSION_SECONDS {
        record_session(app, &active.instance_id, active.start, now);
    }
}

pub fn get_playtime(app: &AppHandle, instance_id: &str) -> PlaytimeResponse {
    let data = load(app);
    let sessions = data.sessions.get(instance_id);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let week_ago = now - 7 * 24 * 60 * 60;
    let day_ago = now - 24 * 60 * 60;
    let total_seconds: u64 = sessions.map_or(0, |s| s.iter().map(|s| s.end - s.start).sum());
    let week_seconds: u64 = sessions.map_or(0, |s| s.iter()
        .filter(|s| s.start >= week_ago)
        .map(|s| s.end - s.start)
        .sum());
    let day_seconds: u64 = sessions.map_or(0, |s| s.iter()
        .filter(|s| s.start >= day_ago)
        .map(|s| s.end - s.start)
        .sum());

    PlaytimeResponse { total_seconds, week_seconds, day_seconds }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlaytimeDayEntry {
    pub label: String,
    pub seconds: u64,
}

pub fn get_playtime_daily(app: &AppHandle, instance_id: &str, days: u64) -> Vec<PlaytimeDayEntry> {
    let data = load(app);
    let sessions = data.sessions.get(instance_id);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let day_secs = 24 * 60 * 60;
    let mut entries: Vec<(u64, u64)> = (0..days).map(|d| {
        let day_start = now - (d * day_secs) - (now % day_secs);
        (day_start, 0)
    }).collect();

    if let Some(sessions) = sessions {
        for session in sessions {
            for entry in entries.iter_mut() {
                let day_end = entry.0 + day_secs;
                if session.start < day_end && session.end > entry.0 {
                    let overlap_start = std::cmp::max(session.start, entry.0);
                    let overlap_end = std::cmp::min(session.end, day_end);
                    if overlap_end > overlap_start {
                        entry.1 += overlap_end - overlap_start;
                    }
                }
            }
        }
    }

    entries.reverse();
    let day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    entries.into_iter().map(|(ts, secs)| {
        let weekday = ((ts / day_secs) + 4) % 7;
        PlaytimeDayEntry {
            label: day_names[weekday as usize].to_string(),
            seconds: secs,
        }
    }).collect()
}
