import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

// UI-related interfaces
interface FileTreeItem extends vscode.TreeItem {
    resourceUri?: vscode.Uri;
    isSelected?: boolean;
    isDirectory?: boolean;
    children?: FileTreeItem[];
}

interface UIGenerationOptions extends GenerationOptions {
    selectedFiles?: string[];
    userPrompt?: string;
    rules?: string[];
    selectedPrompt?: string;
}

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

// Tree View Provider
class FileTreeProvider implements vscode.TreeDataProvider<FileTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileTreeItem | undefined | null | void> = new vscode.EventEmitter<FileTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _onSelectionChanged: vscode.EventEmitter<string[]> = new vscode.EventEmitter<string[]>();
    readonly onSelectionChanged: vscode.Event<string[]> = this._onSelectionChanged.event;

    private selectedFiles: Set<string> = new Set();
    private rootPath: string = '';
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.rootPath = workspaceFolders[0].uri.fsPath;
            this.loadPersistedSelection();
        }
    }

    private getStorageKey(): string {
        return `nextjsContextify.selectedFiles.${this.rootPath}`;
    }

    private loadPersistedSelection(): void {
        const stored = this.context.globalState.get<string[]>(this.getStorageKey());
        if (stored) {
            this.selectedFiles = new Set(stored);
            this.notifySelectionChanged();
        }
    }

    private saveSelection(): void {
        this.context.globalState.update(this.getStorageKey(), Array.from(this.selectedFiles));
    }

    private notifySelectionChanged(): void {
        const selectedFiles = Array.from(this.selectedFiles);
        console.log('Selection changed:', selectedFiles.length, 'items');
        this._onSelectionChanged.fire(selectedFiles);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
        // Force selection change notification on refresh
        this.notifySelectionChanged();
    }

    selectAll(): void {
        this.getAllFiles().forEach(file => this.selectedFiles.add(file));
        this.saveSelection();
        this.notifySelectionChanged();
        this.refresh();
    }

    deselectAll(): void {
        this.selectedFiles.clear();
        this.saveSelection();
        this.notifySelectionChanged();
        this.refresh();
        console.log('Deselected all files - selectedFiles size:', this.selectedFiles.size);
    }

    getTreeItem(element: FileTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FileTreeItem): Thenable<FileTreeItem[]> {
        if (!this.rootPath) {
            return Promise.resolve([]);
        }

        if (!element) {
            return Promise.resolve(this.getFilesInDirectory(this.rootPath));
        } else if (element.isDirectory && element.resourceUri) {
            return Promise.resolve(this.getFilesInDirectory(element.resourceUri.fsPath));
        }

        return Promise.resolve([]);
    }

    private getFilesInDirectory(dirPath: string): FileTreeItem[] {
        const items: FileTreeItem[] = [];

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const ig = this.createIgnoreFilter();

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(this.rootPath, fullPath);

                if (ig.ignores(relativePath)) {
                    continue;
                }

                // Check if this item is selected
                const isSelected = this.selectedFiles.has(relativePath);

                // For directories, also check if any children are selected
                let hasSelectedChildren = false;
                if (entry.isDirectory()) {
                    for (const selectedPath of this.selectedFiles) {
                        if (selectedPath.startsWith(relativePath + '/')) {
                            hasSelectedChildren = true;
                            break;
                        }
                    }
                }

                const item: FileTreeItem = {
                    label: entry.name,
                    resourceUri: vscode.Uri.file(fullPath),
                    isSelected,
                    isDirectory: entry.isDirectory(),
                    collapsibleState: entry.isDirectory()
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None,
                    contextValue: entry.isDirectory() ? 'directory' : 'file',
                    iconPath: entry.isDirectory()
                        ? vscode.ThemeIcon.Folder
                        : vscode.ThemeIcon.File,
                    checkboxState: isSelected
                        ? vscode.TreeItemCheckboxState.Checked
                        : hasSelectedChildren
                            ? vscode.TreeItemCheckboxState.Checked
                            : vscode.TreeItemCheckboxState.Unchecked
                };

                items.push(item);
            }
        } catch (error) {
            console.error('Error reading directory:', error);
        }

        return items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return (a.label as string).localeCompare(b.label as string);
        });
    }

    private createIgnoreFilter() {
        const ig = ignore();
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

        const ignoreFilePath = path.join(this.rootPath, '.nextjscollectorignore');
        if (fs.existsSync(ignoreFilePath)) {
            try {
                const ignoreFileContent = fs.readFileSync(ignoreFilePath, 'utf8');
                ig.add(ignoreFileContent);
            } catch (error) {
                console.warn('Failed to read .nextjscollectorignore:', error);
            }
        }

        return ig;
    }

    private getAllFiles(): string[] {
        const files: string[] = [];
        this.scanDirectoryForFiles(this.rootPath, files);
        return files;
    }

    private scanDirectoryForFiles(dirPath: string, files: string[]): void {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const ig = this.createIgnoreFilter();

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(this.rootPath, fullPath);

                if (ig.ignores(relativePath)) {
                    continue;
                }

                if (entry.isFile()) {
                    files.push(relativePath);
                } else if (entry.isDirectory()) {
                    this.scanDirectoryForFiles(fullPath, files);
                }
            }
        } catch (error) {
            console.error('Error scanning directory:', error);
        }
    }

    toggleSelection(item: FileTreeItem): void {
        if (item.resourceUri) {
            const relativePath = path.relative(this.rootPath, item.resourceUri.fsPath);

            if (item.isDirectory) {
                // Handle directory selection
                this.toggleDirectorySelection(relativePath, item.resourceUri.fsPath);
            } else {
                // Handle file selection
                if (this.selectedFiles.has(relativePath)) {
                    this.selectedFiles.delete(relativePath);
                } else {
                    this.selectedFiles.add(relativePath);
                }
            }

            this.saveSelection();
            this.notifySelectionChanged();
            this.refresh();
        }
    }

    private toggleDirectorySelection(relativePath: string, fullPath: string): void {
        const isSelected = this.selectedFiles.has(relativePath);

        if (isSelected) {
            // Deselect directory and all its contents
            this.deselectDirectoryAndContents(relativePath, fullPath);
        } else {
            // Select directory and all its contents
            this.selectDirectoryAndContents(relativePath, fullPath);
        }
    }

    private selectDirectoryAndContents(relativePath: string, fullPath: string): void {
        // Add the directory itself
        this.selectedFiles.add(relativePath);

        // Recursively add all items (files and subdirectories) in the directory
        const allItemsInDirectory = this.getAllItemsInDirectory(fullPath);
        allItemsInDirectory.forEach(item => {
            this.selectedFiles.add(item);
        });

        console.log(`Selected directory ${relativePath} and ${allItemsInDirectory.length} items`);
    }

    private deselectDirectoryAndContents(relativePath: string, fullPath: string): void {
        // Remove the directory itself
        this.selectedFiles.delete(relativePath);

        // Get all items (files AND subdirectories) in this directory
        const allItemsInDirectory = this.getAllItemsInDirectory(fullPath);
        allItemsInDirectory.forEach(item => {
            this.selectedFiles.delete(item);
        });

        console.log(`Deselected directory ${relativePath} and ${allItemsInDirectory.length} items`);
    }

    private getAllItemsInDirectory(dirPath: string): string[] {
        const items: string[] = [];
        this.scanDirectoryForAllItems(dirPath, items);
        return items;
    }

    private scanDirectoryForAllItems(dirPath: string, items: string[]): void {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const ig = this.createIgnoreFilter();

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(this.rootPath, fullPath);

                if (ig.ignores(relativePath)) {
                    continue;
                }

                // Add both files AND directories to the items list
                items.push(relativePath);

                // If it's a directory, recursively scan it
                if (entry.isDirectory()) {
                    this.scanDirectoryForAllItems(fullPath, items);
                }
            }
        } catch (error) {
            console.error('Error scanning directory for all items:', error);
        }
    }

    private getAllFilesInDirectory(dirPath: string): string[] {
        const files: string[] = [];
        this.scanDirectoryForFiles(dirPath, files);
        return files;
    }

    getSelectedFiles(): string[] {
        // Return only actual files, not directories
        const allSelected = Array.from(this.selectedFiles);
        return allSelected.filter(filePath => {
            const fullPath = path.join(this.rootPath, filePath);
            try {
                return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
            } catch {
                return false;
            }
        });
    }

    getSelectedFilesAndDirectories(): string[] {
        // Return all selected items (files and directories)
        return Array.from(this.selectedFiles);
    }
}

