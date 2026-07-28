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

/** Where the character counter starts being worth showing. */
const COUNTER_FROM = MAX_POST_LENGTH - 120;

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
  const router = useRouter();
  const signedIn = useSignedIn();
  const signIn = useSignIn();

  const [body, setBody] = useState("");
  const [films, setFilms] = useState<MovieCard[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grows with what's typed rather than scrolling inside four lines: a post is
  // short, and a box that scrolls hides the beginning of your own sentence.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [body]);

  if (!signedIn) {
    return (
      <div className="rounded-lg border border-ink-line bg-ink-raised px-5 py-6">
        <p className="leading-relaxed text-bone-soft">
          Sign in to post about what you&rsquo;ve been watching — and to follow the people
          whose taste you trust.
        </p>
        <button
          type="button"
          onClick={() => signIn("To post about a film")}
          className="btn btn-primary mt-4"
        >
          Sign in
        </button>
      </div>
    );
  }

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

      setBody("");
      setFilms([]);
      setPicking(false);
      // The action revalidated the feed; this is what pulls the new render in
      // without navigating away from the page you're standing on.
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-ink-line bg-ink-raised p-4 transition-colors focus-within:border-bone/25"
    >
      <div className="flex gap-3.5">
        <Avatar url={avatarUrl} initials={initials} size={44} className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <label htmlFor="post-body" className="sr-only">
            Write a post
          </label>
          <textarea
            id="post-body"
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
            placeholder={`What have you been watching, ${displayName.split(" ")[0]}?`}
            className="w-full resize-none bg-transparent text-lg leading-relaxed text-bone placeholder:text-bone-dim focus:outline-none"
          />

          {films.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
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
                // Closed on choosing, because attaching a second film is the
                // less common case and re-opening it is one click.
                setPicking(false);
              }}
              onClose={() => setPicking(false)}
            />
          )}

          <div className="mt-3 flex items-center gap-3 border-t border-ink-line pt-3">
            <button
              type="button"
              onClick={() => setPicking((current) => !current)}
              disabled={films.length >= MAX_POST_MOVIES}
              aria-expanded={picking}
              className="flex items-center gap-1.5 text-sm font-semibold text-bone-soft transition-colors hover:text-lamp disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-bone-soft"
            >
              <Icon icon="lucide:clapperboard" width={17} height={17} aria-hidden />
              {films.length >= MAX_POST_MOVIES
                ? `${MAX_POST_MOVIES} films is the limit`
                : films.length > 0
                  ? "Add another film"
                  : "Add a film"}
            </button>

            <div className="ml-auto flex items-center gap-3">
              {/* Silent until it's nearly relevant. A counter that starts at
                  1000 is a rule announced before anyone has broken it. */}
              {trimmed.length > COUNTER_FROM && (
                <span className={`meta tabular-nums ${tooLong ? "!text-ember" : ""}`}>
                  {MAX_POST_LENGTH - trimmed.length}
                </span>
              )}

              <button type="submit" disabled={!canPost} className="btn btn-primary h-9 px-5 text-sm">
                {pending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="meta mt-2 !text-lamp">
              {error}
            </p>
          )}
        </div>
      </div>
    </form>
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
    inputRef.current?.focus();
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
    <div className="mt-3 overflow-hidden rounded-lg border border-ink-line bg-ink">
      <div className="relative border-b border-ink-line">
        <Icon
          icon="iconamoon:search"
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
          className="h-11 w-full bg-transparent pr-10 pl-10 text-sm text-bone placeholder:text-bone-dim focus:outline-none"
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
