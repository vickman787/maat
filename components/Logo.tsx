import Image from "next/image";
import Link from "next/link";

export function Logo({
  href = "/",
  light = false,
  size = 38,
}: {
  href?: string;
  light?: boolean;
  size?: number;
}) {
  return (
    <Link href={href} className="logo-link" aria-label="Maat home" style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
      <Image
        src="/logo-symbol.png"
        alt=""
        width={size}
        height={size}
        className="logo-mark"
        style={{ width: size, height: size }}
      />
      <span className="logo-word" style={{ color: light ? "#fff" : undefined }}>
        Maat<span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
