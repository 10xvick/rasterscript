import { useState, useEffect, useReducer, createContext, useContext, useRef } from 'react'
import { Columns, Rows, X, LayoutDashboard, ImageIcon, Wrench, SlidersHorizontal, Layers, ChevronsUpDown } from 'lucide-react'
import { CanvasStage } from '../canvas/CanvasStage'
import { Toolbar } from './Toolbar'
import { PanelSidebar } from './PanelSidebar'
import { DropZone } from './DropZone'
import { LayerPanel } from '../layers/LayerPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tab { id: string; title: string; widgetId: string }
interface AreaNode { id: string; type: 'area'; tabs: Tab[]; activeTab: number }
interface SplitNode { id: string; type: 'split'; dir: 'row' | 'col'; ratio: number; a: LayoutNode; b: LayoutNode }
type LayoutNode = AreaNode | SplitNode

type LayoutAction =
  | { type: 'SPLIT_AREA'; areaId: string; dir: 'row' | 'col' }
  | { type: 'CLOSE_AREA'; areaId: string }
  | { type: 'UPDATE_RATIO'; id: string; ratio: number }
  | { type: 'ADD_TAB'; areaId: string; widgetId: string }
  | { type: 'CLOSE_TAB'; areaId: string; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; areaId: string; tabIndex: number }
  | { type: 'MOVE_TAB'; sourceAreaId: string; targetAreaId: string; tabId: string }
  | { type: 'CHANGE_TAB_WIDGET'; areaId: string; tabId: string; widgetId: string }

// ─── Utilities ────────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).substr(2, 9)

// ─── Widget Registry ──────────────────────────────────────────────────────────

const WIDGETS: Record<string, { name: string; icon: React.ElementType; Component: React.FC }> = {
  canvas: {
    name: 'Canvas',
    icon: ImageIcon,
    Component: () => (
      <div className="h-full flex flex-col relative">
        <CanvasStage />
        <DropZone />
      </div>
    ),
  },
  tools: {
    name: 'Tools',
    icon: Wrench,
    Component: () => <Toolbar />,
  },
  properties: {
    name: 'Properties',
    icon: SlidersHorizontal,
    Component: () => (
      <div className="h-full flex flex-col">
        <PanelSidebar />
      </div>
    ),
  },
  layers: {
    name: 'Layers',
    icon: Layers,
    Component: () => (
      <div className="h-full overflow-y-auto">
        <LayerPanel />
      </div>
    ),
  },
}

// ─── Tree Operations (Pure) ───────────────────────────────────────────────────

const splitNode = (tree: LayoutNode, targetId: string, dir: 'row' | 'col'): LayoutNode => {
  if (tree.type === 'area') {
    if (tree.id !== targetId) return tree
    return { id: genId(), type: 'split', dir, ratio: 50, a: tree, b: { id: genId(), type: 'area', tabs: [], activeTab: 0 } }
  }
  return { ...tree, a: splitNode(tree.a, targetId, dir), b: splitNode(tree.b, targetId, dir) }
}

const removeNode = (tree: LayoutNode, targetId: string): LayoutNode | null => {
  if (tree.type === 'area') return tree.id === targetId ? null : tree
  const a = removeNode(tree.a, targetId)
  const b = removeNode(tree.b, targetId)
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  return { ...tree, a, b }
}

const updateRatio = (tree: LayoutNode, targetId: string, ratio: number): LayoutNode => {
  if (tree.type === 'split') {
    if (tree.id === targetId) return { ...tree, ratio }
    return { ...tree, a: updateRatio(tree.a, targetId, ratio), b: updateRatio(tree.b, targetId, ratio) }
  }
  return tree
}

