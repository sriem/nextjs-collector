import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

interface FileInfo {
    path: string;
    content: string;
    priority: number;
    category: string;
}

export function activate(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('extension.generateCodeBaseContext', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating Next.js codebase context...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Initializing..." });

                const context = await generateCodebaseContext(rootPath, progress);
                const outputPath = path.join(rootPath, 'nextjs-codebase-context.txt');

                progress.report({ increment: 90, message: "Writing context file..." });
                fs.writeFileSync(outputPath, context);

                progress.report({ increment: 100, message: "Complete!" });
                vscode.window.showInformationMessage(
                    `Next.js codebase context generated successfully! (${context.length} characters)`
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error generating context: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    context.subscriptions.push(disposable);
}

async function generateCodebaseContext(
    rootPath: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<string> {
    const ignoreFilePath = path.join(rootPath, '.nextjscollectorignore');
    const ig = ignore();

    // Enhanced default ignore patterns for modern Next.js
    const defaultIgnore = [
        // Dependencies and build outputs
        'node_modules/**',
        '.next/**',
        '.swc/**',
        'out/**',
        'build/**',
        'dist/**',
        '.turbo/**',

        // Environment and config files that shouldn't be shared
        '.env*',
        '.env.local',
        '.env.production',
        '.env.development',

        // Version control and IDE
        '.git/**',
        '.vscode/**',
        '.idea/**',
        '**/.DS_Store',

        // Lock files
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'bun.lockb',

        // Media files
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.png',
        '**/*.gif',
        '**/*.ico',
        '**/*.svg',
        '**/*.webp',
        '**/*.avif',

        // Fonts
        '**/*.woff',
        '**/*.woff2',
        '**/*.ttf',
        '**/*.eot',
        '**/*.otf',

        // Audio/Video
        '**/*.mp4',
        '**/*.webm',
        '**/*.ogg',
        '**/*.mp3',
        '**/*.wav',
        '**/*.avi',
        '**/*.mov',

        // Archives and executables
        '**/*.pdf',
        '**/*.zip',
        '**/*.tar',
        '**/*.gz',
        '**/*.rar',
        '**/*.7z',
        '**/*.exe',
        '**/*.dll',
        '**/*.so',
        '**/*.dylib',

        // Logs and temporary files
        '**/*.log',
        '**/*.tmp',
        '**/tmp/**',
        '**/temp/**',

        // Test coverage
        'coverage/**',
        '.nyc_output/**',

        // Generated files
        '**/*.generated.*',
        '**/generated/**',

        // Other build tools
        '.webpack/**',
        '.parcel-cache/**'
    ];

    ig.add(defaultIgnore);

    // Read custom ignore patterns
    if (fs.existsSync(ignoreFilePath)) {
        try {
            const ignoreFileContent = fs.readFileSync(ignoreFilePath, 'utf8');
            ig.add(ignoreFileContent);
        } catch (error) {
            console.warn('Failed to read .nextjscollectorignore:', error);
        }
    }

    progress.report({ increment: 10, message: "Scanning files..." });

    const files: FileInfo[] = [];
    await scanDirectory(rootPath, rootPath, ig, files);

    progress.report({ increment: 60, message: "Processing and prioritizing files..." });

    // Sort files by priority (higher first) and then by category
    files.sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority;
        }
        return a.category.localeCompare(b.category);
    });

    progress.report({ increment: 80, message: "Generating context..." });

    return buildContextString(files, rootPath);
}

async function scanDirectory(
    dirPath: string,
    rootPath: string,
    ig: ReturnType<typeof ignore>,
    files: FileInfo[]
): Promise<void> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        if (ig.ignores(relativePath)) {
            continue;
        }

        if (entry.isDirectory()) {
            await scanDirectory(fullPath, rootPath, ig, files);
        } else if (entry.isFile()) {
            const fileInfo = await processFile(fullPath, relativePath);
            if (fileInfo) {
                files.push(fileInfo);
            }
        }
    }
}

async function processFile(filePath: string, relativePath: string): Promise<FileInfo | null> {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const { priority, category } = categorizeFile(relativePath, content);

        return {
            path: relativePath,
            content,
            priority,
            category
        };
    } catch (error) {
        // Skip files that can't be read (binary files, permission issues, etc.)
        return null;
    }
}

