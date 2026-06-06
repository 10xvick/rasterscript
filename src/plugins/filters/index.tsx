import { useState, useRef, useEffect } from 'react'
import { Sliders } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps } from '../../core/types'

// ─── Filter functions ──────────────────────────────────────────────────────────

function brightness(d: Uint8ClampedArray, v: number) {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i]+v); d[i+1] = Math.min(255, d[i+1]+v); d[i+2] = Math.min(255, d[i+2]+v)
  }
}
function contrast(d: Uint8ClampedArray, v: number) {
  const f = (259*(v+255))/(255*(259-v))
  for (let i = 0; i < d.length; i += 4) {
    d[i]  =Math.min(255,Math.max(0,f*(d[i]  -128)+128))
    d[i+1]=Math.min(255,Math.max(0,f*(d[i+1]-128)+128))
    d[i+2]=Math.min(255,Math.max(0,f*(d[i+2]-128)+128))
  }
}
function saturation(d: Uint8ClampedArray, v: number) {
  const s = 1+v/100
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]
    d[i]  =Math.min(255,Math.max(0,g+s*(d[i]  -g)))
    d[i+1]=Math.min(255,Math.max(0,g+s*(d[i+1]-g)))
    d[i+2]=Math.min(255,Math.max(0,g+s*(d[i+2]-g)))
  }
}
function grayscale(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) { const g=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; d[i]=d[i+1]=d[i+2]=g }
}
function invert(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) { d[i]=255-d[i]; d[i+1]=255-d[i+1]; d[i+2]=255-d[i+2] }
}
function sepia(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const r=d[i],g=d[i+1],b=d[i+2]
    d[i]=Math.min(255,r*.393+g*.769+b*.189); d[i+1]=Math.min(255,r*.349+g*.686+b*.168); d[i+2]=Math.min(255,r*.272+g*.534+b*.131)
  }
}

// ─── Curve interpolation (monotone cubic / Fritsch-Carlson) ───────────────────

type Pt = { x: number; y: number }

function monotoneInterp(pts: Pt[], x: number): number {
  const n = pts.length
  if (!n) return x
  if (x <= pts[0].x) return pts[0].y
  if (x >= pts[n-1].x) return pts[n-1].y
  let i = 0; while (i < n-2 && pts[i+1].x < x) i++
  const h = pts[i+1].x-pts[i].x || 1e-10
  const t = (x-pts[i].x)/h
  if (n === 2) return pts[i].y+t*(pts[i+1].y-pts[i].y)
  const m: number[] = []
  for (let j=0;j<n-1;j++) m.push((pts[j+1].y-pts[j].y)/((pts[j+1].x-pts[j].x)||1e-10))
  const tk: number[] = [m[0]]
  for (let j=1;j<n-1;j++) tk.push((m[j-1]+m[j])/2)
  tk.push(m[n-2])
  for (let j=0;j<n-1;j++) {
    if (Math.abs(m[j])<1e-10) { tk[j]=tk[j+1]=0; continue }
    const a=tk[j]/m[j], b=tk[j+1]/m[j], s=a*a+b*b
    if (s>9) { tk[j]=3/Math.sqrt(s)*a*m[j]; tk[j+1]=3/Math.sqrt(s)*b*m[j] }
  }
  const t2=t*t,t3=t2*t
  return (2*t3-3*t2+1)*pts[i].y+(t3-2*t2+t)*h*tk[i]+(-2*t3+3*t2)*pts[i+1].y+(t3-t2)*h*tk[i+1]
}

function buildLUT(pts: Pt[]): Uint8Array {
  const s=[...pts].sort((a,b)=>a.x-b.x)
  const lut=new Uint8Array(256)
  for (let i=0;i<256;i++) lut[i]=Math.min(255,Math.max(0,Math.round(monotoneInterp(s,i/255)*255)))
  return lut
}
function applyLUT(d: Uint8ClampedArray, lut: Uint8Array) {
  for (let i=0;i<d.length;i+=4) { d[i]=lut[d[i]]; d[i+1]=lut[d[i+1]]; d[i+2]=lut[d[i+2]] }
}

