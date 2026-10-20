import { useState, type FormEvent } from 'react'

import { signInLayout } from '@/lib/lobbyLayout'

import { Scenery, sceneryCss, useLobbyFonts, usePageVisible, useReducedMotion, useScene, useWindowSize } from './LobbyScenery'
import type { GameSignInProps } from './gameSignInProps'

// The game sign-in page (a computer, for a school with the game lobby): the
// lobby's background and hero, and on the right the school's gold frame
// (public/lobby/<set>/login-frame.webp, the owner's frame with its painted
// insides cleared) holding real fields and buttons. Signing in works exactly
// as on the classic page (the same login names and passwords).

const css = `
.gs-frame { position: absolute; transform-origin: 0 0; width: 1122px; height: 1402px; font-family: 'Nunito', 'Segoe UI', sans-serif; color: #fff; user-select: text; }
.gs-panel { position: absolute; left: 122px; top: 150px; width: 880px; height: 1175px; background: linear-gradient(180deg, #0a1235 0%, #0d1338 50%, #0e1333 100%); clip-path: polygon(40px 0, calc(100% - 40px) 0, 100% 40px, 100% calc(100% - 64px), calc(100% - 64px) 100%, 64px 100%, 0 calc(100% - 64px), 0 40px); }
.gs-frame > img { position: absolute; left: 0; top: 0; width: 1122px; height: 1402px; pointer-events: none; }
.gs-title { position: absolute; left: 150px; right: 150px; top: 250px; text-align: center; font-size: 64px; font-weight: 900; line-height: 1.1; white-space: nowrap; text-shadow: 0 3px 0 rgba(10, 6, 40, 0.6); }
.gs-title b { background: linear-gradient(180deg, #fff6c9, #ffd34d 55%, #e9a514); -webkit-background-clip: text; background-clip: text; color: transparent; }
.gs-sub { position: absolute; left: 150px; right: 150px; top: 335px; text-align: center; font-size: 38px; font-weight: 800; color: #b9b5ff; }
.gs-tabs { position: absolute; left: 172px; top: 428px; width: 786px; height: 92px; display: flex; border: 2px solid rgba(170, 150, 255, 0.45); border-radius: 16px; background: rgba(10, 12, 44, 0.55); overflow: hidden; }
.gs-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 18px; border: 0; background: none; color: #fff; font: 800 36px 'Nunito', sans-serif; cursor: pointer; transition: background 160ms; }
.gs-tab[aria-selected='true'] { background: linear-gradient(180deg, #b0179c, #6c0f8f); box-shadow: inset 0 0 0 3px #ff5fd8, 0 0 22px rgba(255, 60, 200, 0.75); border-radius: 14px; }
.gs-tab:focus-visible, .gs-link:focus-visible, .gs-eye:focus-visible, .gs-check:focus-visible { outline: 4px solid #ffe08a; outline-offset: 2px; }
.gs-hint { position: absolute; left: 172px; width: 786px; top: 534px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 25px; font-weight: 700; color: #a9a6d8; }
.gs-field { position: absolute; left: 172px; width: 786px; height: 92px; display: flex; align-items: center; gap: 24px; padding: 0 30px; border: 2px solid rgba(160, 150, 255, 0.45); border-radius: 16px; background: rgba(8, 10, 40, 0.6); box-sizing: border-box; transition: border-color 160ms, box-shadow 160ms; }
.gs-field:focus-within { border-color: #ff5fd8; box-shadow: 0 0 18px rgba(255, 60, 200, 0.55); }
.gs-field input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: none; color: #fff; font: 700 34px 'Nunito', sans-serif; }
.gs-field input::placeholder { color: #8f8dc4; }
.gs-eye { width: 56px; height: 56px; display: grid; place-items: center; border: 0; background: none; cursor: pointer; border-radius: 10px; }
.gs-row { position: absolute; left: 172px; width: 786px; top: 812px; height: 52px; display: flex; align-items: center; justify-content: space-between; }
.gs-check { display: flex; align-items: center; gap: 18px; font-size: 32px; font-weight: 700; color: #fff; cursor: pointer; }
.gs-check input { width: 40px; height: 40px; margin: 0; accent-color: #ff3fcf; cursor: pointer; }
.gs-link { color: #ff7fe0; font-size: 32px; font-weight: 700; text-decoration: underline; text-underline-offset: 5px; cursor: pointer; background: none; border: 0; padding: 0; font-family: inherit; }
.gs-error { position: absolute; left: 172px; width: 786px; top: 870px; text-align: center; font-size: 28px; font-weight: 800; color: #ff8fc8; }
.gs-signin { position: absolute; left: 201px; top: 905px; width: 720px; padding: 0; border: 0; background: none; cursor: pointer; transition: transform 160ms cubic-bezier(.3, 1.6, .5, 1), filter 160ms; }
.gs-signin:hover { transform: translateY(-3px); filter: brightness(1.06); }
.gs-signin:active { transform: scale(0.96); transition-duration: 80ms; }
.gs-signin:disabled { cursor: progress; }
.gs-signin:focus-visible { outline: 5px solid #ffe08a; outline-offset: 4px; border-radius: 20px; }
.gs-signin img { position: static; display: block; width: 100%; filter: drop-shadow(0 0 14px rgba(255, 220, 100, 0.8)); }
.gs-signin span { position: absolute; left: 274px; width: 330px; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font: 900 66px 'Nunito', sans-serif; letter-spacing: 0.03em; color: #120a45; text-shadow: 0 2px 0 rgba(255, 255, 255, 0.55); white-space: nowrap; }
.gs-signin span.busy { font-size: 46px; }
.gs-divider { position: absolute; left: 240px; width: 642px; top: 1170px; height: 2px; background: linear-gradient(90deg, rgba(160, 150, 255, 0), rgba(160, 150, 255, 0.55) 40%, rgba(160, 150, 255, 0.55) 60%, rgba(160, 150, 255, 0)); }
.gs-divider i { position: absolute; left: 50%; top: -9px; width: 16px; height: 16px; margin-left: -8px; transform: rotate(45deg); border: 3px solid #ffd34d; background: #0f1438; }
.gs-help { position: absolute; left: 172px; width: 786px; top: 1205px; text-align: center; font-size: 30px; font-weight: 700; color: #b9b5ff; }
.gs-logo { position: absolute; display: flex; align-items: center; gap: 0.25em; font-family: 'Nunito', sans-serif; font-weight: 900; pointer-events: none; }
.gs-logo b { background: linear-gradient(180deg, #fff6c9, #ffd34d 55%, #e9a514); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 2px rgba(20, 8, 70, 0.55)); }
`

