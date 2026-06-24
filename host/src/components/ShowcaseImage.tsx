import Image from "next/image";

type ShowcaseImageProps = {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
};

/** Full image visible — no cropping (object-contain, natural aspect ratio). */
export function ShowcaseImage({
  src,
  alt,
  priority = false,
  sizes = "100vw",
  className = "",
}: ShowcaseImageProps) {
  return (
    <div
      className={`overflow-hidden rounded-sm border border-gold/30 bg-cream shadow-lg ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={1200}
        priority={priority}
        sizes={sizes}
        className="h-auto w-full"
      />
    </div>
  );
}
