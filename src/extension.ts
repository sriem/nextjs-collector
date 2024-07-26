import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.generateCodeBaseContext', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const ignoreFilePath = path.join(rootPath, '.nextjscollectorignore');
        const ig = ignore();

        // Default ignore patterns
        const defaultIgnore = [
            'node_modules',
            '.env',
            '.next',
            '.git',
            'dist',
            'build',
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml',
            '**/*.jpg',
            '**/*.jpeg',
            '**/*.png',
            '**/*.gif',
            '**/*.ico',
            '**/*.svg',
            '**/*.woff',
            '**/*.woff2',
            '**/*.ttf',
            '**/*.eot',
            '**/*.mp4',
            '**/*.webm',
            '**/*.ogg',
            '**/*.mp3',
            '**/*.wav',
            '**/*.pdf',
            '**/*.zip',
            '**/*.tar',
            '**/*.gz',
            '**/*.rar',
            '**/*.exe',
            '**/*.dll',
            '**/*.so',
            '**/*.dylib'
        ];

        // Add default ignore patterns
        ig.add(defaultIgnore);

        // Read and add patterns from .nextjscollectorignore if it exists
        if (fs.existsSync(ignoreFilePath)) {
            const ignoreFileContent = fs.readFileSync(ignoreFilePath, 'utf8');
            ig.add(ignoreFileContent);
        }

        let generatedContext = '';

        function shouldIgnoreFile(relativePath: string): boolean {
            return ig.ignores(relativePath);
        }

        function generateContext(dir: string) {
            const files = fs.readdirSync(dir);

            for (const file of files) {
                const filePath = path.join(dir, file);
                const relativePath = path.relative(rootPath, filePath);

                if (shouldIgnoreFile(relativePath)) {
                    continue;
                }

                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    generateContext(filePath);
                } else {
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
                    } catch (error) {
                        // Silently ignore read errors
                    }
                }
            }
        }

        generateContext(rootPath);

        const outputPath = path.join(rootPath, 'nextjs-codebase-context.txt');
        fs.writeFileSync(outputPath, generatedContext);

        vscode.window.showInformationMessage('Next.js codebase context generated successfully!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }