import { Icon } from "@iconify/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/app/components/app-shell";
import { Avatar } from "@/app/components/avatar";
import { FollowButton } from "@/app/components/follow-button";
import { FollowListRow } from "@/app/components/follow-list-row";
import { ProfileSidebar } from "@/app/components/profile-sidebar";
import { getViewer } from "@/lib/auth/viewer";
import { getRatedMovies } from "@/lib/movies/catalog";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import {
  getFollowCounts,
  getFollowers,
  getFollowing,
  getFollowingIds,
} from "@/lib/profiles/follows";
import { getProfileByUsername } from "@/lib/profiles/queries";
import { formatWatchTime, tasteStats } from "@/lib/profiles/stats";
import { createServerSupabase } from "@/lib/supabase/server";

/** Short form for the visitor rail's tight stats — "Jul 2026", not "July 2026". */
const JOINED_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

/**
 * The followers and following lists, shared between both — same header,
 * same rail, same empty state shape, just a different edge of the `follows`
 * table and which tab is lit.
 */
export async function FollowListPage({
  username,
  kind,
}: {
  username: string;
  kind: "followers" | "following";
}) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  const isOwner = viewer?.username?.toLowerCase() === username.toLowerCase();

  const profile = isOwner ? viewer!.profile : await getProfileByUsername(supabase, username);
  if (!profile) notFound();

  const [people, counts, viewerFollowingIds, rated] = await Promise.all([
    kind === "followers" ? getFollowers(supabase, profile.id) : getFollowing(supabase, profile.id),
    getFollowCounts(supabase, profile.id),
    viewer ? getFollowingIds(supabase, viewer.id) : Promise.resolve(new Set<string>()),
    isOwner ? Promise.resolve([]) : getRatedMovies(supabase, profile.id),
  ]);

  const name = isOwner ? viewer!.displayName : displayNameFor(profile.display_name, profile.username);
  const initials = isOwner ? viewer!.initials : initialsFor(profile.display_name, profile.username);
  const picture = isOwner ? viewer!.avatarUrl : avatarUrl(profile.avatar_path);
  const stats = tasteStats(rated);
  const joined = JOINED_FORMAT.format(new Date(profile.created_at));

  const empty =
    kind === "followers"
      ? {
          heading: "No followers yet",
          body: isOwner
            ? "Once someone follows you, they'll show up here."
            : `Once someone follows ${name}, they'll show up here.`,
        }
      : {
          heading: "Not following anyone yet",
          body: isOwner
            ? "Follow someone and they'll show up here."
            : `Once ${name} follows someone, they'll show up here.`,
        };

  return (
    <AppShell viewer={viewer}>
      <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-14">
        {isOwner ? (
          <ProfileSidebar
            displayName={name}
            username={profile.username}
            avatarUrl={picture}
            initials={initials}
            bio={profile.bio}
            followers={counts.followers}
            following={counts.following}
          />
        ) : (
          <aside className="lg:sticky lg:top-28 lg:h-fit lg:self-start">
            <Link href={`/${profile.username}`} className="flex items-center gap-3.5">
              <Avatar url={picture} initials={initials} size={52} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-bone">{name}</p>
                <p className="meta truncate !text-xs">@{profile.username}</p>
              </div>
            </Link>

            {profile.bio && (
              <p className="mt-3 text-sm leading-relaxed text-bone-soft">{profile.bio}</p>
            )}

            <div className="mt-5 w-full">
              <FollowButton
                targetId={profile.id}
                targetUsername={profile.username}
                initialFollowing={viewer ? viewerFollowingIds.has(profile.id) : false}
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Icon icon="mdi:account-multiple-outline" className="size-4 text-bone/70" />

              <Link
                href={`/${profile.username}/followers`}
                className="meta follow-count-link"
              >
                <strong className="font-semibold text-bone">{counts.followers}</strong> followers
              </Link>

              <span className="text-bone/40">•</span>

              <Link
                href={`/${profile.username}/following`}
                className="meta follow-count-link"
              >
                <strong className="font-semibold text-bone">{counts.following}</strong> following
              </Link>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon icon="lucide:calendar" className="size-4 text-bone/70" />
                <span className="meta">Joined {joined}</span>
              </div>

              {stats.count > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:clapperboard" className="size-4 text-bone/70" />
                    <span className="meta">
                      <strong className="font-semibold text-bone">{stats.count}</strong> films rated
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:star" className="size-4 text-bone/70" />
                    <span className="meta">
                      <strong className="font-semibold text-bone">
                        {stats.averageStars ? `${stats.averageStars.toFixed(1)}★` : "—"}
                      </strong>{" "}
                      average
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:clock" className="size-4 text-bone/70" />
                    <span className="meta">
                      <strong className="font-semibold text-bone">
                        {formatWatchTime(stats.totalMinutes)}
                      </strong>{" "}
                      rated
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon icon="lucide:sparkles" className="mt-0.5 size-4 shrink-0 text-bone/70" />
                    <span className="meta">
                      Mostly{" "}
                      <strong className="font-semibold text-bone">
                        {stats.topGenres.length > 0
                          ? stats.topGenres
                              .slice(0, 3)
                              .map((entry) => entry.genre)
                              .join(", ")
                          : "—"}
                      </strong>
                    </span>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}

        <div className="mt-10 lg:mt-0">
          <h1 className="border-b border-ink-line pb-4 text-xl font-bold text-bone">
            {kind === "followers" ? "Followers" : "Following"}
          </h1>

          {people.length === 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold text-bone">{empty.heading}</h2>
              <p className="mt-2 max-w-md leading-relaxed text-bone-soft">{empty.body}</p>
            </section>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-ink-line">
              {people.map((person) => (
                <FollowListRow
                  key={person.id}
                  profile={person}
                  showFollowButton={viewer !== null && viewer.id !== person.id}
                  initialFollowing={viewerFollowingIds.has(person.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}
