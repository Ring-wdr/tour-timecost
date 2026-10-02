/** "추정" 표기 + 계산 근거 툴팁 (키보드 포커스로도 보임) */
export function Estimate({ tip, label = "추정" }: { tip: string; label?: string }) {
  return (
    <span className="est" tabIndex={0} data-tip={tip} aria-label={`${label}: ${tip}`} role="note">
      {label}
    </span>
  );
}
