import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

import { canClaim } from '@/lib/daily'
import { lobbyLayout } from '@/lib/lobbyLayout'

import { Scenery, sceneryCss, useLobbyFonts, usePageVisible, useReducedMotion, useScene, useWindowSize } from './LobbyScenery'
import type { LobbyViewProps } from './lobbyViewProps'

export type { LobbyPlace } from './lobbyViewProps'

// The game lobby (design: docs/design/student-home/desktop-v5.html), full
// window: the school's background (public/lobby/<set>/, scene.json) covers
// it, the hero stands on the background's platform, and the buttons sit on
// a layer as big as the window, pinned to its corners and edges in the
// design's units and scaled with the window's height (lib/lobbyLayout.ts).
// Motion is CSS only (transform and opacity, so the browser does it without
// repainting), stops while the page or tab is out of sight and is off for
// reduced motion.

const css = `
.lb-ui { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }
.lb-ui > * { pointer-events: auto; }

.lb-lock { position: absolute; right: 18px; top: 22px; z-index: 3; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #2a1a6e; border: 1.5px solid rgba(255, 214, 107, 0.85); box-shadow: 0 2px 6px rgba(20, 6, 60, 0.5); }
.lb-gem { position: absolute; z-index: 4; width: 14px; height: 14px; transform: rotate(45deg); background: linear-gradient(135deg, #f6d9ff, #a35cff 50%, #6a2bd6); border: 1.5px solid #ffe08a; box-shadow: 0 0 10px rgba(190, 120, 255, 0.95); }

.lb-gf { position: absolute; filter: drop-shadow(0 0 8px rgba(255, 200, 80, 0.55)) drop-shadow(0 6px 14px rgba(20, 6, 60, 0.45)); --shape: polygon(20px 0, calc(100% - 40px) 0, 100% 50%, calc(100% - 40px) 100%, 20px 100%, 0 calc(100% - 20px), 0 20px); }
.lb-gf > i { position: absolute; clip-path: var(--shape); }
.lb-edge { inset: 0; background: linear-gradient(180deg, #fff4c2 0%, #f2c14e 35%, #b9821f 62%, #ffe28a 100%); }
.lb-fill { inset: 3px; background: linear-gradient(180deg, #2c1aa0 0%, #1d0f73 55%, #140852 100%); }
.lb-line { inset: 6px; border: 1.5px solid rgba(252, 12, 151, 0.55); }
.lb-ava { position: absolute; left: 205px; top: 40px; width: 100px; height: 100px; border-radius: 50%; padding: 4px; background: conic-gradient(from 200deg, #fc0c97, #ffd24a, #7b4dff, #fc0c97); box-shadow: 0 0 16px rgba(252, 12, 151, 0.75); }
.lb-ava > div { width: 100%; height: 100%; border-radius: 50%; border: 2px solid #fff; background-repeat: no-repeat; background-position: -67px -36px; background-size: 236px auto; background-color: #ffc4e6; }
.lb-lv { position: absolute; left: 216px; top: 133px; width: 78px; height: 28px; display: grid; place-items: center; font: 900 17px 'Nunito', sans-serif; color: #2a1050; background: linear-gradient(180deg, #fffbe0 0%, #ffe45c 22%, #ffc61a 58%, #f0a000 100%); border: 1.5px solid #fff3c4; clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%); }
.lb-name { position: absolute; left: 322px; top: 44px; height: 40px; width: 220px; display: flex; align-items: center; gap: 10px; }
.lb-name span { font-weight: 900; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 0 rgba(20, 8, 70, 0.6), 0 0 10px rgba(123, 77, 255, 0.6); }
.lb-pencil { position: relative; flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.4); }
.lb-sub { position: absolute; left: 323px; top: 84px; width: 220px; display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 900; color: #e6dcff; white-space: nowrap; }
.lb-sub .lb-class { overflow: hidden; text-overflow: ellipsis; }
.lb-coins { flex: none; display: flex; align-items: center; gap: 5px; font-size: 17px; color: #ffe08a; }
.lb-xp { position: absolute; left: 322px; top: 117px; width: 220px; height: 14px; border-radius: 7px; background: rgba(10, 4, 40, 0.75); border: 1px solid rgba(255, 214, 107, 0.6); overflow: hidden; }
.lb-xp i { display: block; height: 100%; border-radius: 7px; background: linear-gradient(90deg, #7b4dff, #fc0c97); box-shadow: 0 0 16px rgba(252, 12, 151, 0.75); }

.lb-start { right: 18px; bottom: 130px; width: 582px; }
.lb-start > img { filter: drop-shadow(0 0 12px rgba(255, 220, 100, 0.85)) drop-shadow(0 0 28px rgba(255, 190, 40, 0.5)); }
.lb-start .lb-glow { position: absolute; inset: 0; width: 100%; filter: blur(16px) brightness(1.35); opacity: 0.25; animation: lb-breathe 1.6s ease-in-out infinite; }
.lb-shine { position: absolute; inset: 0; overflow: hidden; -webkit-mask-size: 100% 100%; mask-size: 100% 100%; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; pointer-events: none; }
.lb-shine::after { content: ''; position: absolute; top: 0; bottom: 0; width: 22%; background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0)); animation: lb-sweep 3.2s ease-in-out infinite; }
.lb-words { position: absolute; left: 222px; top: 51px; width: 252px; height: 70px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #120a45; }
.lb-words b { font-weight: 900; font-size: 50px; line-height: 1; letter-spacing: 0.04em; text-shadow: 0 2px 0 rgba(255, 255, 255, 0.55); white-space: nowrap; }
.lb-words small { font-weight: 900; font-size: 19px; margin-top: 4px; color: #6a2600; letter-spacing: 0.02em; }
.lb-tag { right: 300px; bottom: 273px; transform: translateX(50%); z-index: 6; max-width: 420px; padding: 4px 14px; border-radius: 999px; font-size: 15px; font-weight: 900; background: linear-gradient(90deg, #fc0c97, #c4006f); border: 2px solid #fff3c4; box-shadow: 0 0 16px rgba(252, 12, 151, 0.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }

.lb-gym { position: absolute; right: 18px; bottom: 309px; width: 576px; height: 114px; filter: drop-shadow(0 0 10px rgba(140, 90, 255, 0.7)) drop-shadow(0 6px 14px rgba(20, 6, 60, 0.4)); --shape: polygon(44px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 44px 100%, 0 50%); }
.lb-gym > i { position: absolute; clip-path: var(--shape); }
.lb-gym-edge { inset: 0; background: linear-gradient(180deg, #fff4c2, #f2c14e 40%, #b9821f 70%, #ffe28a); }
.lb-gym-fill { inset: 3px; background: linear-gradient(90deg, rgba(40, 24, 150, 0.96) 0%, rgba(26, 14, 100, 0.92) 55%, rgba(26, 14, 100, 0.55) 100%); }
.lb-gym-line { inset: 7px; border: 1.5px solid rgba(160, 120, 255, 0.75); }
.lb-orn { position: absolute; left: -6px; top: 47px; width: 20px; height: 20px; transform: rotate(45deg); background: linear-gradient(135deg, #fff4c2, #e2a930); box-shadow: 0 0 10px rgba(255, 214, 80, 0.9); }

.lb-nav { position: absolute; left: 50%; transform: translateX(-50%); bottom: 9px; height: 106px; filter: drop-shadow(0 0 8px rgba(255, 200, 80, 0.5)) drop-shadow(0 -4px 14px rgba(20, 6, 60, 0.35)); --shape: polygon(36px 0, calc(100% - 36px) 0, 100% 50%, calc(100% - 36px) 100%, 36px 100%, 0 50%); }
.lb-nav > i { position: absolute; clip-path: var(--shape); }
.lb-nav-edge { inset: 0; background: linear-gradient(180deg, #fff4c2, #f2c14e 35%, #b9821f 62%, #ffe28a); }
.lb-nav-fill { inset: 3px; background: linear-gradient(180deg, rgba(30, 22, 110, 0.93), rgba(14, 10, 60, 0.95)); }
.lb-nav-line { inset: 7px; border: 1px solid rgba(110, 140, 255, 0.55); }
.lb-cells { position: absolute; left: 308px; right: 40px; top: 0; bottom: 0; display: flex; }
.lb-cell { position: relative; flex: 1; height: 100%; display: grid; place-items: center; }
.lb-cell > img { width: 124px; margin-top: 4px; }
.lb-cell::before { content: ''; position: absolute; left: 0; top: 22px; bottom: 22px; width: 2px; background: linear-gradient(180deg, rgba(255, 214, 107, 0), rgba(255, 214, 107, 0.75), rgba(255, 214, 107, 0)); }
.lb-cell .lb-lock { right: calc(50% - 40px); top: 16px; }



.lb-toast { position: absolute; left: 50%; top: 168px; transform: translateX(-50%); z-index: 20; padding: 10px 22px; border-radius: 999px; background: rgba(26, 14, 100, 0.94); border: 2px solid #ffe08a; box-shadow: 0 0 18px rgba(255, 214, 80, 0.6); font-size: 22px; font-weight: 900; white-space: nowrap; animation: lb-pop 220ms cubic-bezier(.3, 1.6, .5, 1); }
.lb-modes { position: absolute; right: 306px; bottom: 432px; width: 330px; z-index: 20; padding: 14px; border-radius: 16px; background: rgba(26, 14, 100, 0.96); border: 2px solid #ffe08a; box-shadow: 0 0 18px rgba(140, 90, 255, 0.7); display: flex; flex-direction: column; gap: 8px; animation: lb-pop 220ms cubic-bezier(.3, 1.6, .5, 1); }
.lb-modes h2 { margin: 0 0 4px; font-size: 18px; font-weight: 900; color: #ffe08a; }
.lb-mode { position: relative; display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255, 214, 107, 0.5); background: rgba(255, 255, 255, 0.08); color: #fff; font: 900 18px 'Noto Sans SC', 'Microsoft YaHei', sans-serif; cursor: pointer; transition: transform 160ms cubic-bezier(.3, 1.6, .5, 1); }
.lb-mode:active { transform: scale(0.97); }
.lb-mode em { font-style: normal; font-size: 13px; color: #ffe9a0; }
.lb-dot { position: absolute; right: 10px; top: 10px; z-index: 4; min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #ff3b5c; border: 2px solid #fff; color: #fff; font: 900 13px/18px 'Nunito', sans-serif; font-style: normal; text-align: center; box-shadow: 0 2px 6px rgba(20, 6, 60, 0.5); }
.lb-daily-shade { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(10, 6, 40, 0.55); }
.lb-daily { position: relative; width: min(92vw, 520px); max-height: 86vh; overflow: auto; padding: 26px 26px 22px; border-radius: 22px; background: linear-gradient(180deg, #1d1466, #120a45); border: 3px solid #ffd34d; box-shadow: 0 0 26px rgba(255, 211, 77, 0.5), 0 30px 80px rgba(0, 0, 0, 0.45); color: #fff; text-align: center; font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif; animation: lb-pop 220ms cubic-bezier(.3, 1.6, .5, 1); }
.lb-daily h2 { margin: 0 0 12px; font-size: 26px; font-weight: 900; color: #ffd34d; }
.lb-daily p { margin: 6px 0; font-size: 18px; font-weight: 700; }
.lb-daily-big { font-size: 56px !important; margin: 4px 0 10px !important; }
.lb-daily-note { color: #d9d6ff; font-size: 15px !important; }
.lb-daily-error { color: #ff9cc8; font-size: 14px !important; }
.lb-daily-close { position: absolute; right: 12px; top: 10px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.12); color: #fff; font-size: 16px; font-weight: 900; cursor: pointer; }
.lb-daily-go { margin: 6px auto; padding: 12px 26px; border: 0; border-radius: 999px; background: linear-gradient(180deg, #fffbe0 0%, #ffe45c 22%, #ffc61a 58%, #f0a000 100%); color: #2a1050; font: 900 20px 'Noto Sans SC', 'Microsoft YaHei', sans-serif; cursor: pointer; box-shadow: 0 0 14px rgba(255, 214, 80, 0.6); transition: transform 160ms cubic-bezier(.3, 1.6, .5, 1); }
.lb-daily-go:active { transform: scale(0.95); }
.lb-daily-go:disabled { filter: grayscale(0.7) brightness(0.8); cursor: default; }
.lb-daily-go.small { margin: 0; padding: 8px 16px; font-size: 16px; flex: none; }
.lb-tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; text-align: left; }
.lb-tasks li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 214, 107, 0.35); }
.lb-task-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.lb-task-text b { font-size: 17px; font-weight: 900; }
.lb-task-text small { font-size: 13px; color: #d9d6ff; font-weight: 700; }
.lb-task-bar { display: block; height: 8px; border-radius: 999px; background: rgba(10, 4, 40, 0.7); overflow: hidden; }
.lb-task-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #7b4dff, #fc0c97); }
.lb-task-done { flex: none; color: #2ee59d; font-weight: 900; font-size: 15px; }
.lb-error { position: absolute; left: 50%; top: 220px; transform: translateX(-50%); z-index: 20; max-width: 640px; padding: 12px 20px; border-radius: 14px; background: rgba(120, 10, 60, 0.92); border: 2px solid #ffd0ea; font-size: 18px; font-weight: 700; text-align: center; }

.lb-toast { --lb-x: -50%; }
`

