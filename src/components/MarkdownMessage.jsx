// Simple markdown renderer for chat messages
// Handles: **bold**, headers, tables, bullet lists, numbered lists, code

export default function MarkdownMessage({ content, userMessage = false }) {
  if (!content) return null

  const textColor = userMessage ? 'white' : 'var(--text)'
  const mutedColor = userMessage ? 'rgba(255,255,255,0.7)' : 'var(--muted)'
  const borderColor = userMessage ? 'rgba(255,255,255,0.2)' : 'var(--border)'
  const codeBackground = userMessage ? 'rgba(0,0,0,0.2)' : 'var(--surface2)'
  const headerColor = userMessage ? 'white' : 'var(--text)'

  function parseLine(line, key) {
    // Replace **bold**, *italic*, `code` inline
    const parts = []
    let remaining = line
    let i = 0

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/)
      const italicMatch = remaining.match(/^(.*?)\*(.+?)\*/)
      const codeMatch = remaining.match(/^(.*?)`(.+?)`/)

      const matches = [boldMatch, italicMatch, codeMatch].filter(Boolean)
      if (matches.length === 0) {
        parts.push(<span key={i++}>{remaining}</span>)
        break
      }

      // Pick earliest match
      const earliest = matches.sort((a, b) => a[1].length - b[1].length)[0]
      if (earliest[1]) parts.push(<span key={i++}>{earliest[1]}</span>)

      if (earliest === boldMatch) {
        parts.push(<strong key={i++} style={{ fontWeight: '700', color: headerColor }}>{earliest[2]}</strong>)
      } else if (earliest === italicMatch) {
        parts.push(<em key={i++}>{earliest[2]}</em>)
      } else if (earliest === codeMatch) {
        parts.push(<code key={i++} style={{ background: codeBackground, padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>{earliest[2]}</code>)
      }

      remaining = remaining.slice(earliest[1].length + earliest[0].length - earliest[1].length)
    }
    return parts
  }

  const lines = content.split('\n')
  const elements = []
  let i = 0
  let tableBuffer = []
  let inTable = false

  while (i < lines.length) {
    const line = lines[i]

    // Table detection
    if (line.trim().startsWith('|')) {
      tableBuffer.push(line)
      i++
      continue
    } else if (tableBuffer.length > 0) {
      // Render table
      const tableRows = tableBuffer.filter(r => !r.match(/^\s*\|[-|\s]+\|\s*$/))
      const headers = tableRows[0]?.split('|').filter(c => c.trim()) || []
      const rows = tableRows.slice(1)

      elements.push(
        <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
            <thead>
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} style={{
                    padding: '6px 10px', textAlign: 'left', fontWeight: '700',
                    color: headerColor, borderBottom: `1px solid ${borderColor}`,
                    background: userMessage ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                    whiteSpace: 'nowrap',
                  }}>
                    {parseLine(h.trim(), `th-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split('|').filter(c => c !== undefined).slice(1, -1)
                return (
                  <tr key={ri} style={{ borderBottom: `1px solid ${borderColor}` }}>
                    {cells.map((cell, ci) => (
                      <td key={ci} style={{ padding: '6px 10px', color: textColor }}>
                        {parseLine(cell.trim(), `td-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
      tableBuffer = []
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<div key={i} style={{ fontSize: '14px', fontWeight: '700', color: headerColor, marginTop: '10px', marginBottom: '4px' }}>{parseLine(line.slice(4), i)}</div>)
    } else if (line.startsWith('## ')) {
      elements.push(<div key={i} style={{ fontSize: '15px', fontWeight: '700', color: headerColor, marginTop: '12px', marginBottom: '6px' }}>{parseLine(line.slice(3), i)}</div>)
    } else if (line.startsWith('# ')) {
      elements.push(<div key={i} style={{ fontSize: '16px', fontWeight: '700', color: headerColor, marginTop: '14px', marginBottom: '8px' }}>{parseLine(line.slice(2), i)}</div>)
    }
    // Bullet lists
    else if (line.match(/^[\s]*[-*•]\s/)) {
      const indent = line.match(/^(\s*)/)[1].length
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', paddingLeft: `${indent + 4}px`, marginBottom: '3px' }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }}>•</span>
          <span style={{ color: textColor, lineHeight: '1.5' }}>{parseLine(line.replace(/^[\s]*[-*•]\s/, ''), i)}</span>
        </div>
      )
    }
    // Numbered lists
    else if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)[1]
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, fontWeight: '600', minWidth: '18px' }}>{num}.</span>
          <span style={{ color: textColor, lineHeight: '1.5' }}>{parseLine(line.replace(/^\d+\.\s/, ''), i)}</span>
        </div>
      )
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      elements.push(<div key={i} style={{ height: '1px', background: borderColor, margin: '10px 0' }} />)
    }
    // Empty line
    else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '6px' }} />)
    }
    // Normal text
    else {
      elements.push(
        <p key={i} style={{ margin: '0 0 4px 0', lineHeight: '1.6', color: textColor }}>
          {parseLine(line, i)}
        </p>
      )
    }
    i++
  }

  // Flush remaining table
  if (tableBuffer.length > 0) {
    const tableRows = tableBuffer.filter(r => !r.match(/^\s*\|[-|\s]+\|\s*$/))
    const headers = tableRows[0]?.split('|').filter(c => c.trim()) || []
    const rows = tableRows.slice(1)
    elements.push(
      <div key="final-table" style={{ overflowX: 'auto', margin: '10px 0' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
          <thead>
            <tr>{headers.map((h, hi) => <th key={hi} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '700', color: headerColor, borderBottom: `1px solid ${borderColor}`, background: userMessage ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)' }}>{parseLine(h.trim(), hi)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const cells = row.split('|').filter(c => c !== undefined).slice(1, -1)
              return <tr key={ri} style={{ borderBottom: `1px solid ${borderColor}` }}>{cells.map((cell, ci) => <td key={ci} style={{ padding: '6px 10px', color: textColor }}>{parseLine(cell.trim(), ci)}</td>)}</tr>
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return <div style={{ fontSize: '14px' }}>{elements}</div>
}
