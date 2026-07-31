"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createPost } from "@/app/actions/posts";
import { Avatar } from "@/app/components/avatar";
import { useSignIn, useSignedIn } from "@/app/components/session";
import { posterUrl, type MovieCard } from "@/lib/movies/images";
import { MIN_SEARCH_LENGTH } from "@/lib/movies/search-config";
import { MAX_POST_LENGTH, MAX_POST_MOVIES } from "@/lib/social/posts";

/**
 * Writing a post.
 *
 * The film picker is the whole reason this isn't a plain textarea. A post on a
 * film site is nearly always about a film, and the difference between a post
 * that names one and a post that links one is whether anyone can get to it —
 * so attaching is a first-class control sitting under the box rather than a URL
 * you're expected to paste.
 *
 * It searches through /api/search, the same endpoint the header's overlay uses.
 * That endpoint is the film search, which is exactly right here: this is the
 * one place in the feed where you are looking for a film rather than a person.
 */

/** Enough to recognise the one you meant without becoming a second page. */
const PICKER_RESULTS = 6;

type SearchResponse = { movies?: MovieCard[]; error?: string };

export function PostComposer({
  displayName,
  avatarUrl,
  initials,
}: {
  displayName: string;
  avatarUrl: string | null;
  initials: string;
}) {
  const signedIn = useSignedIn();
  const signIn = useSignIn();
  const [isOpen, setIsOpen] = useState(false);
  const [initialPicking, setInitialPicking] = useState(false);

  function handleOpen(addFilm = false) {
    if (!signedIn) {
      signIn("To post about a film");
      return;
    }
    setInitialPicking(addFilm);
    setIsOpen(true);
  }

  return (
    <>
      <div
        onClick={() => handleOpen(false)}
        className="group flex items-center gap-3 sm:gap-3.5 rounded-full border border-ink-line bg-bone/5 hover:bg-bone/8 px-3.5 py-2 transition-all cursor-pointer focus-within:ring-1 focus-within:ring-bone/20"
      >
        <Avatar url={avatarUrl} initials={initials} size={36} className="shrink-0" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen(false);
          }}
          className="flex-1 text-left text-xs sm:text-sm text-bone-dim group-hover:text-bone/80 transition-colors truncate"
        >
          What have you been watching, {displayName.split(" ")[0]}?
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-full border border-ink-line/80 bg-bone/8 px-3 py-1.5 text-xs font-semibold text-bone-soft hover:bg-bone/15 hover:text-bone transition-colors shrink-0"
        >
          <Icon icon="lucide:clapperboard" width={15} height={15} aria-hidden />
          <span>Add film</span>
        </button>
      </div>

      {isOpen && (
        <PostModal
          displayName={displayName}
          avatarUrl={avatarUrl}
          initials={initials}
          initialPicking={initialPicking}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function PostModal({
  displayName,
  avatarUrl,
  initials,
  initialPicking = false,
  onClose,
}: {
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  initialPicking?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [films, setFilms] = useState<MovieCard[]>([]);
  const [picking, setPicking] = useState(initialPicking);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialPicking) {
      textareaRef.current?.focus();
    }
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [initialPicking]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(90, element.scrollHeight)}px`;
  }, [body]);

  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX_POST_LENGTH;
  const canPost = trimmed.length > 0 && !tooLong && !pending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canPost) return;

    setError(null);
    startTransition(async () => {
      const result = await createPost(
        trimmed,
        films.map((film) => film.id),
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onClose();
      router.refresh();
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 sm:py-16">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="scrim-in fixed inset-0 bg-ink/75 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create post"
        onKeyDown={onKeyDown}
        className="palette-in relative z-50 flex max-h-full w-full max-w-[540px] flex-col overlay-card rounded-2xl border border-ink-line bg-ink-raised shadow-2xl p-5"
      >
        <div className="flex items-center justify-between border-b border-ink-line pb-3">
          <div className="flex items-center gap-3">
            <Avatar url={avatarUrl} initials={initials} size={36} />
            <div>
              <p className="text-sm font-semibold text-bone">{displayName}</p>
              <p className="text-xs text-bone-dim">Create a post</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
          >
            <Icon icon="lucide:x" width={18} height={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col min-h-0 flex-1">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={MAX_POST_LENGTH}
            rows={3}
            placeholder={`What have you been watching, ${displayName.split(" ")[0]}?`}
            className="w-full resize-none bg-transparent text-base sm:text-lg leading-relaxed text-bone placeholder:text-bone-dim/70 focus:outline-none focus-visible:outline-none composer-input"
          />

          {films.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {films.map((film) => (
                <li key={film.id}>
                  <AttachedFilm
                    film={film}
                    onRemove={() =>
                      setFilms((current) => current.filter((entry) => entry.id !== film.id))
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {picking && (
            <FilmPicker
              chosenIds={films.map((film) => film.id)}
              onChoose={(film) => {
                setFilms((current) =>
                  current.some((entry) => entry.id === film.id)
                    ? current
                    : [...current, film],
                );
                setPicking(false);
              }}
              onClose={() => setPicking(false)}
            />
          )}

          <div className="mt-5 flex items-center gap-3 border-t border-ink-line pt-3.5">
            <button
              type="button"
              onClick={() => setPicking((current) => !current)}
              disabled={films.length >= MAX_POST_MOVIES}
              className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-bone/5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-bone-soft transition-colors hover:bg-bone/10 hover:text-bone disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Icon icon="lucide:clapperboard" width={16} height={16} aria-hidden />
              {films.length >= MAX_POST_MOVIES
                ? `${MAX_POST_MOVIES} films limit`
                : films.length > 0
                  ? "Add another film"
                  : "Add a film"}
            </button>

            <div className="ml-auto flex items-center gap-3">
              {trimmed.length > 0 && (
                <span
                  className={`meta tabular-nums text-xs ${
                    trimmed.length >= MAX_POST_LENGTH - 50 ? "!text-ember font-semibold" : "text-bone-dim/70"
                  }`}
                >
                  {trimmed.length}/{MAX_POST_LENGTH}
                </span>
              )}

              <button type="submit" disabled={!canPost} className="btn btn-primary h-9 px-5 text-sm rounded-full">
                {pending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="meta mt-2 !text-ember text-xs">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/** An attached film, as a chip you can take back off. */
function AttachedFilm({ film, onRemove }: { film: MovieCard; onRemove: () => void }) {
  const src = posterUrl(film.poster_path, "w342");

  return (
    <span className="flex items-center gap-2 rounded-full border border-ink-line bg-bone/8 py-1 pr-1 pl-2">
      <span className="relative block h-7 w-[1.15rem] shrink-0 overflow-hidden rounded-xs bg-ink">
        {src && <Image src={src} alt="" fill sizes="1.15rem" className="object-cover" />}
      </span>
      <span className="max-w-[12rem] truncate text-xs font-semibold text-bone">
        {film.title}
        {film.release_year && <span className="text-bone-dim"> {film.release_year}</span>}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${film.title}`}
        className="grid size-5 shrink-0 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
      >
        <Icon icon="lucide:x" width={13} height={13} aria-hidden />
      </button>
    </span>
  );
}