function Envelope() {
  return (
    <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden="true">
      <rect x="2" y="2" width="40" height="30" rx="5" fill="none" stroke="#c9c6ff" strokeWidth="3" />
      <path d="M4 5 22 19 40 5" fill="none" stroke="#c9c6ff" strokeWidth="3" />
    </svg>
  )
}

function Padlock() {
  return (
    <svg width="36" height="44" viewBox="0 0 36 44" aria-hidden="true">
      <path d="M9 19v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#c9c6ff" strokeWidth="4" />
      <rect x="3" y="18" width="30" height="24" rx="5" fill="#c9c6ff" />
      <circle cx="18" cy="29" r="3.5" fill="#0f1438" />
    </svg>
  )
}

function Eye({ open }: { open: boolean }) {
  return (
    <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden="true">
      <path d="M2 16C8 6 15 2 22 2s14 4 20 14c-6 10-13 14-20 14S8 26 2 16Z" fill="none" stroke="#c9c6ff" strokeWidth="3" />
      <circle cx="22" cy="16" r="6" fill="#c9c6ff" />
      {!open && <path d="M6 30 38 2" stroke="#c9c6ff" strokeWidth="3.5" strokeLinecap="round" />}
    </svg>
  )
}

function Cap() {
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">
      <path d="M23 2 44 11 23 20 2 11Z" fill="#fff" />
      <path d="M10 15v9c4 4 9 6 13 6s9-2 13-6v-9l-13 6Z" fill="#fff" />
    </svg>
  )
}

function People() {
  return (
    <svg width="48" height="34" viewBox="0 0 48 34" aria-hidden="true">
      <circle cx="17" cy="9" r="7" fill="#fff" />
      <path d="M3 33c0-8 6-13 14-13s14 5 14 13Z" fill="#fff" />
      <circle cx="34" cy="10" r="6" fill="#fff" opacity=".85" />
      <path d="M30 20c8 0 15 4 15 13H34c0-5-1-9-4-13Z" fill="#fff" opacity=".85" />
    </svg>
  )
}

function Shield({ letter, size }: { letter: string; size: number }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 130 117" aria-hidden="true">
      <defs>
        <linearGradient id="gs-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4c2" />
          <stop offset=".45" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#b9821f" />
        </linearGradient>
      </defs>
      <path d="M65 4 L118 20 L108 66 Q94 92 65 112 Q36 92 22 66 L12 20 Z" fill="url(#gs-gold)" />
      <path d="M65 16 L106 28 L98 63 Q87 83 65 98 Q43 83 32 63 L24 28 Z" fill="#1d0f73" />
      <text x="65" y="78" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight="900" fontSize="54" fill="url(#gs-gold)">
        {letter}
      </text>
    </svg>
  )
}

