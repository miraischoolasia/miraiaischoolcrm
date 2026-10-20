import { formatDay, formatTime } from '@/lib/format'
import { signInLayout } from '@/lib/lobbyLayout'

import { Scenery, sceneryCss, useLobbyFonts, usePageVisible, useReducedMotion, useScene, useWindowSize } from './LobbyScenery'
import type { GameWaitingProps } from './gameWaitingProps'

// The class waiting page for a school with the game lobby (a computer): the
// lobby's background and hero, and on the right the school's gold frame
// with the lesson, a note that the page checks by itself, and a way back.

const css = `
.gw-frame { position: absolute; transform-origin: 0 0; width: 1122px; height: 1402px; font-family: 'Noto Sans SC', 'Nunito', 'Microsoft YaHei', sans-serif; color: #fff; text-align: center; }
.gw-panel { position: absolute; left: 122px; top: 150px; width: 880px; height: 1175px; background: linear-gradient(180deg, #0a1235 0%, #0d1338 50%, #0e1333 100%); clip-path: polygon(40px 0, calc(100% - 40px) 0, 100% 40px, 100% calc(100% - 64px), calc(100% - 64px) 100%, 64px 100%, 0 calc(100% - 64px), 0 40px); }
.gw-frame > img { position: absolute; left: 0; top: 0; width: 1122px; height: 1402px; pointer-events: none; }
.gw-line { position: absolute; left: 170px; right: 170px; }
.gw-title { top: 270px; font-size: 70px; font-weight: 900; line-height: 1.2; text-shadow: 0 3px 0 rgba(10, 6, 40, 0.6); }
.gw-lesson { top: 420px; font-size: 54px; font-weight: 900; background: linear-gradient(180deg, #fff6c9, #ffd34d 55%, #e9a514); -webkit-background-clip: text; background-clip: text; color: transparent; }
.gw-when { top: 510px; font-size: 40px; font-weight: 700; color: #d9d6ff; }
.gw-teacher { top: 570px; font-size: 38px; font-weight: 700; color: #b9b5ff; }
.gw-check { top: 690px; display: flex; align-items: center; justify-content: center; gap: 26px; font-size: 34px; font-weight: 700; color: #e6e3ff; line-height: 1.45; }
.gw-spin { flex: none; width: 54px; height: 54px; border-radius: 50%; border: 6px solid rgba(255, 211, 77, 0.25); border-top-color: #ffd34d; animation: gw-spin 1s linear infinite; }
.gw-checked { top: 850px; font-size: 28px; font-weight: 700; color: rgba(255, 255, 255, 0.55); }
.gw-problem { top: 900px; font-size: 28px; font-weight: 700; color: #ff9cc8; }
.gw-back { position: absolute; left: 251px; top: 980px; width: 620px; padding: 0; border: 0; background: none; cursor: pointer; transition: transform 160ms cubic-bezier(.3, 1.6, .5, 1), filter 160ms; }
.gw-back:hover { transform: translateY(-3px); filter: brightness(1.06); }
.gw-back:active { transform: scale(0.96); transition-duration: 80ms; }
.gw-back:focus-visible { outline: 5px solid #ffe08a; outline-offset: 4px; border-radius: 20px; }
.gw-back img { position: static; display: block; width: 100%; filter: drop-shadow(0 0 12px rgba(255, 220, 100, 0.7)); }
.gw-back span { position: absolute; left: 236px; width: 284px; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font: 900 60px 'Noto Sans SC', 'Microsoft YaHei', sans-serif; color: #120a45; text-shadow: 0 2px 0 rgba(255, 255, 255, 0.55); white-space: nowrap; }
@keyframes gw-spin { to { transform: rotate(360deg); } }
.lb-still .gw-spin { animation: none; }
`

function two(value: number) {
  return String(value).padStart(2, '0')
}

export function GameWaiting({ theme, lesson, ended, checkedAt, problem, everySeconds, onBack }: GameWaitingProps) {
  useLobbyFonts()
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const { width, height } = useWindowSize()
  const scene = useScene(theme.folder, theme.scene)
  const words = theme.words
  const layout = signInLayout(width, height, scene, window.devicePixelRatio || 1)
  const motionClass = reduced ? 'lb-still' : !visible ? 'lb-paused' : ''

  return (
    <div className={`lb-root ${motionClass}`}>
      <style>{sceneryCss + css}</style>
      <Scenery folder={theme.folder} scene={scene} layout={layout} heroSrc={`${theme.folder}/hero.webp`} reduced={reduced} paused={!visible} />
      <div className="gw-frame" role="status" style={{ left: layout.frame.x, top: layout.frame.y, transform: `scale(${layout.frame.scale})` }}>
        <div className="gw-panel" />
        <img src={`${theme.folder}/login-frame.webp`} alt="" />
        <div className="gw-line gw-title">{ended ? words.waitEnded : words.waitTitle}</div>
        {lesson && (
          <>
            <div className="gw-line gw-lesson">{lesson.class ?? lesson.title}</div>
            <div className="gw-line gw-when">
              {formatDay(lesson.date)} · {formatTime(lesson.start)} – {formatTime(lesson.end)}
            </div>
            {lesson.teacher && (
              <div className="gw-line gw-teacher">
                {words.waitTeacher}：{lesson.teacher}
              </div>
            )}
          </>
        )}
        {!ended && (
          <div className="gw-line gw-check">
            <i className="gw-spin" aria-hidden="true" />
            <span>{words.waitChecks.replace('{seconds}', String(everySeconds))}</span>
          </div>
        )}
        {checkedAt && (
          <div className="gw-line gw-checked">
            {words.waitChecked} {two(checkedAt.getHours())}:{two(checkedAt.getMinutes())}:{two(checkedAt.getSeconds())}
          </div>
        )}
        {problem && <div className="gw-line gw-problem">{problem}</div>}
        <button type="button" className="gw-back" onClick={onBack} aria-label={words.waitBack}>
          <img src={`${theme.folder}/btn-start-blank.webp`} alt="" draggable={false} />
          <span>{words.waitBack}</span>
        </button>
      </div>
    </div>
  )
}
