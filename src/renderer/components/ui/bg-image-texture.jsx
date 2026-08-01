import { cn } from "@/lib/utils"

export function BackgroundImageTexture({
  opacity = 0.5,
  className,
  children
}) {
  return (
    <div className={cn("relative", className)}>
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
