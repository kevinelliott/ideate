//! Stacks storage and management.
//! 
//! Stacks are reusable technology configurations that can be applied to projects
//! to guide the AI agents during development.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::models::{Stack, StackTool};

fn get_stacks_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    Ok(app_data_dir.join("stacks.json"))
}

fn create_builtin_stacks() -> Vec<Stack> {
    let now = chrono::Utc::now().to_rfc3339();
    
    vec![
        // Modern React + Vite Web App
        Stack {
            id: "builtin-react-vite".to_string(),
            name: "React + Vite".to_string(),
            description: "Modern React application with Vite for fast development. Includes TypeScript, Tailwind CSS, and React Router.".to_string(),
            category: "Web Application".to_string(),
            tools: vec![
                StackTool { name: "React".to_string(), category: "Frontend Framework".to_string(), version: Some("19".to_string()), description: Some("A JavaScript library for building user interfaces".to_string()), website: Some("https://react.dev".to_string()) },
                StackTool { name: "Vite".to_string(), category: "Build Tool".to_string(), version: Some("6".to_string()), description: Some("Next generation frontend tooling".to_string()), website: Some("https://vite.dev".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "Tailwind CSS".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Utility-first CSS framework".to_string()), website: Some("https://tailwindcss.com".to_string()) },
                StackTool { name: "React Router".to_string(), category: "Routing".to_string(), version: Some("7".to_string()), description: Some("Declarative routing for React".to_string()), website: Some("https://reactrouter.com".to_string()) },
            ],
            tags: vec!["react".to_string(), "vite".to_string(), "typescript".to_string(), "spa".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("⚛️".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // React + Tauri Desktop/Mobile
        Stack {
            id: "builtin-react-tauri".to_string(),
            name: "React + Tauri".to_string(),
            description: "Cross-platform desktop and mobile applications with React frontend and Rust backend via Tauri.".to_string(),
            category: "Desktop/Mobile Application".to_string(),
            tools: vec![
                StackTool { name: "React".to_string(), category: "Frontend Framework".to_string(), version: Some("19".to_string()), description: Some("A JavaScript library for building user interfaces".to_string()), website: Some("https://react.dev".to_string()) },
                StackTool { name: "Tauri".to_string(), category: "App Framework".to_string(), version: Some("2".to_string()), description: Some("Build smaller, faster, and more secure desktop and mobile applications".to_string()), website: Some("https://tauri.app".to_string()) },
                StackTool { name: "Rust".to_string(), category: "Backend Language".to_string(), version: None, description: Some("Systems programming language for the backend".to_string()), website: Some("https://rust-lang.org".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "Vite".to_string(), category: "Build Tool".to_string(), version: Some("6".to_string()), description: Some("Next generation frontend tooling".to_string()), website: Some("https://vite.dev".to_string()) },
                StackTool { name: "Tailwind CSS".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Utility-first CSS framework".to_string()), website: Some("https://tailwindcss.com".to_string()) },
            ],
            tags: vec!["react".to_string(), "tauri".to_string(), "desktop".to_string(), "mobile".to_string(), "rust".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("🦀".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // React + Supabase Full Stack
        Stack {
            id: "builtin-react-supabase".to_string(),
            name: "React + Supabase".to_string(),
            description: "Full-stack web application with React frontend and Supabase for database, authentication, and real-time features.".to_string(),
            category: "Full Stack Web".to_string(),
            tools: vec![
                StackTool { name: "React".to_string(), category: "Frontend Framework".to_string(), version: Some("19".to_string()), description: Some("A JavaScript library for building user interfaces".to_string()), website: Some("https://react.dev".to_string()) },
                StackTool { name: "Supabase".to_string(), category: "Backend Platform".to_string(), version: None, description: Some("Open source Firebase alternative with PostgreSQL".to_string()), website: Some("https://supabase.com".to_string()) },
                StackTool { name: "PostgreSQL".to_string(), category: "Database".to_string(), version: None, description: Some("Powerful open source relational database".to_string()), website: Some("https://postgresql.org".to_string()) },
                StackTool { name: "Vite".to_string(), category: "Build Tool".to_string(), version: Some("6".to_string()), description: Some("Next generation frontend tooling".to_string()), website: Some("https://vite.dev".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "Tailwind CSS".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Utility-first CSS framework".to_string()), website: Some("https://tailwindcss.com".to_string()) },
            ],
            tags: vec!["react".to_string(), "supabase".to_string(), "postgresql".to_string(), "fullstack".to_string(), "auth".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("⚡".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // Next.js Full Stack
        Stack {
            id: "builtin-nextjs".to_string(),
            name: "Next.js".to_string(),
            description: "Production-ready React framework with server-side rendering, API routes, and optimized performance.".to_string(),
            category: "Full Stack Web".to_string(),
            tools: vec![
                StackTool { name: "Next.js".to_string(), category: "Framework".to_string(), version: Some("15".to_string()), description: Some("The React Framework for the Web".to_string()), website: Some("https://nextjs.org".to_string()) },
                StackTool { name: "React".to_string(), category: "Frontend Framework".to_string(), version: Some("19".to_string()), description: Some("A JavaScript library for building user interfaces".to_string()), website: Some("https://react.dev".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "Tailwind CSS".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Utility-first CSS framework".to_string()), website: Some("https://tailwindcss.com".to_string()) },
                StackTool { name: "Vercel".to_string(), category: "Deployment".to_string(), version: None, description: Some("Platform for frontend frameworks and static sites".to_string()), website: Some("https://vercel.com".to_string()) },
            ],
            tags: vec!["nextjs".to_string(), "react".to_string(), "ssr".to_string(), "fullstack".to_string(), "vercel".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("▲".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // SvelteKit Full Stack
        Stack {
            id: "builtin-sveltekit".to_string(),
            name: "SvelteKit".to_string(),
            description: "Modern full-stack framework with Svelte, featuring excellent developer experience and performance.".to_string(),
            category: "Full Stack Web".to_string(),
            tools: vec![
                StackTool { name: "SvelteKit".to_string(), category: "Framework".to_string(), version: Some("2".to_string()), description: Some("Web development, streamlined".to_string()), website: Some("https://svelte.dev".to_string()) },
                StackTool { name: "Svelte".to_string(), category: "Frontend Framework".to_string(), version: Some("5".to_string()), description: Some("Cybernetically enhanced web apps".to_string()), website: Some("https://svelte.dev".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "Tailwind CSS".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Utility-first CSS framework".to_string()), website: Some("https://tailwindcss.com".to_string()) },
                StackTool { name: "Vite".to_string(), category: "Build Tool".to_string(), version: Some("6".to_string()), description: Some("Next generation frontend tooling".to_string()), website: Some("https://vite.dev".to_string()) },
            ],
            tags: vec!["svelte".to_string(), "sveltekit".to_string(), "typescript".to_string(), "fullstack".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("🔥".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // Python FastAPI Backend
        Stack {
            id: "builtin-python-fastapi".to_string(),
            name: "Python FastAPI".to_string(),
            description: "High-performance Python API backend with automatic OpenAPI documentation and async support.".to_string(),
            category: "Backend API".to_string(),
            tools: vec![
                StackTool { name: "Python".to_string(), category: "Language".to_string(), version: Some("3.12".to_string()), description: Some("Programming language".to_string()), website: Some("https://python.org".to_string()) },
                StackTool { name: "FastAPI".to_string(), category: "Framework".to_string(), version: Some("0.115".to_string()), description: Some("Modern, fast web framework for building APIs".to_string()), website: Some("https://fastapi.tiangolo.com".to_string()) },
                StackTool { name: "Pydantic".to_string(), category: "Validation".to_string(), version: Some("2".to_string()), description: Some("Data validation using Python type annotations".to_string()), website: Some("https://pydantic.dev".to_string()) },
                StackTool { name: "SQLAlchemy".to_string(), category: "ORM".to_string(), version: Some("2".to_string()), description: Some("Python SQL toolkit and ORM".to_string()), website: Some("https://sqlalchemy.org".to_string()) },
                StackTool { name: "PostgreSQL".to_string(), category: "Database".to_string(), version: None, description: Some("Powerful open source relational database".to_string()), website: Some("https://postgresql.org".to_string()) },
                StackTool { name: "uv".to_string(), category: "Package Manager".to_string(), version: None, description: Some("Extremely fast Python package installer".to_string()), website: Some("https://docs.astral.sh/uv".to_string()) },
            ],
            tags: vec!["python".to_string(), "fastapi".to_string(), "api".to_string(), "backend".to_string(), "async".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("🐍".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // Node.js + Express + Prisma
        Stack {
            id: "builtin-node-express".to_string(),
            name: "Node.js + Express + Prisma".to_string(),
            description: "Node.js backend with Express framework and Prisma ORM for type-safe database access.".to_string(),
            category: "Backend API".to_string(),
            tools: vec![
                StackTool { name: "Node.js".to_string(), category: "Runtime".to_string(), version: Some("22".to_string()), description: Some("JavaScript runtime built on V8".to_string()), website: Some("https://nodejs.org".to_string()) },
                StackTool { name: "Express".to_string(), category: "Framework".to_string(), version: Some("5".to_string()), description: Some("Fast, unopinionated web framework".to_string()), website: Some("https://expressjs.com".to_string()) },
                StackTool { name: "Prisma".to_string(), category: "ORM".to_string(), version: Some("6".to_string()), description: Some("Next-generation Node.js and TypeScript ORM".to_string()), website: Some("https://prisma.io".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "PostgreSQL".to_string(), category: "Database".to_string(), version: None, description: Some("Powerful open source relational database".to_string()), website: Some("https://postgresql.org".to_string()) },
            ],
            tags: vec!["node".to_string(), "express".to_string(), "prisma".to_string(), "typescript".to_string(), "backend".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("💚".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // React Native Mobile
        Stack {
            id: "builtin-react-native".to_string(),
            name: "React Native + Expo".to_string(),
            description: "Cross-platform mobile application development with React Native and Expo for iOS and Android.".to_string(),
            category: "Mobile Application".to_string(),
            tools: vec![
                StackTool { name: "React Native".to_string(), category: "Framework".to_string(), version: Some("0.76".to_string()), description: Some("Build native mobile apps using React".to_string()), website: Some("https://reactnative.dev".to_string()) },
                StackTool { name: "Expo".to_string(), category: "Platform".to_string(), version: Some("52".to_string()), description: Some("Platform for making universal React apps".to_string()), website: Some("https://expo.dev".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "NativeWind".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Use Tailwind CSS in React Native".to_string()), website: Some("https://nativewind.dev".to_string()) },
                StackTool { name: "React Navigation".to_string(), category: "Navigation".to_string(), version: Some("7".to_string()), description: Some("Routing and navigation for React Native".to_string()), website: Some("https://reactnavigation.org".to_string()) },
            ],
            tags: vec!["react-native".to_string(), "expo".to_string(), "mobile".to_string(), "ios".to_string(), "android".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("📱".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // Rust CLI Tool
        Stack {
            id: "builtin-rust-cli".to_string(),
            name: "Rust CLI".to_string(),
            description: "Build fast, reliable command-line tools with Rust and the clap argument parser.".to_string(),
            category: "CLI Tool".to_string(),
            tools: vec![
                StackTool { name: "Rust".to_string(), category: "Language".to_string(), version: None, description: Some("Systems programming language".to_string()), website: Some("https://rust-lang.org".to_string()) },
                StackTool { name: "clap".to_string(), category: "CLI Framework".to_string(), version: Some("4".to_string()), description: Some("Command Line Argument Parser for Rust".to_string()), website: Some("https://docs.rs/clap".to_string()) },
                StackTool { name: "tokio".to_string(), category: "Async Runtime".to_string(), version: Some("1".to_string()), description: Some("Async runtime for Rust".to_string()), website: Some("https://tokio.rs".to_string()) },
                StackTool { name: "serde".to_string(), category: "Serialization".to_string(), version: Some("1".to_string()), description: Some("Serialization framework for Rust".to_string()), website: Some("https://serde.rs".to_string()) },
            ],
            tags: vec!["rust".to_string(), "cli".to_string(), "terminal".to_string(), "command-line".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("🖥️".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // Astro Static Site
        Stack {
            id: "builtin-astro".to_string(),
            name: "Astro".to_string(),
            description: "Content-focused websites with minimal JavaScript. Perfect for blogs, marketing sites, and documentation.".to_string(),
            category: "Static Site".to_string(),
            tools: vec![
                StackTool { name: "Astro".to_string(), category: "Framework".to_string(), version: Some("5".to_string()), description: Some("The web framework for content-driven websites".to_string()), website: Some("https://astro.build".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "Tailwind CSS".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Utility-first CSS framework".to_string()), website: Some("https://tailwindcss.com".to_string()) },
                StackTool { name: "MDX".to_string(), category: "Content".to_string(), version: None, description: Some("Markdown for the component era".to_string()), website: Some("https://mdxjs.com".to_string()) },
            ],
            tags: vec!["astro".to_string(), "static".to_string(), "content".to_string(), "blog".to_string(), "docs".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("🚀".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // Go Backend
        Stack {
            id: "builtin-go-api".to_string(),
            name: "Go API".to_string(),
            description: "High-performance Go backend API with Chi router and standard library patterns.".to_string(),
            category: "Backend API".to_string(),
            tools: vec![
                StackTool { name: "Go".to_string(), category: "Language".to_string(), version: Some("1.23".to_string()), description: Some("Simple, fast, reliable programming language".to_string()), website: Some("https://go.dev".to_string()) },
                StackTool { name: "Chi".to_string(), category: "Router".to_string(), version: Some("5".to_string()), description: Some("Lightweight, idiomatic router for Go".to_string()), website: Some("https://go-chi.io".to_string()) },
                StackTool { name: "sqlc".to_string(), category: "Database".to_string(), version: None, description: Some("Generate type-safe Go from SQL".to_string()), website: Some("https://sqlc.dev".to_string()) },
                StackTool { name: "PostgreSQL".to_string(), category: "Database".to_string(), version: None, description: Some("Powerful open source relational database".to_string()), website: Some("https://postgresql.org".to_string()) },
            ],
            tags: vec!["go".to_string(), "golang".to_string(), "api".to_string(), "backend".to_string(), "performance".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("🐹".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        
        // T3 Stack
        Stack {
            id: "builtin-t3".to_string(),
            name: "T3 Stack".to_string(),
            description: "Full-stack, typesafe Next.js application with tRPC, Prisma, and NextAuth.".to_string(),
            category: "Full Stack Web".to_string(),
            tools: vec![
                StackTool { name: "Next.js".to_string(), category: "Framework".to_string(), version: Some("15".to_string()), description: Some("The React Framework for the Web".to_string()), website: Some("https://nextjs.org".to_string()) },
                StackTool { name: "tRPC".to_string(), category: "API".to_string(), version: Some("11".to_string()), description: Some("End-to-end typesafe APIs".to_string()), website: Some("https://trpc.io".to_string()) },
                StackTool { name: "Prisma".to_string(), category: "ORM".to_string(), version: Some("6".to_string()), description: Some("Next-generation Node.js and TypeScript ORM".to_string()), website: Some("https://prisma.io".to_string()) },
                StackTool { name: "NextAuth.js".to_string(), category: "Authentication".to_string(), version: Some("5".to_string()), description: Some("Authentication for Next.js".to_string()), website: Some("https://authjs.dev".to_string()) },
                StackTool { name: "TypeScript".to_string(), category: "Language".to_string(), version: Some("5".to_string()), description: Some("Typed superset of JavaScript".to_string()), website: Some("https://typescriptlang.org".to_string()) },
                StackTool { name: "Tailwind CSS".to_string(), category: "Styling".to_string(), version: Some("4".to_string()), description: Some("Utility-first CSS framework".to_string()), website: Some("https://tailwindcss.com".to_string()) },
            ],
            tags: vec!["t3".to_string(), "nextjs".to_string(), "trpc".to_string(), "prisma".to_string(), "fullstack".to_string(), "typesafe".to_string()],
            is_builtin: true,
            is_published: false,
            author: Some("Ideate".to_string()),
            icon: Some("🔷".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
    ]
}

/// Loads all stacks from the app data directory, including built-in stacks.
#[tauri::command]
pub fn load_stacks(app: AppHandle) -> Result<Vec<Stack>, String> {
    let stacks_path = get_stacks_file_path(&app)?;
    let builtin_stacks = create_builtin_stacks();
    
    if !stacks_path.exists() {
        // Return only builtin stacks if no custom stacks file exists
        return Ok(builtin_stacks);
    }
    
    let content = fs::read_to_string(&stacks_path)
        .map_err(|e| format!("Failed to read stacks.json: {}", e))?;
    
    let custom_stacks: Vec<Stack> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse stacks.json: {}", e))?;
    
    // Combine builtin and custom stacks
    let mut all_stacks = builtin_stacks;
    all_stacks.extend(custom_stacks);
    
    Ok(all_stacks)
}

/// Saves custom stacks to the app data directory (builtin stacks are not saved).
#[tauri::command]
pub fn save_stacks(app: AppHandle, stacks: Vec<Stack>) -> Result<(), String> {
    let stacks_path = get_stacks_file_path(&app)?;
    
    // Filter out builtin stacks - only save custom ones
    let custom_stacks: Vec<Stack> = stacks.into_iter()
        .filter(|s| !s.is_builtin)
        .collect();
    
    let stacks_json = serde_json::to_string_pretty(&custom_stacks)
        .map_err(|e| format!("Failed to serialize stacks: {}", e))?;
    
    fs::write(&stacks_path, stacks_json)
        .map_err(|e| format!("Failed to write stacks.json: {}", e))?;
    
    Ok(())
}

/// Deletes a custom stack by ID.
#[tauri::command]
pub fn delete_stack(app: AppHandle, stack_id: String) -> Result<(), String> {
    let stacks_path = get_stacks_file_path(&app)?;
    
    if !stacks_path.exists() {
        return Ok(());
    }
    
    let content = fs::read_to_string(&stacks_path)
        .map_err(|e| format!("Failed to read stacks.json: {}", e))?;
    
    let mut stacks: Vec<Stack> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse stacks.json: {}", e))?;
    
    stacks.retain(|s| s.id != stack_id);
    
    let stacks_json = serde_json::to_string_pretty(&stacks)
        .map_err(|e| format!("Failed to serialize stacks: {}", e))?;
    
    fs::write(&stacks_path, stacks_json)
        .map_err(|e| format!("Failed to write stacks.json: {}", e))?;
    
    Ok(())
}
