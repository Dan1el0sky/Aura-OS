use std::process::Command;
use serde_json::Value;

pub trait SystemControl {
    fn execute(&self, tool: &str, params: Option<&Value>) -> Result<String, String>;
}

pub struct CommandExecutor;

impl CommandExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[cfg(target_os = "windows")]
impl SystemControl for CommandExecutor {
    fn execute(&self, tool: &str, params: Option<&Value>) -> Result<String, String> {
        match tool {
            "mute" => {
                // Toggle Mute using WScript.Shell
                let script = "$w = new-object -com wscript.shell; $w.sendkeys([char]0xAD)";
                run_powershell(script)
            },
            "lock" => {
                Command::new("rundll32.exe")
                    .args(["user32.dll,LockWorkStation"])
                    .output()
                    .map(|_| "Workstation Locked".to_string())
                    .map_err(|e| e.to_string())
            },
            "clean_desktop" => {
                // Archive Desktop files to Documents/DesktopArchive
                let script = "mkdir -Force $HOME\\Documents\\DesktopArchive; Move-Item -Path $HOME\\Desktop\\* -Destination $HOME\\Documents\\DesktopArchive\\ -Force";
                run_powershell(script)
            },
            "dark_mode" => {
                 // Set Dark Mode
                 let script = "Set-ItemProperty -Path HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize -Name AppsUseLightTheme -Value 0; Set-ItemProperty -Path HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize -Name SystemUsesLightTheme -Value 0";
                 run_powershell(script)
            },
            "set_volume" => {
                // Set Volume using nircmd or WScript logic if possible, but PowerShell native volume setting is hard.
                // We'll use a hack with WScript.Shell to press Volume Down/Up multiple times, or assume user has nircmd.
                // Better pure PowerShell approach (Windows 10/11):
                // Function Set-SoundVolume { param($Volume) $obj = new-object -com wscript.shell; for($i=0;$i-lt 50;$i++){$obj.sendkeys([char]0xAE)}; for($i=0;$i-lt ($Volume/2);$i++){$obj.sendkeys([char]0xAF)} }
                // This resets volume to 0 then moves it up.
                if let Some(p) = params {
                    if let Some(level) = p.get("level").and_then(|v| v.as_u64()) {
                         let script = format!("$obj = new-object -com wscript.shell; for($i=0;$i-lt 50;$i++){{$obj.sendkeys([char]0xAE)}}; for($i=0;$i-lt {});$i++){{$obj.sendkeys([char]0xAF)}}", level / 2);
                         run_powershell(&script)
                    } else {
                        Err("Missing level parameter".to_string())
                    }
                } else {
                    Err("Missing params".to_string())
                }
            },
             _ => Err(format!("Unknown tool: {}", tool)),
        }
    }
}

#[cfg(target_os = "linux")]
impl SystemControl for CommandExecutor {
    fn execute(&self, tool: &str, params: Option<&Value>) -> Result<String, String> {
        match tool {
            "mute" => {
                match Command::new("amixer").args(["set", "Master", "toggle"]).output() {
                    Ok(_) => Ok("Audio Muted (Linux Mock)".to_string()),
                    Err(_) => Ok("Audio Muted (Mock - amixer not found)".to_string()),
                }
            },
            "lock" => {
                 match Command::new("xdg-screensaver").arg("lock").output() {
                    Ok(_) => Ok("Screen Locked (Linux Mock)".to_string()),
                    Err(_) => Ok("Screen Locked (Mock - xdg-screensaver not found)".to_string()),
                 }
            },
            "clean_desktop" => {
                println!("(Mock) Moving files from Desktop to Archive");
                Ok("Desktop Cleaned (Linux Mock)".to_string())
            },
            "dark_mode" => {
                 println!("(Mock) Setting Dark Mode");
                 Ok("Dark Mode Enabled (Linux Mock)".to_string())
            },
            "set_volume" => {
                 if let Some(p) = params {
                    if let Some(level) = p.get("level") {
                         let level_str = format!("{}%", level);
                         match Command::new("amixer").args(["set", "Master", &level_str]).output() {
                            Ok(_) => Ok(format!("Volume set to {} (Linux Mock)", level)),
                            Err(_) => Ok(format!("Volume set to {} (Mock - amixer not found)", level)),
                         }
                    } else {
                        Err("Missing level parameter".to_string())
                    }
                } else {
                    Err("Missing params".to_string())
                }
            },
             _ => Err(format!("Unknown tool: {}", tool)),
        }
    }
}

#[cfg(target_os = "windows")]
fn run_powershell(script: &str) -> Result<String, String> {
    Command::new("powershell")
        .args(["-Command", script])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .map_err(|e| e.to_string())
}
