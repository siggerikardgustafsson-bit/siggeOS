import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export const BACKGROUNDS = [
  { id:'none',      label:'Ingen',    url:'' },
  { id:'mountains', label:'Berg',     url:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=60&auto=format&fit=crop' },
  { id:'forest',    label:'Skog',     url:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=60&auto=format&fit=crop' },
  { id:'ocean',     label:'Hav',      url:'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=400&q=60&auto=format&fit=crop' },
  { id:'city',      label:'Stad',     url:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&q=60&auto=format&fit=crop' },
  { id:'aurora',    label:'Norrsken', url:'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=400&q=60&auto=format&fit=crop' },
  { id:'desert',    label:'Öken',     url:'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=400&q=60&auto=format&fit=crop' },
  { id:'balkans',   label:'Balkan',   url:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=60&auto=format&fit=crop' },
  { id:'space',     label:'Rymden',   url:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400&q=60&auto=format&fit=crop' },
]

export const BLUR_LEVELS  = [
  { id:'low',    label:'Lite',   cls:'bg-blur-low' },
  { id:'medium', label:'Medel',  cls:'bg-blur-medium' },
  { id:'high',   label:'Mycket', cls:'bg-blur-high' },
]

export const DIM_LEVELS = [
  { id:'light',  label:'Lätt',  dark:'rgba(7,9,15,0.35)',  light:'rgba(240,242,248,0.25)' },
  { id:'medium', label:'Medel', dark:'rgba(7,9,15,0.55)',  light:'rgba(240,242,248,0.45)' },
  { id:'dark',   label:'Mörk',  dark:'rgba(7,9,15,0.78)',  light:'rgba(240,242,248,0.68)' },
]

function applyBg(url, blurId, dimId, theme) {
  const bgEl   = document.getElementById('bg-image')
  const gradEl = document.getElementById('bg-gradient')
  const body   = document.body
  if (!bgEl) return

  const blur = BLUR_LEVELS.find(b => b.id === blurId) || BLUR_LEVELS[1]
  const dim  = DIM_LEVELS.find(d => d.id === dimId)   || DIM_LEVELS[1]
  const isDark = theme !== 'light'

  if (url) {
    bgEl.style.backgroundImage = 'url("' + url + '")'
    bgEl.style.opacity = '1'
    if (gradEl) gradEl.style.opacity = '0'
    body.classList.add('has-bg-image')
    BLUR_LEVELS.forEach(b => body.classList.remove(b.cls))
    body.classList.add(blur.cls)
    document.documentElement.style.setProperty('--bg-overlay', isDark ? dim.dark : dim.light)
  } else {
    bgEl.style.opacity = '0'
    bgEl.style.backgroundImage = 'none'
    if (gradEl) gradEl.style.opacity = '1'
    body.classList.remove('has-bg-image')
    BLUR_LEVELS.forEach(b => body.classList.remove(b.cls))
    document.documentElement.style.removeProperty('--bg-overlay')
  }
}

export function ThemeProvider({ children }) {
  const [theme,   setThemeState]   = useState(() => localStorage.getItem('theme')   || 'dark')
  const [accent,  setAccentState]  = useState(() => localStorage.getItem('accent')  || 'blue')
  const [bgImage, setBgImageState] = useState(() => localStorage.getItem('bgImage') || '')
  const [blurId,  setBlurIdState]  = useState(() => localStorage.getItem('sigge-blur') || 'medium')
  const [dimId,   setDimIdState]   = useState(() => localStorage.getItem('sigge-dim')  || 'medium')
  const [compact, setCompactState] = useState(() => localStorage.getItem('compact') === 'true')

  // Theme + accent
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-theme', theme)
    html.setAttribute('data-accent', accent)
    localStorage.setItem('theme', theme)
    localStorage.setItem('accent', accent)
  }, [theme, accent])

  // Background — apply whenever any bg setting changes
  useEffect(() => {
    applyBg(bgImage, blurId, dimId, theme)
    if (bgImage) {
      try { localStorage.setItem('bgImage', bgImage) } catch(e) {}
    } else {
      localStorage.removeItem('bgImage')
    }
  }, [bgImage, blurId, dimId, theme])

  // Compact
  useEffect(() => {
    document.documentElement.style.setProperty('--spacing-scale', compact ? '0.85' : '1')
    localStorage.setItem('compact', compact)
  }, [compact])

  function setTheme(v)   { setThemeState(v);   localStorage.setItem('theme', v) }
  function setAccent(v)  { setAccentState(v);  localStorage.setItem('accent', v) }
  function setBgImage(v) { setBgImageState(v) }
  function setBlurId(v)  { setBlurIdState(v);  localStorage.setItem('sigge-blur', v) }
  function setDimId(v)   { setDimIdState(v);   localStorage.setItem('sigge-dim', v) }
  function setCompact(v) { setCompactState(v) }

  return (
    <ThemeContext.Provider value={{
      theme, setTheme,
      accent, setAccent,
      bgImage, setBgImage,
      blurId, setBlurId,
      dimId, setDimId,
      compact, setCompact,
      BACKGROUNDS, BLUR_LEVELS, DIM_LEVELS,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
