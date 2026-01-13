import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

export interface DevServerConfig {
  command: string;
  args: string[];
  url: string;
  framework?: string;
  projectType?: "node" | "rust" | "python" | "ruby" | "go" | "php";
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}


interface FrameworkConfig {
  name: string;
  detectDeps: string[];
  defaultPort: number;
  devScripts: string[];
  configFiles?: string[];
}

const NODE_FRAMEWORK_CONFIGS: FrameworkConfig[] = [
  {
    name: "Vite",
    detectDeps: ["vite"],
    defaultPort: 5173,
    devScripts: ["dev", "start"],
    configFiles: ["vite.config.ts", "vite.config.js", "vite.config.mjs"],
  },
  {
    name: "Next.js",
    detectDeps: ["next"],
    defaultPort: 3000,
    devScripts: ["dev", "start"],
    configFiles: ["next.config.js", "next.config.mjs", "next.config.ts"],
  },
  {
    name: "Nuxt",
    detectDeps: ["nuxt", "nuxt3"],
    defaultPort: 3000,
    devScripts: ["dev", "start"],
    configFiles: ["nuxt.config.ts", "nuxt.config.js"],
  },
  {
    name: "Remix",
    detectDeps: ["@remix-run/dev", "@remix-run/react"],
    defaultPort: 3000,
    devScripts: ["dev", "start"],
  },
  {
    name: "Astro",
    detectDeps: ["astro"],
    defaultPort: 4321,
    devScripts: ["dev", "start"],
    configFiles: ["astro.config.mjs", "astro.config.ts", "astro.config.js"],
  },
  {
    name: "SvelteKit",
    detectDeps: ["@sveltejs/kit"],
    defaultPort: 5173,
    devScripts: ["dev", "start"],
    configFiles: ["svelte.config.js"],
  },
  {
    name: "Create React App",
    detectDeps: ["react-scripts"],
    defaultPort: 3000,
    devScripts: ["start", "dev"],
  },
  {
    name: "Gatsby",
    detectDeps: ["gatsby"],
    defaultPort: 8000,
    devScripts: ["develop", "dev", "start"],
  },
  {
    name: "Angular",
    detectDeps: ["@angular/core", "@angular/cli"],
    defaultPort: 4200,
    devScripts: ["start", "serve", "dev"],
    configFiles: ["angular.json"],
  },
  {
    name: "Vue CLI",
    detectDeps: ["@vue/cli-service"],
    defaultPort: 8080,
    devScripts: ["serve", "dev", "start"],
    configFiles: ["vue.config.js"],
  },
  {
    name: "Parcel",
    detectDeps: ["parcel", "parcel-bundler"],
    defaultPort: 1234,
    devScripts: ["start", "dev", "serve"],
  },
  {
    name: "Webpack Dev Server",
    detectDeps: ["webpack-dev-server"],
    defaultPort: 8080,
    devScripts: ["start", "dev", "serve"],
    configFiles: ["webpack.config.js", "webpack.config.ts"],
  },
  {
    name: "Tauri + Vite",
    detectDeps: ["@tauri-apps/api", "vite"],
    defaultPort: 1420,
    devScripts: ["dev", "tauri:dev"],
    configFiles: ["vite.config.ts", "src-tauri/tauri.conf.json"],
  },
  {
    name: "Electron + Vite",
    detectDeps: ["electron", "vite"],
    defaultPort: 5173,
    devScripts: ["dev", "start"],
  },
  {
    name: "Solid Start",
    detectDeps: ["@solidjs/start", "solid-start"],
    defaultPort: 3000,
    devScripts: ["dev", "start"],
  },
  {
    name: "Qwik",
    detectDeps: ["@builder.io/qwik"],
    defaultPort: 5173,
    devScripts: ["dev", "start"],
  },
  {
    name: "Hono",
    detectDeps: ["hono"],
    defaultPort: 3000,
    devScripts: ["dev", "start"],
  },
  {
    name: "Express",
    detectDeps: ["express"],
    defaultPort: 3000,
    devScripts: ["dev", "start", "serve"],
  },
  {
    name: "Fastify",
    detectDeps: ["fastify"],
    defaultPort: 3000,
    devScripts: ["dev", "start"],
  },
  {
    name: "Nest.js",
    detectDeps: ["@nestjs/core"],
    defaultPort: 3000,
    devScripts: ["start:dev", "dev", "start"],
  },
];

interface RustFramework {
  name: string;
  detectCrate: string;
  command: string;
  args: string[];
  defaultPort: number;
}

const RUST_FRAMEWORKS: RustFramework[] = [
  {
    name: "Trunk (WASM)",
    detectCrate: "trunk",
    command: "trunk",
    args: ["serve"],
    defaultPort: 8080,
  },
  {
    name: "Leptos",
    detectCrate: "leptos",
    command: "cargo",
    args: ["leptos", "watch"],
    defaultPort: 3000,
  },
  {
    name: "Dioxus",
    detectCrate: "dioxus",
    command: "dx",
    args: ["serve"],
    defaultPort: 8080,
  },
  {
    name: "Yew",
    detectCrate: "yew",
    command: "trunk",
    args: ["serve"],
    defaultPort: 8080,
  },
  {
    name: "Actix Web",
    detectCrate: "actix-web",
    command: "cargo",
    args: ["watch", "-x", "run"],
    defaultPort: 8080,
  },
  {
    name: "Axum",
    detectCrate: "axum",
    command: "cargo",
    args: ["watch", "-x", "run"],
    defaultPort: 3000,
  },
  {
    name: "Rocket",
    detectCrate: "rocket",
    command: "cargo",
    args: ["watch", "-x", "run"],
    defaultPort: 8000,
  },
  {
    name: "Warp",
    detectCrate: "warp",
    command: "cargo",
    args: ["watch", "-x", "run"],
    defaultPort: 3030,
  },
];

interface PythonFramework {
  name: string;
  detectPackage: string;
  command: string;
  args: string[];
  defaultPort: number;
}

const PYTHON_FRAMEWORKS: PythonFramework[] = [
  {
    name: "Django",
    detectPackage: "django",
    command: "python",
    args: ["manage.py", "runserver"],
    defaultPort: 8000,
  },
  {
    name: "Flask",
    detectPackage: "flask",
    command: "flask",
    args: ["run", "--reload"],
    defaultPort: 5000,
  },
  {
    name: "FastAPI",
    detectPackage: "fastapi",
    command: "uvicorn",
    args: ["main:app", "--reload"],
    defaultPort: 8000,
  },
  {
    name: "Streamlit",
    detectPackage: "streamlit",
    command: "streamlit",
    args: ["run", "app.py"],
    defaultPort: 8501,
  },
  {
    name: "Gradio",
    detectPackage: "gradio",
    command: "python",
    args: ["app.py"],
    defaultPort: 7860,
  },
];

interface RubyFramework {
  name: string;
  detectGem: string;
  command: string;
  args: string[];
  defaultPort: number;
}

const RUBY_FRAMEWORKS: RubyFramework[] = [
  {
    name: "Rails",
    detectGem: "rails",
    command: "bin/rails",
    args: ["server"],
    defaultPort: 3000,
  },
  {
    name: "Sinatra",
    detectGem: "sinatra",
    command: "ruby",
    args: ["app.rb"],
    defaultPort: 4567,
  },
  {
    name: "Hanami",
    detectGem: "hanami",
    command: "hanami",
    args: ["server"],
    defaultPort: 2300,
  },
];

interface GoFramework {
  name: string;
  detectImport: string;
  command: string;
  args: string[];
  defaultPort: number;
}

const GO_FRAMEWORKS: GoFramework[] = [
  {
    name: "Gin",
    detectImport: "github.com/gin-gonic/gin",
    command: "go",
    args: ["run", "."],
    defaultPort: 8080,
  },
  {
    name: "Echo",
    detectImport: "github.com/labstack/echo",
    command: "go",
    args: ["run", "."],
    defaultPort: 1323,
  },
  {
    name: "Fiber",
    detectImport: "github.com/gofiber/fiber",
    command: "go",
    args: ["run", "."],
    defaultPort: 3000,
  },
  {
    name: "Chi",
    detectImport: "github.com/go-chi/chi",
    command: "go",
    args: ["run", "."],
    defaultPort: 8080,
  },
];

interface PhpFramework {
  name: string;
  detectPackage: string;
  command: string;
  args: string[];
  defaultPort: number;
}

const PHP_FRAMEWORKS: PhpFramework[] = [
  {
    name: "Laravel",
    detectPackage: "laravel/framework",
    command: "php",
    args: ["artisan", "serve"],
    defaultPort: 8000,
  },
  {
    name: "Symfony",
    detectPackage: "symfony/framework-bundle",
    command: "symfony",
    args: ["server:start"],
    defaultPort: 8000,
  },
];

async function detectPackageManager(projectPath: string): Promise<string> {
  const lockFiles: Record<string, string> = {
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "bun.lockb": "bun",
    "package-lock.json": "npm",
  };

  for (const [lockFile, manager] of Object.entries(lockFiles)) {
    try {
      const lockPath = await join(projectPath, lockFile);
      if (await exists(lockPath)) {
        return manager;
      }
    } catch {
      continue;
    }
  }

  return "npm";
}

function extractPortFromScript(script: string): number | null {
  const portPatterns = [
    /--port[=\s]+(\d+)/,
    /-p[=\s]+(\d+)/,
    /PORT[=:](\d+)/,
    /:(\d{4,5})(?:\/|$|\s)/,
  ];

  for (const pattern of portPatterns) {
    const match = script.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

async function extractPortFromConfigFile(
  projectPath: string,
  configFiles: string[]
): Promise<number | null> {
  for (const configFile of configFiles) {
    try {
      const configPath = await join(projectPath, configFile);
      if (await exists(configPath)) {
        const content = await readTextFile(configPath);
        
        // Look for port configurations in various formats
        const portPatterns = [
          /port\s*[=:]\s*(\d+)/i,
          /["']port["']\s*[=:]\s*(\d+)/,
          /server\s*\{[^}]*port\s*[=:]\s*(\d+)/is,
          /devServer\s*[=:]\s*\{[^}]*port\s*[=:]\s*(\d+)/is,
        ];
        
        for (const pattern of portPatterns) {
          const match = content.match(pattern);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function detectNodeFramework(packageJson: PackageJson): FrameworkConfig | null {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  for (const config of NODE_FRAMEWORK_CONFIGS) {
    for (const dep of config.detectDeps) {
      if (allDeps[dep]) {
        return config;
      }
    }
  }

  return null;
}

function findDevScript(
  scripts: Record<string, string>,
  preferredScripts: string[]
): { name: string; command: string } | null {
  for (const scriptName of preferredScripts) {
    if (scripts[scriptName]) {
      return { name: scriptName, command: scripts[scriptName] };
    }
  }

  const devPatterns = ["dev", "start", "serve", "develop"];
  for (const pattern of devPatterns) {
    for (const [name, command] of Object.entries(scripts)) {
      if (name.toLowerCase().includes(pattern)) {
        return { name, command };
      }
    }
  }

  return null;
}

async function detectNodeProject(
  projectPath: string
): Promise<DevServerConfig | null> {
  try {
    const packageJsonPath = await join(projectPath, "package.json");

    if (!(await exists(packageJsonPath))) {
      return null;
    }

    const packageJsonContent = await readTextFile(packageJsonPath);
    const packageJson: PackageJson = JSON.parse(packageJsonContent);

    if (!packageJson.scripts) {
      return null;
    }

    const packageManager = await detectPackageManager(projectPath);
    const framework = detectNodeFramework(packageJson);

    const preferredScripts = framework?.devScripts || [
      "dev",
      "start",
      "serve",
      "develop",
    ];
    const devScript = findDevScript(packageJson.scripts, preferredScripts);

    if (!devScript) {
      return null;
    }

    // Try to get port from: script args > config file > framework default
    let port = extractPortFromScript(devScript.command);
    
    if (!port && framework?.configFiles) {
      port = await extractPortFromConfigFile(projectPath, framework.configFiles);
    }
    
    if (!port) {
      port = framework?.defaultPort || 3000;
    }

    const runCommand = packageManager === "npm" ? "run" : "";
    const args = runCommand ? [runCommand, devScript.name] : [devScript.name];

    return {
      command: packageManager,
      args,
      url: `http://localhost:${port}`,
      framework: framework?.name,
      projectType: "node",
    };
  } catch (error) {
    console.error("Failed to detect Node.js dev server:", error);
    return null;
  }
}

async function detectRustProject(
  projectPath: string
): Promise<DevServerConfig | null> {
  try {
    const cargoPath = await join(projectPath, "Cargo.toml");

    if (!(await exists(cargoPath))) {
      return null;
    }

    const cargoContent = await readTextFile(cargoPath);
    
    // Simple TOML parsing for dependencies
    const depsSection = cargoContent.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
    const devDepsSection = cargoContent.match(/\[dev-dependencies\]([\s\S]*?)(?:\[|$)/);
    const allDeps = (depsSection?.[1] || "") + (devDepsSection?.[1] || "");

    for (const framework of RUST_FRAMEWORKS) {
      if (allDeps.includes(framework.detectCrate)) {
        return {
          command: framework.command,
          args: framework.args,
          url: `http://localhost:${framework.defaultPort}`,
          framework: framework.name,
          projectType: "rust",
        };
      }
    }

    // Check for Trunk.toml (WASM projects)
    const trunkPath = await join(projectPath, "Trunk.toml");
    if (await exists(trunkPath)) {
      return {
        command: "trunk",
        args: ["serve"],
        url: "http://localhost:8080",
        framework: "Trunk (WASM)",
        projectType: "rust",
      };
    }

    // Default: just run with cargo
    return {
      command: "cargo",
      args: ["run"],
      url: "http://localhost:8080",
      framework: "Cargo",
      projectType: "rust",
    };
  } catch (error) {
    console.error("Failed to detect Rust dev server:", error);
    return null;
  }
}

async function detectPythonProject(
  projectPath: string
): Promise<DevServerConfig | null> {
  try {
    // Check for pyproject.toml or requirements.txt
    const pyprojectPath = await join(projectPath, "pyproject.toml");
    const requirementsPath = await join(projectPath, "requirements.txt");
    const managePyPath = await join(projectPath, "manage.py");

    // Django detection via manage.py
    if (await exists(managePyPath)) {
      return {
        command: "python",
        args: ["manage.py", "runserver"],
        url: "http://localhost:8000",
        framework: "Django",
        projectType: "python",
      };
    }

    let depsContent = "";

    if (await exists(pyprojectPath)) {
      depsContent = await readTextFile(pyprojectPath);
    } else if (await exists(requirementsPath)) {
      depsContent = await readTextFile(requirementsPath);
    } else {
      return null;
    }

    const depsLower = depsContent.toLowerCase();

    for (const framework of PYTHON_FRAMEWORKS) {
      if (depsLower.includes(framework.detectPackage)) {
        return {
          command: framework.command,
          args: framework.args,
          url: `http://localhost:${framework.defaultPort}`,
          framework: framework.name,
          projectType: "python",
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to detect Python dev server:", error);
    return null;
  }
}

async function detectRubyProject(
  projectPath: string
): Promise<DevServerConfig | null> {
  try {
    const gemfilePath = await join(projectPath, "Gemfile");

    if (!(await exists(gemfilePath))) {
      return null;
    }

    const gemfileContent = await readTextFile(gemfilePath);
    const contentLower = gemfileContent.toLowerCase();

    for (const framework of RUBY_FRAMEWORKS) {
      if (contentLower.includes(framework.detectGem)) {
        return {
          command: framework.command,
          args: framework.args,
          url: `http://localhost:${framework.defaultPort}`,
          framework: framework.name,
          projectType: "ruby",
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to detect Ruby dev server:", error);
    return null;
  }
}

async function detectGoProject(
  projectPath: string
): Promise<DevServerConfig | null> {
  try {
    const goModPath = await join(projectPath, "go.mod");

    if (!(await exists(goModPath))) {
      return null;
    }

    const goModContent = await readTextFile(goModPath);

    for (const framework of GO_FRAMEWORKS) {
      if (goModContent.includes(framework.detectImport)) {
        return {
          command: framework.command,
          args: framework.args,
          url: `http://localhost:${framework.defaultPort}`,
          framework: framework.name,
          projectType: "go",
        };
      }
    }

    // Default Go project
    return {
      command: "go",
      args: ["run", "."],
      url: "http://localhost:8080",
      framework: "Go",
      projectType: "go",
    };
  } catch (error) {
    console.error("Failed to detect Go dev server:", error);
    return null;
  }
}

async function detectPhpProject(
  projectPath: string
): Promise<DevServerConfig | null> {
  try {
    const composerPath = await join(projectPath, "composer.json");

    if (!(await exists(composerPath))) {
      return null;
    }

    const composerContent = await readTextFile(composerPath);

    for (const framework of PHP_FRAMEWORKS) {
      if (composerContent.includes(framework.detectPackage)) {
        return {
          command: framework.command,
          args: framework.args,
          url: `http://localhost:${framework.defaultPort}`,
          framework: framework.name,
          projectType: "php",
        };
      }
    }

    // Default PHP built-in server
    return {
      command: "php",
      args: ["-S", "localhost:8000", "-t", "public"],
      url: "http://localhost:8000",
      framework: "PHP Built-in",
      projectType: "php",
    };
  } catch (error) {
    console.error("Failed to detect PHP dev server:", error);
    return null;
  }
}

export async function detectDevServer(
  projectPath: string
): Promise<DevServerConfig | null> {
  // Try each project type in order of likelihood
  // Node.js is most common, so try it first
  const nodeConfig = await detectNodeProject(projectPath);
  if (nodeConfig) return nodeConfig;

  const rustConfig = await detectRustProject(projectPath);
  if (rustConfig) return rustConfig;

  const pythonConfig = await detectPythonProject(projectPath);
  if (pythonConfig) return pythonConfig;

  const rubyConfig = await detectRubyProject(projectPath);
  if (rubyConfig) return rubyConfig;

  const goConfig = await detectGoProject(projectPath);
  if (goConfig) return goConfig;

  const phpConfig = await detectPhpProject(projectPath);
  if (phpConfig) return phpConfig;

  return null;
}

export async function detectDevServerWithFallback(
  projectPath: string,
  ampFallback: () => Promise<DevServerConfig | null>
): Promise<DevServerConfig | null> {
  const detected = await detectDevServer(projectPath);

  if (detected) {
    return detected;
  }

  return ampFallback();
}
