import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

interface FileInfo {
    path: string;
    content: string;
    priority: number;
    category: string;
    tokens: number;
    size: number;
}

interface ContextStats {
    totalFiles: number;
    totalTokens: number;
    totalSize: number;
    categories: Record<string, number>;
}

interface GenerationOptions {
    format: 'xml' | 'markdown' | 'json';
    includePrompts: boolean;
    maxTokens?: number;
    targetLLM: 'claude' | 'gpt' | 'gemini' | 'custom';
}

export function activate(context: vscode.ExtensionContext): void {
    // Main context generation command
    const generateContext = vscode.commands.registerCommand('extension.generateCodeBaseContext', async () => {
        await showContextWizard(context);
    });

    // Quick context generation
    const generateQuickContext = vscode.commands.registerCommand('extension.generateQuickContext', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const options: GenerationOptions = {
            format: 'xml',
            includePrompts: true,
            targetLLM: 'claude'
        };

        await generateCodebaseContext(workspaceFolders[0].uri.fsPath, options);
    });

    // Generate with prompts
    const generateWithPrompts = vscode.commands.registerCommand('extension.generateWithPrompts', async () => {
        await showPromptWizard(context);
    });

    context.subscriptions.push(generateContext, generateQuickContext, generateWithPrompts);
}

async function showContextWizard(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    // Step 1: Choose format
    const format = await vscode.window.showQuickPick([
        { label: 'XML Format', detail: 'Structured XML tags for better LLM parsing', value: 'xml' },
        { label: 'Markdown Format', detail: 'Traditional markdown with code blocks', value: 'markdown' },
        { label: 'JSON Format', detail: 'Structured JSON for programmatic use', value: 'json' }
    ], {
        placeHolder: 'Choose output format'
    });

    if (!format) return;

    // Step 2: Choose LLM target
    const llm = await vscode.window.showQuickPick([
        { label: 'Claude (Anthropic)', detail: 'Optimized for Claude with 200k+ context', value: 'claude' },
        { label: 'ChatGPT (OpenAI)', detail: 'Optimized for GPT-4 and GPT-4 Turbo', value: 'gpt' },
        { label: 'Gemini (Google)', detail: 'Optimized for Google Gemini Pro', value: 'gemini' },
        { label: 'Custom', detail: 'Generic format for any LLM', value: 'custom' }
    ], {
        placeHolder: 'Choose target LLM'
    });

    if (!llm) return;

    // Step 3: Include prompts?
    const includePrompts = await vscode.window.showQuickPick([
        { label: 'Yes', detail: 'Include ready-to-use LLM prompts', value: true },
        { label: 'No', detail: 'Just generate the context', value: false }
    ], {
        placeHolder: 'Include LLM prompts?'
    });

    if (includePrompts === undefined) return;

    const options: GenerationOptions = {
        format: format.value as 'xml' | 'markdown' | 'json',
        targetLLM: llm.value as 'claude' | 'gpt' | 'gemini' | 'custom',
        includePrompts: includePrompts.value
    };

    await generateCodebaseContext(workspaceFolders[0].uri.fsPath, options);
}

async function showPromptWizard(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const promptType = await vscode.window.showQuickPick([
        { label: '🐛 Bug Fix Analysis', detail: 'Generate context for debugging specific issues', value: 'bug-fix' },
        { label: '🔄 Refactoring Help', detail: 'Context for large-scale code refactoring', value: 'refactor' },
        { label: '📚 Documentation Generation', detail: 'Create comprehensive documentation', value: 'docs' },
        { label: '🔍 Code Review', detail: 'Prepare for thorough code review', value: 'review' },
        { label: '🚀 Feature Development', detail: 'Context for new feature implementation', value: 'feature' },
        { label: '⚡ Performance Optimization', detail: 'Analyze for performance improvements', value: 'performance' },
        { label: '🏗️ Architecture Analysis', detail: 'Deep dive into project architecture', value: 'architecture' }
    ], {
        placeHolder: 'What do you want to do with your codebase?'
    });

    if (!promptType) return;

    const options: GenerationOptions = {
        format: 'xml',
        includePrompts: true,
        targetLLM: 'claude'
    };

    await generateCodebaseContextWithPrompts(workspaceFolders[0].uri.fsPath, options, promptType.value);
}

