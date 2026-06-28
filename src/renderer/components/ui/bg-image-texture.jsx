import { cn } from "@/lib/utils"

const textureMap = {
  "fabric-of-squares": "/textures/fabric-of-squares.png",
  "grid-noise": "/textures/grid-noise.png",
  inflicted: "/textures/inflicted.png",
  "debut-light": "/textures/debut-light.png",
  groovepaper: "/textures/groovepaper.png",
}

export function BackgroundImageTexture({
  variant = "fabric-of-squares",
  opacity = 0.5,
  className,
  children
}) {
  const textureUrl = variant !== "none" ? textureMap[variant] : null

  return (
    <div className={cn("relative", className)}>
      {textureUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${textureUrl})`,
            backgroundRepeat: "repeat",
            opacity,
          }} />
      )}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
