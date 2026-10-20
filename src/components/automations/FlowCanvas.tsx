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
import { ChatCircleText, Flag, GitFork, Lightning, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  TRIGGER_ID,
  connect,
  describeAction,
  describeNode,
  type ChoiceKind,
  disconnect,
  edgeKey,
  isAction,
  isMessage,
  moveNode,
  removeNode,
  type FlowGraph,
  type FlowPort,
} from '../../lib/automationFlows'
import { brand } from '../../lib/brand'

type CanvasNodeData = {
  kind: 'trigger' | 'message' | 'action' | 'condition'
  title: string
  body: string
  dim: boolean
  // The exits that lead nowhere yet; each shows a "+" to add the next step there.
  openPorts: FlowPort[]
  // The exit whose "add a step" panel is open, if any.
  menuPort: FlowPort | null
  // What the Yes and No exits are called ("Replied" / "No reply" on a wait block).
  yesLabel?: string
  noLabel?: string
  onPlus: (nodeId: string, port: FlowPort) => void
  [key: string]: unknown
}

const handleStyle = { width: 14, height: 14, background: '#fff', border: '2px solid #64748b' }
const yesHandleStyle = { ...handleStyle, top: '60%' }
const noHandleStyle = { ...handleStyle, top: '88%' }

// The "+" after a card. It sits to the right of the exit it belongs to; the steps to add are listed in
// the panel on the right of the page.
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
        {data.title}
      </div>
      <p className="px-3 pb-8 pt-2 text-sm font-medium text-slate-800">{data.body}</p>
      <span className="absolute right-4 top-[52%] text-[11px] font-semibold text-emerald-700">
        {data.yesLabel ?? 'Yes'}
      </span>
      <span className="absolute bottom-1.5 right-4 text-[11px] font-semibold text-slate-500">
        {data.noLabel ?? 'No'}
      </span>
      <Handle type="source" position={Position.Right} id="yes" style={yesHandleStyle} />
      <Handle type="source" position={Position.Right} id="no" style={noHandleStyle} />
      <AddAfter nodeId={id} port="yes" top="60%" data={data} label={data.yesLabel ?? 'Yes'} />
      <AddAfter nodeId={id} port="no" top="88%" data={data} label={data.noLabel ?? 'No'} />
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

// A step that changes the lead (add a tag, assign a PIC, change the stage): nothing is sent.
const ActionNode = memo(function ActionNode({ id, data, selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div className={shell(selected, data.dim)}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flex items-center gap-1.5 rounded-t-[10px] bg-violet-50 px-3 py-1.5 font-semibold text-violet-800">
        <Lightning size={14} weight="fill" aria-hidden="true" />
        Do · {data.title}
      </div>
      <p className="line-clamp-3 px-3 py-2 text-slate-700">{data.body}</p>
      <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
      <AddAfter nodeId={id} port="out" top="50%" data={data} label="this step" />
    </div>
  )
})

const nodeTypes = { trigger: TriggerNode, condition: ConditionNode, message: MessageNode, action: ActionNode }
const fitViewOptions = { padding: 0.2, maxZoom: 1 }
const deleteKeys = ['Backspace', 'Delete']

export type CanvasHighlight = { nodes: Set<string>; edges: Set<string> }

type FlowCanvasProps = {
  graph: FlowGraph
  // The trigger as it reads in the first block.
  triggerLabel: string
  selectedId: string | null
  classroomName: (id: number) => string
  // The name of a saved contact, for a message that goes to one.
  contactName: (id: number) => string
  choiceName: (kind: ChoiceKind, id: string) => string
  // What a test child would walk through; null shows everything normally.
  highlight: CanvasHighlight | null
  readOnly: boolean
  onGraphChange: (graph: FlowGraph) => void
  onSelect: (id: string | null) => void
  // The exit whose "+" was pressed (the panel on the right lists what can be added there).
  adding: { from: string; port: FlowPort } | null
  onAdding: (target: { from: string; port: FlowPort } | null) => void
}

// The drag-and-drop canvas. The graph is the source of truth, but while a block is being dragged the
// canvas moves it on its own and tells the graph only when the drag ends, so the rest of the page
// is not drawn again on every mouse move.
export function FlowCanvas({
  graph,
  triggerLabel,
  selectedId,
  classroomName,
  contactName,
  choiceName,
  highlight,
  readOnly,
  onGraphChange,
  onSelect,
  adding,
  onAdding,
}: FlowCanvasProps) {
  // The line that was clicked; Delete (or the Remove line button) takes it away.
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // The blocks hold this; it stays the same function so a block is not drawn again for it.
  const addingRef = useRef(adding)
  const onAddingRef = useRef(onAdding)
  useEffect(() => {
    addingRef.current = adding
    onAddingRef.current = onAdding
  }, [adding, onAdding])
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
    const current = addingRef.current
    onAddingRef.current(current?.from === from && current.port === port ? null : { from, port })
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
    })
    const list: Node<CanvasNodeData>[] = [
      {
        id: TRIGGER_ID,
        type: 'trigger',
        position: graph.trigger,
        data: { kind: 'trigger', title: 'When', body: triggerLabel, ...common(TRIGGER_ID, ['out']) },
        deletable: false,
        selected: selectedId === TRIGGER_ID && selectedEdge === null,
      },
    ]
    for (const node of graph.nodes) {
      list.push({
        id: node.id,
        type: isMessage(node) ? 'message' : isAction(node) ? 'action' : 'condition',
        position: { x: node.x, y: node.y },
        data: isMessage(node)
          ? { kind: 'message', title: describeNode(node, classroomName, contactName, choiceName), body: node.text, ...common(node.id, ['out']) }
          : isAction(node)
            ? {
                kind: 'action',
                title: describeNode(node),
                body: describeAction(node, choiceName),
                ...common(node.id, ['out']),
              }
          : {
              kind: 'condition',
              title: node.kind === 'wait' ? 'Wait' : 'If',
              body: describeNode(node, classroomName, undefined, choiceName),
              ...(node.kind === 'wait' ? { yesLabel: 'Replied', noLabel: 'No reply' } : {}),
              ...common(node.id, ['yes', 'no']),
            },
        selected: selectedId === node.id && selectedEdge === null,
      })
    }
    return list
  }, [graph, triggerLabel, selectedId, selectedEdge, classroomName, contactName, highlight, readOnly, adding, onPlus, choiceName])

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
        const color = on || picked ? brand.primary : '#94a3b8'
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
          onAdding(null)
          onSelect(node.id)
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdge(edge.id)
          onAdding(null)
          onSelect(null)
        }}
        onPaneClick={() => {
          setSelectedEdge(null)
          onAdding(null)
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
