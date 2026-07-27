import { MovieListPage } from "@/app/profile/movie-list-page";

export const metadata = { title: "Your favorites" };

export default function FavoritesPage() {
  return (
    <MovieListPage
      list="favorite"
      heading="Favorites"
      note={(count) => `${count} film${count === 1 ? "" : "s"} you love, newest first`}
      signedOut={{
        heading: "Your favorites are waiting",
        body: "The films you'd put on again tonight, kept together. Sign in to see yours.",
        reason: "To see your favorites",
      }}
      empty={{
        heading: "No favorites yet",
        body: "The heart on any poster keeps a film here — the ones worth returning to, separate from everything you've merely rated.",
      }}
    />
  );
}
