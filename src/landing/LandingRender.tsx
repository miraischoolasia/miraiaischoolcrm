import type { CSSProperties, ReactNode } from 'react'
import { landingConfig } from './config'
import type { LandingBlock, LandingData } from './landingData'

// Draws a saved landing page with our blocks, without the editor package (its own <Render> would bring the editor's
// rich-text code with it). Puck's JSON is simple: the blocks in order, and a block's slot fields (the columns of
// Columns) hold blocks of their own.

type AnyComponent = {
  fields?: Record<string, { type?: string }>
  defaultProps?: Record<string, unknown>
  render: (props: Record<string, unknown>) => ReactNode
}

const PUCK_CONTEXT = { isEditing: false, metadata: {}, dragRef: null, renderDropZone: () => null }

function slotKeys(component: AnyComponent) {
  return Object.entries(component.fields ?? {})
    .filter(([, field]) => field.type === 'slot')
    .map(([key]) => key)
}

function renderBlocks(blocks: LandingBlock[]): ReactNode {
  return blocks.map((block, index) => {
    const component =
      block && typeof block.type === 'string'
        ? (landingConfig.components as unknown as Record<string, AnyComponent | undefined>)[block.type]
        : undefined
    if (!component) {
      // A block this version does not know (from a newer editor): left out rather than breaking the page.
      return null
    }
    const blockProps = block.props && typeof block.props === 'object' ? block.props : {}
    const props: Record<string, unknown> = { ...(component.defaultProps ?? {}), ...blockProps }
    for (const key of slotKeys(component)) {
      const inner = Array.isArray(props[key]) ? (props[key] as LandingBlock[]) : []
      props[key] = ({ className, style }: { className?: string; style?: CSSProperties } = {}) => (
        <div className={className} style={style}>
          {renderBlocks(inner)}
        </div>
      )
    }
    const key = typeof blockProps.id === 'string' ? blockProps.id : `${block.type}-${index}`
    return <BlockBox key={key} render={component.render} props={{ ...props, id: key, puck: PUCK_CONTEXT }} />
  })
}

function BlockBox({ render, props }: { render: AnyComponent['render']; props: Record<string, unknown> }) {
  return <>{render(props)}</>
}

export function LandingRender({ data }: { data: LandingData }) {
  const root = landingConfig.root as unknown as AnyComponent
  const rootProps = { ...(root.defaultProps ?? {}), ...data.root.props }
  return <>{root.render({ ...rootProps, children: renderBlocks(data.content), puck: PUCK_CONTEXT })}</>
}
