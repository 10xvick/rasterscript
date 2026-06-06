import { useState, useRef, useCallback } from 'react'
import { Terminal, Plus, Trash2, Play, ChevronDown, ChevronRight } from 'lucide-react'
import Editor from '@monaco-editor/react'
import type { EditorPlugin, PluginPanelProps, UserScript } from '../../core/types'
import { buildScriptAPI, runScript } from '../../core/ScriptRunner'
import { BUILTIN_SCRIPTS } from './builtins'
import { useEditorStore } from '../../store/useEditorStore'

// ─── Script Panel ─────────────────────────────────────────────────────────────

function ScriptPanel({ context }: PluginPanelProps) {
  const { scripts, saveScript, deleteScript } = useEditorStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('My Script')
  const [logs, setLogs] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [builtinsOpen, setBuiltinsOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(96)
  const logRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startY: number; startH: number } | null>(null)

  const log = useCallback((...args: unknown[]) => {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
    setLogs(prev => {
      const next = [...prev, line]
      setTimeout(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, 50)
      return next
    })
  }, [])

  const openScript = (scriptCode: string, scriptName: string, id?: string) => {
    setCode(scriptCode)
    setName(scriptName)
    setActiveId(id ?? null)
    setLogs([])
  }

  const handleRun = async () => {
    if (!code.trim()) return
    setRunning(true)
    setLogs([`▶ Running "${name}"...`])
    try {
      const api = buildScriptAPI(context, log)
      await runScript(code, api)
      setLogs(prev => [...prev, '✓ Script completed.'])
    } catch (err) {
      setLogs(prev => [...prev, `✗ Error: ${(err as Error).message}`])
    } finally {
      setRunning(false)
    }
  }

  const handleSave = () => {
    const script: UserScript = {
      id: activeId ?? `script-${Date.now()}`,
      name,
      code,
      createdAt: Date.now(),
    }
    saveScript(script)
    setActiveId(script.id)
  }

  const handleNew = () => {
    openScript('// Write your script here\n// You have access to `api` — see docs in builtins\n\napi.log("Hello from custom script!");\n', 'Untitled Script')
  }

  const sectionBtn = (label: string, open: boolean, toggle: () => void) => (
    <button
      onClick={toggle}
      className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 w-full text-left py-1"
    >
      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Script list ─────────────────────────────────────────────────────── */}
      <div className="flex-none border-b border-neutral-700 p-2 space-y-1 max-h-52 overflow-y-auto">
        {sectionBtn('Built-in scripts', builtinsOpen, () => setBuiltinsOpen(v => !v))}
        {builtinsOpen && BUILTIN_SCRIPTS.map(s => (
          <button key={s.id}
            onClick={() => openScript(s.code, s.name)}
            className="w-full text-left px-2 py-1 rounded text-xs hover:bg-neutral-700 text-neutral-300"
            title={s.description}
          >
            {s.name}
          </button>
        ))}

        <div className="pt-1">
          {sectionBtn('Saved scripts', savedOpen, () => setSavedOpen(v => !v))}
          {savedOpen && scripts.length === 0 && (
            <p className="text-xs text-neutral-500 px-2">No saved scripts yet.</p>
          )}
          {savedOpen && scripts.map(s => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => openScript(s.code, s.name, s.id)}
                className={`flex-1 text-left px-2 py-1 rounded text-xs hover:bg-neutral-700 ${activeId === s.id ? 'bg-neutral-700 text-violet-300' : 'text-neutral-300'}`}
              >
                {s.name}
              </button>
              <button onClick={() => deleteScript(s.id)}
                className="p-1 rounded hover:bg-red-900 text-neutral-500 hover:text-red-300"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Editor area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-2 py-1 border-b border-neutral-700">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1 bg-transparent text-xs text-neutral-300 focus:outline-none"
            placeholder="Script name"
          />
          <button onClick={handleNew} title="New script"
            className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200">
            <Plus size={13} />
          </button>
          <button onClick={handleSave}
            className="px-2 py-0.5 rounded text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200">
            Save
          </button>
          <button onClick={handleRun} disabled={running || !code.trim()}
            className="px-2 py-0.5 rounded text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 font-medium flex items-center gap-1">
            <Play size={11} />{running ? 'Running…' : 'Run'}
          </button>
        </div>

        <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
          <Editor
            height="100%"
            language="javascript"
            theme="vs-dark"
            value={code}
            onChange={v => setCode(v ?? '')}
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              fixedOverflowWidgets: true,
            }}
          />
        </div>

        {/* ── Console resize handle ─────────────────────────────────────── */}
        <div
          className="flex-none h-1.5 bg-neutral-800 hover:bg-violet-600 cursor-ns-resize transition-colors group"
          title="Drag to resize console"
          onPointerDown={e => {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            dragState.current = { startY: e.clientY, startH: consoleHeight }
          }}
          onPointerMove={e => {
            if (!dragState.current) return
            const delta = dragState.current.startY - e.clientY
            setConsoleHeight(Math.max(32, Math.min(500, dragState.current.startH + delta)))
          }}
          onPointerUp={() => { dragState.current = null }}
        />
        {/* ── Console output ──────────────────────────────────────────────── */}
        <div
          ref={logRef}
          style={{ height: consoleHeight }}
          className="flex-none overflow-y-auto bg-neutral-950 p-2 font-mono text-xs"
        >
          {logs.length === 0
            ? <span className="text-neutral-600">Console output will appear here…</span>
            : logs.map((l, i) => (
              <div key={i} className={l.startsWith('✗') ? 'text-red-400' : l.startsWith('✓') ? 'text-green-400' : 'text-neutral-300'}>
                {l}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

export const scriptPlugin: EditorPlugin = {
  id: 'script',
  name: 'Scripts',
  icon: <Terminal size={18} />,
  category: 'script',
  Panel: ScriptPanel,
}
