//! OutRay tunnel integration for exposing local dev servers to the internet.
//!
//! OutRay provides secure tunnels to localhost, making it easy to share
//! development work with others or test on mobile devices.

use std::fs;
use std::process::Command;

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

const WEB_URL: &str = "https://outray.dev";
const DASHBOARD_URL: &str = "https://outray.dev/dashboard";

/// OutRay config structure (matches ~/.outray/config.json)
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutrayAuthConfig {
    auth_type: String,
    user_token: String,
    active_org_id: String,
    org_token: String,
    org_token_expires_at: String,
}

/// Response from /api/cli/login
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginInitResponse {
    code: String,
    login_url: String,
}

/// Response from /api/cli/login/status
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginStatusResponse {
    status: String,
    user_token: Option<String>,
}

/// Organization from /api/me/orgs
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct Organization {
    id: String,
    name: String,
    slug: String,
    role: String,
}

/// Response from /api/cli/exchange
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeTokenResponse {
    org_token: String,
    expires_at: String,
}

/// Login result with additional context for the frontend
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub success: bool,
    pub needs_setup: bool,
    pub setup_url: Option<String>,
    pub error: Option<String>,
}

/// Gets the OutRay config file path
fn get_config_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not find home directory")?;
    Ok(std::path::PathBuf::from(home).join(".outray").join("config.json"))
}

/// OutRay executable info
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutrayExecutable {
    pub path: String,
    pub needs_auth_token: bool,
}

/// Gets the OutRay executable to use.
/// Prefers npx/system outray over bundled binary since the Bun-compiled
/// binary has issues with fetch, os.homedir, etc.
#[tauri::command(rename_all = "camelCase")]
pub fn get_sidecar_path(app: AppHandle) -> Result<OutrayExecutable, String> {
    use tauri::Manager;
    
    // First, check if 'outray' is in PATH (globally installed)
    if let Ok(output) = Command::new("which").arg("outray").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(OutrayExecutable {
                    path,
                    needs_auth_token: false,
                });
            }
        }
    }
    
    // Second, check if npx is available
    if let Ok(output) = Command::new("which").arg("npx").output() {
        if output.status.success() {
            return Ok(OutrayExecutable {
                path: "npx".to_string(),
                needs_auth_token: false,
            });
        }
    }
    
    // Fall back to bundled binary (but note it needs --key workaround)
    let target_triples = [
        "aarch64-apple-darwin",
        "x86_64-apple-darwin",
        "x86_64-unknown-linux-gnu",
        "aarch64-unknown-linux-gnu",
        "x86_64-pc-windows-msvc",
    ];
    
    // Try the resource path (for production builds)
    if let Ok(sidecar_path) = app
        .path()
        .resolve("binaries/outray", tauri::path::BaseDirectory::Resource)
    {
        let sidecar_str = sidecar_path.to_string_lossy().to_string();
        
        if std::path::Path::new(&sidecar_str).exists() {
            return Ok(OutrayExecutable {
                path: sidecar_str,
                needs_auth_token: true,
            });
        }
        
        for triple in &target_triples {
            let path_with_triple = format!("{}-{}", sidecar_str, triple);
            if std::path::Path::new(&path_with_triple).exists() {
                return Ok(OutrayExecutable {
                    path: path_with_triple,
                    needs_auth_token: true,
                });
            }
        }
    }
    
    // For development, try the src-tauri/binaries directory
    if let Ok(dev_binaries_dir) = std::env::current_dir().map(|p| p.join("binaries")) {
        for triple in &target_triples {
            let dev_path = dev_binaries_dir.join(format!("outray-{}", triple));
            if dev_path.exists() {
                return Ok(OutrayExecutable {
                    path: dev_path.to_string_lossy().to_string(),
                    needs_auth_token: true,
                });
            }
        }
    }
    
    Err("OutRay not found. Please install outray globally (npm install -g outray) or ensure the app is built correctly.".to_string())
}

