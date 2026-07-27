import Link from "next/link";

import { Avatar } from "@/app/components/avatar";
import { FollowButton } from "@/app/components/follow-button";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import type { FollowProfile } from "@/lib/profiles/follows";

/** One row in a followers/following list: who they are, and a way to follow them back. */
export function FollowListRow({
  profile,
  showFollowButton,
  initialFollowing,
}: {
  profile: FollowProfile;
  showFollowButton: boolean;
  initialFollowing: boolean;
}) {
  const name = displayNameFor(profile.display_name, profile.username);
  const initials = initialsFor(profile.display_name, profile.username);
  const picture = avatarUrl(profile.avatar_path);

  return (
    <li className="flex items-center gap-3.5 py-3">
      <Link href={`/${profile.username}`} className="flex min-w-0 flex-1 items-center gap-3.5">
        <Avatar url={picture} initials={initials} size={44} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-bone">{name}</p>
          <p className="meta truncate !text-xs">@{profile.username}</p>
        </div>
      </Link>

      {showFollowButton && (
        <div className="w-28 shrink-0">
          <FollowButton
            targetId={profile.id}
            targetUsername={profile.username}
            initialFollowing={initialFollowing}
          />
        </div>
      )}
    </li>
  );
}
