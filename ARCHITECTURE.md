# Architecture Deep Dive

## Overview

RasterScript is built on a **plugin-first architecture** where every feature is a self-contained module. The core engine is framework-agnostic and communicates with React via a thin Zustand bridge.

---

## Core Components

### 1. EditorEngine (`src/core/EditorEngine.ts`)

**Responsibility:** Pure canvas state machine with zero React dependencies.

- Manages the `<canvas>` element lifecycle
- Handles image I/O (load, export)
- Provides `getImageData()` / `setImageData()` primitives
- Integrates with `HistoryManager` for undo/redo
- Emits change events via a simple pub/sub pattern

**Key Methods:**
```ts
loadImage(img: HTMLImageElement | ImageBitmap)
loadBlank(width, height, fill)
getImageData(): ImageData
setImageData(data: ImageData, pushHistory: boolean)
pushHistory(label: string)
undo() / redo()
getContext(): EditorContext  // Factory for plugin API
subscribe(fn: () => void): Unsubscribe
```

**Why it's decoupled:**
- Can be tested without React
- Could be used in a Vue/Svelte/vanilla JS app
- No knowledge of plugins or UI state

---

### 2. PluginRegistry (`src/core/PluginRegistry.ts`)

**Responsibility:** Central registry for all editor plugins.

- Singleton pattern (`export const registry = new PluginRegistry()`)
- Plugins register once at app startup
- Provides lookup by ID or category
- Maintains insertion order for toolbar rendering

**Key Methods:**
```ts
register(plugin: EditorPlugin)
unregister(id: string)
get(id: string): EditorPlugin | undefined
getAll(): EditorPlugin[]
byCategory(category): EditorPlugin[]
```

**Why it's separate:**
- Plugins don't need to know about each other
- Easy to add/remove plugins without touching core
- Could support dynamic plugin loading in the future

---

### 3. HistoryManager (`src/core/HistoryManager.ts`)

**Responsibility:** Undo/redo stack with a 50-entry limit.

- Stores `ImageData` snapshots + metadata (width, height, label)
- Pointer-based navigation (not array slicing)
- Automatically drops redo history when a new action is taken

**Key Methods:**
```ts
push(entry: HistoryEntry)
undo(): HistoryEntry | null
redo(): HistoryEntry | null
canUndo() / canRedo()
current(): HistoryEntry | null
```

---

### 4. ScriptRunner (`src/core/ScriptRunner.ts`)

**Responsibility:** Builds the `ScriptAPI` object and executes user scripts in a sandboxed environment.

**ScriptAPI Highlights:**
- `forEach(fn)` — per-pixel transform with `(r,g,b,a,x,y) => [r,g,b,a]`
- `sliceSprite(cols, rows)` — extract spritesheet cells with alpha trimming
- `resize()`, `crop()`, `rotate()`, `flip()` — same ops as built-in plugins
- `download()` / `downloadAll()` — trigger browser downloads

**Execution:**
```ts
const fn = new Function('api', `return (async () => { ${code} })()`)
await fn(api)
```

**Why async:**
- Supports `await` for blob creation, downloads, etc.
- User scripts can use `api.sliceSprite()` which returns `Promise<Blob[]>`

---

### 5. Zustand Store (`src/store/useEditorStore.ts`)

**Responsibility:** Bridge between the framework-agnostic engine and React.

**State:**
```ts
engine: EditorEngine | null
activePluginId: string | null
width, height, canUndo, canRedo  // mirrored from engine
hasImage: boolean
zoom: number
scripts: UserScript[]  // persisted to localStorage
plugins: EditorPlugin[]  // mirrors registry for reactive access
```

**Why Zustand:**
- Minimal boilerplate
- No context provider needed
- Easy to subscribe to slices
- Works well with non-React code (engine)

**Sync pattern:**
```ts
setEngine: (engine) => {
  set({ engine })
  engine.subscribe(() => get().syncFromEngine())
}
```

Every engine mutation triggers `syncFromEngine()` which updates React state.

---

## Plugin Lifecycle

### Registration (app startup)

```tsx
// src/components/layout/Editor.tsx
useEffect(() => {
  PLUGINS.forEach(p => registry.register(p))
  refreshPlugins()
}, [])
```

### Activation (user clicks toolbar icon)

```ts
setActivePlugin: (id) => {
  const ctx = engine.getContext()
  if (activePluginId) registry.get(activePluginId)?.deactivate?.(ctx)
  if (id) registry.get(id)?.activate?.(ctx)
  set({ activePluginId: id })
}
```

### Rendering

**Toolbar:**
```tsx
{plugins.map(p => (
  <button onClick={() => setActivePlugin(p.id)}>
    {p.icon}
  </button>
))}
```

**Panel Sidebar:**
```tsx
const plugin = registry.get(activePluginId)
if (plugin?.Panel) {
  <plugin.Panel context={engine.getContext()} isActive={true} />
}
```

**Canvas Overlay:**
```tsx
const Overlay = activePlugin?.CanvasOverlay
{Overlay && <Overlay context={ctx} containerRef={containerRef} />}
```

---

## Data Flow

### Image Load
```
User drops file
  → createImageBitmap(file)
  → engine.loadImage(bitmap)
  → engine emits change
  → store.syncFromEngine()
  → React re-renders (width/height updated)
```