const PRESETS: Record<string, Pt[]> = {
  'Linear':        [{x:0,y:0},{x:1,y:1}],
  'S-Curve':       [{x:0,y:0},{x:.25,y:.15},{x:.75,y:.85},{x:1,y:1}],
  'Lighten':       [{x:0,y:0},{x:.5,y:.65},{x:1,y:1}],
  'Darken':        [{x:0,y:0},{x:.5,y:.35},{x:1,y:1}],
  'High Contrast': [{x:0,y:0},{x:.2,y:.05},{x:.8,y:.95},{x:1,y:1}],
  'Matte':         [{x:0,y:.08},{x:1,y:.92}],
  'Negative':      [{x:0,y:1},{x:1,y:0}],
}

// ─── CurveEditor component ────────────────────────────────────────────────────

const SZ = 180

function CurveEditor({ pts, onChange }: { pts: Pt[]; onChange: (p: Pt[]) => void }) {
  const ref  = useRef<HTMLCanvasElement>(null)
  const drag = useRef<number | null>(null)

  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const c = cv.getContext('2d')!
    const sorted = [...pts].sort((a,b)=>a.x-b.x)
    c.fillStyle='#141414'; c.fillRect(0,0,SZ,SZ)
    c.strokeStyle='#252525'; c.lineWidth=0.5
    for (let i=1;i<4;i++) {
      c.beginPath(); c.moveTo(i*SZ/4,0); c.lineTo(i*SZ/4,SZ); c.stroke()
      c.beginPath(); c.moveTo(0,i*SZ/4); c.lineTo(SZ,i*SZ/4); c.stroke()
    }
    c.strokeStyle='#2e2e2e'; c.lineWidth=1
    c.beginPath(); c.moveTo(0,SZ); c.lineTo(SZ,0); c.stroke()
    c.strokeStyle='#a78bfa'; c.lineWidth=1.5; c.beginPath()
    for (let i=0;i<=240;i++) {
      const t=i/240, v=monotoneInterp(sorted,t)
      i===0 ? c.moveTo(t*SZ,(1-v)*SZ) : c.lineTo(t*SZ,(1-v)*SZ)
    }
    c.stroke()
    sorted.forEach(p => {
      c.fillStyle='#7c3aed'; c.beginPath(); c.arc(p.x*SZ,(1-p.y)*SZ,5,0,Math.PI*2); c.fill()
      c.fillStyle='#a78bfa'; c.beginPath(); c.arc(p.x*SZ,(1-p.y)*SZ,3,0,Math.PI*2); c.fill()
    })
  }, [pts])

  const ptFrom = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r=ref.current!.getBoundingClientRect()
    return { x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)), y:Math.min(1,Math.max(0,1-(e.clientY-r.top)/r.height)) }
  }
  const onDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const pt=ptFrom(e)
    const HIT = 0.07
    let ci=-1, md=HIT
    pts.forEach((p,i)=>{ const d=Math.hypot(p.x-pt.x,p.y-pt.y); if(d<md){md=d;ci=i} })
    if (ci>=0) { drag.current=ci } else { onChange([...pts,pt]); drag.current=pts.length }
  }
  const onMove = (e: React.PointerEvent) => {
    if (drag.current===null) return
    const n=[...pts]; n[drag.current]=ptFrom(e); onChange(n)
  }
  const onUp = () => { drag.current=null }
  const onDbl = (e: React.MouseEvent) => {
    if (pts.length<=2) return
    const pt=ptFrom(e)
    const HIT = 0.07
    let ci=-1, md=HIT
    pts.forEach((p,i)=>{ const d=Math.hypot(p.x-pt.x,p.y-pt.y); if(d<md){md=d;ci=i} })
    if (ci>=0) onChange(pts.filter((_,i)=>i!==ci))
  }

  return (
    <canvas ref={ref} width={SZ} height={SZ}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDbl}
      className="rounded block w-full cursor-crosshair" style={{touchAction:'none'}} />
  )
}

// ─── FiltersPanel ─────────────────────────────────────────────────────────────