async function generateCodebaseContext(
    rootPath: string,
    options: GenerationOptions
): Promise<void> {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating Next.js Contextify output...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Initializing enhanced context generation..." });

            const { files, stats } = await scanAndProcessFiles(rootPath, progress);

            progress.report({ increment: 80, message: "Building optimized output..." });

            const output = buildEnhancedOutput(files, stats, rootPath, options);
            const outputPath = path.join(rootPath, `nextjs-contextify-${options.format}.${options.format === 'json' ? 'json' : 'txt'}`);

            progress.report({ increment: 95, message: "Writing context file..." });
            fs.writeFileSync(outputPath, output);

            progress.report({ increment: 100, message: "Complete!" });

            const action = await vscode.window.showInformationMessage(
                `Next.js Contextify generated! (${stats.totalFiles} files, ~${stats.totalTokens.toLocaleString()} tokens)`,
                'Open File', 'Copy to Clipboard', 'Show Stats'
            );

            if (action === 'Open File') {
                const doc = await vscode.workspace.openTextDocument(outputPath);
                await vscode.window.showTextDocument(doc);
            } else if (action === 'Copy to Clipboard') {
                await vscode.env.clipboard.writeText(output);
                vscode.window.showInformationMessage('Context copied to clipboard!');
            } else if (action === 'Show Stats') {
                showContextStats(stats);
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Error generating context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function generateCodebaseContextWithPrompts(
    rootPath: string,
    options: GenerationOptions,
    promptType: string
): Promise<void> {
    const { files, stats } = await scanAndProcessFiles(rootPath);
    const output = buildEnhancedOutput(files, stats, rootPath, options);
    const promptOutput = buildPromptOutput(output, promptType, stats);

    const outputPath = path.join(rootPath, `nextjs-contextify-${promptType}.txt`);
    fs.writeFileSync(outputPath, promptOutput);

    const doc = await vscode.workspace.openTextDocument(outputPath);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
        `Ready-to-use ${promptType} prompt generated! Just copy and paste to your LLM.`
    );
}

async function scanAndProcessFiles(
    rootPath: string,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<{ files: FileInfo[], stats: ContextStats }> {
    const ignoreFilePath = path.join(rootPath, '.nextjscollectorignore');
    const ig = ignore();

    // Enhanced ignore patterns
    const defaultIgnore = [
        'node_modules/**', '.next/**', '.swc/**', 'out/**', 'build/**', 'dist/**', '.turbo/**',
        '.env*', '.git/**', '.vscode/**', '.idea/**', '.cursor/**', '.windsurf/**',
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
        '**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.gif', '**/*.ico', '**/*.svg', '**/*.webp', '**/*.avif',
        '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.eot', '**/*.otf',
        '**/*.mp4', '**/*.webm', '**/*.ogg', '**/*.mp3', '**/*.wav', '**/*.avi', '**/*.mov',
        '**/*.pdf', '**/*.zip', '**/*.tar', '**/*.gz', '**/*.rar', '**/*.7z',
        '**/*.log', '**/*.tmp', '**/tmp/**', '**/temp/**',
        'coverage/**', '.nyc_output/**', '**/*.generated.*', '**/generated/**'
    ];

    ig.add(defaultIgnore);

    if (fs.existsSync(ignoreFilePath)) {
        try {
            const ignoreFileContent = fs.readFileSync(ignoreFilePath, 'utf8');
            ig.add(ignoreFileContent);
        } catch (error) {
            console.warn('Failed to read .nextjscollectorignore:', error);
        }
    }

    progress?.report({ increment: 10, message: "Scanning and analyzing files..." });

    const files: FileInfo[] = [];
    await scanDirectory(rootPath, rootPath, ig, files);

    progress?.report({ increment: 50, message: "Processing and optimizing content..." });

    // Calculate tokens and optimize
    files.forEach(file => {
        file.tokens = estimateTokens(file.content);
        file.size = Buffer.byteLength(file.content, 'utf8');
    });

    // Sort by priority
    files.sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority;
        }
        return a.category.localeCompare(b.category);
    });

    const stats: ContextStats = {
        totalFiles: files.length,
        totalTokens: files.reduce((sum, f) => sum + f.tokens, 0),
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        categories: files.reduce((acc, f) => {
            acc[f.category] = (acc[f.category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    };

    return { files, stats };
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
            category,
            tokens: 0, // Will be calculated later
            size: 0    // Will be calculated later
        };
    } catch (error) {
        return null;
    }
}

function categorizeFile(relativePath: string, content: string): { priority: number; category: string } {
    const fileName = path.basename(relativePath);
    const extension = path.extname(fileName);

    // Enhanced categorization logic (same as before but with better priorities)
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

function buildEnhancedOutput(
    files: FileInfo[],
    stats: ContextStats,
    rootPath: string,
    options: GenerationOptions
): string {
    const timestamp = new Date().toISOString();

    if (options.format === 'json') {
        return JSON.stringify({
            metadata: {
                generated: timestamp,
                rootPath,
                stats,
                format: 'json',
                tool: 'Next.js Contextify'
            },
            files: files.map(f => ({
                path: f.path,
                category: f.category,
                priority: f.priority,
                tokens: f.tokens,
                content: f.content
            }))
        }, null, 2);
    }

    if (options.format === 'xml') {
        return buildXMLOutput(files, stats, rootPath, timestamp, options);
    }

    return buildMarkdownOutput(files, stats, rootPath, timestamp, options);
}

function buildXMLOutput(
    files: FileInfo[],
    stats: ContextStats,
    rootPath: string,
    timestamp: string,
    options: GenerationOptions
): string {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<codebase>
  <metadata>
    <generated>${timestamp}</generated>
    <tool>Next.js Contextify</tool>
    <format>xml</format>
    <rootPath>${rootPath}</rootPath>
    <stats>
      <totalFiles>${stats.totalFiles}</totalFiles>
      <totalTokens>${stats.totalTokens}</totalTokens>
      <totalSize>${stats.totalSize}</totalSize>
    </stats>
  </metadata>

  <projectTree>
${generateProjectTree(files)}
  </projectTree>

  <files>
`;

    const fileContents = files.map(file => {
        const escapedContent = escapeXML(file.content);
        return `    <file path="${file.path}" category="${file.category}" priority="${file.priority}" tokens="${file.tokens}">
${escapedContent}
    </file>`;
    }).join('\n\n');

    const footer = `
  </files>
</codebase>`;

    let output = header + fileContents + footer;

    if (options.includePrompts) {
        output += '\n\n' + generatePromptSuggestions(stats, options.targetLLM);
    }

    return output;
}

function buildMarkdownOutput(
    files: FileInfo[],
    stats: ContextStats,
    rootPath: string,
    timestamp: string,
    options: GenerationOptions
): string {
    const header = `# Next.js Contextify Output

**Generated:** ${timestamp}  
**Root Path:** ${rootPath}  
**Files:** ${stats.totalFiles}  
**Estimated Tokens:** ~${stats.totalTokens.toLocaleString()}  
**Total Size:** ${(stats.totalSize / 1024).toFixed(1)} KB

## Project Structure

\`\`\`
${generateProjectTree(files)}
\`\`\`

## File Contents

`;

    const fileContents = files.map(file => {
        const extension = path.extname(file.path).slice(1) || 'text';
        return `### ${file.path}
**Category:** ${file.category} | **Priority:** ${file.priority} | **Tokens:** ~${file.tokens}

\`\`\`${extension}
${file.content}
\`\`\`

---
`;
    }).join('\n');

    let output = header + fileContents;

    if (options.includePrompts) {
        output += '\n\n' + generatePromptSuggestions(stats, options.targetLLM);
    }

    return output;
}

function generateProjectTree(files: FileInfo[]): string {
    const tree = new Map<string, Set<string>>();

    files.forEach(file => {
        const parts = file.path.split('/');
        let currentPath = '';

        parts.forEach((part, index) => {
            if (index > 0) {
                currentPath += '/';
            }
            currentPath += part;

            if (index === 0) {
                if (!tree.has('')) {
                    tree.set('', new Set());
                }
                tree.get('')?.add(part);
            } else {
                const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
                if (!tree.has(parentPath)) {
                    tree.set(parentPath, new Set());
                }
                tree.get(parentPath)?.add(part);
            }
        });
    });

    return Array.from(tree.entries())
        .sort()
        .map(([dir, items]) => {
            const indent = '  '.repeat(dir.split('/').filter(p => p).length);
            return Array.from(items).map(item => `${indent}${item}`).join('\n');
        })
        .join('\n');
}

function generatePromptSuggestions(stats: ContextStats, targetLLM: string): string {
    const tokenInfo = getTokenLimits(targetLLM);

    return `

# 🤖 Ready-to-Use LLM Prompts

## Quick Start Prompts

### 🐛 Bug Analysis
\`\`\`
I have a Next.js application with ${stats.totalFiles} files. Please analyze the codebase above and help me:

1. Identify potential bugs or issues
2. Look for common Next.js anti-patterns
3. Suggest improvements for better code quality
4. Point out any security concerns

Focus especially on the App Router structure and server/client component usage.
\`\`\`

### 🔄 Refactoring Suggestions
\`\`\`
Based on this Next.js codebase (${stats.totalFiles} files), please provide:

1. Refactoring opportunities to improve code structure
2. Ways to better utilize Next.js 15+ features
3. Component optimization suggestions
4. Performance improvement recommendations

Please provide specific code examples for your suggestions.
\`\`\`

### 📚 Documentation Generation
\`\`\`
Please create comprehensive documentation for this Next.js project including:

1. Project overview and architecture
2. Component documentation with props and usage
3. API routes documentation
4. Setup and deployment instructions
5. Code examples and best practices

Format the output as clear, professional documentation.
\`\`\`

### 🚀 Feature Development
\`\`\`
I want to add a new feature to this Next.js application. Based on the current codebase structure:

1. Show me where to place new components/pages
2. Suggest the best architectural approach
3. Identify reusable components I can leverage
4. Recommend state management patterns

Feature description: [DESCRIBE YOUR FEATURE HERE]
\`\`\`

## Token Usage
- **Current context:** ~${stats.totalTokens.toLocaleString()} tokens
- **${targetLLM} limit:** ${tokenInfo.limit}
- **Efficiency:** ${((stats.totalTokens / tokenInfo.maxTokens) * 100).toFixed(1)}% of recommended max

${stats.totalTokens > tokenInfo.maxTokens ? '⚠️ **Warning:** Context might be too large. Consider filtering specific directories.' : '✅ **Good:** Context size is optimal for LLM processing.'}
`;
}

function buildPromptOutput(context: string, promptType: string, stats: ContextStats): string {
    const prompts = {
        'bug-fix': `# 🐛 Bug Fix Analysis Prompt

${context}

---

## Your Task
I need help debugging issues in this Next.js application. Please:

1. **Scan for Bugs**: Look through the codebase and identify potential bugs, errors, or problematic patterns
2. **Next.js Specific Issues**: Check for App Router anti-patterns, improper server/client component usage, or hydration issues
3. **Code Quality**: Point out code smells, performance issues, or maintainability concerns
4. **Specific Solutions**: For each issue found, provide specific code fixes with examples

**Focus Areas:**
- Server/Client component boundaries
- Data fetching patterns
- Route handlers and API endpoints
- State management
- Performance optimizations

Please format your response with clear headings and code examples.`,

        'refactor': `# 🔄 Refactoring Assistant Prompt

${context}

---

## Refactoring Request
Please help me refactor this Next.js codebase to improve:

1. **Code Structure**: Better organization and modularity
2. **Modern Patterns**: Utilize latest Next.js 15+ features
3. **Performance**: Optimize for better loading and runtime performance
4. **Maintainability**: Make code easier to understand and modify

**Specific Areas:**
- Component composition and reusability
- Custom hooks and utility functions
- File organization and naming
- TypeScript usage and type safety
- Styling and CSS organization

For each suggestion, provide before/after code examples showing the improvement.`,

        'docs': `# 📚 Documentation Generation Prompt

${context}

---

## Documentation Request
Create comprehensive, professional documentation for this Next.js project including:

1. **Project Overview**
   - Purpose and key features
   - Technology stack and architecture
   - Project structure explanation

2. **Setup Guide**
   - Installation instructions
   - Environment setup
   - Development workflow

3. **Component Documentation**
   - All reusable components with props
   - Usage examples
   - Integration patterns

4. **API Documentation**
   - All API routes and endpoints
   - Request/response examples
   - Authentication/authorization

5. **Deployment Guide**
   - Build process
   - Deployment options
   - Production considerations

Format as clear, structured markdown suitable for a README or wiki.`,

        'review': `# 🔍 Code Review Prompt

${context}

---

## Code Review Request
Please conduct a thorough code review of this Next.js application covering:

1. **Architecture Review**
   - Overall project structure
   - Design patterns usage
   - Separation of concerns

2. **Code Quality**
   - TypeScript usage and type safety
   - Error handling
   - Code consistency and style

3. **Next.js Best Practices**
   - App Router implementation
   - Server/Client component usage
   - Data fetching strategies
   - Route handling

4. **Performance & Security**
   - Bundle optimization
   - Loading strategies
   - Security vulnerabilities
   - SEO considerations

Rate each area (1-10) and provide specific recommendations for improvements.`,

        'feature': `# 🚀 Feature Development Prompt

${context}

---

## Feature Development Request
I want to add a new feature to this Next.js application. Based on the current codebase:

1. **Architecture Analysis**
   - Where should new components/pages go?
   - What's the best approach given current structure?
   - Which existing components can I reuse?

2. **Implementation Plan**
   - Detailed step-by-step development plan
   - Required files and their locations
   - Integration points with existing code

3. **Code Templates**
   - Provide starter code following project patterns
   - Include proper TypeScript types
   - Follow established naming conventions

**Feature Description:** [Please describe your feature here]

Please provide a complete implementation roadmap with code examples.`,

        'performance': `# ⚡ Performance Optimization Prompt

${context}

---

## Performance Analysis Request
Analyze this Next.js application for performance optimization opportunities:

1. **Bundle Analysis**
   - Large dependencies or unused code
   - Code splitting opportunities
   - Dynamic import suggestions

2. **Rendering Optimization**
   - Server vs Client component decisions
   - Streaming and Suspense usage
   - Loading states and UX

3. **Data Fetching**
   - Caching strategies
   - Parallel data loading
   - Waterfall elimination

4. **Core Web Vitals**
   - LCP (Largest Contentful Paint) improvements
   - CLS (Cumulative Layout Shift) fixes
   - FID/INP optimization

Provide specific, actionable recommendations with code examples for each optimization.`,

        'architecture': `# 🏗️ Architecture Deep Dive Prompt

${context}

---

## Architecture Analysis Request
Provide a comprehensive analysis of this Next.js application's architecture:

1. **Current Architecture Assessment**
   - Architectural patterns used
   - Layer separation and boundaries
   - Data flow and state management

2. **Strengths & Weaknesses**
   - What's working well?
   - What needs improvement?
   - Potential scalability issues

3. **Modern Next.js Alignment**
   - App Router utilization
   - Server/Client component strategy
   - Edge runtime usage

4. **Improvement Roadmap**
   - Short-term fixes
   - Long-term architectural goals
   - Migration strategies

Include architectural diagrams (text-based) and specific implementation recommendations.`
    };

    return prompts[promptType as keyof typeof prompts] || prompts['review'];
}

function estimateTokens(content: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
}

function getTokenLimits(llm: string): { limit: string, maxTokens: number } {
    const limits = {
        'claude': { limit: '200k tokens', maxTokens: 150000 },
        'gpt': { limit: '128k tokens', maxTokens: 100000 },
        'gemini': { limit: '1M tokens', maxTokens: 800000 },
        'custom': { limit: 'varies', maxTokens: 100000 }
    };
    return limits[llm as keyof typeof limits] || limits.custom;
}

function escapeXML(content: string): string {
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function showContextStats(stats: ContextStats): void {
    const categoryStats = Object.entries(stats.categories)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, count]) => `${cat}: ${count} files`)
        .join('\n');

    vscode.window.showInformationMessage(
        `Context Statistics:\n\n` +
        `📁 Total Files: ${stats.totalFiles}\n` +
        `🎯 Estimated Tokens: ${stats.totalTokens.toLocaleString()}\n` +
        `💾 Total Size: ${(stats.totalSize / 1024).toFixed(1)} KB\n\n` +
        `Categories:\n${categoryStats}`,
        { modal: true }
    );
}

export function deactivate(): void {
    // Cleanup if needed
}