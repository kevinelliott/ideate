//! macOS-specific functionality for app icon and menu customization.

#[cfg(target_os = "macos")]
use cocoa::appkit::NSApplication;
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::NSString;

use tauri::AppHandle;

use crate::preferences::load_preferences_internal;

/// Sets the application dock icon on macOS.
#[cfg(target_os = "macos")]
pub fn set_app_icon(icon_variant: &str) {
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
    
    unsafe {
        let path_str = icon_path.to_string_lossy();
        let ns_path = NSString::alloc(nil).init_str(&path_str);
        let image: id = msg_send![class!(NSImage), alloc];
        let image: id = msg_send![image, initWithContentsOfFile: ns_path];
        
        if image != nil {
            let app = NSApplication::sharedApplication(nil);
            let _: () = msg_send![app, setApplicationIconImage: image];
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
    dispatch::Queue::main().exec_async(move || {
        unsafe {
            let app = NSApplication::sharedApplication(nil);
            
            // Get the main menu
            let main_menu: id = msg_send![app, mainMenu];
            if main_menu == nil {
                return;
            }
            
            // Get the first menu item (the app menu)
            let app_menu_item: id = msg_send![main_menu, itemAtIndex: 0i64];
            if app_menu_item == nil {
                return;
            }
            
            // Get the submenu (actual app menu)
            let app_submenu: id = msg_send![app_menu_item, submenu];
            if app_submenu == nil {
                return;
            }
            
            // Update the submenu title
            let title = NSString::alloc(nil).init_str("Ideate");
            let _: () = msg_send![app_submenu, setTitle: title];
            
            // Update individual menu items that contain the app name
            let item_count: i64 = msg_send![app_submenu, numberOfItems];
            for i in 0..item_count {
                let item: id = msg_send![app_submenu, itemAtIndex: i];
                if item != nil {
                    let item_title: id = msg_send![item, title];
                    if item_title != nil {
                        let title_str: *const std::os::raw::c_char = msg_send![item_title, UTF8String];
                        if !title_str.is_null() {
                            let title_rust = std::ffi::CStr::from_ptr(title_str).to_string_lossy();
                            
                            // Replace "Ideate" (the cargo package name) with "Ideate"
                            if title_rust.contains("Ideate") {
                                let new_title_str = title_rust.replace("Ideate", "Ideate");
                                let new_title = NSString::alloc(nil).init_str(&new_title_str);
                                let _: () = msg_send![item, setTitle: new_title];
                            }
                        }
                    }
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
