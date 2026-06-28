use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
pub struct DownloadState {
    pub tokens: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

pub struct GameState {
    pub child: Arc<Mutex<Option<tokio::process::Child>>>,
    pub workshop_cancel: Arc<Mutex<Option<CancellationToken>>>,
}

pub struct ProxyGuard {
    pub cancel_tokens: Arc<Mutex<HashMap<String, CancellationToken>>>,
    pub local_port: Arc<Mutex<Option<u16>>>,
}