const mutateArea = (tree: LayoutNode, targetId: string, fn: (a: AreaNode) => AreaNode): LayoutNode => {
  if (tree.type === 'area') return tree.id === targetId ? fn(tree) : tree
  return { ...tree, a: mutateArea(tree.a, targetId, fn), b: mutateArea(tree.b, targetId, fn) }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface LayoutContextValue { layout: LayoutNode; dispatch: React.Dispatch<LayoutAction> }
const LayoutContext = createContext<LayoutContextValue | null>(null)
const useLayout = () => useContext(LayoutContext)!

// ─── Resizer ──────────────────────────────────────────────────────────────────

function Resizer({ splitId, dir }: { splitId: string; dir: 'row' | 'col' }) {
  const { dispatch } = useLayout()
  const [dragging, setDragging] = useState(false)
  const isRow = dir === 'row'

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const el = document.getElementById(`split-${splitId}`)
      if (!el) return
      const rect = el.getBoundingClientRect()
      let ratio = isRow
        ? ((e.clientX - rect.left) / rect.width) * 100
        : ((e.clientY - rect.top) / rect.height) * 100
      ratio = Math.max(5, Math.min(95, ratio))
      dispatch({ type: 'UPDATE_RATIO', id: splitId, ratio })
    }
    const onUp = () => setDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, splitId, isRow, dispatch])

  return (
    <div
      onMouseDown={() => setDragging(true)}
      className={`group z-10 flex items-center justify-center bg-neutral-900 transition-colors hover:bg-violet-500 shrink-0 ${
        isRow ? 'w-[4px] cursor-col-resize h-full' : 'h-[4px] cursor-row-resize w-full'
      }`}
    >
      <div className={`bg-neutral-700 rounded-full transition-all group-hover:bg-white ${
        isRow ? 'w-[2px] h-6' : 'h-[2px] w-6'
      }`} />
    </div>
  )
}

// ─── SplitContainer ───────────────────────────────────────────────────────────

