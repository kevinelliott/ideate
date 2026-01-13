//! macOS-specific functionality for app icon and menu customization.

use tauri::AppHandle;

use crate::preferences::load_preferences_internal;

/// Sets the application dock icon on macOS.
#[cfg(target_os = "macos")]
pub fn set_app_icon(icon_variant: &str) {
    use objc2::rc::Retained;
    use objc2::AnyThread;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSString;
    use std::env;

    let exe_path = match env::current_exe() {
        Ok(path) => path,
        Err(_) => return,
    };

    // Navigate from binary to Resources folder
    // .app/Contents/MacOS/binary -> .app/Contents/Resources/
    let resources_dir = exe_path
        .parent() // MacOS
        .and_then(|p| p.parent()) // Contents
        .map(|p| p.join("Resources"));

    let resources_dir = match resources_dir {
        Some(dir) if dir.exists() => dir,
        _ => return,
    };

    // Map icon variant to filename
    let icon_filename = match icon_variant {
        "dark" => "icon-dark.png",
        "light" => "icon-light.png",
        "color" => "icon-color.png",
        "transparent" | _ => "icon.png",
    };

    let icon_path = resources_dir.join(icon_filename);

    if !icon_path.exists() {
        return;
    }

    // Get main thread marker - this function should be called from main thread
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };

    let path_str = icon_path.to_string_lossy();
    let ns_path = NSString::from_str(&path_str);

    // Use alloc from the trait and init with the path
    let allocated = NSImage::alloc();
    let image: Option<Retained<NSImage>> = NSImage::initWithContentsOfFile(allocated, &ns_path);

    if let Some(image) = image {
        let app = NSApplication::sharedApplication(mtm);
        unsafe {
            app.setApplicationIconImage(Some(&image));
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_app_icon(_icon_variant: &str) {
    // No-op on non-macOS platforms
}

/// Sets the application name in the menu bar on macOS.
#[cfg(target_os = "macos")]
pub fn set_app_name() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;
    use objc2_foundation::NSString;

    dispatch::Queue::main().exec_async(move || {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };

        let app = NSApplication::sharedApplication(mtm);

        // Get the main menu
        let Some(main_menu) = app.mainMenu() else {
            return;
        };

        // Get the first menu item (the app menu)
        let Some(app_menu_item) = main_menu.itemAtIndex(0) else {
            return;
        };

        // Get the submenu (actual app menu)
        let Some(app_submenu) = app_menu_item.submenu() else {
            return;
        };

        // Update the submenu title
        let title = NSString::from_str("Ideate");
        app_submenu.setTitle(&title);

        // Update individual menu items that contain the app name
        let item_count = app_submenu.numberOfItems();
        for i in 0..item_count {
            if let Some(item) = app_submenu.itemAtIndex(i) {
                let item_title = item.title();
                let title_str = item_title.to_string();

                // Replace "Ideate" (the cargo package name) with "Ideate"
                if title_str.contains("Ideate") {
                    let new_title_str = title_str.replace("Ideate", "Ideate");
                    let new_title = NSString::from_str(&new_title_str);
                    item.setTitle(&new_title);
                }
            }
        }
    });
}

#[cfg(not(target_os = "macos"))]
pub fn set_app_name() {
    // No-op on non-macOS platforms
}

/// Applies the icon from user preferences on app startup.
pub fn apply_icon_from_preferences(app: &AppHandle) {
    if let Ok(prefs) = load_preferences_internal(app) {
        set_app_icon(&prefs.app_icon);
    }
}
