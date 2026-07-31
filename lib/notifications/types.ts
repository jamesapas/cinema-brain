export type NotificationType = "like" | "comment" | "repost" | "follow";

export type NotificationActor = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  initials: string;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: NotificationActor;
  post: {
    id: string;
    bodySnippet: string;
  } | null;
  comment: {
    id: string;
    bodySnippet: string;
  } | null;
};
