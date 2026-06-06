# RasterScript — Modular Image Editor

A **fully modular** React + TypeScript image editor built with a plugin architecture. Every feature is a self-contained plugin that can be added, removed, or extended without touching core code.

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

### Built-in Script Examples

- **Slice Spritesheet** — extract cells from a grid, trim alpha, download as PNGs
- **Remove Alpha Channel** — flatten transparency to a solid background
- **Swap R/B Channels** — demonstrates `forEach` pixel transform
- **Export Multi-size** — generate icon sets at multiple resolutions
- **Threshold** — black & white conversion by luminance

---

## 🛠️ Adding a New Plugin

1. **Create plugin file** in `src/plugins/my-plugin/index.tsx`
2. **Implement `EditorPlugin`** interface
3. **Register in `Editor.tsx`**:
   ```ts
   import { myPlugin } from '../../plugins/my-plugin'
   const PLUGINS = [..., myPlugin]
   ```

Example minimal plugin:

```tsx
import { Wand2 } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps } from '../../core/types'

function MyPanel({ context }: PluginPanelProps) {
  const apply = () => {
    const data = context.getImageData()
    // ... modify data.data (Uint8ClampedArray)
    context.setImageData(data, true)
  }
  return <button onClick={apply}>Apply Effect</button>
}

export const myPlugin: EditorPlugin = {
  id: 'my-plugin',
  name: 'My Effect',
  icon: <Wand2 size={18} />,
  category: 'filter',
  Panel: MyPanel,
}
```

---

## 🎨 Tech Stack

- **React 19** + **TypeScript**
- **Vite** — lightning-fast dev server
- **Tailwind CSS v4** — utility-first styling
- **Zustand** — minimal state management
- **Monaco Editor** — VS Code-quality script editing
- **Lucide React** — beautiful icons

---

## 📝 Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

---

## 🧩 Design Philosophy

- **Zero coupling** — plugins are isolated, engine is framework-agnostic
- **Composable** — add/remove features by editing a single array
- **Extensible** — user scripts can do anything the built-in tools can
- **Maintainable** — clear separation of concerns, minimal prop drilling
- **Type-safe** — full TypeScript coverage with strict mode

---

## 📄 License

MIT
