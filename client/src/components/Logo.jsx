/** The ADVS logo (client/public/advs-logo.png). Decorative when text next to it names the app. */
export default function Logo({ size = 36, decorative = false, className = '' }) {
  return (
    <img
      src="/advs-logo.png"
      width={size}
      height={size}
      alt={decorative ? '' : 'ADVS logo'}
      aria-hidden={decorative || undefined}
      className={`logo ${className}`.trim()}
      draggable="false"
    />
  );
}
