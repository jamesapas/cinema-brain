import Image from "next/image";

import { AskAboutButton } from "@/app/components/chat-drawer";
import { MoreInfoButton } from "@/app/components/movie-details";
import { StarRating } from "@/app/components/star-rating";
import { backdropUrl, metaLine, type MovieCard } from "@/lib/movies/images";

/** Overviews run long; the hero wants a taste, not the whole synopsis. */
function blurb(overview: string | null, max = 180) {
  if (!overview) return null;
  if (overview.length <= max) return overview;
  const cut = overview.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "));
  return `${(lastStop > 90 ? cut.slice(0, lastStop) : cut).trimEnd()}…`;
}

export function Hero({ movie, rating }: { movie: MovieCard; rating: number | null }) {
  const backdrop = backdropUrl(movie.backdrop_path);
  const text = blurb(movie.overview);

  return (
    // The artwork bleeds the full width of the viewport and runs under the
    // fixed header; the text on top of it stays in the page container, so the
    // title lines up with the shelf headings below.
    <section className="relative isolate min-h-[62vh] w-full overflow-hidden sm:min-h-[70vh]">
      {backdrop && (
        <Image
          src={backdrop}
          alt=""
          fill
          // Hero is the LCP element, so it loads eagerly at full width.
          priority
          sizes="100vw"
          className="object-cover object-top"
        />
      )}

      {/* Two gradients: one lifts the text off the image, one blends the bottom
          edge into the first row of posters so there's no hard seam. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />

      <div className="page-container relative flex min-h-[62vh] flex-col justify-end pt-24 pb-12 sm:min-h-[70vh] lg:pb-16">
        <div className="max-w-xl">
          <p className="label">Featured</p>

          <h1 className="mt-2 text-4xl leading-[1.02] font-bold text-bone sm:text-5xl lg:text-6xl">
            {movie.title}
          </h1>

          <p className="meta mt-3 !text-sm">{metaLine(movie)}</p>

          {text && <p className="mt-4 max-w-lg leading-relaxed text-bone-soft">{text}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AskAboutButton title={movie.title} />
            <MoreInfoButton movie={movie} rating={rating} />
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <span className="label">Your rating</span>
            <StarRating movieId={movie.id} rating={rating} size="lg" />
          </div>
        </div>
      </div>
    </section>
  );
}
