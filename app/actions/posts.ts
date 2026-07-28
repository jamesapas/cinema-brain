"use server";

import { revalidatePath } from "next/cache";

import { getComments } from "@/lib/social/queries";
import {
  MAX_POST_MOVIES,
  commentProblem,
  postProblem,
  type PostComment,
} from "@/lib/social/posts";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Writes for posts, likes, reposts and comments.
 *
 * Same posture as the rating and list actions: Server Functions are reachable
 * by direct POST, not only through our own UI, so each one verifies the caller
 * even though RLS is the real boundary. The check turns "silently wrote
 * nothing" into a sentence the interface can show.
 *
 * On revalidation, deliberately uneven:
 *
 *   Writing or deleting a post changes what the feed *contains*, so those
 *   revalidate. Liking, reposting and commenting change a number on a card the
 *   reader is looking at — the client has already moved it optimistically, and
 *   revalidating /feed would re-rank the page under their cursor and slide the
 *   post they just tapped somewhere else. The count is correct locally and
 *   correct again on the next navigation, which is the honest trade.
 */

export type PostResult = { ok: true; postId: string } | { ok: false; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string };
export type CommentResult =
  | { ok: true; comment: PostComment }
  | { ok: false; error: string };
export type CommentsResult =
  | { ok: true; comments: PostComment[] }
  | { ok: false; error: string };

/** Everywhere a post is listed. The feed, and whoever's profile it sits on. */
function revalidatePostSurfaces() {
  revalidatePath("/feed");
  revalidatePath("/[username]", "page");
}

/**
 * A new post, and the films it names.
 *
 * Two writes, and Postgres is not holding them in one transaction — PostgREST
 * has no way to ask for that. So the second failing rolls the first back by
 * hand: a post that was meant to be about three films and silently isn't is a
 * worse outcome than no post at all, because only one of the two is obvious to
 * the person who wrote it.
 */
export async function createPost(body: string, movieIds: number[]): Promise<PostResult> {
  const problem = postProblem(body);
  if (problem) return { ok: false, error: problem };

  // Deduped before the cap, so naming the same film twice doesn't spend a slot.
  const films = [...new Set(movieIds)].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (films.length > MAX_POST_MOVIES) {
    return { ok: false, error: `Up to ${MAX_POST_MOVIES} films per post.` };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to post." };

  const { data: post, error } = await supabase
    .from("posts")
    .insert({ author_id: user.id, body: body.trim() })
    .select("id")
    .single();

  if (error || !post) {
    console.error("[createPost]", error);
    return { ok: false, error: "Couldn't publish that. Try again." };
  }

  if (films.length > 0) {
    const { error: filmsError } = await supabase.from("post_movies").insert(
      films.map((movieId, index) => ({
        post_id: post.id,
        movie_id: movieId,
        position: index,
      })),
    );

    if (filmsError) {
      console.error("[createPost] films", filmsError);
      // Best effort, and the post is unreachable either way if this fails too:
      // it has no films, and nothing has linked to it yet.
      await supabase.from("posts").delete().eq("id", post.id);
      return { ok: false, error: "Couldn't attach those films. Try again." };
    }
  }

  revalidatePostSurfaces();
  return { ok: true, postId: post.id };
}

/**
 * Removes a post. The cascades on `post_movies`, `post_likes`, `post_reposts`
 * and `post_comments` take everything hanging off it, so this is one delete.
 */
export async function deletePost(postId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to delete a post." };

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", user.id);

  if (error) {
    console.error("[deletePost]", error);
    return { ok: false, error: "Couldn't delete that post. Try again." };
  }

  revalidatePostSurfaces();
  return { ok: true };
}

/**
 * Like, or take it back.
 *
 * The client sends where it wants to end up rather than "toggle", for the same
 * reason `setListMembership` does: the button is a toggle, the row either
 * exists or it doesn't, and the composite primary key makes liking twice a
 * no-op. Two taps racing each other settle on a state instead of alternating.
 */
export async function setLiked(postId: string, liked: boolean): Promise<ActionResult> {
  return setReaction("post_likes", postId, liked, "like");
}

/** Repost, or take it back. Structurally identical to a like. */
export async function setReposted(
  postId: string,
  reposted: boolean,
): Promise<ActionResult> {
  return setReaction("post_reposts", postId, reposted, "repost");
}

async function setReaction(
  table: "post_likes" | "post_reposts",
  postId: string,
  on: boolean,
  noun: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: `Sign in to ${noun} a post.` };

  // user_id is explicit so the primary key can resolve the conflict; the RLS
  // policy still requires it to be the caller.
  const { error } = on
    ? await supabase
        .from(table)
        .upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" })
    : await supabase.from(table).delete().eq("post_id", postId).eq("user_id", user.id);

  if (error) {
    console.error(`[set${noun}]`, error);
    return { ok: false, error: `Couldn't ${noun} that. Try again.` };
  }

  return { ok: true };
}

/**
 * A reply, returned in full so the thread can show it without re-reading the
 * whole conversation. The author is the caller, so the profile it needs is one
 * lookup rather than the join `getComments` does for a page's worth of them.
 */
export async function addComment(postId: string, body: string): Promise<CommentResult> {
  const problem = commentProblem(body);
  if (problem) return { ok: false, error: problem };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to reply." };

  const [{ data: comment, error }, { data: author }] = await Promise.all([
    supabase
      .from("post_comments")
      .insert({ post_id: postId, author_id: user.id, body: body.trim() })
      .select("id, body, created_at")
      .single(),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_path")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (error || !comment || !author) {
    console.error("[addComment]", error);
    return { ok: false, error: "Couldn't post that reply. Try again." };
  }

  revalidatePath("/post/[id]", "page");

  return {
    ok: true,
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      author,
      // They just wrote it, so of course they can remove it.
      deletableByViewer: true,
    },
  };
}

/**
 * Removes a reply. The `or` mirrors the RLS policy exactly — its author, or the
 * author of the post it sits under — so a refusal here means the same thing a
 * refusal there would, rather than the two disagreeing about who may moderate.
 */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to delete a reply." };

  const { error } = await supabase.from("post_comments").delete().eq("id", commentId);

  if (error) {
    console.error("[deleteComment]", error);
    return { ok: false, error: "Couldn't delete that reply. Try again." };
  }

  revalidatePath("/post/[id]", "page");
  return { ok: true };
}

/**
 * A post's thread, fetched when someone opens it.
 *
 * On demand rather than with the feed: most posts in a feed are scrolled past,
 * and shipping every reply to every one of them would be most of the payload
 * spent on text nobody asked to read.
 */
export async function loadComments(postId: string): Promise<CommentsResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The post's author decides who may moderate the thread, and it is read here
  // rather than accepted from the caller — a client that named itself the
  // author would otherwise be offered delete buttons on a stranger's replies.
  const { data: post, error } = await supabase
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .maybeSingle();

  if (error || !post) {
    if (error) console.error("[loadComments] post", error);
    return { ok: false, error: "Couldn't find that post." };
  }

  try {
    return { ok: true, comments: await getComments(supabase, postId, user?.id ?? null, post.author_id) };
  } catch (cause) {
    console.error("[loadComments]", cause);
    return { ok: false, error: "Couldn't load the replies. Try again." };
  }
}
