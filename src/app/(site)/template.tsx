/**
 * A template re-mounts on every navigation (a layout does not), so this gives each page a short
 * fade-and-rise entrance. Pure CSS; disabled automatically for users who prefer reduced motion.
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
