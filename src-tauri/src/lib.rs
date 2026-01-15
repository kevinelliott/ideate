//! Ideate - A desktop app for managing AI coding agent workflows.
//!
//! This is the main library crate that orchestrates all modules.

// Module declarations
mod agents;
mod ideas;
mod integrations;
mod macos;
mod models;
mod preferences;
mod process;
mod projects;
mod terminal;
mod ui_state;
mod usage;
mod utils;
mod worktree;

use tauri::Emitter;

// Re-export models for use by other modules
pub use models::*;

/// Main entry point for the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
    use tauri::RunEvent;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            macos::apply_icon_from_preferences(&app.handle());

            // Create custom menu item for welcome guide
            let welcome_guide = MenuItemBuilder::new("Show Welcome Guide")
                .id("show_welcome_guide")
                .build(app)?;

            // Create About metadata
            let about_metadata = AboutMetadata {
                version: Some("0.1.0".into()),
                authors: Some(vec!["Kevin Elliott".into()]),
                comments: Some("A desktop app for managing AI coding agent workflows".into()),
                website: Some("https://github.com/kevinelliott/ideate".into()),
                license: Some("MIT".into()),
                ..Default::default()
            };

            // Build app submenu
            let app_submenu = SubmenuBuilder::new(app, "Ideate")
                .about(Some(about_metadata))
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            // Build Edit submenu
            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            // Build View submenu
            let view_submenu = SubmenuBuilder::new(app, "View").fullscreen().build()?;

            // Build Window submenu
            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            // Build Help submenu with our custom item
            let help_submenu = SubmenuBuilder::new(app, "Help")
                .item(&welcome_guide)
                .build()?;

            // Build the full menu
            let menu = MenuBuilder::new(app)
                .items(&[
                    &app_submenu,
                    &edit_submenu,
                    &view_submenu,
                    &window_submenu,
                    &help_submenu,
                ])
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app, event| {
                if event.id().as_ref() == "show_welcome_guide" {
                    let _ = app.emit("show-welcome-guide", ());
                }
            });

            macos::set_app_name();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Projects
            projects::create_project,
            projects::import_project,
            projects::load_projects,
            projects::save_projects,
            projects::load_prd,
            projects::save_prd,
            projects::load_project_settings,
            projects::save_project_settings,
            projects::load_project_state,
            projects::save_project_state,
            projects::load_cost_history,
            projects::save_cost_history,
            // Preferences
            preferences::load_preferences,
            preferences::save_preferences,
            preferences::set_app_icon_command,
            preferences::open_full_disk_access_settings,
            // Ideas
            ideas::load_ideas,
            ideas::save_ideas,
            // Agents
            agents::list_agents,
            agents::detect_agents,
            // Usage
            usage::load_amp_usage,
            usage::load_claude_usage,
            usage::get_recent_amp_thread_duration,
            usage::get_recent_claude_session_duration,
            // Process management
            process::spawn_agent,
            process::wait_agent,
            process::kill_agent,
            process::save_process_log,
            process::save_process_history_entry,
            process::load_process_history,
            process::read_process_log_file,
            // Integrations - OutRay
            integrations::outray::get_sidecar_path,
            integrations::outray::get_auth_token,
            integrations::outray::login,
            integrations::outray::check_auth,
            integrations::outray::open_dashboard,
            // Terminal
            terminal::spawn_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
            // UI State
            ui_state::load_ui_state,
            ui_state::save_ui_state,
            ui_state::save_panel_states,
            ui_state::save_window_state,
            // Worktree
            worktree::prepare_story_worktree,
            worktree::finalize_story_worktree,
            worktree::cleanup_all_story_worktrees,
            // Utils
            utils::write_binary_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::Exit = event {
                // Kill all spawned processes when the app exits
                process::kill_all_processes();
            }
        });
}