function Lock({ style }: { style?: CSSProperties }) {
  return (
    <span className="lb-lock" style={style} aria-hidden="true">
      <svg width="11" height="12" viewBox="0 0 11 12">
        <path d="M2.5 5V3.6a3 3 0 0 1 6 0V5" fill="none" stroke="#ffe9a0" strokeWidth="1.6" />
        <rect x="1" y="5" width="9" height="6.5" rx="1.4" fill="#ffe9a0" />
      </svg>
    </span>
  )
}

function Coin() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill="#f2c14e" stroke="#fff4c2" strokeWidth="1.4" />
      <circle cx="9" cy="9" r="5" fill="none" stroke="#b9821f" strokeWidth="1.4" />
    </svg>
  )
}

// A picture button; `soon` marks a feature that is not built yet (a small
// lock; pressing it says so).
function PicButton({ src, label, style, className = '', soon, lockStyle, onPress, children }: {
  src?: string
  label: string
  style?: CSSProperties
  className?: string
  soon?: boolean
  lockStyle?: CSSProperties
  onPress: () => void
  children?: ReactNode
}) {
  return (
    <button type="button" className={`lb-btn ${className}`} style={style} aria-label={label} onClick={onPress}>
      {src && <img src={src} alt="" draggable={false} />}
      {children}
      {soon && <Lock style={lockStyle} />}
    </button>
  )
}