function FiltersPanel({ context }: PluginPanelProps) {
  const [tab, setTab]   = useState<'adjust'|'curves'>('adjust')
  const [bright, setBright] = useState(0)
  const [cont,   setCont]   = useState(0)
  const [sat,    setSat]    = useState(0)
  const [curvePts, setCurvePts] = useState<Pt[]>([{x:0,y:0},{x:1,y:1}])
  const origRef = useRef<ImageData | null>(null)

  const origCopy = () => {
    if (!origRef.current) origRef.current = context.getImageData()
    const o = origRef.current
    return new ImageData(new Uint8ClampedArray(o.data), o.width, o.height)
  }

  const previewAdjust = (b=bright, c=cont, s=sat) => {
    const copy = origCopy()
    if (b!==0) brightness(copy.data, b)
    if (c!==0) contrast(copy.data, c)
    if (s!==0) saturation(copy.data, s)
    context.setImageData(copy, false)
  }

  const previewCurve = (pts: Pt[]) => {
    const copy = origCopy()
    applyLUT(copy.data, buildLUT(pts))
    context.setImageData(copy, false)
  }

  const applyAdjust = () => {
    const copy = origCopy()
    if (bright!==0) brightness(copy.data, bright)
    if (cont!==0)   contrast(copy.data, cont)
    if (sat!==0)    saturation(copy.data, sat)
    context.setImageData(copy, true)
    origRef.current = null
  }

  const applyCurve = () => {
    const copy = origCopy()
    applyLUT(copy.data, buildLUT(curvePts))
    context.setImageData(copy, true)
    origRef.current = null
  }

  const reset = () => {
    if (origRef.current) {
      const o=origRef.current
      context.setImageData(new ImageData(new Uint8ClampedArray(o.data),o.width,o.height), false)
      origRef.current = null
    }
    setBright(0); setCont(0); setSat(0); setCurvePts([{x:0,y:0},{x:1,y:1}])
  }

  const quickApply = (fn: (d: Uint8ClampedArray) => void) => {
    if (origRef.current) {
      const o=origRef.current
      context.setImageData(new ImageData(new Uint8ClampedArray(o.data),o.width,o.height), false)
      origRef.current = null
    }
    setBright(0); setCont(0); setSat(0)
    const data = context.getImageData(); fn(data.data); context.setImageData(data, true)
  }

  const sl = 'w-full accent-violet-500 h-1.5'
  const lbl = 'text-xs text-neutral-400 flex justify-between mb-1'

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex border-b border-neutral-800 shrink-0">
        {(['adjust','curves'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs transition-colors ${ tab===t ? 'text-violet-400 border-b-2 border-violet-500 bg-neutral-800/40' : 'text-neutral-500 hover:text-neutral-300' }`}>
            {t === 'adjust' ? 'Adjustments' : 'Curves'}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3">
        {tab === 'adjust' && (
          <>
            {([
              ['Brightness', bright, (v:number)=>{setBright(v); previewAdjust(v,cont,sat)}, -100, 100],
              ['Contrast',   cont,   (v:number)=>{setCont(v);   previewAdjust(bright,v,sat)}, -100, 100],
              ['Saturation', sat,    (v:number)=>{setSat(v);    previewAdjust(bright,cont,v)}, -100, 100],
            ] as [string, number, (v:number)=>void, number, number][]).map(([label, val, set, mn, mx]) => (
              <div key={label}>
                <div className={lbl}><span>{label}</span><span className="tabular-nums">{val > 0 ? `+${val}` : val}</span></div>
                <input type="range" min={mn} max={mx} value={val}
                  onChange={e => set(Number(e.target.value))} className={sl} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={applyAdjust}
                className="flex-1 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors">
                Apply
              </button>
              <button onClick={reset}
                className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors">
                Reset
              </button>
            </div>
            <div className="border-t border-neutral-800 pt-3">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Quick effects</p>
              <div className="flex flex-wrap gap-1.5">
                {([['Grayscale',grayscale],['Invert',invert],['Sepia',sepia]] as [string,(d:Uint8ClampedArray)=>void][]).map(([name,fn]) => (
                  <button key={name} onClick={() => quickApply(fn)}
                    className="px-2.5 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors">{name}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'curves' && (
          <>
            <CurveEditor pts={curvePts} onChange={pts => { setCurvePts(pts); previewCurve(pts) }} />
            <p className="text-[10px] text-neutral-600">Click to add · Double-click to remove</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(PRESETS).map(([name, pts]) => (
                <button key={name} onClick={() => { setCurvePts(pts); previewCurve(pts) }}
                  className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-violet-600 text-[10px] transition-colors">
                  {name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={applyCurve}
                className="flex-1 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors">
                Apply
              </button>
              <button onClick={reset}
                className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors">
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export const filtersPlugin: EditorPlugin = {
  id: 'filters',
  name: 'Filters',
  icon: <Sliders size={18} />,
  category: 'filter',
  Panel: FiltersPanel,
}
