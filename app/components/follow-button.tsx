"use client";

import { useEffect, useState, useTransition } from "react";

import { follow, unfollow } from "@/app/actions/follow";
import { useSignIn, useSignedIn } from "@/app/components/session";

/** Follow/unfollow, on another account's own profile page. */
export function FollowButton({
  targetId,
  targetUsername,
  initialFollowing,
  compact,
  className,
}: {
  targetId: string;
  targetUsername: string;
  initialFollowing: boolean;
  compact?: boolean;
  className?: string | ((following: boolean) => string);
}) {
  const signedIn = useSignedIn();
  const signIn = useSignIn();
  const [following, setFollowing] = useState(initialFollowing);

  useEffect(() => {
    function handleFollowChange(event: Event) {
      const customEvent = event as CustomEvent<{ targetId: string; following: boolean }>;
      if (customEvent.detail && customEvent.detail.targetId === targetId) {
        setFollowing(customEvent.detail.following);
      }
    }

    window.addEventListener("kino:follow-change", handleFollowChange);
    return () => window.removeEventListener("kino:follow-change", handleFollowChange);
  }, [targetId]);

  function broadcast(next: boolean) {
    window.dispatchEvent(
      new CustomEvent("kino:follow-change", {
        detail: { targetId, following: next },
      }),
    );
  }

  function click() {
    if (!signedIn) {
      signIn("To follow this person");
      return;
    }
    const next = !following;

    // Instant optimistic update for immediate color & text response
    setFollowing(next);
    broadcast(next);

    const action = next
      ? follow(targetId, targetUsername)
      : unfollow(targetId, targetUsername);

    action.then((result) => {
      if (!result.ok) {
        setFollowing(!next);
        broadcast(!next);
      }
    });
  }

  const computedClassName =
    typeof className === "function"
      ? className(following)
      : className
        ? `${className} ${following ? "btn btn-quiet" : "btn btn-primary"}`
        : compact
          ? `h-7 px-3.5 text-xs rounded-full font-semibold transition-colors shrink-0 ${
              following ? "btn btn-quiet" : "btn btn-primary"
            }`
          : `w-full ${following ? "btn btn-quiet" : "btn btn-primary"}`;

  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={signedIn && following}
      className={computedClassName}
    >
      {signedIn && following ? "Following" : "Follow"}
    </button>
  );
}
