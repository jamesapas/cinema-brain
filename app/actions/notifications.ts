"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { getNotifications, getUnreadNotificationCount } from "@/lib/notifications/queries";
import type { NotificationItem } from "@/lib/notifications/types";

export type NotificationsFetchResult =
  | { ok: true; notifications: NotificationItem[]; unreadCount: number }
  | { ok: false; error: string };

export type UnreadCountResult =
  | { ok: true; unreadCount: number }
  | { ok: false; error: string };

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function fetchNotificationsAction(): Promise<NotificationsFetchResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to view notifications." };

  try {
    const [notifications, unreadCount] = await Promise.all([
      getNotifications(supabase, user.id),
      getUnreadNotificationCount(supabase, user.id),
    ]);
    return { ok: true, notifications, unreadCount };
  } catch (cause) {
    console.error("[fetchNotificationsAction]", cause);
    return { ok: false, error: "Couldn't load notifications." };
  }
}

export async function getUnreadCountAction(): Promise<UnreadCountResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: true, unreadCount: 0 };

  try {
    const unreadCount = await getUnreadNotificationCount(supabase, user.id);
    return { ok: true, unreadCount };
  } catch (cause) {
    console.error("[getUnreadCountAction]", cause);
    return { ok: false, error: "Couldn't load unread count." };
  }
}

export async function markAsReadAction(notificationId: string): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in required." };

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("recipient_id", user.id);

  if (error) {
    console.error("[markAsReadAction]", error);
    return { ok: false, error: "Couldn't mark notification as read." };
  }

  return { ok: true };
}

export async function markAllAsReadAction(): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in required." };

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", user.id)
    .eq("read", false);

  if (error) {
    console.error("[markAllAsReadAction]", error);
    return { ok: false, error: "Couldn't mark all as read." };
  }

  return { ok: true };
}