/**
 * The film search inside the composer.
 *
 * Its own small box rather than the header's overlay: that one takes the whole
 * screen and closes by taking you to a film page, which is the opposite of what
 * someone mid-sentence wants.
 */
function FilmPicker({
  chosenIds,
  onChoose,
  onClose,
}: {
  chosenIds: number[];
  onChoose: (film: MovieCard) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<MovieCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const term = query.trim();

  /** Clearing on the keystroke, not in the effect — see the film overlay. */
  function updateQuery(next: string) {
    setQuery(next);
    if (next.trim().length < MIN_SEARCH_LENGTH) {
      setMovies([]);
      setError(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (term.length < MIN_SEARCH_LENGTH) return;

    const controller = new AbortController();

    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as SearchResponse;
        if (!response.ok) throw new Error(payload.error ?? "Search failed.");

        setMovies(payload.movies ?? []);
        setError(null);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Search failed.");
        setMovies([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [term]);

  const shown = movies.slice(0, PICKER_RESULTS);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-ink-line bg-ink shadow-lg">
      <div className="relative border-b border-ink-line">
        <Icon
          icon="lucide:search"
          width={17}
          height={17}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-bone-dim"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => {
            // Escape closes the picker, not the post you were writing.
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
            // The composer is a form, and Enter in a text input submits it.
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder="Which film?"
          aria-label="Search films to attach"
          autoComplete="off"
          className="h-11 w-full bg-transparent pr-10 pl-10 text-sm text-bone placeholder:text-bone-dim focus:outline-none focus-visible:outline-none composer-input"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close film search"
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
        >
          <Icon icon="lucide:x" width={15} height={15} aria-hidden />
        </button>
      </div>

      {term.length >= MIN_SEARCH_LENGTH && (
        <div className="max-h-64 overflow-y-auto">
          {error ? (
            <p role="alert" className="px-3 py-4 text-sm text-lamp">
              {error}
            </p>
          ) : shown.length === 0 ? (
            <p className="meta px-3 py-4">
              {loading ? "Searching…" : `No title matches “${term}”.`}
            </p>
          ) : (
            <ul className="py-1">
              {shown.map((movie) => {
                const chosen = chosenIds.includes(movie.id);
                return (
                  <li key={movie.id}>
                    <button
                      type="button"
                      onClick={() => onChoose(movie)}
                      disabled={chosen}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bone/10 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
                    >
                      <PickerPoster movie={movie} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-bone">
                          {movie.title}
                        </span>
                        <span className="meta block truncate !text-xs">
                          {[
                            movie.release_year,
                            movie.genres.slice(0, 2).join(", ") || null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {chosen && (
                        <Icon
                          icon="lucide:check"
                          width={16}
                          height={16}
                          aria-label="Already attached"
                          className="shrink-0 text-lamp"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PickerPoster({ movie }: { movie: MovieCard }) {
  const src = posterUrl(movie.poster_path, "w342");

  return (
    <span className="relative block h-12 w-8 shrink-0 overflow-hidden rounded-xs bg-ink-raised ring-1 ring-ink-line">
      {src && <Image src={src} alt="" fill sizes="2rem" className="object-cover" />}
    </span>
  );
}
