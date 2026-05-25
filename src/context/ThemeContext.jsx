import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [accent, setAccent] = useState(() => localStorage.getItem('accent') || 'blue')
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('bgImage') || '')
  const [compact, setCompact] = useState(() => localStorage.getItem('compact') === 'true')

  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-theme', theme)
    html.setAttribute('data-accent', accent)
    localStorage.setItem('theme', theme)
    localStorage.setItem('accent', accent)
  }, [theme, accent])

  useEffect(() => {
    const bgEl = document.getElementById('bg-image')
    if (bgEl) {
      if (bgImage) {
        bgEl.style.backgroundImage = `url(${bgImage})`
        bgEl.style.opacity = '1'
      } else {
        bgEl.style.opacity = '0'
      }
    }
    localStorage.setItem('bgImage', bgImage)
  }, [bgImage])

  useEffect(() => {
    document.documentElement.style.setProperty('--spacing-scale', compact ? '0.85' : '1')
    localStorage.setItem('compact', compact)
  }, [compact])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent, bgImage, setBgImage, compact, setCompact }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
