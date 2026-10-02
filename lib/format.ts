export function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export function duration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

export function km(n: number): string {
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)}km`;
}

export function ymd(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}
