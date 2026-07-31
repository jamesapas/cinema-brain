import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { avatarUrl, initialsFor } from "@/lib/profiles/avatar";
import type { NotificationItem, NotificationActor } from "./types";

export async function getNotifications(
  supabase: SupabaseClient<Database>,
  recipientId: string,
  limit = 10,
  before?: string,
): Promise<NotificationItem[]> {
  let query = supabase
    .from("notifications")
    .select("id, type, read, created_at, actor_id, post_id, comment_id")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: rows, error } = await query;

  if (error || !rows || rows.length === 0) {
    if (error) console.error("[getNotifications]", error);
    return [];
  }

  const actorIds = [...new Set(rows.map((r) => r.actor_id))];
  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];
  const commentIds = [...new Set(rows.map((r) => r.comment_id).filter(Boolean))] as string[];

  const [profilesRes, postsRes, commentsRes] = await Promise.all([
    actorIds.length > 0
      ? supabase.from("profiles").select("id, username, display_name, avatar_path").in("id", actorIds)
      : Promise.resolve({ data: [] }),
    postIds.length > 0
      ? supabase.from("posts").select("id, body").in("id", postIds)
      : Promise.resolve({ data: [] }),
    commentIds.length > 0
      ? supabase.from("post_comments").select("id, body").in("id", commentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const actorsMap = new Map<string, NotificationActor>();
  if (profilesRes.data) {
    for (const p of profilesRes.data) {
      actorsMap.set(p.id, {
        id: p.id,
        username: p.username,
        displayName: p.display_name,
        avatarUrl: avatarUrl(p.avatar_path),
        initials: initialsFor(p.display_name, p.username),
      });
    }
  }

  const postsMap = new Map<string, { id: string; bodySnippet: string }>();
  if (postsRes.data) {
    for (const post of postsRes.data) {
      const snippet = post.body.length > 60 ? `${post.body.slice(0, 60)}…` : post.body;
      postsMap.set(post.id, { id: post.id, bodySnippet: snippet });
    }
  }

  const commentsMap = new Map<string, { id: string; bodySnippet: string }>();
  if (commentsRes.data) {
    for (const c of commentsRes.data) {
      const snippet = c.body.length > 60 ? `${c.body.slice(0, 60)}…` : c.body;
      commentsMap.set(c.id, { id: c.id, bodySnippet: snippet });
    }
  }

  return rows.map((row) => {
    const actor = actorsMap.get(row.actor_id) ?? {
      id: row.actor_id,
      username: "someone",
      displayName: "Someone",
      avatarUrl: null,
      initials: "?",
    };

    return {
      id: row.id,
      type: row.type,
      read: row.read,
      createdAt: row.created_at,
      actor,
      post: row.post_id ? postsMap.get(row.post_id) ?? null : null,
      comment: row.comment_id ? commentsMap.get(row.comment_id) ?? null : null,
    };
  });
}

export async function getUnreadNotificationCount(
  supabase: SupabaseClient<Database>,
  recipientId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("read", false);

  if (error) {
    console.error("[getUnreadNotificationCount]", error);
    return 0;
  }

  return count ?? 0;
}
