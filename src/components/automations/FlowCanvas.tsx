import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChatCircleText, Flag, GitFork, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  TRIGGER_ID,
  connect,
  describeNode,
  disconnect,
  edgeKey,
  isMessage,
  moveNode,
  removeNode,
  type FlowGraph,
  type FlowPort,
  type NewBlockKind,
} from '../../lib/automationFlows'

type CanvasNodeData = {
  kind: 'trigger' | 'message' | 'condition'
  title: string
  body: string
  dim: boolean
  // The exits that lead nowhere yet; each shows a "+" to add the next step there.
  openPorts: FlowPort[]
  // The exit whose "add" menu is open, if any.
  menuPort: FlowPort | null
  onPlus: (nodeId: string, port: FlowPort) => void
  onPick: (nodeId: string, port: FlowPort, kind: NewBlockKind) => void
  [key: string]: unknown
}

const handleStyle = { width: 14, height: 14, background: '#fff', border: '2px solid #64748b' }
const yesHandleStyle = { ...handleStyle, top: '60%' }
const noHandleStyle = { ...handleStyle, top: '88%' }

const PICKS: { kind: NewBlockKind; label: string; hint: string }[] = [
  { kind: 'message', label: 'Send a message', hint: 'A WhatsApp message to approve' },
  { kind: 'age', label: 'Check the age', hint: 'Split by the child’s age' },
  { kind: 'classroom', label: 'Check the class', hint: 'Split by the class' },
]

// The "+" after a card, and the small menu it opens. It sits to the right of the exit it belongs to.
function AddAfter({
  nodeId,
  port,
  top,
  data,
  label,
}: {
  nodeId: string
  port: FlowPort
  top: string
  data: CanvasNodeData
  label?: string
}) {
  if (!data.openPorts.includes(port)) {
    return null
  }
  const open = data.menuPort === port
  return (
    <div className="nodrag nopan absolute left-full flex items-center" style={{ top, transform: 'translateY(-50%)' }}>
      <span className="h-px w-5 border-t border-dashed border-slate-400" aria-hidden="true" />
      <button
        type="button"
        aria-label={label ? `Add the next step after ${label}` : 'Add the next step'}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          data.onPlus(nodeId, port)
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-[#fc0c97] hover:text-[#fc0c97]"
      >
        <Plus size={14} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-9 z-10 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {PICKS.map((pick) => (
            <li key={pick.kind} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation()
                  data.onPick(nodeId, port, pick.kind)
                }}
                className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="block text-sm font-semibold text-slate-900">{pick.label}</span>
                <span className="block text-xs text-slate-500">{pick.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function shell(selected: boolean | undefined, dim: boolean) {
  return cn(
    'w-[210px] rounded-xl border bg-white text-xs shadow-sm',
    selected ? 'border-2 border-[#fc0c97]' : 'border-slate-300',
    dim && 'opacity-35',
  )
}

// The blocks are memoised: while one is dragged the others are not drawn again.
const TriggerNode = memo(function TriggerNode({ id, data, selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div className={shell(selected, data.dim)}>
      <div className="flex items-center gap-1.5 rounded-t-[10px] bg-[#fff1f8] px-3 py-1.5 font-semibold text-[#be185d]">
        <Flag size={14} weight="fill" aria-hidden="true" />
        When
      </div>
      <p className="px-3 py-2 text-sm font-medium text-slate-800">{data.body}</p>
      <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
      <AddAfter nodeId={id} port="out" top="50%" data={data} label="the trigger" />
    </div>
  )
})

const ConditionNode = memo(function ConditionNode({ id, data, selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div className={shell(selected, data.dim)}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flex items-center gap-1.5 rounded-t-[10px] bg-amber-50 px-3 py-1.5 font-semibold text-amber-800">
        <GitFork size={14} weight="fill" aria-hidden="true" />
        If
      </div>
      <p className="px-3 pb-8 pt-2 text-sm font-medium text-slate-800">{data.body}</p>
      <span className="absolute right-4 top-[52%] text-[11px] font-semibold text-emerald-700">Yes</span>
      <span className="absolute bottom-1.5 right-4 text-[11px] font-semibold text-slate-500">No</span>
      <Handle type="source" position={Position.Right} id="yes" style={yesHandleStyle} />
      <Handle type="source" position={Position.Right} id="no" style={noHandleStyle} />
      <AddAfter nodeId={id} port="yes" top="60%" data={data} label="Yes" />
      <AddAfter nodeId={id} port="no" top="88%" data={data} label="No" />
    </div>
  )
})

const MessageNode = memo(function MessageNode({ id, data, selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div className={shell(selected, data.dim)}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flex items-center gap-1.5 rounded-t-[10px] bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">
        <ChatCircleText size={14} weight="fill" aria-hidden="true" />
        Send · {data.title}
      </div>
      <p className="line-clamp-3 px-3 py-2 text-slate-600">{data.body || 'Write the message…'}</p>
      <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
      <AddAfter nodeId={id} port="out" top="50%" data={data} label="this message" />
    </div>
  )
})

const nodeTypes = { trigger: TriggerNode, condition: ConditionNode, message: MessageNode }
const fitViewOptions = { padding: 0.2, maxZoom: 1 }
const deleteKeys = ['Backspace', 'Delete']

export type CanvasHighlight = { nodes: Set<string>; edges: Set<string> }

type FlowCanvasProps = {
  graph: FlowGraph
  // The trigger as it reads in the first block.
  triggerLabel: string
  selectedId: string | null
  classroomName: (id: number) => string
  // What a test child would walk through; null shows everything normally.
  highlight: CanvasHighlight | null
  readOnly: boolean
  onGraphChange: (graph: FlowGraph) => void
  onSelect: (id: string | null) => void
  // The "+" after a card: add a block of this kind after the given exit of the given card.
  onAddAfter: (from: string, port: FlowPort, kind: NewBlockKind) => void
}

// The drag-and-drop canvas. The graph is the source of truth, but while a block is being dragged the
// canvas moves it on its own and tells the graph only when the drag ends, so the rest of the page
// is not drawn again on every mouse move.
export function FlowCanvas({
  graph,
  triggerLabel,
  selectedId,
  classroomName,
  highlight,
  readOnly,
  onGraphChange,
  onSelect,
  onAddAfter,
}: FlowCanvasProps) {
  // The line that was clicked; Delete (or the Remove line button) takes it away.
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // The exit whose "+" menu is open.
  const [adding, setAdding] = useState<{ from: string; port: FlowPort } | null>(null)

  // The blocks hold these two; they stay the same function so a block is not drawn again for them.
  const addRef = useRef(onAddAfter)
  useEffect(() => {
    addRef.current = onAddAfter
  }, [onAddAfter])
  // When a block is added the whole flow is brought back into view, so the new block is not off screen.
  const flowRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null)
  const blockCount = useRef(graph.nodes.length)
  useEffect(() => {
    const grew = graph.nodes.length > blockCount.current
    blockCount.current = graph.nodes.length
    if (!grew) {
      return
    }
    const timer = window.setTimeout(() => void flowRef.current?.fitView({ ...fitViewOptions, duration: 250 }), 80)
    return () => window.clearTimeout(timer)
  }, [graph.nodes.length])

  const onPlus = useCallback((from: string, port: FlowPort) => {
    setAdding((current) => (current?.from === from && current.port === port ? null : { from, port }))
  }, [])
  const onPick = useCallback((from: string, port: FlowPort, kind: NewBlockKind) => {
    setAdding(null)
    addRef.current(from, port, kind)
  }, [])

  const derived = useMemo<Node<CanvasNodeData>[]>(() => {
    const dims = (id: string) => highlight !== null && !highlight.nodes.has(id)
    // The exits with nothing after them: only these show a "+".
    const openPorts = (id: string, ports: FlowPort[]) =>
      readOnly ? [] : ports.filter((port) => !graph.edges.some((edge) => edge.from === id && edge.port === port))
    const common = (id: string, ports: FlowPort[]) => ({
      dim: dims(id),
      openPorts: openPorts(id, ports),
      menuPort: adding?.from === id ? adding.port : null,
      onPlus,
      onPick,
    })
    const list: Node<CanvasNodeData>[] = [
      {
        id: TRIGGER_ID,
        type: 'trigger',
        position: graph.trigger,
        data: { kind: 'trigger', title: 'When', body: triggerLabel, ...common(TRIGGER_ID, ['out']) },
        deletable: false,
        selected: selectedId === TRIGGER_ID && selectedEdge === null,
        zIndex: adding?.from === TRIGGER_ID ? 20 : undefined,
      },
    ]
    for (const node of graph.nodes) {
      list.push({
        id: node.id,
        type: isMessage(node) ? 'message' : 'condition',
        position: { x: node.x, y: node.y },
        data: isMessage(node)
          ? { kind: 'message', title: describeNode(node), body: node.text, ...common(node.id, ['out']) }
          : {
              kind: 'condition',
              title: 'If',
              body: describeNode(node, classroomName),
              ...common(node.id, ['yes', 'no']),
            },
        selected: selectedId === node.id && selectedEdge === null,
        // A menu that is open sits above the other blocks.
        zIndex: adding?.from === node.id ? 20 : undefined,
      })
    }
    return list
  }, [graph, triggerLabel, selectedId, selectedEdge, classroomName, highlight, readOnly, adding, onPlus, onPick])

  const [nodes, setNodes] = useState<Node<CanvasNodeData>[]>(derived)
  useEffect(() => {
    // Keep the sizes the canvas already measured so a block does not flicker when its text changes.
    setNodes((previous) =>
      derived.map((node) => {
        const old = previous.find((entry) => entry.id === node.id)
        return old ? { ...node, measured: old.measured, width: old.width, height: old.height } : node
      }),
    )
  }, [derived])

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => {
        const key = edgeKey(edge)
        const on = highlight?.edges.has(key) ?? false
        const picked = key === selectedEdge
        const color = on || picked ? '#fc0c97' : '#94a3b8'
        return {
          id: key,
          source: edge.from,
          sourceHandle: edge.port,
          target: edge.to,
          animated: on,
          selected: picked,
          style: {
            stroke: color,
            strokeWidth: on || picked ? 2.5 : 1.5,
            opacity: highlight && !on && !picked ? 0.35 : 1,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        }
      }),
    [graph.edges, highlight, selectedEdge],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Moves and measurements stay inside the canvas until the drag ends.
      setNodes((current) => applyNodeChanges(changes, current) as Node<CanvasNodeData>[])
      let next = graph
      for (const change of changes) {
        if (change.type === 'remove' && change.id !== TRIGGER_ID) {
          next = removeNode(next, change.id)
        }
      }
      if (next !== graph) {
        onGraphChange(next)
      }
    },
    [graph, onGraphChange],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) => {
      let next = graph
      for (const node of dragged) {
        next = moveNode(next, node.id, Math.round(node.position.x), Math.round(node.position.y))
      }
      if (next !== graph) {
        onGraphChange(next)
      }
    },
    [graph, onGraphChange],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let next = graph
      for (const change of changes) {
        if (change.type === 'remove') {
          next = disconnect(next, change.id)
          setSelectedEdge((current) => (current === change.id ? null : current))
        }
      }
      if (next !== graph) {
        onGraphChange(next)
      }
    },
    [graph, onGraphChange],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return
      }
      const next = connect(graph, {
        from: connection.source,
        port: (connection.sourceHandle ?? 'out') as FlowPort,
        to: connection.target,
      })
      if (next !== graph) {
        onGraphChange(next)
      }
    },
    [graph, onGraphChange],
  )

  return (
    <div className="h-full min-h-[340px] w-full bg-slate-50" data-flow-canvas>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flowRef.current = instance
        }}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          setSelectedEdge(null)
          setAdding(null)
          onSelect(node.id)
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdge(edge.id)
          setAdding(null)
          onSelect(null)
        }}
        onPaneClick={() => {
          setSelectedEdge(null)
          setAdding(null)
          onSelect(null)
        }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={readOnly ? null : deleteKeys}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background gap={18} />
        <Controls showInteractive={false} />
        {selectedEdge !== null && !readOnly && (
          <Panel position="top-right">
            <button
              type="button"
              onClick={() => {
                onGraphChange(disconnect(graph, selectedEdge))
                setSelectedEdge(null)
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Remove line
            </button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}