function SplitContainer({ node }: { node: SplitNode }) {
  const isRow = node.dir === 'row'
  return (
    <div id={`split-${node.id}`} className={`flex h-full w-full overflow-hidden ${isRow ? 'flex-row' : 'flex-col'}`}>
      <div style={{ flexBasis: `${node.ratio}%`, flexGrow: 0, flexShrink: 0, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <LayoutRenderer node={node.a} />
      </div>
      <Resizer splitId={node.id} dir={node.dir} />
      <div style={{ flexBasis: `${100 - node.ratio}%`, flexGrow: 0, flexShrink: 0, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <LayoutRenderer node={node.b} />
      </div>
    </div>
  )
}

// ─── TabItem ──────────────────────────────────────────────────────────────────

function TabItem({ area, tab, idx }: { area: AreaNode; tab: Tab; idx: number }) {
  const { dispatch } = useLayout()
  const selectRef = useRef<HTMLSelectElement>(null)
  const isActive = idx === area.activeTab
  const meta = WIDGETS[tab.widgetId]
  const Icon = meta?.icon ?? ImageIcon

  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({ sourceAreaId: area.id, tabId: tab.id }))}
      onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', areaId: area.id, tabIndex: idx })}
      className={`group flex items-center gap-1.5 px-2 h-full border-r border-neutral-800 cursor-pointer min-w-[80px] max-w-[180px] shrink-0 transition-colors ${
        isActive
          ? 'bg-neutral-800 text-neutral-100 border-t-2 border-t-violet-500'
          : 'bg-neutral-900 border-t-2 border-t-transparent hover:bg-neutral-800/50 text-neutral-400'
      }`}
    >
      {/* Switch icon — invisible select overlaid on top opens the OS dropdown */}
      <div className="relative flex-none" title="Change panel type">
        <ChevronsUpDown size={10} className={isActive ? 'text-violet-400' : 'text-neutral-600 group-hover:text-neutral-400'} />
        <select
          ref={selectRef}
          value={tab.widgetId}
          onClick={e => e.stopPropagation()}
          onChange={e => {
            if (e.target.value === '__close__') {
              dispatch({ type: 'CLOSE_TAB', areaId: area.id, tabId: tab.id })
            } else {
              dispatch({ type: 'CHANGE_TAB_WIDGET', areaId: area.id, tabId: tab.id, widgetId: e.target.value })
            }
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          {Object.entries(WIDGETS).map(([key, w]) => (
            <option key={key} value={key}>{w.name}</option>
          ))}
          <option disabled>──────────</option>
          <option value="__close__">Close</option>
        </select>
      </div>

      <Icon size={12} className={isActive ? 'text-violet-400 shrink-0' : 'shrink-0'} />
      <span className="truncate text-xs flex-1">{tab.title}</span>
      <X
        size={11}
        className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', areaId: area.id, tabId: tab.id }) }}
      />
    </div>
  )
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

function TabBar({ area }: { area: AreaNode }) {
  const { dispatch } = useLayout()

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-violet-900/20')
    try {
      const d = JSON.parse(e.dataTransfer.getData('application/json'))
      if (d.sourceAreaId !== area.id)
        dispatch({ type: 'MOVE_TAB', sourceAreaId: d.sourceAreaId, targetAreaId: area.id, tabId: d.tabId })
    } catch { }
  }

  return (
    <div
      className="flex h-8 bg-neutral-900 border-b border-neutral-800 items-center shrink-0 overflow-hidden select-none"
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-violet-900/20') }}
      onDragLeave={e => e.currentTarget.classList.remove('bg-violet-900/20')}
      onDrop={onDrop}
    >
      <div className="flex flex-1 h-full overflow-x-auto min-w-0">
        {area.tabs.map((tab, idx) => (
          <TabItem key={tab.id} area={area} tab={tab} idx={idx} />
        ))}
        <select
          value=""
          onChange={e => {
            if (e.target.value) dispatch({ type: 'ADD_TAB', areaId: area.id, widgetId: e.target.value })
          }}
          className="h-full w-7 bg-transparent text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-light focus:outline-none cursor-pointer shrink-0 appearance-none text-center"
          title="Add panel"
        >
          <option value="" disabled>+</option>
          {Object.entries(WIDGETS).map(([key, w]) => (
            <option key={key} value={key}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center px-1 border-l border-neutral-800 h-full bg-neutral-900 shrink-0 gap-0.5">
        <button onClick={() => dispatch({ type: 'SPLIT_AREA', areaId: area.id, dir: 'row' })} className="p-1 hover:bg-neutral-700 rounded text-neutral-500 hover:text-white transition-colors" title="Split Right">
          <Columns size={12} />
        </button>
        <button onClick={() => dispatch({ type: 'SPLIT_AREA', areaId: area.id, dir: 'col' })} className="p-1 hover:bg-neutral-700 rounded text-neutral-500 hover:text-white transition-colors" title="Split Down">
          <Rows size={12} />
        </button>
        <button onClick={() => dispatch({ type: 'CLOSE_AREA', areaId: area.id })} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-neutral-500 transition-colors" title="Close Panel">
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── EmptyAreaState ───────────────────────────────────────────────────────────

function EmptyAreaState({ areaId }: { areaId: string }) {
  const { dispatch } = useLayout()
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 p-4 bg-neutral-950">
      <div className="flex flex-col items-center gap-2 text-neutral-600">
        <LayoutDashboard size={32} className="opacity-30" />
        <span className="text-xs">Empty Panel</span>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-[160px]">
        {Object.entries(WIDGETS).map(([key, meta]) => {
          const Icon = meta.icon
          return (
            <button
              key={key}
              onClick={() => dispatch({ type: 'ADD_TAB', areaId, widgetId: key })}
              className="flex items-center gap-2 p-2.5 bg-neutral-900 border border-neutral-800 hover:border-violet-500/50 hover:bg-neutral-800 rounded transition-all text-xs text-neutral-300"
            >
              <Icon size={14} className="text-violet-400 shrink-0" />
              {meta.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── AreaContainer ────────────────────────────────────────────────────────────

function AreaContainer({ node }: { node: AreaNode }) {
  const activeTab = node.tabs[node.activeTab]
  const Content = activeTab && WIDGETS[activeTab.widgetId]
    ? WIDGETS[activeTab.widgetId].Component
    : () => <EmptyAreaState areaId={node.id} />

  return (
    <div className="flex flex-col h-full w-full bg-neutral-950 overflow-hidden">
      <TabBar area={node} />
      <div className="flex-1 overflow-hidden relative min-h-0">
        <Content />
      </div>
    </div>
  )
}

// ─── Recursive Renderer ───────────────────────────────────────────────────────

function LayoutRenderer({ node }: { node: LayoutNode | null }) {
  if (!node) return null
  if (node.type === 'split') return <SplitContainer node={node} />
  return <AreaContainer node={node} />
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function layoutReducer(state: LayoutNode, action: LayoutAction): LayoutNode {
  switch (action.type) {
    case 'SPLIT_AREA':
      return splitNode(state, action.areaId, action.dir)

    case 'CLOSE_AREA': {
      const next = removeNode(state, action.areaId)
      return next ?? { id: genId(), type: 'area', tabs: [], activeTab: 0 }
    }

    case 'UPDATE_RATIO':
      return updateRatio(state, action.id, action.ratio)

    case 'ADD_TAB':
      return mutateArea(state, action.areaId, area => {
        const meta = WIDGETS[action.widgetId]
        const tab: Tab = { id: genId(), title: meta?.name ?? action.widgetId, widgetId: action.widgetId }
        return { ...area, tabs: [...area.tabs, tab], activeTab: area.tabs.length }
      })

    case 'CLOSE_TAB':
      return mutateArea(state, action.areaId, area => {
        const tabs = area.tabs.filter(t => t.id !== action.tabId)
        return { ...area, tabs, activeTab: Math.min(area.activeTab, Math.max(0, tabs.length - 1)) }
      })

    case 'SET_ACTIVE_TAB':
      return mutateArea(state, action.areaId, area => ({ ...area, activeTab: action.tabIndex }))

    case 'MOVE_TAB': {
      let extracted: Tab | null = null
      const next = mutateArea(state, action.sourceAreaId, area => {
        const idx = area.tabs.findIndex(t => t.id === action.tabId)
        if (idx < 0) return area
        extracted = area.tabs[idx]
        const tabs = area.tabs.filter((_, i) => i !== idx)
        return { ...area, tabs, activeTab: Math.min(area.activeTab, Math.max(0, tabs.length - 1)) }
      })
      if (!extracted) return state
      return mutateArea(next, action.targetAreaId, area => ({
        ...area, tabs: [...area.tabs, extracted!], activeTab: area.tabs.length,
      }))
    }

    case 'CHANGE_TAB_WIDGET':
      return mutateArea(state, action.areaId, area => ({
        ...area,
        tabs: area.tabs.map(t =>
          t.id === action.tabId
            ? { ...t, widgetId: action.widgetId, title: WIDGETS[action.widgetId]?.name ?? action.widgetId }
            : t
        ),
      }))

    default: return state
  }
}

// ─── Initial State ────────────────────────────────────────────────────────────

const INITIAL_STATE: LayoutNode = {
  id: 'root', type: 'split', dir: 'row', ratio: 8,
  a: {
    id: 'tools-panel', type: 'area',
    tabs: [{ id: 'tab-tools', title: 'Tools', widgetId: 'tools' }],
    activeTab: 0,
  },
  b: {
    id: 'workspace', type: 'split', dir: 'row', ratio: 76,
    a: {
      id: 'canvas-panel', type: 'area',
      tabs: [{ id: 'tab-canvas', title: 'Canvas', widgetId: 'canvas' }],
      activeTab: 0,
    },
    b: {
      id: 'right-col', type: 'split', dir: 'col', ratio: 50,
      a: {
        id: 'props-panel', type: 'area',
        tabs: [{ id: 'tab-props', title: 'Properties', widgetId: 'properties' }],
        activeTab: 0,
      },
      b: {
        id: 'layers-panel', type: 'area',
        tabs: [{ id: 'tab-layers', title: 'Layers', widgetId: 'layers' }],
        activeTab: 0,
      },
    },
  },
}

// ─── Layout Root (export) ─────────────────────────────────────────────────────

export function LayoutRoot() {
  const [layout, dispatch] = useReducer(layoutReducer, INITIAL_STATE)
  return (
    <LayoutContext.Provider value={{ layout, dispatch }}>
      <div className="flex-1 min-h-0 overflow-hidden">
        <LayoutRenderer node={layout} />
      </div>
    </LayoutContext.Provider>
  )
}
