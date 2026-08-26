import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

export default function Notifications({
  user,
  notifications: parentNotifications,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
  onOpenVideo,
  onBack,
}) {
  const [notifications, setNotifications] = useState(
    parentNotifications || []
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unreadCount = useMemo(() => {
    return notifications.filter(
      (notification) => !notification.is_read
    ).length;
  }, [notifications]);

  // =====================================================
  // SYNC PARENT NOTIFICATIONS
  // =====================================================

  useEffect(() => {
    setNotifications(parentNotifications || []);
  }, [parentNotifications]);

  // =====================================================
  // LOAD NOTIFICATIONS
  // =====================================================

  async function loadNotifications() {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError("");

      const { data, error: notificationsError } =
        await supabase
          .from("notifications")
          .select(
            `
              id,
              user_id,
              actor_id,
              type,
              video_id,
              message,
              is_read,
              created_at
            `
          )
          .eq("user_id", user.id)
          .order("created_at", {
            ascending: false,
          });

      if (notificationsError) {
        throw notificationsError;
      }

      setNotifications(data || []);
    } catch (err) {
      console.error("NOTIFICATIONS LOAD ERROR:", err);

      setError(
        err?.message ||
          "Notifications load nahi ho paayi."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    if (!user?.id) return;

    loadNotifications();
  }, [user?.id]);

  // =====================================================
  // REALTIME NOTIFICATIONS
  // =====================================================

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications-page-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new;

          setNotifications((current) => {
            const alreadyExists = current.some(
              (item) =>
                item.id === newNotification.id
            );

            if (alreadyExists) {
              return current;
            }

            return [
              newNotification,
              ...current,
            ];
          });
        }
      )
      .subscribe((status) => {
        console.log(
          "NOTIFICATIONS REALTIME:",
          status
        );
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // =====================================================
  // MARK ONE AS READ
  // =====================================================

  async function handleMarkRead(notification) {
    if (!notification?.id || !user?.id) {
      return;
    }

    // Already read
    if (notification.is_read) {
      return;
    }

    try {
      const { error: readError } =
        await supabase
          .from("notifications")
          .update({
            is_read: true,
          })
          .eq("id", notification.id)
          .eq("user_id", user.id);

      if (readError) {
        throw readError;
      }

      // Update local UI immediately
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                is_read: true,
              }
            : item
        )
      );

      // Also update App.jsx state
      if (onMarkRead) {
        await onMarkRead(notification.id);
      }
    } catch (err) {
      console.error(
        "NOTIFICATION READ ERROR:",
        err
      );
    }
  }

  // =====================================================
  // OPEN NOTIFICATION
  // =====================================================

  async function openNotification(notification) {
    if (!notification) return;

    // First mark notification as read
    if (!notification.is_read) {
      await handleMarkRead(notification);
    }

    // If notification has a video ID,
    // find that video and open it.
    if (notification.video_id) {
      try {
        const existingVideo = await findVideo(
          notification.video_id
        );

        if (existingVideo) {
          if (onOpenVideo) {
            onOpenVideo(existingVideo);
          }

          return;
        }
      } catch (err) {
        console.error(
          "OPEN NOTIFICATION VIDEO ERROR:",
          err
        );
      }
    }
  }

  // =====================================================
  // FIND VIDEO
  // =====================================================

  async function findVideo(videoId) {
    if (!videoId) return null;

    const { data, error: videoError } =
      await supabase
        .from("videos")
        .select(
          `
            id,
            user_id,
            title,
            description,
            category,
            video_url,
            thumbnail_url,
            created_at
          `
        )
        .eq("id", videoId)
        .maybeSingle();

    if (videoError) {
      throw videoError;
    }

    if (!data) {
      return null;
    }

    // Get creator profile
    let profile = null;

    if (data.user_id) {
      const { data: profileData } =
        await supabase
          .from("profiles")
          .select(
            "id, username, full_name, avatar_url"
          )
          .eq("id", data.user_id)
          .maybeSingle();

      profile = profileData || null;
    }

    // Get views
    const { count: viewsCount } =
      await supabase
        .from("video_views")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("video_id", data.id);

    // Get likes
    const { count: likesCount } =
      await supabase
        .from("video_likes")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("video_id", data.id);

    return {
      ...data,
      profile,
      creator_name:
        profile?.username ||
        profile?.full_name ||
        "BharatTube Creator",
      creator_avatar_url:
        profile?.avatar_url || "",
      views: viewsCount || 0,
      likes: likesCount || 0,
    };
  }

  // =====================================================
  // MARK ALL AS READ
  // =====================================================

  async function handleMarkAllRead() {
    if (!user?.id || unreadCount === 0) {
      return;
    }

    try {
      const { error: markAllError } =
        await supabase
          .from("notifications")
          .update({
            is_read: true,
          })
          .eq("user_id", user.id)
          .eq("is_read", false);

      if (markAllError) {
        throw markAllError;
      }

      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          is_read: true,
        }))
      );

      if (onMarkAllRead) {
        await onMarkAllRead();
      }
    } catch (err) {
      console.error(
        "MARK ALL READ ERROR:",
        err
      );

      alert(
        err?.message ||
          "Notifications read nahi ho paayi."
      );
    }
  }

  // =====================================================
  // ICON
  // =====================================================

  function getNotificationIcon(type) {
    switch (type) {
      case "like":
        return "❤️";

      case "comment":
        return "💬";

      case "subscribe":
      case "subscription":
        return "👤";

      case "reply":
        return "↩️";

      case "mention":
        return "📢";

      case "new_video":
        return "🎬";

      default:
        return "🔔";
    }
  }

  // =====================================================
  // MESSAGE
  // =====================================================

  function getNotificationMessage(
    notification
  ) {
    if (notification?.message) {
      return notification.message;
    }

    switch (notification?.type) {
      case "like":
        return "Someone liked your video.";

      case "comment":
        return "Someone commented on your video.";

      case "subscribe":
      case "subscription":
        return "Someone subscribed to your channel.";

      case "new_video":
        return "A new video was uploaded.";

      default:
        return "You have a new notification.";
    }
  }

  // =====================================================
  // DATE
  // =====================================================

  function formatDate(date) {
    if (!date) return "";

    const value = new Date(date);

    if (Number.isNaN(value.getTime())) {
      return "";
    }

    return value.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // =====================================================
  // REFRESH
  // =====================================================

  async function handleRefresh() {
    await loadNotifications();

    if (onRefresh) {
      await onRefresh();
    }
  }

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="page-container notifications-page">

      {/* HEADER */}

      <div className="page-heading">

        <div>
          <div className="page-eyebrow">
            🔔 YOUR ACTIVITY
          </div>

          <h1>
            Notifications
          </h1>

          <p>
            Aapke BharatTube notifications yahan
            milenge.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >

          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading
              ? "Loading..."
              : "↻ Refresh"}
          </button>

          {unreadCount > 0 && (
            <button
              className="red-btn"
              onClick={handleMarkAllRead}
            >
              ✓ Mark all read
            </button>
          )}

          {onBack && (
            <button
              className="refresh-btn"
              onClick={onBack}
            >
              ← Back
            </button>
          )}

        </div>

      </div>

      {/* ERROR */}

      {error && (
        <div
          className="videos-state error-state"
        >
          <div className="state-icon">
            ⚠️
          </div>

          <h2>
            Notifications load nahi ho pa rahi
          </h2>

          <p>
            {error}
          </p>

          <button
            className="red-btn"
            onClick={handleRefresh}
          >
            Try Again
          </button>
        </div>
      )}

      {/* EMPTY */}

      {!loading &&
        !error &&
        notifications.length === 0 && (
          <div className="empty-state">

            <div className="empty-state-icon">
              🔔
            </div>

            <h2>
              No notifications yet
            </h2>

            <p>
              Jab koi activity hogi,
              notification yahan dikhegi.
            </p>

          </div>
        )}

      {/* NOTIFICATION LIST */}

      {!error &&
        notifications.length > 0 && (
          <div className="notification-list">

            {notifications.map(
              (notification) => (

                <button
                  type="button"
                  key={notification.id}
                  className={
                    notification.is_read
                      ? "notification-item"
                      : "notification-item unread"
                  }
                  onClick={() =>
                    openNotification(
                      notification
                    )
                  }
                >

                  <div className="notification-icon">
                    {getNotificationIcon(
                      notification.type
                    )}
                  </div>

                  <div className="notification-content">

                    <strong>
                      {getNotificationMessage(
                        notification
                      )}
                    </strong>

                    <small>
                      {formatDate(
                        notification.created_at
                      )}
                    </small>

                    {notification.video_id && (
                      <small
                        style={{
                          display: "block",
                          marginTop: "4px",
                        }}
                      >
                        ▶ Tap to watch video
                      </small>
                    )}

                  </div>

                  {!notification.is_read && (
                    <span className="notification-unread-dot">
                      ●
                    </span>
                  )}

                </button>

              )
            )}

          </div>
        )}

    </div>
  );
}