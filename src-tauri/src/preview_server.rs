//! Preview server for serving static design files during development.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use axum::Router;
use tokio::sync::oneshot;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

lazy_static::lazy_static! {
    static ref SERVERS: Mutex<HashMap<String, ServerHandle>> = Mutex::new(HashMap::new());
}

struct ServerHandle {
    port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewServerInfo {
    pub server_id: String,
    pub port: u16,
    pub url: String,
}

/// Start a preview server for the given directory.
/// Returns the server info including the URL to access it.
#[tauri::command]
pub async fn start_preview_server(
    directory: String,
    entry_file: Option<String>,
) -> Result<PreviewServerInfo, String> {
    let path = PathBuf::from(&directory);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }

    // Generate a unique server ID
    let server_id = uuid::Uuid::new_v4().to_string();
    
    // Find an available port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind to port: {}", e))?;
    
    let addr = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?;
    let port = addr.port();

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    // Build the router with CORS and static file serving
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let serve_dir = ServeDir::new(&path)
        .append_index_html_on_directories(true);

    let app = Router::new()
        .fallback_service(serve_dir)
        .layer(cors);

    // Spawn the server
    let server_id_clone = server_id.clone();
    tokio::spawn(async move {
        let server = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            });
        
        if let Err(e) = server.await {
            eprintln!("Preview server {} error: {}", server_id_clone, e);
        }
    });

    // Store the server handle
    {
        let mut servers = SERVERS.lock().map_err(|e| format!("Lock error: {}", e))?;
        servers.insert(server_id.clone(), ServerHandle {
            port,
            shutdown_tx: Some(shutdown_tx),
        });
    }

    let entry = entry_file.unwrap_or_else(|| "index.html".to_string());
    let url = format!("http://127.0.0.1:{}/{}", port, entry);

    Ok(PreviewServerInfo {
        server_id,
        port,
        url,
    })
}

/// Stop a preview server by its ID.
#[tauri::command]
pub async fn stop_preview_server(server_id: String) -> Result<(), String> {
    let mut servers = SERVERS.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    if let Some(mut handle) = servers.remove(&server_id) {
        if let Some(tx) = handle.shutdown_tx.take() {
            let _ = tx.send(());
        }
        Ok(())
    } else {
        // Server not found is not an error - it may have already been stopped
        Ok(())
    }
}

/// Stop all preview servers. Called on app shutdown.
pub fn stop_all_servers() {
    if let Ok(mut servers) = SERVERS.lock() {
        for (id, mut handle) in servers.drain() {
            if let Some(tx) = handle.shutdown_tx.take() {
                let _ = tx.send(());
            }
            println!("Stopped preview server: {}", id);
        }
    }
}

/// Get info about a running preview server.
#[tauri::command]
pub fn get_preview_server_info(server_id: String) -> Result<Option<PreviewServerInfo>, String> {
    let servers = SERVERS.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    if let Some(handle) = servers.get(&server_id) {
        Ok(Some(PreviewServerInfo {
            server_id: server_id.clone(),
            port: handle.port,
            url: format!("http://127.0.0.1:{}/index.html", handle.port),
        }))
    } else {
        Ok(None)
    }
}
