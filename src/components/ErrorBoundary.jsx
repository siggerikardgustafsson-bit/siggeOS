import { Component } from 'react'

// App-wide crash guard. Without this, any render-time exception (bad data from
// the DB, an undefined access, a failed lazy-chunk fetch after a deploy) blanks
// the whole screen with nothing but a console error. Here the user gets a
// recovery UI instead, and the rest of the app shell keeps working.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack)
    // A stale lazy chunk after a deploy throws a module-load error — a reload
    // pulls the new chunk. Do it once (guard against a reload loop).
    const isChunkError = /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(
      error?.message || '',
    )
    if (isChunkError && !sessionStorage.getItem('mx-chunk-reloaded')) {
      try { sessionStorage.setItem('mx-chunk-reloaded', '1') } catch (_) {}
      window.location.reload()
    }
  }

  reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="maxxit-loading-screen">
        <div className="maxxit-loading-card" style={{ maxWidth: 380, textAlign: 'center' }}>
          <div className="maxxit-logo maxxit-logo-large"><span>Maxx</span><strong>It</strong></div>
          <div className="maxxit-loading-text" style={{ marginBottom: 4 }}>Något gick fel här.</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
            Sidan kraschade oväntat. Din data är oförändrad.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={this.reset}>Försök igen</button>
            <button className="btn btn-ghost" onClick={() => { window.location.href = '/' }}>Till startsidan</button>
          </div>
        </div>
      </div>
    )
  }
}
