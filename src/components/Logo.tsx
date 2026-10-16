export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`logo logo-${size}`} aria-label="Family Game Exchange">
      <span className="logo-mark" aria-hidden="true">
        <i className="jc jc-l" />
        <i className="jc jc-r" />
      </span>
      <span className="logo-word" aria-hidden="true">
        <span className="logo-top">Family</span>
        <span className="logo-main">Game Exchange</span>
      </span>
    </span>
  );
}
