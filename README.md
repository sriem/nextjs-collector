# Codebase Context Collector

## Overview
Codebase Context Collector is a Visual Studio Code extension that simplifies the process of collecting your entire codebase into a single file. This tool is designed to provide comprehensive context for Large Language Models (LLMs) like ChatGPT or Claude.ai, enabling more accurate and context-aware responses when discussing your project.

## Features
- Collects all files in your project into a single text file
- Customizable ignore patterns to exclude unnecessary files or directories
- Easy to use with a simple command in VS Code

## Installation
1. Install the extension from the VS Code Marketplace or download the `.vsix` file from the releases page.
2. If using the `.vsix` file:
   - Open Visual Studio Code
   - Go to the Extensions view (Ctrl+Shift+X)
   - Click on the "..." at the top of the Extensions view
   - Choose "Install from VSIX..."
   - Select the downloaded `.vsix` file

## Usage
1. Open your project in VS Code
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on macOS)
3. Type "Collect Codebase Context" and select the command
4. The extension will create a file named `codebase-context.txt` in your project root

## Customizing Ignored Files
By default, the extension ignores common directories like `node_modules`, `.env`, `.next`, `.git`, `dist`, and `build`. To customize this:

1. Create a file named `.contextcollectorignore` in your project root
2. Add patterns for files or directories you want to ignore, one per line

Example `.contextcollectorignore` file:
```
node_modules
.env
.next
.git
dist
build
*.log
temp/
secrets.json
```

## Using the Collected Context
After running the extension:
1. Open the generated `codebase-context.txt` file
2. Copy its contents
3. Paste it into your conversation with ChatGPT, Claude.ai, or any other LLM
4. Provide context by explaining that this is your project's codebase
5. Ask questions or request assistance related to your project

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author
Sergej Riemann

## Support
If you encounter any problems or have any suggestions, please open an issue on the GitHub repository.