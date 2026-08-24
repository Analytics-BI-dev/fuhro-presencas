import Image from "next/image";

const logoSizes = {
  compact: "h-12",
  regular: "h-20",
  large: "h-24",
};

type BrandProps = {
  centered?: boolean;
  size?: keyof typeof logoSizes;
  showName?: boolean;
};

export function Brand({
  centered = false,
  size = "regular",
  showName = true,
}: BrandProps) {
  return (
    <div
      className={`flex gap-3 ${
        centered
          ? "flex-col items-center text-center"
          : "items-center text-left"
      }`}
    >
      <Image
        alt="Logo Fuhro"
        className={`${logoSizes[size]} w-auto object-contain`}
        height={93}
        preload={size === "large"}
        src="/fuhro-logo.png"
        width={114}
      />
      {showName ? (
        <div>
          <p className="text-lg font-bold tracking-tight text-brand-secondary">
            Fuhro
          </p>
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            Presenças
          </p>
        </div>
      ) : null}
    </div>
  );
}
