/** 데모용 QR 미리보기 (값 기반 결정적 패턴 — 실제 스캔용 아님) */
export const QrBox = ({ value, size = 108 }: { value: string; size?: number }) => {
  const n = 21;
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  let seed = h || 1;
  const cells: boolean[] = [];
  for (let i = 0; i < n * n; i += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    cells.push((seed >>> 16) % 2 === 0);
  }
  const cell = size / n;
  const finder = (cx: number, cy: number) => (
    <>
      <rect x={cx * cell} y={cy * cell} width={cell * 7} height={cell * 7} fill="var(--ink, #111)" />
      <rect x={(cx + 1) * cell} y={(cy + 1) * cell} width={cell * 5} height={cell * 5} fill="#fff" />
      <rect x={(cx + 2) * cell} y={(cy + 2) * cell} width={cell * 3} height={cell * 3} fill="var(--ink, #111)" />
    </>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR: ${value}`}>
      <rect width={size} height={size} fill="#fff" />
      {cells.map((on, i) =>
        on ? (
          <rect
            key={i}
            x={(i % n) * cell}
            y={Math.floor(i / n) * cell}
            width={cell}
            height={cell}
            fill="var(--ink, #111)"
          />
        ) : null
      )}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
};