// Steps Tree Provider
class StepsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentStep: number = 1;
    private selectedFilesCount: number = 0;

    constructor() { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateSelectedFiles(count: number): void {
        this.selectedFilesCount = count;
        this.refresh();
    }

    setCurrentStep(step: number): void {
        this.currentStep = step;
        this.refresh();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<vscode.TreeItem[]> {
        const steps = [
            {
                label: "1️⃣ Select Files",
                description: this.selectedFilesCount > 0 ? `${this.selectedFilesCount} files selected` : "No files selected",
                command: {
                    command: 'nextjsContextifyExplorer.focus',
                    title: 'Focus File Selection'
                },
                iconPath: this.currentStep === 1 ? new vscode.ThemeIcon('arrow-right') :
                    this.selectedFilesCount > 0 ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('circle-outline')
            },
            {
                label: "2️⃣ Configure Settings",
                description: "Choose format, LLM, and prompts",
                command: {
                    command: 'extension.openContextifyUI',
                    title: 'Open Configuration UI'
                },
                iconPath: this.currentStep === 2 ? new vscode.ThemeIcon('arrow-right') :
                    this.currentStep > 2 ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('circle-outline')
            },
            {
                label: "3️⃣ Generate Context",
                description: "Create optimized context for LLMs",
                command: {
                    command: 'extension.openContextifyUI',
                    title: 'Generate Context'
                },
                iconPath: this.currentStep === 3 ? new vscode.ThemeIcon('arrow-right') : new vscode.ThemeIcon('circle-outline')
            }
        ];

        return Promise.resolve(steps.map(step => {
            const item = new vscode.TreeItem(step.label, vscode.TreeItemCollapsibleState.None);
            item.description = step.description;
            item.command = step.command;
            item.iconPath = step.iconPath;
            item.tooltip = `${step.label}: ${step.description}`;
            return item;
        }));
    }
}

// Extended Prompt Library
const EXTENDED_PROMPT_LIBRARY = {
    // Development & Implementation
    'bug-fix': {
        title: '🐛 Bug Fix Analysis',
        description: 'Generate context for debugging specific issues',
        prompt: `As an expert debugging assistant, please analyze this Next.js codebase and help me identify and fix bugs. 

Focus on:
- Runtime errors and exceptions
- Logic errors and unexpected behavior  
- Performance bottlenecks
- Memory leaks
- State management issues
- API integration problems
- Styling/layout bugs
- TypeScript errors

Please provide:
1. A thorough analysis of potential issues
2. Root cause identification
3. Step-by-step solutions
4. Best practices to prevent similar issues
5. Testing recommendations`
    },
    'feature-development': {
        title: '🚀 Feature Development',
        description: 'Context for new feature implementation',
        prompt: `As a senior Next.js developer, help me implement new features in this codebase.

Please analyze the existing architecture and provide:
1. Implementation strategy that aligns with current patterns
2. Component design recommendations
3. State management approach
4. API integration patterns
5. Testing strategy
6. Performance considerations
7. Accessibility compliance
8. SEO optimization for new pages

Consider:
- Next.js App Router best practices
- Server Components vs Client Components
- Data fetching strategies
- Caching strategies
- Error boundaries
- Loading states`
    },
    'refactoring': {
        title: '🔄 Refactoring Help',
        description: 'Context for large-scale code refactoring',
        prompt: `As a code architecture expert, help me refactor this Next.js codebase for better maintainability, performance, and scalability.

Focus areas:
1. Code organization and structure
2. Component decomposition
3. Custom hooks extraction
4. Type safety improvements
5. Performance optimizations
6. Bundle size reduction
7. Code duplication removal
8. Design pattern implementation

Provide:
- Detailed refactoring plan
- Priority recommendations
- Migration strategies
- Risk assessment
- Testing approach during refactoring`
    },

    // Analysis & Review
    'code-review': {
        title: '🔍 Code Review',
        description: 'Prepare for thorough code review',
        prompt: `As a lead developer conducting a comprehensive code review, please analyze this Next.js codebase.

Review criteria:
1. **Code Quality**: Clean code principles, readability, maintainability
2. **Architecture**: Component structure, separation of concerns, SOLID principles
3. **Performance**: Bundle size, rendering performance, Core Web Vitals
4. **Security**: XSS prevention, data validation, authentication/authorization
5. **Accessibility**: WCAG compliance, semantic HTML, keyboard navigation
6. **SEO**: Meta tags, structured data, sitemap, robots.txt
7. **Testing**: Test coverage, test quality, testing strategies
8. **Best Practices**: Next.js patterns, React patterns, TypeScript usage

Provide specific feedback with:
- Issue severity (Critical/High/Medium/Low)
- Exact file locations
- Before/after code examples
- Actionable recommendations`
    },
    'performance-optimization': {
        title: '⚡ Performance Optimization',
        description: 'Analyze for performance improvements',
        prompt: `As a performance optimization specialist, analyze this Next.js application for improvements.

Performance audit focus:
1. **Core Web Vitals**: LCP, FID, CLS optimization
2. **Bundle Analysis**: Code splitting, tree shaking, dead code elimination
3. **Image Optimization**: Next.js Image component usage, formats, lazy loading
4. **Caching Strategies**: ISR, SSG, client-side caching
5. **Database Queries**: N+1 problems, query optimization
6. **API Performance**: Response times, caching headers
7. **Client-Side Performance**: JavaScript execution, memory usage
8. **Loading Strategies**: Progressive loading, skeleton screens

Provide:
- Performance metrics analysis
- Optimization recommendations with impact estimates
- Implementation priority
- Monitoring suggestions
- Tools and techniques recommendations`
    },
    'architecture-analysis': {
        title: '🏗️ Architecture Analysis',
        description: 'Deep dive into project architecture',
        prompt: `As a software architect, provide a comprehensive analysis of this Next.js application architecture.

Architecture review:
1. **Project Structure**: Directory organization, file naming conventions
2. **Component Architecture**: Composition patterns, reusability, props design
3. **State Management**: Global vs local state, data flow patterns
4. **Data Layer**: API design, data fetching patterns, caching strategies
5. **Routing Strategy**: File-based routing usage, dynamic routes, middleware
6. **Styling Architecture**: CSS organization, theming, responsive design
7. **Configuration Management**: Environment variables, feature flags
8. **Error Handling**: Error boundaries, logging, user feedback

Evaluate:
- Scalability potential
- Maintainability score
- Technical debt assessment
- Migration path recommendations
- Team collaboration efficiency`
    },

    // Documentation & Communication
    'documentation': {
        title: '📚 Documentation Generation',
        description: 'Create comprehensive documentation',
        prompt: `As a technical writer and developer, create comprehensive documentation for this Next.js project.

Documentation scope:
1. **README**: Setup, installation, development workflow
2. **API Documentation**: Endpoints, parameters, responses, examples
3. **Component Library**: Props, usage examples, design system
4. **Architecture Guide**: Project structure, patterns, conventions
5. **Deployment Guide**: Environment setup, CI/CD, monitoring
6. **Contributing Guide**: Code standards, review process, testing
7. **Troubleshooting**: Common issues, debugging steps
8. **Changelog**: Version history, breaking changes, migration guides

Format requirements:
- Clear, concise language
- Code examples with syntax highlighting
- Visual diagrams where helpful
- Interactive examples when possible
- Searchable structure`
    },
    'onboarding': {
        title: '👋 Developer Onboarding',
        description: 'Help new developers understand the codebase',
        prompt: `As a senior developer creating an onboarding guide, help new team members understand this Next.js codebase.

Onboarding coverage:
1. **Project Overview**: Purpose, goals, target audience
2. **Technology Stack**: Frameworks, libraries, tools explanation
3. **Development Setup**: Step-by-step environment setup
4. **Codebase Tour**: Key directories, important files, entry points
5. **Development Workflow**: Git flow, testing, deployment
6. **Common Tasks**: How to add features, fix bugs, run tests
7. **Code Standards**: Conventions, patterns, best practices
8. **Resources**: Documentation links, learning materials

Create:
- Beginner-friendly explanations
- Hands-on exercises
- Common gotchas and solutions
- Quick reference guides
- Contact points for help`
    },

    // Specialized Analysis
    'security-audit': {
        title: '🔒 Security Audit',
        description: 'Comprehensive security analysis',
        prompt: `As a cybersecurity expert, conduct a thorough security audit of this Next.js application.

Security assessment areas:
1. **Authentication & Authorization**: JWT handling, session management, RBAC
2. **Input Validation**: XSS prevention, SQL injection, CSRF protection
3. **Data Protection**: Encryption, sensitive data handling, PII compliance
4. **API Security**: Rate limiting, CORS, input sanitization
5. **Dependencies**: Vulnerability scanning, supply chain security
6. **Configuration**: Environment variables, secrets management
7. **Client-Side Security**: Content Security Policy, secure headers
8. **Infrastructure**: HTTPS enforcement, security headers

Provide:
- Vulnerability assessment with CVSS scores
- Specific remediation steps
- Security best practices implementation
- Compliance checklist (GDPR, OWASP Top 10)
- Monitoring and alerting recommendations`
    },
    'testing-strategy': {
        title: '🧪 Testing Strategy',
        description: 'Comprehensive testing analysis and recommendations',
        prompt: `As a QA engineer and testing specialist, analyze this Next.js codebase and create a comprehensive testing strategy.

Testing analysis:
1. **Current Test Coverage**: Unit, integration, e2e test analysis
2. **Testing Gaps**: Untested components, edge cases, error scenarios
3. **Test Quality**: Assertion quality, test maintainability, flakiness
4. **Testing Tools**: Jest, Testing Library, Playwright, Cypress evaluation
5. **Performance Testing**: Load testing, stress testing, memory leaks
6. **Accessibility Testing**: Screen reader compatibility, keyboard navigation
7. **Visual Regression**: UI consistency, responsive design testing
8. **API Testing**: Contract testing, error handling, rate limiting

Recommendations:
- Testing pyramid strategy
- Test automation roadmap
- CI/CD integration
- Quality gates and metrics
- Mock strategies and test data management`
    },
    'migration-planning': {
        title: '🔄 Migration Planning',
        description: 'Plan migrations to newer technologies',
        prompt: `As a migration specialist, help plan and execute migrations for this Next.js application.

Migration assessment:
1. **Current State Analysis**: Technology versions, dependencies, technical debt
2. **Target State Definition**: Goals, requirements, constraints
3. **Gap Analysis**: What needs to change, compatibility issues
4. **Risk Assessment**: Breaking changes, data loss risks, downtime
5. **Migration Strategy**: Phased approach, rollback plans, testing strategy
6. **Resource Planning**: Timeline, team requirements, training needs
7. **Communication Plan**: Stakeholder updates, documentation, training

Common migration types:
- Next.js version upgrades (Pages Router to App Router)
- React version updates
- TypeScript adoption
- State management library changes
- Styling system migrations
- Database migrations
- Hosting platform changes

Provide detailed migration roadmap with timelines and milestones.`
    }
};

export function activate(context: vscode.ExtensionContext): void {
    // Initialize Tree View Providers
    const treeDataProvider = new FileTreeProvider(context);
    const stepsProvider = new StepsTreeProvider();

    const treeView = vscode.window.createTreeView('nextjsContextifyExplorer', {
        treeDataProvider,
        showCollapseAll: true,
        canSelectMany: true
    });

    const stepsView = vscode.window.createTreeView('nextjsContextifySteps', {
        treeDataProvider: stepsProvider,
        showCollapseAll: false
    });

    // Store reference to current webview panel for communication
    let currentWebviewPanel: vscode.WebviewPanel | undefined;

    // Update steps and notify webview when file selection changes
    treeDataProvider.onSelectionChanged((selectedFiles) => {
        const selectedCount = selectedFiles.length;
        const actualFiles = treeDataProvider.getSelectedFiles();
        const selectedDirectories = treeDataProvider.getSelectedFilesAndDirectories().filter(item => {
            const fullPath = path.join(treeDataProvider['rootPath'], item);
            try {
                return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
            } catch {
                return false;
            }
        });

        stepsProvider.updateSelectedFiles(actualFiles.length);
        if (actualFiles.length > 0) {
            stepsProvider.setCurrentStep(2);
        } else {
            stepsProvider.setCurrentStep(1);
        }

        // Notify webview of selection change
        if (currentWebviewPanel) {
            currentWebviewPanel.webview.postMessage({
                command: 'selectedFilesChanged',
                files: actualFiles,
                directories: selectedDirectories
            });
        }
    });

    // Update tree view selection when checkbox state changes
    treeView.onDidChangeCheckboxState((e) => {
        console.log('Checkbox state changed for', e.items.length, 'items');
        let hasChanges = false;

        e.items.forEach(([item, state]) => {
            if (item.resourceUri) {
                const relativePath = path.relative(treeDataProvider['rootPath'], item.resourceUri.fsPath);
                const fullPath = item.resourceUri.fsPath;

                try {
                    const isDirectory = fs.statSync(fullPath).isDirectory();

                    if (state === vscode.TreeItemCheckboxState.Checked) {
                        if (isDirectory) {
                            console.log(`Selecting directory: ${relativePath}`);
                            // Select directory and all its contents
                            treeDataProvider['selectDirectoryAndContents'](relativePath, fullPath);
                        } else {
                            console.log(`Selecting file: ${relativePath}`);
                            // Select single file
                            treeDataProvider['selectedFiles'].add(relativePath);
                        }
                        hasChanges = true;
                    } else {
                        if (isDirectory) {
                            console.log(`Deselecting directory: ${relativePath}`);
                            // Deselect directory and all its contents (including subdirectories)
                            treeDataProvider['deselectDirectoryAndContents'](relativePath, fullPath);
                        } else {
                            console.log(`Deselecting file: ${relativePath}`);
                            // Deselect single file
                            treeDataProvider['selectedFiles'].delete(relativePath);
                        }
                        hasChanges = true;
                    }
                } catch (error) {
                    console.warn('Error processing checkbox change for:', relativePath, error);
                }
            }
        });

        if (hasChanges) {
            treeDataProvider['saveSelection']();
            treeDataProvider['notifySelectionChanged']();
            console.log('Selection updated - current size:', treeDataProvider['selectedFiles'].size);

            // Force tree view refresh to update checkbox states
            setTimeout(() => {
                treeDataProvider.refresh();
            }, 100);
        }
    });

    // Original commands
    const generateContext = vscode.commands.registerCommand('extension.generateCodeBaseContext', async () => {
        await showContextWizard(context);
    });

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

    const generateWithPrompts = vscode.commands.registerCommand('extension.generateWithPrompts', async () => {
        await showPromptWizard(context);
    });

    // New UI commands
    const openContextifyUI = vscode.commands.registerCommand('extension.openContextifyUI', async () => {
        stepsProvider.setCurrentStep(2);
        currentWebviewPanel = await showContextifyUI(context, treeDataProvider, stepsProvider);
    });

    const refreshTreeView = vscode.commands.registerCommand('nextjsContextifyExplorer.refresh', () => {
        console.log('Refreshing tree view...');
        treeDataProvider.refresh();
    });

    const selectAllFiles = vscode.commands.registerCommand('nextjsContextifyExplorer.selectAll', () => {
        console.log('Selecting all files...');
        treeDataProvider.selectAll();
    });

    const deselectAllFiles = vscode.commands.registerCommand('nextjsContextifyExplorer.deselectAll', () => {
        console.log('Deselecting all files...');
        treeDataProvider.deselectAll();
    });

    // Tree view item click handler
    const onTreeItemClick = vscode.commands.registerCommand('nextjsContextifyExplorer.onItemClick', (item: FileTreeItem) => {
        treeDataProvider.toggleSelection(item);
    });

    // Focus commands
    const focusFileSelection = vscode.commands.registerCommand('nextjsContextifyExplorer.focus', () => {
        vscode.commands.executeCommand('nextjsContextifyExplorer.focus');
        stepsProvider.setCurrentStep(1);
    });

    context.subscriptions.push(
        generateContext,
        generateQuickContext,
        generateWithPrompts,
        openContextifyUI,
        refreshTreeView,
        selectAllFiles,
        deselectAllFiles,
        onTreeItemClick,
        focusFileSelection,
        treeView,
        stepsView
    );
}

// Webview UI Function
async function showContextifyUI(context: vscode.ExtensionContext, treeDataProvider: FileTreeProvider, stepsProvider: StepsTreeProvider): Promise<vscode.WebviewPanel> {
    const panel = vscode.window.createWebviewPanel(
        'nextjsContextifyUI',
        'Next.js Contextify',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return panel;
    }

    panel.webview.html = getWebviewContent();

    // Send initial selection to webview
    setTimeout(() => {
        const selectedFiles = treeDataProvider.getSelectedFiles();
        const selectedDirectories = treeDataProvider.getSelectedFilesAndDirectories().filter(item => {
            const fullPath = path.join(workspaceFolders[0].uri.fsPath, item);
            try {
                return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
            } catch {
                return false;
            }
        });

        panel.webview.postMessage({
            command: 'selectedFilesChanged',
            files: selectedFiles,
            directories: selectedDirectories
        });
    }, 100);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case 'generate':
                    await handleUIGeneration(message.options, treeDataProvider, workspaceFolders[0].uri.fsPath, stepsProvider);
                    break;
                case 'getSelectedFiles':
                    panel.webview.postMessage({
                        command: 'selectedFilesResponse',
                        files: treeDataProvider.getSelectedFiles(),
                        directories: treeDataProvider.getSelectedFilesAndDirectories().filter(item => {
                            const fullPath = path.join(workspaceFolders[0].uri.fsPath, item);
                            try {
                                return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
                            } catch {
                                return false;
                            }
                        })
                    });
                    break;
                case 'getPromptLibrary':
                    panel.webview.postMessage({
                        command: 'promptLibraryResponse',
                        prompts: EXTENDED_PROMPT_LIBRARY
                    });
                    break;
                case 'refreshFileSelection':
                    panel.webview.postMessage({
                        command: 'selectedFilesChanged',
                        files: treeDataProvider.getSelectedFiles(),
                        directories: treeDataProvider.getSelectedFilesAndDirectories().filter(item => {
                            const fullPath = path.join(workspaceFolders[0].uri.fsPath, item);
                            try {
                                return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
                            } catch {
                                return false;
                            }
                        })
                    });
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    return panel;
}

// Handle UI Generation
async function handleUIGeneration(
    options: UIGenerationOptions,
    treeDataProvider: FileTreeProvider,
    rootPath: string,
    stepsProvider: StepsTreeProvider
): Promise<void> {
    try {
        stepsProvider.setCurrentStep(3);
        const selectedFiles = treeDataProvider.getSelectedFiles();

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating Next.js Contextify output...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Initializing enhanced context generation..." });

            const { files, stats } = await scanAndProcessFiles(rootPath, progress);

            // Filter files based on selection if any
            const filteredFiles = selectedFiles.length > 0
                ? files.filter(file => selectedFiles.includes(file.path))
                : files;

            progress.report({ increment: 80, message: "Building optimized output..." });

            const output = buildEnhancedOutputWithUI(filteredFiles, stats, rootPath, options);

            const getFileExtension = (format: string) => {
                switch (format) {
                    case 'xml': return 'xml';
                    case 'json': return 'json';
                    case 'markdown': return 'md';
                    default: return 'txt';
                }
            };

            const outputPath = path.join(rootPath, `nextjs-contextify-${options.format}.${getFileExtension(options.format)}`);

            progress.report({ increment: 95, message: "Writing context file..." });
            fs.writeFileSync(outputPath, output);

            progress.report({ increment: 100, message: "Complete!" });

            // Reset to step 1 for next generation
            stepsProvider.setCurrentStep(1);

            const action = await vscode.window.showInformationMessage(
                `✅ Context generated successfully! (${filteredFiles.length} files, ~${stats.totalTokens.toLocaleString()} tokens)`,
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

            const getFileExtension = (format: string) => {
                switch (format) {
                    case 'xml': return 'xml';
                    case 'json': return 'json';
                    case 'markdown': return 'md';
                    default: return 'txt';
                }
            };

            const outputPath = path.join(rootPath, `nextjs-contextify-${options.format}.${getFileExtension(options.format)}`);

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

// Get Webview Content
function getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Next.js Contextify</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            line-height: 1.6;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            border: 2px solid var(--vscode-focusBorder);
            border-radius: 12px;
            background: linear-gradient(135deg, var(--vscode-editor-background) 0%, var(--vscode-editor-selectionBackground) 100%);
        }
        .header h1 {
            margin: 0 0 15px 0;
            font-size: 2.5em;
            color: var(--vscode-textLink-foreground);
        }
        .header p {
            margin: 0;
            font-size: 1.2em;
            color: var(--vscode-descriptionForeground);
        }
        .step {
            margin-bottom: 40px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s ease;
        }
        .step.active {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 20px rgba(0, 122, 255, 0.1);
        }
        .step-header {
            padding: 20px 25px;
            background-color: var(--vscode-editor-selectionBackground);
            border-bottom: 1px solid var(--vscode-widget-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .step-title {
            display: flex;
            align-items: center;
            gap: 15px;
            font-size: 1.3em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .step-number {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            width: 35px;
            height: 35px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.1em;
        }
        .step-status {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        .step-content {
            padding: 25px;
        }
        .step-description {
            margin-bottom: 20px;
            font-size: 1.1em;
            color: var(--vscode-editor-foreground);
            padding: 15px;
            background-color: var(--vscode-input-background);
            border-radius: 8px;
            border-left: 4px solid var(--vscode-focusBorder);
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--vscode-input-foreground);
            font-size: 1.05em;
        }
        select, textarea, input {
            width: 100%;
            padding: 12px;
            border: 2px solid var(--vscode-input-border);
            border-radius: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 14px;
            transition: border-color 0.2s ease;
        }
        select:focus, textarea:focus, input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        textarea {
            min-height: 120px;
            resize: vertical;
        }
        .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            margin-right: 15px;
            margin-bottom: 10px;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }
        .button.primary {
            background-color: var(--vscode-button-background);
            font-size: 16px;
            padding: 15px 30px;
        }
        .button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .prompt-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .prompt-card {
            border: 2px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 18px;
            cursor: pointer;
            transition: all 0.2s ease;
            background-color: var(--vscode-editor-background);
        }
        .prompt-card:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
            transform: translateY(-2px);
        }
        .prompt-card.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 15px rgba(0, 122, 255, 0.2);
        }
        .prompt-title {
            font-weight: bold;
            margin-bottom: 8px;
            color: var(--vscode-textLink-foreground);
            font-size: 1.1em;
        }
        .prompt-description {
            font-size: 0.95em;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        }
        .stats-display {
            background-color: var(--vscode-editor-selectionBackground);
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            border-left: 4px solid var(--vscode-focusBorder);
        }
        .warning {
            background-color: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            color: var(--vscode-inputValidation-warningForeground);
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
        }
        .rules-container {
            background-color: var(--vscode-input-background);
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
        }
        .rule-item {
            background-color: var(--vscode-editor-selectionBackground);
            padding: 12px;
            margin: 8px 0;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 3px solid var(--vscode-focusBorder);
        }
        .rule-remove {
            background: none;
            border: none;
            color: var(--vscode-errorForeground);
            cursor: pointer;
            padding: 6px 10px;
            border-radius: 4px;
            font-weight: bold;
        }
        .rule-remove:hover {
            background-color: var(--vscode-errorBackground);
        }
        .cta-section {
            text-align: center;
            margin: 30px 0;
            padding: 25px;
            background-color: var(--vscode-editor-selectionBackground);
            border-radius: 12px;
            border: 2px solid var(--vscode-focusBorder);
        }
        .file-summary {
            background-color: var(--vscode-input-background);
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid var(--vscode-focusBorder);
        }
        .hidden {
            display: none;
        }
        .icon {
            width: 20px;
            height: 20px;
            display: inline-block;
        }
        .progress-bar {
            width: 100%;
            height: 6px;
            background-color: var(--vscode-widget-border);
            border-radius: 3px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background-color: var(--vscode-focusBorder);
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Next.js Contextify</h1>
            <p>Generate optimized context files from your Next.js codebase for AI/LLM analysis</p>
        </div>

        <!-- Step 1: File Selection Status -->
        <div class="step" id="step1">
            <div class="step-header">
                <div class="step-title">
                    <div class="step-number">1</div>
                    <span>📁 File Selection</span>
                </div>
                <div class="step-status" id="step1-status">
                    <span>📋 Ready to select files</span>
                </div>
            </div>
            <div class="step-content">
                <div class="step-description">
                    <strong>Choose which files to include in your context.</strong><br>
                    Use the <strong>"📁 File Selection"</strong> panel in the sidebar to select specific files, or leave empty to include all relevant files automatically.
                </div>
                
                <div class="file-summary" id="fileSummary" style="display: none;">
                    <div id="selectedFilesDisplay"></div>
                </div>

                <div class="cta-section" id="step1-cta">
                    <p><strong>👈 Use the File Selection panel on the left to choose your files</strong></p>
                    <button class="button secondary" onclick="refreshFileSelection()">🔄 Refresh Selection</button>
                    <button class="button primary" onclick="proceedToStep2()" style="display: none;" id="proceedBtn1">
                        ➡️ Continue to Configuration
                    </button>
                </div>
            </div>
        </div>

        <!-- Step 2: Configuration -->
        <div class="step" id="step2">
            <div class="step-header">
                <div class="step-title">
                    <div class="step-number">2</div>
                    <span>⚙️ Configuration</span>
                </div>
                <div class="step-status">
                    <span>🎯 Configure your generation settings</span>
                </div>
            </div>
            <div class="step-content">
                <div class="step-description">
                    <strong>Configure how your context should be generated.</strong><br>
                    Choose the output format, target LLM, and whether to include ready-to-use prompts.
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="format">📄 Output Format:</label>
                        <select id="format">
                            <option value="xml">XML Format (Structured tags for better LLM parsing)</option>
                            <option value="markdown">Markdown Format (Traditional markdown with code blocks)</option>
                            <option value="json">JSON Format (Structured JSON for programmatic use)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="targetLLM">🤖 Target LLM:</label>
                        <select id="targetLLM">
                            <option value="claude">Claude (Anthropic) - 200k+ context</option>
                            <option value="gpt">ChatGPT (OpenAI) - GPT-4 and GPT-4 Turbo</option>
                            <option value="gemini">Gemini (Google) - Google Gemini Pro</option>
                            <option value="custom">Custom - Generic format for any LLM</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label>
                        <input type="checkbox" id="includePrompts" checked> 
                        📝 Include ready-to-use LLM prompts
                    </label>
                </div>

                <div class="cta-section">
                    <button class="button primary" onclick="proceedToStep3()">
                        ➡️ Continue to Prompts & Rules
                    </button>
                </div>
            </div>
        </div>

        <!-- Step 3: Professional Prompts -->
        <div class="step" id="step3">
            <div class="step-header">
                <div class="step-title">
                    <div class="step-number">3</div>
                    <span>🎯 Professional Prompts</span>
                </div>
                <div class="step-status">
                    <span>🎨 Choose your analysis type</span>
                </div>
            </div>
            <div class="step-content">
                <div class="step-description">
                    <strong>Select a professional prompt template for your specific use case.</strong><br>
                    Each template is optimized for different types of code analysis and comes with expert-level prompts.
                </div>
                
                <div id="promptGrid" class="prompt-grid"></div>

                <div class="cta-section" style="margin-top: 25px;">
                    <button class="button secondary" onclick="skipPrompts()">⏭️ Skip Professional Prompts</button>
                    <button class="button primary" onclick="proceedToStep4()" style="display: none;" id="proceedBtn3">
                        ➡️ Continue to Custom Settings
                    </button>
                </div>
            </div>
        </div>

        <!-- Step 4: Custom Input -->
        <div class="step" id="step4">
            <div class="step-header">
                <div class="step-title">
                    <div class="step-number">4</div>
                    <span>✏️ Custom Input</span>
                </div>
                <div class="step-status">
                    <span>🎨 Add your personal touch</span>
                </div>
            </div>
            <div class="step-content">
                <div class="step-description">
                    <strong>Add your own instructions and custom rules.</strong><br>
                    This will be combined with the professional prompt to create a perfectly tailored analysis request.
                </div>

                <div class="form-group">
                    <label for="userPrompt">💬 Additional Instructions (optional):</label>
                    <textarea id="userPrompt" placeholder="Add any specific instructions, questions, or context for the LLM...

Examples:
- Focus on performance optimization in the checkout flow
- Look for security vulnerabilities in API routes  
- Suggest improvements for mobile responsiveness
- Check TypeScript type safety in components"></textarea>
                </div>

                <div class="form-group">
                    <label for="newRule">📋 Custom Rules:</label>
                    <input type="text" id="newRule" placeholder="e.g., Focus on TypeScript types, Ignore test files, Check for accessibility issues">
                    <button class="button secondary" onclick="addRule()" style="margin-top: 10px;">➕ Add Rule</button>
                </div>

                <div class="rules-container" id="rulesContainer" style="display: none;">
                    <div id="rulesList"></div>
                </div>

                <div class="cta-section" style="margin-top: 30px;">
                    <button class="button primary" onclick="proceedToGeneration()">
                        🚀 Ready to Generate Context
                    </button>
                </div>
            </div>
        </div>

        <!-- Step 5: Generate -->
        <div class="step" id="step5">
            <div class="step-header">
                <div class="step-title">
                    <div class="step-number">5</div>
                    <span>🚀 Generate Context</span>
                </div>
                <div class="step-status">
                    <span>⚡ Create your optimized context</span>
                </div>
            </div>
            <div class="step-content">
                <div class="step-description">
                    <strong>Everything is configured! Generate your context file.</strong><br>
                    Your context will be optimized for your chosen LLM and include all selected prompts and rules.
                </div>

                <div class="cta-section">
                    <button class="button primary" onclick="generateContext()" style="font-size: 18px; padding: 18px 35px;">
                        🎯 Generate Context File
                    </button>
                    <button class="button secondary" onclick="generateAndCopy()">
                        📋 Generate & Copy to Clipboard
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let selectedPrompt = null;
        let customRules = [];
        let promptLibrary = {};
        let currentStep = 1;
        let selectedFilesCount = 0;
        let selectedFiles = [];
        let selectedDirectories = [];

        // Load prompt library
        vscode.postMessage({ command: 'getPromptLibrary' });

        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'selectedFilesResponse':
                    selectedFiles = message.files;
                    selectedDirectories = message.directories || [];
                    displaySelectedFiles(message.files, message.directories || []);
                    break;
                case 'selectedFilesChanged':
                    selectedFiles = message.files;
                    selectedDirectories = message.directories || [];
                    displaySelectedFiles(message.files, message.directories || []);
                    break;
                case 'promptLibraryResponse':
                    promptLibrary = message.prompts;
                    displayPromptLibrary();
                    break;
            }
        });

        function updateStepVisibility() {
            for (let i = 1; i <= 5; i++) {
                const step = document.getElementById(\`step\${i}\`);
                if (i <= currentStep) {
                    step.style.display = 'block';
                    step.classList.toggle('active', i === currentStep);
                } else {
                    step.style.display = 'none';
                }
            }
        }

        function proceedToStep2() {
            currentStep = 2;
            updateStepVisibility();
            document.getElementById('step2').scrollIntoView({ behavior: 'smooth' });
        }

        function proceedToStep3() {
            currentStep = 3;
            updateStepVisibility();
            document.getElementById('step3').scrollIntoView({ behavior: 'smooth' });
        }

        function proceedToStep4() {
            currentStep = 4;
            updateStepVisibility();
            document.getElementById('step4').scrollIntoView({ behavior: 'smooth' });
        }

        function proceedToGeneration() {
            currentStep = 5;
            updateStepVisibility();
            document.getElementById('step5').scrollIntoView({ behavior: 'smooth' });
        }

        function skipPrompts() {
            selectedPrompt = null;
            document.querySelectorAll('.prompt-card').forEach(card => {
                card.classList.remove('selected');
            });
            proceedToStep4();
        }

        function displayPromptLibrary() {
            const grid = document.getElementById('promptGrid');
            grid.innerHTML = '';
            
            Object.entries(promptLibrary).forEach(([key, prompt]) => {
                const card = document.createElement('div');
                card.className = 'prompt-card';
                card.onclick = () => selectPrompt(key, card);
                card.innerHTML = \`
                    <div class="prompt-title">\${prompt.title}</div>
                    <div class="prompt-description">\${prompt.description}</div>
                \`;
                grid.appendChild(card);
            });
        }

        function selectPrompt(key, element) {
            document.querySelectorAll('.prompt-card').forEach(card => {
                card.classList.remove('selected');
            });
            element.classList.add('selected');
            selectedPrompt = key;
            
            document.getElementById('proceedBtn3').style.display = 'inline-flex';
        }

        function refreshFileSelection() {
            vscode.postMessage({ command: 'refreshFileSelection' });
        }

        function displaySelectedFiles(files, directories = []) {
            console.log('Displaying selected files:', files.length, 'files,', directories.length, 'directories');
            
            selectedFiles = files || [];
            selectedDirectories = directories || [];
            selectedFilesCount = selectedFiles.length;
            
            const display = document.getElementById('selectedFilesDisplay');
            const summary = document.getElementById('fileSummary');
            const status = document.getElementById('step1-status');
            const proceedBtn = document.getElementById('proceedBtn1');
            
            const totalItems = selectedFiles.length + selectedDirectories.length;
            
            // Always show the summary section
            summary.style.display = 'block';
            
            if (totalItems > 0) {
                let displayContent = '<h4>✅ Selected Items (' + selectedFiles.length + ' files';
                if (selectedDirectories.length > 0) {
                    displayContent += ' + ' + selectedDirectories.length + ' directories';
                }
                displayContent += '):</h4>';
                
                // Show directories first
                if (selectedDirectories.length > 0) {
                    displayContent += '<div style="margin-bottom: 10px;"><strong>📁 Directories (including all contents):</strong><br>';
                    displayContent += selectedDirectories.slice(0, 5).map(dir => '📁 ' + dir + '/').join('<br>');
                    if (selectedDirectories.length > 5) {
                        displayContent += '<br><strong>... and ' + (selectedDirectories.length - 5) + ' more directories</strong>';
                    }
                    displayContent += '</div>';
                }
                
                // Show individual files
                if (selectedFiles.length > 0) {
                    displayContent += '<div><strong>📄 Individual Files:</strong><br>';
                    displayContent += selectedFiles.slice(0, 8).map(file => '📄 ' + file).join('<br>');
                    if (selectedFiles.length > 8) {
                        displayContent += '<br><strong>... and ' + (selectedFiles.length - 8) + ' more files</strong>';
                    }
                    displayContent += '</div>';
                }
                
                display.innerHTML = displayContent;
                status.innerHTML = '<span>✅ ' + totalItems + ' items selected</span>';
                proceedBtn.style.display = 'inline-flex';
            } else {
                // No items selected - reset to default state
                display.innerHTML = '<h4>📂 No specific files selected</h4><p>Will include all relevant files automatically (recommended for most cases)</p>';
                status.innerHTML = '<span>📂 All files (auto-selection)</span>';
                proceedBtn.style.display = 'inline-flex';
                console.log('Displaying empty selection state');
            }
        }

        function addRule() {
            const input = document.getElementById('newRule');
            const rule = input.value.trim();
            if (rule) {
                customRules.push(rule);
                input.value = '';
                displayRules();
            }
        }

        function removeRule(index) {
            customRules.splice(index, 1);
            displayRules();
        }

        function displayRules() {
            const container = document.getElementById('rulesContainer');
            const list = document.getElementById('rulesList');

            if (customRules.length > 0) {
                container.style.display = 'block';
                list.innerHTML = \`
                    <h4>📋 Custom Rules (\${customRules.length}):</h4>
                    \${customRules.map((rule, index) => \`
                        <div class="rule-item">
                            <span>\${rule}</span>
                            <button class="rule-remove" onclick="removeRule(\${index})">✖</button>
                        </div>
                    \`).join('')}
                \`;
            } else {
                container.style.display = 'none';
            }
        }

        function generateContext() {
            const options = {
                format: document.getElementById('format').value,
                targetLLM: document.getElementById('targetLLM').value,
                includePrompts: document.getElementById('includePrompts').checked,
                selectedPrompt: selectedPrompt,
                userPrompt: document.getElementById('userPrompt').value.trim(),
                rules: customRules
            };

            vscode.postMessage({
                command: 'generate',
                options: options
            });
        }

        function generateAndCopy() {
            generateContext();
        }

        // Initialize and auto-refresh
        updateStepVisibility();
        
        // Auto-refresh file selection on load
        setTimeout(() => {
            refreshFileSelection();
        }, 500);
    </script>
</body>
</html>`;
}

// Build Enhanced Output with UI
function buildEnhancedOutputWithUI(
    files: FileInfo[],
    stats: ContextStats,
    rootPath: string,
    options: UIGenerationOptions
): string {
    const timestamp = new Date().toISOString();

    // Start with base output
    let output = buildEnhancedOutput(files, stats, rootPath, options);

    // Add UI-specific enhancements
    if (options.selectedPrompt && EXTENDED_PROMPT_LIBRARY[options.selectedPrompt as keyof typeof EXTENDED_PROMPT_LIBRARY]) {
        const prompt = EXTENDED_PROMPT_LIBRARY[options.selectedPrompt as keyof typeof EXTENDED_PROMPT_LIBRARY];
        output = `# ${prompt.title}

${prompt.prompt}

${options.userPrompt ? `## Additional Instructions

${options.userPrompt}

` : ''}${options.rules && options.rules.length > 0 ? `## Custom Rules

${options.rules.map(rule => `- ${rule}`).join('\n')}

` : ''}---

# Codebase Context

${output}`;
    } else if (options.userPrompt || (options.rules && options.rules.length > 0)) {
        // Add user prompt and rules even without professional prompt
        output = `# Custom Analysis Request

${options.userPrompt ? `## Instructions

${options.userPrompt}

` : ''}${options.rules && options.rules.length > 0 ? `## Rules

${options.rules.map(rule => `- ${rule}`).join('\n')}

` : ''}---

# Codebase Context

${output}`;
    }

    return output;
}