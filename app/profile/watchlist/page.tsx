import { MovieListPage } from "@/app/profile/movie-list-page";

export const metadata = { title: "Your watchlist" };

export default function WatchlistPage() {
  return (
    <MovieListPage
      list="watchlist"
      heading="Watchlist"
      note={(count) => `${count} film${count === 1 ? "" : "s"} to get to, newest first`}
      signedOut={{
        heading: "Your watchlist is waiting",
        body: "Everything you've meant to get to, in one place. Sign in to see yours.",
        reason: "To see your watchlist",
      }}
      empty={{
        heading: "Nothing saved yet",
        body: "The bookmark on any poster puts a film here, so the next thing to watch is never a decision you make from scratch.",
      }}
    />
  );
}