export function GameSignIn({ theme, schoolName, supportWhatsapp, onSignIn }: GameSignInProps) {
  useLobbyFonts()
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const { width, height } = useWindowSize()
  const scene = useScene(theme.folder, theme.scene)
  const words = theme.signIn
  const [role, setRole] = useState<'student' | 'parent'>('student')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const layout = signInLayout(width, height, scene, window.devicePixelRatio || 1)
  const school = schoolName || theme.emblemWord
  const [before, after = ''] = words.welcome.split('{school}')
  const whatsappLink = supportWhatsapp
    ? `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(words.whatsappMessage.replace('{school}', school))}`
    : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!username.trim() || !password) {
      setError(words.missing)
      return
    }
    setBusy(true)
    setError(null)
    const failure = await onSignIn(username, password, remember)
    setBusy(false)
    if (failure) setError(failure)
  }

  function contactSchool() {
    if (whatsappLink) window.open(whatsappLink, '_blank', 'noopener')
  }

  const motionClass = reduced ? 'lb-still' : !visible ? 'lb-paused' : ''

  return (
    <div className={`lb-root ${motionClass}`}>
      <style>{sceneryCss + css}</style>
      <Scenery folder={theme.folder} scene={scene} layout={layout} heroSrc={`${theme.folder}/hero.webp`} reduced={reduced} paused={!visible} />

      <div className="gs-logo" style={{ left: layout.logo.x, top: layout.logo.y, fontSize: layout.logo.height * 0.62 }}>
        <Shield letter={theme.emblemWord.slice(0, 1)} size={layout.logo.height} />
        <b>{school}</b>
      </div>

      <form className="gs-frame" style={{ left: layout.frame.x, top: layout.frame.y, transform: `scale(${layout.frame.scale})` }} onSubmit={(event) => void submit(event)} noValidate>
        <div className="gs-panel" />
        <img src={`${theme.folder}/login-frame.webp`} alt="" />
        <h1 className="gs-title" style={{ margin: 0 }}>
          {before}
          <b>{school}</b>
          {after}
        </h1>
        <div className="gs-sub">{words.subtitle}</div>

        <div className="gs-tabs" role="tablist" aria-label={`${words.student} / ${words.parent}`}>
          <button type="button" role="tab" aria-selected={role === 'student'} className="gs-tab" onClick={() => setRole('student')}>
            <Cap /> {words.student}
          </button>
          <button type="button" role="tab" aria-selected={role === 'parent'} className="gs-tab" onClick={() => setRole('parent')}>
            <People /> {words.parent}
          </button>
        </div>
        <div className="gs-hint">{role === 'student' ? words.studentHint : words.parentHint}</div>

        <label className="gs-field" style={{ top: 580 }}>
          <Envelope />
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            placeholder={role === 'student' ? words.studentLogin : words.parentLogin}
            aria-label={role === 'student' ? words.studentLogin : words.parentLogin}
          />
        </label>
        <label className="gs-field" style={{ top: 696 }}>
          <Padlock />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type={shown ? 'text' : 'password'}
            autoCapitalize="none"
            autoComplete="current-password"
            placeholder={words.password}
            aria-label={words.password}
          />
          <button type="button" className="gs-eye" aria-label={shown ? words.hidePassword : words.showPassword} aria-pressed={shown} onClick={() => setShown((value) => !value)}>
            <Eye open={shown} />
          </button>
        </label>

        <div className="gs-row">
          <label className="gs-check">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            {words.remember}
          </label>
          {whatsappLink && (
            <button type="button" className="gs-link" onClick={contactSchool}>
              {words.forgot}
            </button>
          )}
        </div>

        {error && (
          <div className="gs-error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="gs-signin" disabled={busy} aria-label={words.signIn}>
          <img src={`${theme.folder}/btn-start-blank.webp`} alt="" draggable={false} />
          <span className={busy ? 'busy' : ''}>{busy ? words.signingIn : words.signIn}</span>
        </button>

        {whatsappLink && (
          <>
            <div className="gs-divider">
              <i />
            </div>
            <div className="gs-help">
              {words.help}{' '}
              <button type="button" className="gs-link" style={{ fontSize: 30 }} onClick={contactSchool}>
                {words.contact}
              </button>{' '}
              ›
            </div>
          </>
        )}
      </form>
    </div>
  )
}
