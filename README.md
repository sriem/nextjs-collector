# Next.js Codebase Context Collector

## Overview
Next.js Codebase Context Collector is a Visual Studio Code extension specifically designed for Next.js projects. It simplifies the process of generating a context file from your entire Next.js codebase. This tool is designed to provide comprehensive context for Large Language Models (LLMs) like ChatGPT or Claude.ai, enabling more accurate and context-aware responses when discussing your Next.js project.

## Features
- Generates a single context file from all files in your Next.js project
- Customizable ignore patterns to exclude unnecessary files or directories
- Easy to use with a simple command in VS Code
- Optimized for Next.js project structure and file types

## Installation
1. Install the extension from the VS Code Marketplace or download the `.vsix` file from the [releases page](https://github.com/Riemann-AI/nextjs-codebase-context-collector/releases).
2. If using the `.vsix` file:
   - Open Visual Studio Code
   - Go to the Extensions view (Ctrl+Shift+X)
   - Click on the "..." at the top of the Extensions view
   - Choose "Install from VSIX..."
   - Select the downloaded `.vsix` file

## Usage
1. Open your Next.js project in VS Code
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on macOS)
3. Type "Generate Code Base Context" and select the command
4. The extension will create a file named `nextjs-codebase-context.txt` in your project root

## Customizing Ignored Files
By default, the extension ignores common directories and files typically not needed for context in Next.js projects, such as `node_modules`, `.env`, `.next`, `.git`, `dist`, and `build`. To customize this:

1. Create a file named `.nextjscontextgeneratorignore` in your project root
2. Add patterns for files or directories you want to ignore, one per line

Example `.nextjscontextgeneratorignore` file:
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
public/assets/
```

## Using the Generated Context
After running the extension:
1. Open the generated `nextjs-codebase-context.txt` file
2. Copy its contents
3. Paste it into your conversation with ChatGPT, Claude.ai, or any other LLM
4. Provide context by explaining that this is your Next.js project's codebase
5. Ask questions or request assistance related to your Next.js project

## Best Practices for Next.js Projects
- Include key Next.js configuration files like `next.config.js` in your context
- Consider including important parts of your `package.json` for dependency context
- If using a custom server, make sure to include the server file
- Include representative examples of your pages, components, and API routes

## How It Works
The extension scans your Next.js project directory and collects the content of all relevant files. It prioritizes Next.js-specific files (like pages, components, and configuration files) and includes them at the beginning of the generated context file. This ensures that the most important parts of your Next.js project are immediately available to the LLM.

## Performance Considerations
For large projects, the context generation process might take a few moments. The extension will show a progress notification and inform you once the context file has been successfully generated.

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request to our [GitHub repository](https://github.com/Riemann-AI/nextjs-codebase-context-collector).

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author
Sergej Riemann

## Support
If you encounter any problems or have any suggestions specific to Next.js projects, please open an issue on our [GitHub repository](https://github.com/Riemann-AI/nextjs-codebase-context-collector/issues).

## Privacy Notice
This extension does not collect or transmit any data from your project. All processing is done locally on your machine.

## Feedback
We value your feedback! If you find this extension useful, please consider leaving a review on the VS Code Marketplace. If you have ideas for improvements or new features, feel free to open an issue on our GitHub repository.

Thank you for using Next.js Codebase Context Collector!