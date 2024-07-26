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

        if (fs.existsSync(ignoreFilePath)) {
            const ignoreFileContent = fs.readFileSync(ignoreFilePath, 'utf8');
            ig.add(ignoreFileContent);
        } else {
            // Default ignore patterns if .nextjscontextgeneratorignore doesn't exist
            ig.add(['node_modules', '.env', '.next', '.git', 'dist', 'build']);
        }

        let generatedContext = '';

        function generateContext(dir: string) {
            const files = fs.readdirSync(dir);

            for (const file of files) {
                const filePath = path.join(dir, file);
                const relativePath = path.relative(rootPath, filePath);

                if (ig.ignores(relativePath)) {
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

                    const content = fs.readFileSync(filePath, 'utf8');
                    if (isNextJSFile) {
                        generatedContext = `\n\n// File: ${relativePath}\n${content}` + generatedContext;
                    } else {
                        generatedContext += `\n\n// File: ${relativePath}\n${content}`;
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