function categorizeFile(relativePath: string, content: string): { priority: number; category: string } {
    const fileName = path.basename(relativePath);
    const dirPath = path.dirname(relativePath);
    const extension = path.extname(fileName);

    // Highest priority: Core Next.js configuration and root files
    if (fileName === 'next.config.js' || fileName === 'next.config.mjs' || fileName === 'next.config.ts') {
        return { priority: 100, category: 'A1_NextJS_Config' };
    }

    if (fileName === 'package.json') {
        return { priority: 95, category: 'A2_Package_Config' };
    }

    if (fileName === 'tsconfig.json' || fileName === 'jsconfig.json') {
        return { priority: 90, category: 'A3_TypeScript_Config' };
    }

    if (fileName === 'tailwind.config.js' || fileName === 'tailwind.config.ts') {
        return { priority: 85, category: 'A4_Styling_Config' };
    }

    // High priority: App Router structure
    if (relativePath.startsWith('app/')) {
        if (fileName === 'layout.tsx' || fileName === 'layout.js') {
            return { priority: 80, category: 'B1_App_Layouts' };
        }
        if (fileName === 'page.tsx' || fileName === 'page.js') {
            return { priority: 75, category: 'B2_App_Pages' };
        }
        if (fileName === 'loading.tsx' || fileName === 'loading.js') {
            return { priority: 70, category: 'B3_App_Loading' };
        }
        if (fileName === 'error.tsx' || fileName === 'error.js') {
            return { priority: 70, category: 'B4_App_Error' };
        }
        if (fileName === 'not-found.tsx' || fileName === 'not-found.js') {
            return { priority: 65, category: 'B5_App_NotFound' };
        }
        if (fileName === 'template.tsx' || fileName === 'template.js') {
            return { priority: 65, category: 'B6_App_Templates' };
        }
        if (fileName === 'global-error.tsx' || fileName === 'global-error.js') {
            return { priority: 65, category: 'B7_App_GlobalError' };
        }
        // API routes in app directory
        if (fileName === 'route.ts' || fileName === 'route.js') {
            return { priority: 72, category: 'B8_App_API_Routes' };
        }
        // Other app directory files
        return { priority: 60, category: 'B9_App_Other' };
    }

    // Pages Router (still relevant for hybrid apps)
    if (relativePath.startsWith('pages/')) {
        if (fileName === '_app.tsx' || fileName === '_app.js') {
            return { priority: 78, category: 'C1_Pages_App' };
        }
        if (fileName === '_document.tsx' || fileName === '_document.js') {
            return { priority: 77, category: 'C2_Pages_Document' };
        }
        if (fileName === '_error.tsx' || fileName === '_error.js') {
            return { priority: 76, category: 'C3_Pages_Error' };
        }
        if (fileName === '404.tsx' || fileName === '404.js') {
            return { priority: 74, category: 'C4_Pages_404' };
        }
        if (fileName === '500.tsx' || fileName === '500.js') {
            return { priority: 73, category: 'C5_Pages_500' };
        }
        if (relativePath.startsWith('pages/api/')) {
            return { priority: 71, category: 'C6_Pages_API' };
        }
        return { priority: 68, category: 'C7_Pages_Other' };
    }

    // Components and UI
    if (relativePath.startsWith('components/') || relativePath.startsWith('src/components/')) {
        if (content.includes("'use client'") || content.includes('"use client"')) {
            return { priority: 55, category: 'D1_Client_Components' };
        }
        return { priority: 52, category: 'D2_Server_Components' };
    }

    if (relativePath.startsWith('ui/') || relativePath.startsWith('src/ui/')) {
        return { priority: 50, category: 'D3_UI_Components' };
    }

    // Hooks and utilities
    if (relativePath.startsWith('hooks/') || relativePath.startsWith('src/hooks/') || fileName.startsWith('use')) {
        return { priority: 48, category: 'E1_Hooks' };
    }

    if (relativePath.startsWith('lib/') || relativePath.startsWith('src/lib/') ||
        relativePath.startsWith('utils/') || relativePath.startsWith('src/utils/')) {
        return { priority: 45, category: 'E2_Utils_Lib' };
    }

    // Data and state management
    if (relativePath.startsWith('store/') || relativePath.startsWith('src/store/') ||
        relativePath.includes('redux') || relativePath.includes('zustand') ||
        relativePath.includes('context') || relativePath.includes('provider')) {
        return { priority: 42, category: 'F1_State_Management' };
    }

    // Database and API related
    if (relativePath.startsWith('prisma/') || relativePath.includes('schema') ||
        relativePath.includes('migration') || relativePath.includes('seed')) {
        return { priority: 40, category: 'F2_Database' };
    }

    // Middleware
    if (fileName === 'middleware.ts' || fileName === 'middleware.js') {
        return { priority: 82, category: 'A5_Middleware' };
    }

    // Styling
    if (extension === '.css' || extension === '.scss' || extension === '.sass' || extension === '.less') {
        if (fileName.includes('global') || fileName.includes('main') || relativePath.startsWith('styles/')) {
            return { priority: 35, category: 'G1_Styles' };
        }
        return { priority: 30, category: 'G2_Component_Styles' };
    }

    // TypeScript/JavaScript files
    if (extension === '.ts' || extension === '.tsx' || extension === '.js' || extension === '.jsx') {
        return { priority: 25, category: 'H1_Other_Code' };
    }

    // Configuration files
    if (extension === '.json' || extension === '.yaml' || extension === '.yml' ||
        fileName.includes('config') || fileName.includes('.env')) {
        return { priority: 20, category: 'H2_Config_Files' };
    }

    // Documentation and other files
    if (extension === '.md' || extension === '.mdx') {
        return { priority: 15, category: 'H3_Documentation' };
    }

    // Everything else
    return { priority: 10, category: 'H4_Other' };
}

function buildContextString(files: FileInfo[], rootPath: string): string {
    const header = `
# Next.js Codebase Context

Generated on: ${new Date().toISOString()}
Root path: ${rootPath}
Total files: ${files.length}

This context includes files organized by priority and category for optimal LLM processing.
The files are ordered to provide the most important architectural and configuration 
information first, followed by implementation details.

## File Categories:
- A: Core configurations (Next.js, package.json, TypeScript, etc.)
- B: App Router structure (layouts, pages, API routes)
- C: Pages Router structure (for hybrid or legacy setups)
- D: Components (client/server components, UI)
- E: Hooks and utilities
- F: Data layer (state management, database)
- G: Styling
- H: Other code and documentation

---

`;

    const fileContents = files.map(file => {
        const separator = '='.repeat(80);
        return `
${separator}
FILE: ${file.path}
CATEGORY: ${file.category}
PRIORITY: ${file.priority}
${separator}

${file.content}
`;
    }).join('\n');

    return header + fileContents;
}

export function deactivate(): void {
    // Cleanup if needed
}