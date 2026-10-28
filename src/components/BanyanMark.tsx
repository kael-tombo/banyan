import Image from "next/image";

/**
 * Brand mark — the official symbol from the banyan-logo-kit.
 * The color variant is drawn on light surfaces; the white one-size variant on
 * canopy (deep-green) surfaces. The kit PNG is square with transparency.
 */
export function BanyanMark({
  size = 28,
  variant = "color",
  className = "",
}: {
  size?: number;
  variant?: "color" | "white";
  className?: string;
}) {
  return (
    <Image
      src={variant === "white" ? "/brand/symbol-white.png" : "/brand/symbol-color.png"}
      alt=""
      width={size}
      height={size}
      priority
      className={`${className}`}
    />
  );
}
