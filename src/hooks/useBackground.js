import { useState, useEffect } from 'react'

export const BACKGROUNDS = [
  { id:'none',      label:'Ingen',    url:null, thumb:null },
  { id:'mountains', label:'Berg',     url:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=60&auto=format&fit=crop' },
  { id:'forest',    label:'Skog',     url:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=60&auto=format&fit=crop' },
  { id:'ocean',     label:'Hav',      url:'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=400&q=60&auto=format&fit=crop' },
  { id:'city',      label:'Stad',     url:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&q=60&auto=format&fit=crop' },
  { id:'aurora',    label:'Norrsken', url:'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=400&q=60&auto=format&fit=crop' },
  { id:'desert',    label:'Öken',     url:'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=400&q=60&auto=format&fit=crop' },
  { id:'balkans',   label:'Balkan',   url:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=60&auto=format&fit=crop' },
  { id:'space',     label:'Rymden',   url:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80&auto=format&fit=crop', thumb:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400&q=60&auto=format&fit=crop' },
]

export const BLUR_LEVELS = [
  { id:'low',    label:'Lite',   cls:'bg-blur-low' },
  { id:'medium', label:'Medel',  cls:'bg-blur-medium' },
  { id:'high',   label:'Mycket', cls:'bg-blur-high' },
]

export const DIM_LEVELS = [
  { id:'light',  label:'Lätt',  dark:'rgba(7,9,15,0.35)',  light:'rgba(240,242,248,0.25)' },
  { id:'medium', label:'Medel', dark:'rgba(7,9,15,0.55)',  light:'rgba(240,242,248,0.45)' },
  { id:'dark',   label:'Mörk',  dark:'rgba(7,9,15,0.78)',  light:'rgba(240,242,248,0.68)' },
]

function applyBackground(bgId, blurId, dimId) {
  const bg   = BACKGROUNDS.find(b => b.id === bgId)   || BACKGROUNDS[0]
  const blur = BLUR_LEVELS.find(b => b.id === blurId)  || BLUR_LEVELS[1]
  const dim  = DIM_LEVELS.find(d => d.id === dimId)    || DIM_LEVELS[1]

  const el     = document.getElementById('bg-image')
  const gradEl = document.getElementById('bg-gradient')
  const body   = document.body
  const isDark = document.documentElement.dataset.theme !== 'light'

  if (!el) return

  if (bg.url) {
    el.style.backgroundImage = 'url(' + bg.url + ')'
    el.style.opacity = '1'
    if (gradEl) gradEl.style.opacity = '0'
    body.classList.add('has-bg-image')
    BLUR_LEVELS.forEach(b => body.classList.remove(b.cls))
    body.classList.add(blur.cls)
    document.documentElement.style.setProperty('--bg-overlay', isDark ? dim.dark : dim.light)
  } else {
    el.style.opacity = '0'
    el.style.backgroundImage = ''
    if (gradEl) gradEl.style.opacity = '1'
    body.classList.remove('has-bg-image')
    BLUR_LEVELS.forEach(b => body.classList.remove(b.cls))
    document.documentElement.style.removeProperty('--bg-overlay')
  }
}

export function useBackground() {
  const [bgId,   setBgId]   = useState(() => localStorage.getItem('sigge-bg')   || 'none')
  const [blurId, setBlurId] = useState(() => localStorage.getItem('sigge-blur') || 'medium')
  const [dimId,  setDimId]  = useState(() => localStorage.getItem('sigge-dim')  || 'medium')

  useEffect(() => {
    applyBackground(bgId, blurId, dimId)
  }, [bgId, blurId, dimId])

  // Also apply on mount (for page loads / navigation)
  useEffect(() => {
    applyBackground(
      localStorage.getItem('sigge-bg')   || 'none',
      localStorage.getItem('sigge-blur') || 'medium',
      localStorage.getItem('sigge-dim')  || 'medium',
    )
  }, [])

  function setBackground(id) { setBgId(id); localStorage.setItem('sigge-bg', id) }
  function setBlur(id)       { setBlurId(id); localStorage.setItem('sigge-blur', id) }
  function setDim(id)        { setDimId(id); localStorage.setItem('sigge-dim', id) }

  return {
    bgId, blurId, dimId,
    bg:   BACKGROUNDS.find(b => b.id === bgId)   || BACKGROUNDS[0],
    blur: BLUR_LEVELS.find(b => b.id === blurId)  || BLUR_LEVELS[1],
    dim:  DIM_LEVELS.find(d => d.id === dimId)    || DIM_LEVELS[1],
    setBackground, setBlur, setDim,
  }
}

// Call this from AppLayout on init without the hook overhead
export function initBackground() {
  applyBackground(
    localStorage.getItem('sigge-bg')   || 'none',
    localStorage.getItem('sigge-blur') || 'medium',
    localStorage.getItem('sigge-dim')  || 'medium',
  )
}
