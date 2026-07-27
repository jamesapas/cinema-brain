import { FollowListPage } from "@/app/[username]/follow-list-page";

type PageProps = { params: Promise<{ username: string }> };

export default async function FollowersPage({ params }: PageProps) {
  const { username } = await params;
  return <FollowListPage username={username} kind="followers" />;
}
