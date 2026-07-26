import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/app/components/app-shell";
import { AvatarUploader } from "@/app/components/avatar-uploader";
import { DisplayNameForm } from "@/app/components/display-name-form";
import { PosterCard } from "@/app/components/poster-card";
import { getRatedMovies } from "@/lib/movies/catalog";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getProfile } from "@/lib/profiles/queries";
import { formatWatchTime, tasteStats, type StarBucket } from "@/lib/profiles/stats";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Your profile · Cinema Brain" };

/** Dates are formatted with a fixed locale so server and client agree. */
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export default async function ProfilePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile, rated] = await Promise.all([
    getProfile(supabase),
    getRatedMovies(supabase),
  ]);

  const email = user.email ?? "signed in";
  const name = displayNameFor(profile?.display_name ?? null, email);
  const initials = initialsFor(profile?.display_name ?? null, email);
  const picture = avatarUrl(profile?.avatar_path);
  const stats = tasteStats(rated);
  const memberSince = MONTH_YEAR.format(new Date(profile?.created_at ?? user.created_at));
  const ratingsById = Object.fromEntries(rated.map((entry) => [entry.movie.id, entry.rating]));
  const notes = rated.filter((entry) => entry.notes);

  return (
    <AppShell email={email} displayName={name} avatarUrl={picture} initials={initials}>
      <main className="page-container flex-1 pt-28 pb-24">
        <div className="flex flex-col gap-12">
          <section className="flex flex-col gap-7">
            <div>
              <p className="label">Your profile</p>
              <h1 className="mt-2 text-3xl font-bold text-bone sm:text-4xl">{name}</h1>
              <p className="meta mt-2">
                {email} · Member since {memberSince}
              </p>
            </div>

            <AvatarUploader userId={user.id} url={picture} initials={initials} />
            <DisplayNameForm value={profile?.display_name ?? null} />
          </section>

          {stats.count === 0 ? (
            <EmptyState />
          ) : (
            <>
              <section>
                <h2 className="text-xl font-bold text-bone">Your taste, so far</h2>
                <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Films rated" value={String(stats.count)} />
                  <Stat
                    label="Average rating"
                    value={stats.averageStars ? `${stats.averageStars.toFixed(1)}★` : "—"}
                  />
                  <Stat label="Runtime rated" value={formatWatchTime(stats.totalMinutes)} />
                  <Stat
                    label="Most-rated genre"
                    value={stats.topGenres[0]?.genre ?? "—"}
                    note={
                      stats.topGenres[0]
                        ? `${stats.topGenres[0].count} of ${stats.count}`
                        : undefined
                    }
                  />
                </dl>
              </section>

              {/* Capped: across the full container a bar becomes a stripe and
                  its count drifts off the far end. */}
              <div className="grid max-w-4xl gap-10 lg:grid-cols-2">
                <RatingSpread distribution={stats.distribution} total={stats.count} />
                <GenreSpread genres={stats.topGenres} total={stats.count} />
              </div>

              <section>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-xl font-bold text-bone">Films you&rsquo;ve rated</h2>
                  <span className="meta">Highest first</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-4">
                  {rated.map((entry) => (
                    <PosterCard
                      key={entry.movie.id}
                      movie={entry.movie}
                      rating={ratingsById[entry.movie.id] ?? null}
                    />
                  ))}
                </div>
              </section>

              {notes.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold text-bone">Your notes</h2>
                  <ul className="mt-5 flex max-w-3xl flex-col gap-4">
                    {notes.map((entry) => (
                      <li
                        key={entry.movie.id}
                        className="border-l-2 border-ink-line pl-4 transition-colors hover:border-lamp"
                      >
                        <p className="font-semibold text-bone">
                          {entry.movie.title}{" "}
                          <span className="meta">· {entry.rating / 2}★</span>
                        </p>
                        <p className="mt-1 leading-relaxed text-bone-soft">{entry.notes}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-line bg-ink-raised px-4 py-4">
      <dt className="label !text-[0.6875rem]">{label}</dt>
      {/* Wraps rather than truncates: a genre name is the value, not a label,
          and "Science …" tells you nothing. */}
      <dd className="mt-1.5 text-2xl leading-tight font-bold text-balance text-bone">
        {value}
      </dd>
      {note && <p className="meta mt-0.5 !text-xs">{note}</p>}
    </div>
  );
}

/**
 * How they score things, as five bars.
 *
 * One series, so one hue and no legend — the heading names it. Counts are
 * labelled directly rather than behind a hover, since there are only five and
 * the exact number is the interesting part. Bars are gold at 70% against an
 * ink track: enough contrast to read as data, not enough to shout over the
 * page's one accent.
 */
function RatingSpread({
  distribution,
  total,
}: {
  distribution: StarBucket[];
  total: number;
}) {
  const peak = Math.max(...distribution.map((bucket) => bucket.count), 1);

  return (
    <section>
      <h2 className="text-xl font-bold text-bone">How you rate</h2>
      {/* Say the rounding out loud: a 1.5★ film lands in the 2★ bar. */}
      <p className="meta mt-1">{total} ratings, rounded to the nearest star</p>

      <ul className="mt-5 flex flex-col gap-2.5">
        {/* Best score at the top: the list reads like a ranking, not a scale. */}
        {[...distribution].reverse().map((bucket) => (
          <li key={bucket.stars} className="flex items-center gap-3">
            <span className="meta w-10 shrink-0 tabular-nums">{bucket.stars}★</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-line">
              <span
                className="block h-full rounded-full bg-lamp/70"
                style={{ width: `${(bucket.count / peak) * 100}%` }}
              />
            </span>
            <span className="meta w-6 shrink-0 text-right tabular-nums">
              {bucket.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GenreSpread({
  genres,
  total,
}: {
  genres: { genre: string; count: number }[];
  total: number;
}) {
  const peak = Math.max(...genres.map((entry) => entry.count), 1);

  return (
    <section>
      <h2 className="text-xl font-bold text-bone">What you watch</h2>
      <p className="meta mt-1">Genres across your {total} rated films</p>

      <ul className="mt-5 flex flex-col gap-2.5">
        {genres.map((entry) => (
          <li key={entry.genre} className="flex items-center gap-3">
            <span className="meta w-28 shrink-0 truncate">{entry.genre}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-line">
              <span
                className="block h-full rounded-full bg-lamp/70"
                style={{ width: `${(entry.count / peak) * 100}%` }}
              />
            </span>
            <span className="meta w-6 shrink-0 text-right tabular-nums">{entry.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-lg border border-ink-line bg-ink-raised px-6 py-10 text-center">
      <h2 className="text-xl font-bold text-bone">Nothing rated yet</h2>
      <p className="mx-auto mt-2 max-w-md leading-relaxed text-bone-soft">
        Rate a few films and this page fills in — how you score things, what you
        gravitate towards, and how long you&rsquo;ve spent on it.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Browse the catalog
      </Link>
    </section>
  );
}
