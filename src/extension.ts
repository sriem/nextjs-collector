import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Next.js Codebase Context Generator');

    let disposable = vscode.commands.registerCommand('extension.generateCodeBaseContext', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const ignoreFilePath = path.join(rootPath, '.nextjscontextgeneratorignore');
        const ig = ignore();

        // Default ignore patterns
        const defaultIgnore = [
            'node_modules', '.env', '.next', '.git', 'dist', 'build',
            'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', // Add package manager lock files
            '**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.gif', '**/*.ico', '**/*.svg',
            '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.eot',
            '**/*.mp4', '**/*.webm', '**/*.ogg', '**/*.mp3', '**/*.wav',
            '**/*.pdf', '**/*.zip', '**/*.tar', '**/*.gz', '**/*.rar',
            '**/*.exe', '**/*.dll', '**/*.so', '**/*.dylib'
        ];

        // Add default ignore patterns
        ig.add(defaultIgnore);

        // Read and add patterns from .nextjscontextgeneratorignore if it exists
        if (fs.existsSync(ignoreFilePath)) {
            const ignoreFileContent = fs.readFileSync(ignoreFilePath, 'utf8');
            ig.add(ignoreFileContent);
        }

        let generatedContext = '';

        function generateContext(dir: string) {
            const files = fs.readdirSync(dir);

            for (const file of files) {
                const filePath = path.join(dir, file);
                const relativePath = path.relative(rootPath, filePath);

                if (ig.ignores(relativePath)) {
                    outputChannel.appendLine(`Ignored: ${relativePath}`);
                    continue;
                }

                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    generateContext(filePath);
                } else {
                    // Check file extension and name
                    const ext = path.extname(file).toLowerCase();
                    const fileName = path.basename(file).toLowerCase();
                    if (['.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.rar', '.exe', '.dll', '.so', '.dylib'].includes(ext) ||
                        ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(fileName)) {
                        outputChannel.appendLine(`Skipped file: ${relativePath}`);
                        continue;
                    }

                    // Prioritize Next.js specific files
                    const isNextJSFile = file === 'next.config.js' ||
                        file.endsWith('.page.js') ||
                        file.endsWith('.page.tsx') ||
                        relativePath.startsWith('pages/') ||
                        relativePath.startsWith('components/') ||
                        relativePath.startsWith('styles/');

                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        if (isNextJSFile) {
                            generatedContext = `\n\n// File: ${relativePath}\n${content}` + generatedContext;
                        } else {
                            generatedContext += `\n\n// File: ${relativePath}\n${content}`;
                        }
                        outputChannel.appendLine(`Included: ${relativePath}`);
                    } catch (error) {
                        outputChannel.appendLine(`Error reading file ${relativePath}: ${error}`);
                    }
                }
            }
        }

        generateContext(rootPath);

        const outputPath = path.join(rootPath, 'nextjs-codebase-context.txt');
        fs.writeFileSync(outputPath, generatedContext);

        outputChannel.appendLine(`Next.js codebase context generated and saved to: ${outputPath}`);
        outputChannel.show();

        vscode.window.showInformationMessage('Next.js codebase context generated successfully!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }