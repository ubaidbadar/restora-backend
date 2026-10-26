import type PhotoSizes from '../types/photo_sizes';

interface PhotoProps {
  /** The large photo (1200px). */
  src: string;
  sizes?: PhotoSizes;
  /** How wide it shows, for the browser to pick a file (`sizes` of the img), e.g. "112px". */
  shownAt: string;
  className?: string;
  /** In the first screenful: loaded at once instead of when scrolled to. */
  priority?: boolean;
}

/**
 * A dish or deal photo that loads fast: the browser picks the smallest saved size for how wide it shows and the
 * screen's density (160, 480 or 1200px WebP), a blurred preview fills its place until it arrives, and photos below the
 * first screenful wait until they are scrolled to. Photos saved before sizes existed show as they are.
 */
export default function Photo({ src, sizes, shownAt, className = '', priority = false }: PhotoProps) {
  return (
    <img
      src={sizes?.md ?? src}
      srcSet={sizes ? `${sizes.sm} 160w, ${sizes.md} 480w, ${src} 1200w` : undefined}
      sizes={sizes ? shownAt : undefined}
      width={sizes?.width}
      height={sizes?.height}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      style={sizes ? { backgroundImage: `url(${sizes.blur})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      className={`bg-canvas aspect-square object-cover object-center ${className}`}
    />
  );
}
