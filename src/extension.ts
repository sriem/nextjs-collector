import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Codebase Context Collector');

    let disposable = vscode.commands.registerCommand('extension.collectCodebaseContext', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const ignoreFilePath = path.join(rootPath, '.contextcollectorignore');
        const ig = ignore();

        if (fs.existsSync(ignoreFilePath)) {
            const ignoreFileContent = fs.readFileSync(ignoreFilePath, 'utf8');
            ig.add(ignoreFileContent);
        } else {
            // Default ignore patterns if .contextcollectorignore doesn't exist
            ig.add(['node_modules', '.env', '.next', '.git', 'dist', 'build']);
        }

        let collectedInfo = '';

        function collectFiles(dir: string) {
            const files = fs.readdirSync(dir);

            for (const file of files) {
                const filePath = path.join(dir, file);
                const relativePath = path.relative(rootPath, filePath);

                if (ig.ignores(relativePath)) {
                    continue;
                }

                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    collectFiles(filePath);
                } else {
                    const content = fs.readFileSync(filePath, 'utf8');
                    collectedInfo += `\n\n// File: ${relativePath}\n${content}`;
                }
            }
        }

        collectFiles(rootPath);

        const outputPath = path.join(rootPath, 'codebase-context.txt');
        fs.writeFileSync(outputPath, collectedInfo);

        outputChannel.appendLine(`Codebase context collected and saved to: ${outputPath}`);
        outputChannel.show();

        vscode.window.showInformationMessage('Codebase context collected successfully!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }