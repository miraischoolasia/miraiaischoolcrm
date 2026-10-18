import { avatarLook, type HairStyle } from '../lib/avatarLook'

// The child's cartoon face (see avatarLook): a round head on a coloured
// circle, with a hairstyle, eyes, a smile and sometimes glasses or blush.
export function StudentAvatar({ id, name, size = 40, dim = false }: { id: number; name: string; size?: number; dim?: boolean }) {
  const look = avatarLook(id)
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={name}
      className={dim ? 'opacity-50 grayscale' : undefined}
    >
      <circle cx="32" cy="32" r="32" fill={look.background} />
      <Hair style={look.hairStyle} color={look.hair} back />
      {/* body */}
      <path d="M14 64c2-11 9-16 18-16s16 5 18 16z" fill="#ffffff" opacity="0.85" />
      {/* head and ears */}
      <circle cx="17" cy="33" r="4" fill={look.skin} />
      <circle cx="47" cy="33" r="4" fill={look.skin} />
      <circle cx="32" cy="31" r="15" fill={look.skin} />
      <Hair style={look.hairStyle} color={look.hair} />
      {/* eyes and smile */}
      <circle cx="26.5" cy="32" r="2" fill="#1f2937" />
      <circle cx="37.5" cy="32" r="2" fill="#1f2937" />
      <circle cx="27.2" cy="31.3" r="0.6" fill="#ffffff" />
      <circle cx="38.2" cy="31.3" r="0.6" fill="#ffffff" />
      <path d="M27.5 38c2.6 2.4 6.4 2.4 9 0" stroke="#7c2d12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {look.blush && (
        <>
          <ellipse cx="23" cy="37" rx="2.6" ry="1.5" fill="#f9a8d4" opacity="0.7" />
          <ellipse cx="41" cy="37" rx="2.6" ry="1.5" fill="#f9a8d4" opacity="0.7" />
        </>
      )}
      {look.glasses && (
        <g stroke="#334155" strokeWidth="1.3" fill="none">
          <circle cx="26.5" cy="32" r="4" />
          <circle cx="37.5" cy="32" r="4" />
          <path d="M30.5 32h3" />
        </g>
      )}
    </svg>
  )
}

function Hair({ style, color, back = false }: { style: HairStyle; color: string; back?: boolean }) {
  if (back) {
    // Hair that falls behind the head.
    if (style === 'bob') return <path d="M15 30c0-12 8-19 17-19s17 7 17 19v12H15z" fill={color} />
    if (style === 'bun') return <circle cx="32" cy="12" r="6" fill={color} />
    if (style === 'curly') return <path d="M14 34c-3-14 6-23 18-23s21 9 18 23c-2-2-4-2-6 0-1-3-4-3-5 0-2-2-5-2-7 0-1-3-4-3-6 0-2-2-5-2-7 0-2-2-3-2-5 0z" fill={color} />
    return null
  }
  switch (style) {
    case 'short':
      return <path d="M17 29c0-10 7-15 15-15s15 5 15 15c-4-5-9-7-15-7s-11 2-15 7z" fill={color} />
    case 'bob':
      return <path d="M17 30c0-10 7-16 15-16s15 6 15 16c-3-3-6-5-10-6-3 3-9 5-20 6z" fill={color} />
    case 'spiky':
      return <path d="M17 29l2-9 4 4 3-8 4 6 4-7 3 7 4-5 2 7 3 5c-5-4-10-5-15-5s-10 1-14 5z" fill={color} />
    case 'bun':
      return <path d="M17 29c0-9 7-14 15-14s15 5 15 14c-4-4-9-6-15-6s-11 2-15 6z" fill={color} />
    case 'curly':
      return <path d="M17 28c1-8 7-13 15-13s14 5 15 13c-2-2-4-2-5 0-2-2-4-2-6 0-1-2-3-2-4 0-2-2-4-2-6 0-1-2-3-2-4 0-2-2-4-2-5 0z" fill={color} />
    case 'cap':
      return (
        <g>
          <path d="M17 27c0-8 7-13 15-13s15 5 15 13z" fill="#ef4444" />
          <path d="M30 26h20c1 2 0 3-2 3H30z" fill="#dc2626" />
          <circle cx="32" cy="14" r="1.6" fill="#fca5a5" />
        </g>
      )
  }
}