export function LobbyView({ theme, active, student, level, coins, start, hasVideos, error, onStart, onGo, daily, dailyBusy, dailyError, onCheckIn, onClaim }: LobbyViewProps) {
  useLobbyFonts()
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const { width, height } = useWindowSize()
  const scene = useScene(theme.folder, theme.scene)
  const [toast, setToast] = useState<string | null>(null)
  const [modesOpen, setModesOpen] = useState(false)
  const words = theme.words
  const pic = (name: string) => `${theme.folder}/${name}.webp`

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(timer)
  }, [toast])

  const layout = lobbyLayout(width, height, scene, window.devicePixelRatio || 1)
  const [dailyOpen, setDailyOpen] = useState<'checkin' | 'tasks' | null>(null)
  const checkinOn = Boolean(daily?.checkin.enabled)
  const tasksOn = Boolean(daily && daily.tasks.length > 0)
  const practiceOn = Boolean(daily?.practice.enabled && daily.practice.has_questions)
  const claimable = daily ? daily.tasks.filter(canClaim).length : 0
  const soon = (label: string) => () => {
    setModesOpen(false)
    setToast(`${label} · ${words.comingSoon}`)
  }
  const name = student?.name ?? ''
  const nameSize = name.length <= 9 ? 30 : name.length <= 13 ? 24 : 20
  const startMask = `url(${pic('btn-start-blank')})`

  function pressStart() {
    setModesOpen(false)
    if (!onStart()) setToast(words.waitForTeacher)
  }

  const motionClass = reduced ? 'lb-still' : !active || !visible ? 'lb-paused' : ''

  return (
    <div className={`lb-root ${motionClass}`}>
      <style>{sceneryCss + css}</style>
      <Scenery folder={theme.folder} scene={scene} layout={layout} heroSrc={pic('hero')} reduced={reduced} paused={!active || !visible} />
        {dailyOpen && daily && (
          <div className="lb-daily-shade" onClick={(event) => event.target === event.currentTarget && setDailyOpen(null)}>
            <div className="lb-daily" role="dialog" aria-label={dailyOpen === 'checkin' ? words.checkinTitle : words.tasksTitle}>
              <button type="button" className="lb-daily-close" aria-label={words.close} onClick={() => setDailyOpen(null)}>
                ✕
              </button>
              <h2>{dailyOpen === 'checkin' ? words.checkinTitle : words.tasksTitle}</h2>
              {dailyOpen === 'checkin' ? (
                <>
                  <p className="lb-daily-big">{daily.checkin.done ? '✅' : '📅'}</p>
                  {daily.checkin.done ? (
                    <p>{words.checkinDone}</p>
                  ) : (
                    <button type="button" className="lb-daily-go" disabled={dailyBusy} onClick={onCheckIn}>
                      {words.checkinButton.replace('{coins}', String(daily.checkin.coins))}
                    </button>
                  )}
                  {daily.checkin.streak > 0 && <p className="lb-daily-note">{words.checkinStreak.replace('{days}', String(daily.checkin.streak))}</p>}
                </>
              ) : daily.tasks.length === 0 ? (
                <p>{words.tasksEmpty}</p>
              ) : (
                <ul className="lb-tasks">
                  {daily.tasks.map((task) => (
                    <li key={task.id}>
                      <div className="lb-task-text">
                        <b>{task.label}</b>
                        <span className="lb-task-bar">
                          <i style={{ width: `${Math.round((task.progress / task.target) * 100)}%` }} />
                        </span>
                        <small>
                          {task.progress}/{task.target} · {words.taskCoins.replace('{coins}', String(task.coins))}
                        </small>
                      </div>
                      {task.claimed ? (
                        <span className="lb-task-done">{words.claimed}</span>
                      ) : (
                        <button type="button" className="lb-daily-go small" disabled={dailyBusy || !canClaim(task)} onClick={() => onClaim(task.id)}>
                          {words.claim}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {dailyError && <p className="lb-daily-error">{dailyError}</p>}
            </div>
          </div>
        )}

      {/* The buttons, pinned to the window's corners and edges */}
      <div
        className="lb-ui"
        style={{ left: layout.layer.x, top: layout.layer.y, width: layout.layer.width, height: layout.layer.height, transform: `scale(${layout.unit})` }}
        onClick={(event) => {
          if (modesOpen && !(event.target as HTMLElement).closest('.lb-modes, .lb-switch')) setModesOpen(false)
        }}
      >
        {/* Name plate: school shield, face, Lv, name, class, coins, level bar, rank badge */}
        <div className="lb-gf" style={{ left: 16, top: 26, width: 636, height: 126 }}>
          <i className="lb-edge" />
          <i className="lb-fill" />
          <i className="lb-line" />
        </div>
        <svg className="lb-abs" style={{ left: 46, top: 36 }} width="130" height="104" viewBox="0 0 130 104" aria-hidden="true">
          <defs>
            <linearGradient id="lb-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff4c2" />
              <stop offset=".45" stopColor="#f2c14e" />
              <stop offset="1" stopColor="#b9821f" />
            </linearGradient>
            <radialGradient id="lb-gemfill" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#ffc2e6" />
              <stop offset=".5" stopColor="#fc0c97" />
              <stop offset="1" stopColor="#8a0050" />
            </radialGradient>
          </defs>
          <path d="M65 4 L112 18 L104 58 Q92 80 65 90 Q38 80 26 58 L18 18 Z" fill="#fff" opacity=".95" />
          <path d="M65 12 L102 23 L96 55 Q86 73 65 81 Q44 73 34 55 L28 23 Z" fill="#1d0f73" />
          <text x="65" y="68" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight="900" fontSize="46" fill="url(#lb-gold)">
            {theme.emblemWord.slice(0, 1)}
          </text>
          <rect x="22" y="84" width="86" height="18" rx="2" fill="#fff" />
          <text x="65" y="98" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight="900" fontSize="14" fill="#1d0f73" letterSpacing="2" textLength={theme.emblemWord.length > 7 ? 80 : undefined}>
            {theme.emblemWord}
          </text>
        </svg>
        <div className="lb-ava">
          <div style={{ backgroundImage: `url(${pic('hero')})` }} />
        </div>
        {level && <div className="lb-lv">Lv.{level.level}</div>}
        <div className="lb-name lb-lat">
          <span style={{ fontSize: nameSize }} title={name}>
            {name}
          </span>
          <PicButton label={`${words.comingSoon}`} className="lb-pencil" style={{ position: 'relative' }} onPress={soon('编辑资料')}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 11.5 10.5 3l2.5 2.5L4.5 14H2v-2.5Z" fill="#fff" />
            </svg>
          </PicButton>
        </div>
        <div className="lb-sub lb-lat">
          <span className="lb-class">{student?.className ?? ''}</span>
          {coins !== null && (
            <span className="lb-coins" aria-label={`${words.coins} ${coins}`}>
              <Coin />
              {coins.toLocaleString('en-US')}
            </span>
          )}
        </div>
        {level && (
          <div className="lb-xp" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.fraction * 100)}>
            <i style={{ width: `${Math.max(4, Math.round(level.fraction * 100))}%` }} />
          </div>
        )}
        <svg className="lb-abs" style={{ left: 548, top: 58 }} width="82" height="92" viewBox="0 0 118 128" aria-hidden="true">
          <path d="M18 46 Q2 34 4 14 Q16 30 34 34Z" fill="url(#lb-gold)" />
          <path d="M100 46 Q116 34 114 14 Q102 30 84 34Z" fill="url(#lb-gold)" />
          <path d="M14 66 Q-2 56 2 40 Q12 54 30 54Z" fill="url(#lb-gold)" opacity=".85" />
          <path d="M104 66 Q120 56 116 40 Q106 54 88 54Z" fill="url(#lb-gold)" opacity=".85" />
          <path d="M59 8 L94 22 V56 C94 84 78 102 59 112 C40 102 24 84 24 56 V22 Z" fill="url(#lb-gold)" stroke="#fff3c4" strokeWidth="2" />
          <path d="M59 22 L84 31 V56 C84 76 73 90 59 98 C45 90 34 76 34 56 V31 Z" fill="#2c1aa0" />
          <path d="M59 36 L72 56 L59 80 L46 56 Z" fill="url(#lb-gemfill)" stroke="#ffe08a" strokeWidth="1.5" />
        </svg>

        {/* Top right: sound (no sounds yet) and settings (the Me page) */}
        <PicButton src={pic('btn-sound')} label="音效" style={{ right: 112, top: 30, width: 72 }} onPress={soon('音效')} />
        <PicButton src={pic('btn-settings')} label="设定" style={{ right: 30, top: 30, width: 72 }} onPress={() => onGo('more')} />

        {/* 2 x 2 tiles packed into one block, a diamond where they meet */}
        <PicButton src={pic('tile-check-in')} label={checkinOn ? words.checkinTitle : `签到 · ${words.comingSoon}`} style={{ right: 146, top: 132, width: 142 }} soon={!checkinOn} onPress={checkinOn ? () => setDailyOpen('checkin') : soon('签到')}>
          {checkinOn && !daily?.checkin.done && <i className="lb-dot" aria-hidden="true" />}
        </PicButton>
        <PicButton src={pic('tile-tasks')} label={tasksOn ? words.tasksTitle : `任务 · ${words.comingSoon}`} style={{ right: 17, top: 132, width: 142 }} soon={!tasksOn} onPress={tasksOn ? () => setDailyOpen('tasks') : soon('任务')}>
          {claimable > 0 && <i className="lb-dot" aria-hidden="true">{claimable}</i>}
        </PicButton>
        <PicButton src={pic('tile-season')} label={`赛季 · ${words.comingSoon}`} style={{ right: 146, top: 254, width: 142 }} soon onPress={soon('赛季')} />
        <PicButton src={pic('tile-shop')} label={`商店 · ${words.comingSoon}`} style={{ right: 17, top: 254, width: 142 }} soon onPress={soon('商店')} />
        <div className="lb-gem" style={{ right: 150, top: 262 }} />

        <PicButton src={pic('btn-friends')} label={`好友 · ${words.comingSoon}`} style={{ left: 16, top: 184, width: 154 }} soon lockStyle={{ right: 14, top: 14 }} onPress={soon('好友')} />
        <PicButton src={pic('btn-ask-ai')} label={`问 AI BM · ${words.comingSoon}`} style={{ left: 16, bottom: 153, width: 342 }} soon lockStyle={{ right: 34, top: 10 }} onPress={soon('问 AI BM')} />

        {/* DAILY GYM: one panel, the mode switch inside it */}
        <div className="lb-gym">
          <i className="lb-gym-edge" />
          <i className="lb-gym-fill" />
          <i className="lb-gym-line" />
          <span className="lb-orn" />
          <PicButton src={pic('gym-ic')} label={practiceOn ? words.modePractice : `${words.modePractice} · ${words.comingSoon}`} style={{ left: 72, top: 16, width: 290 }} onPress={practiceOn ? () => onGo('practice') : soon(words.modePractice)} />
          <PicButton src={pic('btn-switch-mode')} label={words.modes} className="lb-switch" style={{ left: 410, top: 38, width: 142 }} onPress={() => setModesOpen((open) => !open)} />
        </div>
        {modesOpen && (
          <div className="lb-modes" role="dialog" aria-label={words.modes}>
            <h2>{words.modes}</h2>
            {hasVideos ? (
              <button type="button" className="lb-mode" onClick={() => onGo('videos')}>
                {words.modeVideos} <span>›</span>
              </button>
            ) : null}
            {practiceOn ? (
              <button type="button" className="lb-mode" onClick={() => onGo('practice')}>
                {words.modePractice} <span>›</span>
              </button>
            ) : (
              <button type="button" className="lb-mode" onClick={soon(words.modePractice)}>
                {words.modePractice} <em>{words.comingSoon}</em>
              </button>
            )}
            <button type="button" className="lb-mode" onClick={soon(words.modeLiveReview)}>
              {words.modeLiveReview} <em>{words.comingSoon}</em>
            </button>
            <button type="button" className="lb-mode" onClick={() => setModesOpen(false)}>
              {words.close}
            </button>
          </div>
        )}

        {/* The big gold button */}
        {start.kind === 'class' && (
          <div className="lb-abs lb-tag">
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <rect x="0" y="1" width="11" height="10" rx="2" fill="#fff" />
              <path d="M11 5 16 2v8l-5-3Z" fill="#fff" />
            </svg>
            {[start.item.class ?? start.item.title, start.item.teacher].filter(Boolean).join(' · ')}
          </div>
        )}
        <PicButton
          label={start.kind === 'class' ? words.enterClass : words.startLearning}
          className="lb-start"
          style={{ position: 'absolute' }}
          onPress={pressStart}
        >
          <img className="lb-glow" src={pic('btn-start-blank')} alt="" aria-hidden="true" style={{ position: 'absolute' }} />
          <img src={pic('btn-start-blank')} alt="" draggable={false} style={{ position: 'relative' }} />
          <span className="lb-shine" style={{ WebkitMaskImage: startMask, maskImage: startMask }} />
          <span className="lb-words">
            {start.kind === 'class' ? (
              <>
                <b>{words.enterClass}</b>
                <small>{start.live ? words.classOn : words.minutesToStart(start.minutesToStart)}</small>
              </>
            ) : (
              <b style={{ fontSize: 56 }}>{words.startLearning}</b>
            )}
          </span>
        </PicButton>

        {/* Bottom bar: learning mode (chosen) and the other five */}
        <div className="lb-nav" style={{ width: layout.navWidth - 20 }}>
          <i className="lb-nav-edge" />
          <i className="lb-nav-fill" />
          <i className="lb-nav-line" />
          <div className="lb-cells">
            <PicButton src={pic('nav-ic-dress-up')} label={`角色换装 · ${words.comingSoon}`} className="lb-cell" style={{ position: 'relative' }} soon onPress={soon('角色换装')} />
            <PicButton src={pic('nav-ic-friend-team')} label={`好友组队 · ${words.comingSoon}`} className="lb-cell" style={{ position: 'relative' }} soon onPress={soon('好友组队')} />
            <PicButton src={pic('nav-ic-class-team')} label={`班级战队 · ${words.comingSoon}`} className="lb-cell" style={{ position: 'relative' }} soon onPress={soon('班级战队')} />
            <PicButton src={pic('nav-ic-results')} label="学习成绩" className="lb-cell" style={{ position: 'relative' }} onPress={() => onGo('results')} />
            <PicButton src={pic('nav-ic-more')} label="更多" className="lb-cell" style={{ position: 'relative' }} onPress={() => onGo('more')} />
          </div>
          <PicButton src={pic('nav-learning-mode')} label="学习模式" style={{ left: 6, bottom: -3, width: 304 }} onPress={() => onGo('learn')} />
        </div>

        {toast && (
          <div className="lb-toast" role="status">
            {toast}
          </div>
        )}
        {error && (
          <div className="lb-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
