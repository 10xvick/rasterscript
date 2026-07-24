# RasterScript — Modular Image Editor

[![Repository](https://img.shields.io/badge/GitHub-10xvick%2Frasterscript-blue?logo=github)](https://github.com/10xvick/rasterscript)
[![Project Board](https://img.shields.io/badge/GitHub-Project%20Board-success?logo=github)](https://github.com/users/10xvick/projects/2)
[![TypeScript](https://img.shields.io/badge/TypeScript-~5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-^6.2-646CFF?logo=vite)](https://vitejs.dev/)

A **fully modular** React + TypeScript image editor built with a plugin architecture. Every feature is a self-contained plugin that can be added, removed, or extended without touching core code.

🌐 **Live:** [https://10xvick.github.io/tools/image/rasterscript/](https://10xvick.github.io/tools/image/rasterscript/)

---

## 🔗 Quick Links

- **Repository**: [https://github.com/10xvick/rasterscript](https://github.com/10xvick/rasterscript)
- **Project Board**: [https://github.com/users/10xvick/projects/2](https://github.com/users/10xvick/projects/2)
- **Architecture Spec**: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Script API Documentation**: [`SCRIPT_API.md`](./SCRIPT_API.md)

---

## ✨ Features

- **Modular Plugin System** — crop, resize, rotate, flip, draw, filters, and custom scripts
- **Script Runner** — write custom image processing scripts with a first-class API (Monaco editor)
- **Built-in Script Templates** — spritesheet slicer, multi-size export, alpha removal, pixel transforms
- **Clean Architecture** — decoupled core engine, plugin registry, Zustand store, zero prop drilling
- **Canvas-based** — pure HTML5 Canvas with undo/redo history
- **Modern Stack** — React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Monaco Editor

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and drop an image to start editing.

---

## 🏗️ Architecture

### Core Principles

1. **Plugin Registry** — every tool is a plugin implementing `EditorPlugin`
2. **EditorEngine** — pure canvas state machine, zero React dependency
3. **Zustand Store** — bridges engine state to React components
4. **ScriptRunner** — sandboxed JS execution with a rich API exposed to user scripts
5. **Complete Decoupling** — plugins know nothing about each other; only the engine coordinates them

### Folder Structure

```
src/
├── core/
│   ├── types.ts              # All shared interfaces (Plugin, EditorContext, ScriptAPI…)
│   ├── PluginRegistry.ts     # Central plugin registry (singleton)
│   ├── EditorEngine.ts       # Canvas state machine + history
│   ├── HistoryManager.ts     # Undo/redo stack
│   └── ScriptRunner.ts       # Script API builder + sandboxed execution
├── plugins/
│   ├── crop/                 # Interactive crop tool with SVG overlay
│   ├── resize/               # Resize with aspect lock + smooth/pixelated modes
│   ├── doodle/               # Freehand drawing + eraser
│   ├── rotate/               # 90°/180° rotation
│   ├── flip/                 # Horizontal/vertical flip
│   ├── filters/              # Brightness, contrast, saturation, grayscale, invert, sepia
│   └── script/               # Monaco-based script editor + built-in templates
├── store/
│   └── useEditorStore.ts     # Zustand store (engine state, active plugin, zoom, scripts)
├── components/
│   ├── layout/               # Editor shell, Toolbar, PanelSidebar, StatusBar, DropZone
│   └── canvas/               # CanvasStage (renders canvas + active plugin overlay)
└── lib/                      # Shared utilities (if needed)
```

---

## 🔌 Plugin Contract

Every plugin implements this interface:

```ts
interface EditorPlugin {
  id: string                          // Unique identifier
  name: string                        // Display name
  icon: ReactNode                     // Lucide icon
  category: 'transform' | 'draw' | 'filter' | 'script' | 'export'
  shortcutKey?: string                // Optional keyboard shortcut (single char)
  Panel?: FC<PluginPanelProps>        // Right-side options panel
  CanvasOverlay?: FC<OverlayProps>    // SVG/div overlay for interactive tools (e.g. crop rect)
  activate?(ctx: EditorContext): void
  deactivate?(ctx: EditorContext): void
}
```

### EditorContext

Plugins receive an `EditorContext` — a stable API to interact with the canvas:

```ts
interface EditorContext {
  canvas: HTMLCanvasElement
  getImageData(): ImageData
  setImageData(data: ImageData, pushHistory?: boolean): void
  pushHistory(label: string): void
  getWidth(): number
  getHeight(): number
}
```

---

## 📜 Script API

User scripts have access to a rich `api` object:

```ts
api.canvas              // HTMLCanvasElement
api.ctx                 // 2D rendering context
api.getImageData()      // Returns ImageData
api.setImageData(data)  // Replaces canvas content + pushes to history
api.forEach(fn)         // Per-pixel transform: (r,g,b,a,x,y) => [r,g,b,a]
api.resize(w, h)        // Resize with optional smoothing
api.crop(x, y, w, h)    // Crop to rect
api.rotate(degrees)     // Rotate by 90/180/270
api.flip('h' | 'v')     // Flip horizontal or vertical
api.sliceSprite(cols, rows, options)  // Extract spritesheet cells
api.download(blob, filename)
api.downloadAll(blobs, prefix)
api.log(...args)        // Console output
```

---

## 🗺️ Roadmap & Sprints

Active development is tracked on the **[Project Board](https://github.com/users/10xvick/projects/2)** across feature epics:

1. **Editor Scripts & AI**: Editor Scripts Engine (#1), AI Assistant (#2), Extensions Marketplace (#3), Visual Blueprint (#4), 2-Way Sync (#5).
2. **Essential Tools**: Text Tool (#7), Shapes Tool (#8), Paint Bucket (#9), Eyedropper (#10), Gradient (#11), Blur/Sharpen (#12), Clone Stamp (#13), Magic Wand & Lasso (#14).
3. **Layer & Image Adjustments**: Color Adjustments (#15), Rulers & Guides (#16), Grid Overlay (#17), Blend Modes (#18), Info Panel (#19), Histogram (#20).

---

## 📄 License

MIT
