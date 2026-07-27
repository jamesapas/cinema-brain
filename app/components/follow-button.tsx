"use client";

import { useState, useTransition } from "react";

import { follow, unfollow } from "@/app/actions/follow";
import { useSignIn, useSignedIn } from "@/app/components/session";

/** Follow/unfollow, on another account's own profile page. */
export function FollowButton({
  targetId,
  targetUsername,
  initialFollowing,
}: {
  targetId: string;
  targetUsername: string;
  initialFollowing: boolean;
}) {
  const signedIn = useSignedIn();
  const signIn = useSignIn();
  const [following, setFollowing] = useState(initialFollowing);
  const [, startTransition] = useTransition();

  function click() {
    if (!signedIn) {
      signIn("To follow this person");
      return;
    }
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const result = next
        ? await follow(targetId, targetUsername)
        : await unfollow(targetId, targetUsername);
      if (!result.ok) setFollowing(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={signedIn && following}
      className={`w-full ${following ? "btn btn-quiet" : "btn btn-primary"}`}
    >
      {signedIn && following ? "Following" : "Follow"}
    </button>
  );
}