### Plugin Action (e.g., Rotate)
```
User clicks "Rotate 90°"
  → applyRotate(context, 90)
  → context.setImageData(rotatedData, pushHistory=true)
  → engine.setImageData() + history.push()
  → engine emits change
  → store.syncFromEngine()
  → React re-renders
```

### Undo
```
User presses Cmd+Z
  → engine.undo()
  → history.undo() returns previous ImageData
  → engine restores canvas
  → engine emits change
  → store.syncFromEngine()
  → React re-renders (canUndo/canRedo updated)
```

---

## Plugin Types

### 1. Transform Plugins (crop, resize, rotate, flip)

- **Panel:** Input fields + "Apply" button
- **Overlay (optional):** Interactive SVG for crop selection
- **Pattern:** Read canvas → transform → write back with `setImageData()`

### 2. Draw Plugins (doodle)

- **Panel:** Color picker, brush size, opacity, eraser toggle
- **Overlay:** Transparent canvas capturing pointer events
- **Pattern:** Draw directly on main canvas, push history on pointer up
- **Settings sync:** Module-level `Map<HTMLCanvasElement, Settings>` shared between panel and overlay

### 3. Filter Plugins (brightness, contrast, etc.)

- **Panel:** Sliders + one-click effect buttons
- **Pattern:** `getImageData()` → mutate `data.data` array → `setImageData()`

### 4. Script Plugin

- **Panel:** Monaco editor + script list + console output
- **Pattern:** Build `ScriptAPI` → execute user code → catch errors → log output

---

## Key Design Decisions

### Why EditorContext instead of passing the engine?

**EditorContext** is a stable, minimal API:
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

**Benefits:**
- Plugins can't accidentally break the engine
- Clear contract — only these operations are allowed
- Easy to mock for testing
- Could be implemented by a different engine in the future

### Why module-level settings map for doodle?

**Problem:** Overlay and Panel are separate components but need to share live settings (color, size, opacity).

**Solutions considered:**
1. ❌ Prop drilling — breaks encapsulation
2. ❌ Zustand store — overkill for plugin-local state
3. ✅ Module-level `Map<HTMLCanvasElement, Settings>` — clean, scoped, no re-renders

**Pattern:**
```ts
// Top of file
export const doodleSettings = new Map<HTMLCanvasElement, Settings>()

// Panel writes
useEffect(() => {
  doodleSettings.set(context.canvas, { color, size, opacity, eraser })
}, [color, size, opacity, eraser])

// Overlay reads
const s = doodleSettings.get(context.canvas) ?? DEFAULT_SETTINGS
```

### Why not use ffmpeg.wasm?

**Decision:** Build everything from scratch using native Canvas API.

**Rationale:**
- **Learning value** — demonstrates pixel-level manipulation
- **Bundle size** — ffmpeg.wasm is ~30 MB
- **Flexibility** — easier to add custom operations (spritesheet slicing, alpha trimming)
- **Performance** — native Canvas is fast for most operations
- **Future option** — could add ffmpeg as an optional plugin later

---

## Extension Points

### Adding a new plugin

1. Create `src/plugins/my-plugin/index.tsx`
2. Implement `EditorPlugin` interface
3. Import and add to `PLUGINS` array in `Editor.tsx`

### Adding a new script template

1. Add entry to `src/plugins/script/builtins.ts`
2. Appears automatically in the script panel

### Adding a new ScriptAPI method

1. Add to `buildScriptAPI()` in `ScriptRunner.ts`
2. Update `ScriptAPI` interface in `types.ts`
3. Document in README

---

## Testing Strategy

### Unit Tests (recommended)

- **HistoryManager** — undo/redo logic
- **PluginRegistry** — register/lookup
- **ScriptRunner** — API surface, error handling
- **Pixel transforms** — brightness, contrast, etc.

### Integration Tests

- **EditorEngine** — load → edit → undo → redo
- **Plugin lifecycle** — activate → apply → deactivate

### E2E Tests (optional)

- Load image → crop → resize → export
- Script execution → console output

---

## Performance Considerations

### Canvas operations

- `getImageData()` / `putImageData()` are synchronous and can block the main thread
- For large images (>4K), consider:
  - Web Workers for pixel transforms
  - OffscreenCanvas for background rendering
  - Debouncing live previews

### History memory

- Each history entry stores a full `ImageData` copy
- 50-entry limit prevents unbounded growth
- For very large images, could compress entries or use diffs

### Monaco Editor

- Lazy-loaded via `@monaco-editor/react`
- ~2 MB bundle impact
- Could be code-split if script plugin is optional

---

## Future Enhancements

### Plugin hot-reloading

- Watch `src/plugins/` for changes
- Dynamically `import()` and re-register
- Useful for plugin development

### Plugin marketplace

- JSON manifest format
- Remote plugin loading
- Sandboxed execution (iframe or Web Worker)

### Layer system

- Multiple canvases stacked with blend modes
- Non-destructive editing
- Requires rethinking the engine architecture

### WebGL acceleration

- Use WebGL shaders for filters
- Faster for real-time effects
- More complex to implement

---

## Conclusion

This architecture prioritizes **modularity**, **maintainability**, and **extensibility**. Every component has a single responsibility, and plugins are completely isolated from each other. The framework-agnostic core means the engine could be reused in other contexts, and the plugin system makes it trivial to add new features without touching existing code.
