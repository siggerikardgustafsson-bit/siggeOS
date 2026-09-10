// Shared loading skeletons. One shimmer style (.mx-skel / .mx-skel-bar in
// index.css), a few layouts so pages don't each hand-roll "Laddar…".

export function SkeletonBar({ w = '100%', h = 12, r = 7, style }) {
  return <div className="mx-skel mx-skel-bar" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

export function SkeletonCard({ lines = 3, style }) {
  return (
    <div className="card mx-skel" style={{ padding: 18, ...style }}>
      <SkeletonBar w="38%" h={10} style={{ marginBottom: 14 }} />
      <SkeletonBar w="62%" h={26} style={{ marginBottom: 14 }} />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <SkeletonBar key={i} w={`${88 - i * 12}%`} h={9} style={{ marginTop: 8 }} />
      ))}
    </div>
  )
}

export function SkeletonStatRow({ count = 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card mx-skel" style={{ padding: 16 }}>
          <SkeletonBar w="60%" h={9} style={{ marginBottom: 10 }} />
          <SkeletonBar w="45%" h={22} />
        </div>
      ))}
    </div>
  )
}

// Full page: header strip + optional stat row + a few cards.
export default function PageSkeleton({ stats = 4, cards = 3, statBar = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
      <div>
        <SkeletonBar w="180px" h={26} style={{ marginBottom: 8 }} />
        <SkeletonBar w="120px" h={11} />
      </div>
      {statBar && <SkeletonStatRow count={stats} />}
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} lines={i === 0 ? 4 : 3} />
      ))}
    </div>
  )
}
