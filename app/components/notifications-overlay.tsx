"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  fetchNotificationsAction,
  getUnreadCountAction,
  markAllAsReadAction,
  markAsReadAction,
} from "@/app/actions/notifications";
import { Avatar } from "@/app/components/avatar";
import { useSignIn, useSignedIn, useSessionUser } from "@/app/components/session";

import type { NotificationItem, NotificationType } from "@/lib/notifications/types";
import { relativeTime } from "@/lib/social/posts";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type NotificationsOverlayContextValue = {
  isOpen: boolean;
  unreadCount: number;
  notifications: NotificationItem[];
  loading: boolean;
  error: string | null;
  toggle: () => void;
  open: () => void;
  close: () => void;
  markAllAsRead: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
};

const NotificationsOverlayContext = createContext<NotificationsOverlayContextValue | null>(null);

export function useNotificationsOverlay() {
  const context = useContext(NotificationsOverlayContext);
  if (!context) {
    throw new Error("useNotificationsOverlay must be used inside NotificationsOverlayProvider.");
  }
  return context;
}

export function NotificationsOverlayProvider({ children }: { children: React.ReactNode }) {
  const signedIn = useSignedIn();
  const user = useSessionUser();
  const signIn = useSignIn();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fetch notifications in the background on load so opening is instant.
  useEffect(() => {
    let cancelled = false;
    if (!signedIn) return;

    async function init() {
      setLoading(true);
      setError(null);
      const res = await fetchNotificationsAction();
      if (!cancelled) {
        if (res.ok) {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
          setHasLoaded(true);
        } else {
          setError(res.error);
        }
        setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Subscribe to real-time notification changes via Supabase Realtime
  useEffect(() => {
    if (!signedIn || !user?.id) return;

    const userId = user.id;
    const supabase = createBrowserSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setupRealtime() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }

      channel = supabase
        .channel(`user-notifications-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${userId}`,
          },
          async () => {
            const res = await fetchNotificationsAction();
            if (res.ok) {
              setNotifications(res.notifications);
              setUnreadCount(res.unreadCount);
              setHasLoaded(true);
            }
          },
        )
        .subscribe();
    }

    void setupRealtime();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [signedIn, user?.id]);

  // Fast fallback interval polling (every 5 seconds) to ensure header badge stays updated
  useEffect(() => {
    if (!signedIn) return;

    const intervalId = setInterval(async () => {
      const res = await getUnreadCountAction();
      if (res.ok) {
        setUnreadCount(res.unreadCount);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [signedIn]);

  const open = useCallback(() => {
    if (!signedIn) {
      signIn(undefined, "signin");
      return;
    }
    setIsOpen(true);
  }, [signedIn, signIn]);

  const close = useCallback(() => setIsOpen(false), []);

  const toggle = useCallback(() => {
    if (!signedIn) {
      signIn(undefined, "signin");
      return;
    }
    setIsOpen((current) => !current);
  }, [signedIn, signIn]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !signedIn) return;

    async function syncNotifications() {
      const res = await fetchNotificationsAction();
      if (!cancelled) {
        if (res.ok) {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
          setHasLoaded(true);
          setError(null);
        } else if (!hasLoaded) {
          setError(res.error);
        }
      }
    }
    void syncNotifications();
    return () => {
      cancelled = true;
    };
  }, [isOpen, signedIn, hasLoaded]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    await markAllAsReadAction();
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    await markAsReadAction(id);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  return (
    <NotificationsOverlayContext.Provider
      value={{
        isOpen,
        unreadCount,
        notifications,
        loading: loading && !hasLoaded,
        error,
        toggle,
        open,
        close,
        markAllAsRead,
        markAsRead,
      }}
    >
      {children}
      {isOpen && <NotificationsOverlay onClose={close} />}
    </NotificationsOverlayContext.Provider>
  );
}

function NotificationsOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { notifications, loading, error, markAllAsRead, markAsRead } =
    useNotificationsOverlay();

  async function handleNotificationClick(item: NotificationItem) {
    if (!item.read) {
      void markAsRead(item.id);
    }
    onClose();

    if (item.type === "follow") {
      router.push(`/${item.actor.username}`);
    } else if (item.post?.id) {
      router.push(`/post/${item.post.id}`);
    }
  }

  const unreadExist = notifications.some((n) => !n.read);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close notifications"
        onClick={onClose}
        className="scrim-in fixed inset-0 bg-ink/50 backdrop-blur-xs"
      />

      <div className="page-container relative h-full pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="palette-in pointer-events-auto absolute top-[4.25rem] right-4 sm:right-6 lg:right-8 flex max-h-[calc(100vh-5.5rem)] w-[calc(100vw-2rem)] sm:w-[420px] flex-col overflow-hidden rounded-xl border border-ink-line bg-ink-raised shadow-2xl shadow-black/80"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-line px-5 py-4">
            <h2 className="text-base font-bold text-bone">Notifications</h2>
            <div className="flex items-center gap-3">
              {unreadExist && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="text-xs text-bone-dim transition hover:text-bone hover:underline"
                >
                  Mark all as read
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="grid h-8 w-8 place-items-center rounded-full text-bone-dim transition hover:bg-bone/10 hover:text-bone"
              >
                <Icon icon="lucide:x" width={18} height={18} />
              </button>
            </div>
          </div>

          {/* Content list */}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-1 p-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-lg p-3">
                    <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2 py-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="skeleton h-3.5 w-28 rounded" />
                        <div className="skeleton h-3 w-8 rounded" />
                      </div>
                      <div className="skeleton h-3 w-3/4 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <p role="alert" className="px-4 py-8 text-center text-sm text-lamp">
                {error}
              </p>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-bone-soft">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-ink-line/40 text-bone-dim">
                  <Icon icon="lucide:bell-off" width={24} height={24} />
                </div>
                <p className="mt-3 text-sm font-medium text-bone">No notifications yet</p>
                <p className="mt-1 text-xs text-bone-dim">
                  When someone likes, comments, or reposts your posts, you&apos;ll see it here.
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(item)}
                      className={`group flex w-full items-start gap-3 rounded-lg p-3 text-left transition ${
                        item.read ? "hover:bg-bone/5" : "bg-lamp/10 hover:bg-lamp/15"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <Avatar
                          url={item.actor.avatarUrl}
                          initials={item.actor.initials}
                          size={36}
                        />
                        <NotificationBadge type={item.type} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-bone">
                            {item.actor.displayName ?? `@${item.actor.username}`}
                          </span>
                          <span className="shrink-0 text-[11px] text-bone-dim">
                            {relativeTime(item.createdAt)}
                          </span>
                        </div>

                        <p className="mt-0.5 text-xs leading-relaxed text-bone-soft">
                          <NotificationBody item={item} />
                        </p>
                      </div>

                      {!item.read && (
                        <span
                          aria-label="Unread"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lamp"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationBadge({ type }: { type: NotificationType }) {
  let bgClass = "bg-lamp";
  if (type === "like") bgClass = "bg-ember";
  else if (type === "comment") bgClass = "bg-sky-500";
  else if (type === "repost") bgClass = "bg-emerald-500";

  return (
    <span className={`absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-ink shadow-xs ${bgClass}`}>
      <NotificationIcon type={type} />
    </span>
  );
}

function NotificationIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case "like":
      return <Icon icon="heroicons:heart-20-solid" width={11} height={11} className="text-white" />;
    case "comment":
      return <Icon icon="heroicons:chat-bubble-left-20-solid" width={11} height={11} className="text-white" />;
    case "repost":
      return <Icon icon="heroicons:arrow-path-20-solid" width={11} height={11} className="text-white" />;
    case "follow":
      return <Icon icon="heroicons:user-plus-20-solid" width={11} height={11} className="text-white" />;
  }
}

function NotificationBody({ item }: { item: NotificationItem }) {
  switch (item.type) {
    case "like":
      return (
        <>
          liked your post{" "}
          {item.post ? (
            <span className="font-normal italic text-bone-dim">&ldquo;{item.post.bodySnippet}&rdquo;</span>
          ) : null}
        </>
      );
    case "comment":
      return (
        <>
          commented on your post{" "}
          {item.comment ? (
            <span className="font-normal italic text-bone-dim">&ldquo;{item.comment.bodySnippet}&rdquo;</span>
          ) : null}
        </>
      );
    case "repost":
      return (
        <>
          reposted your post{" "}
          {item.post ? (
            <span className="font-normal italic text-bone-dim">&ldquo;{item.post.bodySnippet}&rdquo;</span>
          ) : null}
        </>
      );
    case "follow":
      return <>started following you.</>;
  }
}
