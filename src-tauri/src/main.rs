// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        use std::env;
        use std::process::{Command, Stdio, exit};
        use std::io::{BufReader, BufRead};
        use std::thread;
        let stage = env::var("EMERALD_LAUNCH_STAGE").unwrap_or_else(|_| "0".to_string());
        if stage == "0" {
            let mut cmd = Command::new(env::current_exe().unwrap());
            cmd.env("EMERALD_LAUNCH_STAGE", "1");
            
            let wayland_libs = ["/usr/lib64/libwayland-client.so.0", "/usr/lib/libwayland-client.so.0"];
            if let Some(path) = wayland_libs.iter().find(|p| std::path::Path::new(p).exists()) {
                cmd.env("LD_PRELOAD", path);
            }

            let mut child = cmd
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .expect("failed to spawn child process");

            let stdout = child.stdout.take().expect("failed to take stdout");
            let stderr = child.stderr.take().expect("failed to take stderr");
            let child_id = child.id();
            fn check_line(l: &str) -> bool {
                let low = l.to_lowercase();
                (low.contains("gbm") && low.contains("buffer")) || 
                (low.contains("dmabuf") && low.contains("renderer")) ||
                (low.contains("invalid argument") && low.contains("buffer")) ||
                (low.contains("wayland") && low.contains("protocol error"))
            }

            let h1 = thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        println!("{}", l);
                        if check_line(&l) {
                            eprintln!("!!! Emerald: Graphics error detected in stdout: {}", l);
                            #[cfg(unix)]
                            let _ = Command::new("kill").arg("-9").arg(child_id.to_string()).status();
                            return true;
                        }
                    }
                }
                false
            });

            let h2 = thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        eprintln!("{}", l);
                        if check_line(&l) {
                            eprintln!("!!! Emerald: Graphics error detected in stderr: {}", l);
                            #[cfg(unix)]
                            let _ = Command::new("kill").arg("-9").arg(child_id.to_string()).status();
                            return true;
                        }
                    }
                }
                false
            });

            let status = child.wait().expect("failed to wait on child process");

            let found_error = h1.join().unwrap_or(false) || h2.join().unwrap_or(false);

            if found_error || !status.success() {
                if found_error {
                    println!("Emerald: Automatic recovery triggered for graphics crash/invisible launch.");
                }
                let mut retry_cmd = Command::new(env::current_exe().unwrap());
                retry_cmd.env("EMERALD_LAUNCH_STAGE", "2")
                    .env("GDK_BACKEND", "x11")
                    .env("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
                    .env("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
                
                if let Some(path) = wayland_libs.iter().find(|p| std::path::Path::new(p).exists()) {
                    retry_cmd.env("LD_PRELOAD", path);
                }

                let mut retry_child = retry_cmd.spawn().expect("failed to spawn fallback child process");

                let retry_status = retry_child.wait().expect("failed to wait on fallback child process");
                exit(retry_status.code().unwrap_or(1));
            }
            exit(0);
        }
    }

    emerald_lib::run()
}