/// Runs the OutRay login flow natively in Rust.
/// Returns a LoginResult with details about whether setup is needed.
#[tauri::command(rename_all = "camelCase")]
pub async fn login(app: AppHandle, _custom_cli_path: Option<String>) -> Result<LoginResult, String> {
    // Step 1: Initiate login session
    let client = reqwest::Client::new();
    let init_response = client
        .post(format!("{}/api/cli/login", WEB_URL))
        .send()
        .await
        .map_err(|e| format!("Failed to initiate login: {}", e))?;
    
    if !init_response.status().is_success() {
        return Err(format!("Failed to initiate login: HTTP {}", init_response.status()));
    }
    
    let login_init: LoginInitResponse = init_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse login response: {}", e))?;
    
    // Step 2: Open browser with login URL
    app.shell()
        .open(&login_init.login_url, None::<tauri_plugin_shell::open::Program>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;
    
    // Step 3: Poll for authentication (up to 5 minutes)
    let mut user_token: Option<String> = None;
    for _ in 0..60 {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        
        let status_response = client
            .get(format!("{}/api/cli/login/status?code={}", WEB_URL, login_init.code))
            .send()
            .await
            .map_err(|e| format!("Failed to check login status: {}", e))?;
        
        if !status_response.status().is_success() {
            continue;
        }
        
        let status: LoginStatusResponse = status_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse status response: {}", e))?;
        
        if status.status == "authenticated" {
            if let Some(token) = status.user_token {
                user_token = Some(token);
                break;
            }
        } else if status.status == "expired" {
            return Ok(LoginResult {
                success: false,
                needs_setup: false,
                setup_url: None,
                error: Some("Login session expired. Please try again.".to_string()),
            });
        }
    }
    
    let user_token = match user_token {
        Some(token) => token,
        None => {
            return Ok(LoginResult {
                success: false,
                needs_setup: false,
                setup_url: None,
                error: Some("Login timeout - no authentication received".to_string()),
            });
        }
    };
    
    // Step 4: Fetch organizations
    let orgs_response = client
        .get(format!("{}/api/me/orgs", WEB_URL))
        .header("Authorization", format!("Bearer {}", user_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch organizations: {}", e))?;
    
    if !orgs_response.status().is_success() {
        return Err(format!("Failed to fetch organizations: HTTP {}", orgs_response.status()));
    }
    
    let orgs: Vec<Organization> = orgs_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse organizations: {}", e))?;
    
    // No organizations - user needs to complete account setup
    if orgs.is_empty() {
        return Ok(LoginResult {
            success: false,
            needs_setup: true,
            setup_url: Some(DASHBOARD_URL.to_string()),
            error: Some("No organizations found. Please complete your account setup.".to_string()),
        });
    }
    
    // Step 5: Auto-select first organization
    let selected_org = &orgs[0];
    
    // Step 6: Exchange token for org token
    let exchange_response = client
        .post(format!("{}/api/cli/exchange", WEB_URL))
        .header("Authorization", format!("Bearer {}", user_token))
        .header("Content-Type", "application/json")
        .body(format!(r#"{{"orgId":"{}"}}"#, selected_org.id))
        .send()
        .await
        .map_err(|e| format!("Failed to exchange token: {}", e))?;
    
    if !exchange_response.status().is_success() {
        return Err(format!("Failed to exchange token: HTTP {}", exchange_response.status()));
    }
    
    let exchange: ExchangeTokenResponse = exchange_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse exchange response: {}", e))?;
    
    // Step 7: Save config to ~/.outray/config.json
    let config = OutrayAuthConfig {
        auth_type: "user".to_string(),
        user_token,
        active_org_id: selected_org.id.clone(),
        org_token: exchange.org_token,
        org_token_expires_at: exchange.expires_at,
    };
    
    let config_path = get_config_path()?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to save config: {}", e))?;
    
    Ok(LoginResult {
        success: true,
        needs_setup: false,
        setup_url: None,
        error: None,
    })
}

/// Checks if the user is logged into OutRay by checking the config file.
#[tauri::command(rename_all = "camelCase")]
pub async fn check_auth(_app: AppHandle, _custom_cli_path: Option<String>) -> Result<bool, String> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        return Ok(false);
    }
    
    // Try to read and parse the config
    let content = fs::read_to_string(&config_path)
        .map_err(|_| "Failed to read config")?;
    
    let config: OutrayAuthConfig = serde_json::from_str(&content)
        .map_err(|_| "Failed to parse config")?;
    
    // Check if we have the required tokens
    if config.user_token.is_empty() || config.org_token.is_empty() {
        return Ok(false);
    }
    
    // Check if org token is still valid (not expired)
    if let Ok(expires_at) = chrono::DateTime::parse_from_rfc3339(&config.org_token_expires_at) {
        let now = chrono::Utc::now();
        // Consider expired if less than 5 minutes remain
        if expires_at.timestamp() - now.timestamp() < 5 * 60 {
            return Ok(false);
        }
    }
    
    Ok(true)
}

/// Opens the OutRay dashboard in the browser for account setup.
#[tauri::command(rename_all = "camelCase")]
pub async fn open_dashboard(app: AppHandle) -> Result<(), String> {
    app.shell()
        .open(DASHBOARD_URL, None::<tauri_plugin_shell::open::Program>)
        .map_err(|e| format!("Failed to open browser: {}", e))
}

/// Gets the OutRay auth token from the config file.
/// Used to pass --key to the OutRay CLI since the compiled binary
/// has issues with os.homedir().
#[tauri::command(rename_all = "camelCase")]
pub fn get_auth_token() -> Result<Option<String>, String> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    let config: OutrayAuthConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;
    
    if config.org_token.is_empty() {
        return Ok(None);
    }
    
    Ok(Some(config.org_token))
}
