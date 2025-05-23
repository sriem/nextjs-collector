# Next.js Contextify

A powerful VS Code extension that generates comprehensive context files from your Next.js codebase for optimal use with Large Language Models (LLMs) like ChatGPT, Claude, and others.

## 🚀 Features

### ✨ **Latest Next.js Support (v15+)**
- **App Router** prioritization with intelligent file categorization
- **Server Components** and **Client Components** detection
- Support for all App Router conventions (`layout`, `page`, `loading`, `error`, `not-found`, `template`, `global-error`)
- **Route Handlers** (`route.ts/js`) detection
- **Middleware** support

### 🎯 **Smart File Prioritization**
Files are intelligently categorized and prioritized for optimal LLM processing:

1. **A: Core Configurations** (Priority 80-100)
   - Next.js config files (`next.config.js/ts/mjs`)
   - Package configuration (`package.json`)
   - TypeScript/JavaScript config
   - Styling configuration (Tailwind, etc.)
   - Middleware

2. **B: App Router Structure** (Priority 60-80)
   - Layouts, pages, loading states
   - Error boundaries and templates
   - API routes in app directory

3. **C: Pages Router Structure** (Priority 68-78)
   - `_app`, `_document`, `_error`
   - API routes in pages directory
   - Custom error pages (404, 500)

4. **D: Components** (Priority 50-55)
   - Client components (`'use client'`)
   - Server components
   - UI components

5. **E: Hooks & Utilities** (Priority 45-48)
   - Custom hooks
   - Utility functions and libraries

6. **F: Data Layer** (Priority 40-42)
   - State management (Redux, Zustand, Context)
   - Database schemas and migrations

7. **G: Styling** (Priority 30-35)
   - Global styles and component styles

8. **H: Other Files** (Priority 10-25)
   - TypeScript/JavaScript files
   - Configuration files
   - Documentation

### 🛡️ **Enhanced Ignore Patterns**
Comprehensive default ignore patterns for modern Next.js development:

- **Build outputs**: `.next/`, `.swc/`, `out/`, `build/`, `dist/`, `.turbo/`
- **Dependencies**: `node_modules/`
- **Environment**: `.env*` files
- **Lock files**: All package manager lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`)
- **Media files**: Images, fonts, audio, video
- **Development tools**: Coverage reports, logs, temporary files
- **AI IDEs**: `.cursor/`, `.windsurf/` configurations

### 📊 **Rich Context Output**
- **Structured format** with file categories and priorities
- **Progress indicators** during generation
- **File statistics** and metadata
- **Comprehensive headers** explaining the context structure

## 🔧 Installation

1. Install from VS Code Marketplace (coming soon)
2. Or install manually:
   ```bash
   git clone https://github.com/sriem/nextjs-contextify
   cd nextjs-contextify
   npm install
   npm run build
   ```

## 📖 Usage

### Basic Usage
1. Open your Next.js project in VS Code
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run command: `Generate Code Base Context`
4. Find the generated file: `nextjs-codebase-context.txt` in your project root

### Custom Ignore Patterns
Create a `.nextjscollectorignore` file in your project root to add custom ignore patterns:

```
# Custom ignore patterns
*.test.ts
*.spec.js
/cypress/
/playwright/
custom-folder/
specific-file.ts
```

## 🎯 Perfect for LLM Interactions

This extension generates context files optimized for:

- **Code reviews and analysis**
- **Architecture discussions**
- **Bug fixing and debugging**
- **Feature development planning**
- **Migration assistance**
- **Performance optimization**

The intelligent prioritization ensures that LLMs receive the most important architectural information first, leading to better understanding and more relevant responses.

## 🔄 Recent Updates (v1.1.0)

### 🆕 New Features
- **Full App Router support** with all Next.js 15+ conventions
- **Client/Server component detection** using `'use client'` directive
- **Smart file categorization** with 8 priority levels
- **Progress indicators** with real-time status updates
- **Enhanced error handling** with detailed error messages
- **Better ignore patterns** covering modern build tools and AI IDEs

### 🔧 Technical Improvements
- **Updated dependencies** to latest versions
- **Modern TypeScript configuration** (ES2022, ESNext modules)
- **Enhanced ESLint rules** for better code quality
- **Async/await architecture** for better performance
- **Type-safe implementation** with comprehensive interfaces

### 🏗️ Architecture Enhancements
- **Modular code structure** with separate concerns
- **Memory-efficient processing** for large codebases
- **Better file system handling** with proper error recovery
- **Structured output format** with metadata headers

## 🛠️ Development

### Prerequisites
- Node.js 18+
- VS Code 1.100.0+

### Setup
```bash
git clone https://github.com/sriem/nextjs-contextify
cd nextjs-contextify
npm install
```

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Package
```bash
npm run vscode:prepublish
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines
- Follow TypeScript best practices
- Maintain comprehensive test coverage
- Update documentation for new features
- Ensure compatibility with latest Next.js versions

## 📋 Requirements

- VS Code 1.100.0 or higher
- Next.js project (works with any version, optimized for 13+)

## 🐛 Known Issues

- Very large codebases (10,000+ files) may take longer to process
- Binary files are automatically skipped to prevent corruption

## 📈 Roadmap

- [ ] Custom prioritization rules
- [ ] Multiple output formats (JSON, XML)
- [ ] Integration with popular AI coding assistants
- [ ] Real-time context updates
- [ ] Project template detection
- [ ] Performance metrics and insights

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👤 Author

**Sergej Riemann**
- GitHub: [@sriem](https://github.com/sriem)
- Website: [www.sergej-riemann.dev](https://www.sergej-riemann.dev)

## 🙏 Acknowledgments

- Next.js team for the amazing framework
- VS Code team for the excellent extension API
- The developer community for feedback and contributions

---

**Star ⭐ this repo if you find it helpful!**