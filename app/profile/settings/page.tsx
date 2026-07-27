import { AppShell } from "@/app/components/app-shell";
import { ProfileSettingsForm } from "@/app/components/profile-settings-form";
import { ProfileSidebar } from "@/app/components/profile-sidebar";
import { SignInPrompt } from "@/app/components/sign-in-prompt";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowCounts } from "@/lib/profiles/follows";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

/** Dates are formatted with a fixed locale so server and client agree. */
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

export default async function ProfileSettingsPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);

  if (!viewer) {
    return (
      <AppShell viewer={null}>
        <main className="page-container flex flex-1 items-center justify-center pt-28 pb-24">
          <SignInPrompt
            heading="Your account is waiting"
            body="Your picture, your handle, and the name people see. Sign in to change them."
            reason="To edit your profile"
          />
        </main>
      </AppShell>
    );
  }

  const {
    email,
    profile,
    displayName: name,
    initials,
    avatarUrl: picture,
  } = viewer;
  const memberSince = MONTH_YEAR.format(
    new Date(profile?.created_at ?? viewer.createdAt),
  );
  const counts = await getFollowCounts(supabase, viewer.id);

  return (
    <AppShell viewer={viewer}>
      <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-14">
        <ProfileSidebar
          displayName={name}
          username={viewer.username}
          avatarUrl={picture}
          initials={initials}
          bio={profile?.bio ?? null}
          followers={counts.followers}
          following={counts.following}
        />

        <div className="mt-10 lg:mt-0">
          <h1 className="text-2xl font-bold text-bone">Settings</h1>

          <div className="mt-8">
            <ProfileSettingsForm
              userId={viewer.id}
              email={email}
              username={viewer.username}
              displayName={profile?.display_name ?? null}
              bio={profile?.bio ?? null}
              avatarUrl={picture}
              initials={initials}
              memberSince={memberSince}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
