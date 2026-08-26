import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./Channel.css";

function Channel({
  channelId: propChannelId,
  currentUser,
  onBack,
  onSelectVideo,
}) {
  const [profile, setProfile] = useState(null);
  const [videos, setVideos] = useState([]);

  const [subscriberCount, setSubscriberCount] = useState(0);
  const [subscribed, setSubscribed] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const [resolvedChannelId, setResolvedChannelId] = useState(null);

  // =====================================================
  // UUID CHECK
  // =====================================================

  function isValidUuid(value) {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
    );
  }

  // =====================================================
  // RESOLVE CHANNEL ID
  // =====================================================

  useEffect(() => {
    let cancelled = false;

    async function resolveChannelId() {
      if (isValidUuid(propChannelId)) {
        setResolvedChannelId(propChannelId);
        return;
      }

      if (isValidUuid(currentUser?.id)) {
        setResolvedChannelId(currentUser.id);
        return;
      }

      const { data, error } = await supabase.auth.getUser();

      if (cancelled) return;

      const authUserId = data?.user?.id;

      if (!error && isValidUuid(authUserId)) {
        setResolvedChannelId(authUserId);
      } else {
        setResolvedChannelId(null);
      }
    }

    resolveChannelId();

    return () => {
      cancelled = true;
    };
  }, [propChannelId, currentUser?.id]);

  // =====================================================
  // LOAD CHANNEL
  // =====================================================

  useEffect(() => {
    if (isValidUuid(resolvedChannelId)) {
      loadChannel(resolvedChannelId);
    } else if (resolvedChannelId === null) {
      setLoading(false);
      setError(
        "Valid Channel ID nahi mila. Please login karke dobara try karo."
      );
    }
  }, [resolvedChannelId, currentUser?.id]);

  async function loadChannel(channelId) {
    try {
      setLoading(true);
      setError("");

      // =================================================
      // PROFILE
      // =================================================

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", channelId)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (!profileData) {
        setProfile({
          id: channelId,
          full_name: "BharatTube Creator",
          username: "creator",
          bio: "",
          avatar_url: "",
        });
      } else {
        setProfile(profileData);
      }

      // =================================================
      // VIDEOS
      // =================================================

      const {
        data: videoData,
        error: videoError,
      } = await supabase
        .from("videos")
        .select(`
          id,
          user_id,
          title,
          description,
          category,
          video_url,
          thumbnail_url,
          created_at
        `)
        .eq("user_id", channelId)
        .order("created_at", {
          ascending: false,
        });

      if (videoError) {
        throw videoError;
      }

      setVideos(videoData || []);

      // =================================================
      // SUBSCRIBER COUNT
      // =================================================

      const {
        count,
        error: subscriberError,
      } = await supabase
        .from("subscriptions")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("channel_id", channelId);

      if (subscriberError) {
        throw subscriberError;
      }

      setSubscriberCount(count || 0);

      // =================================================
      // CURRENT USER SUBSCRIPTION
      // =================================================

      if (
        currentUser?.id &&
        currentUser.id !== channelId
      ) {
        const {
          data: subscriptionData,
          error: subscriptionError,
        } = await supabase
          .from("subscriptions")
          .select("id, notifications_enabled")
          .eq("subscriber_id", currentUser.id)
          .eq("channel_id", channelId)
          .maybeSingle();

        if (subscriptionError) {
          throw subscriptionError;
        }

        const isSubscribed = Boolean(subscriptionData);

        setSubscribed(isSubscribed);

        if (isSubscribed) {
          setNotificationsEnabled(
            subscriptionData.notifications_enabled ?? true
          );
        } else {
          setNotificationsEnabled(false);
        }
      } else {
        setSubscribed(false);
        setNotificationsEnabled(false);
      }
    } catch (err) {
      console.error("CHANNEL ERROR:", err);

      setError(
        err?.message ||
          "Channel load nahi ho paya."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // SUBSCRIBE / UNSUBSCRIBE
  // =====================================================

  async function toggleSubscribe() {
    if (!currentUser?.id) {
      alert("Please login first.");
      return;
    }

    if (currentUser.id === resolvedChannelId) {
      return;
    }

    try {
      setSubscribeLoading(true);

      // =================================================
      // UNSUBSCRIBE
      // =================================================

      if (subscribed) {
        const {
          error: deleteError,
        } = await supabase
          .from("subscriptions")
          .delete()
          .eq("subscriber_id", currentUser.id)
          .eq("channel_id", resolvedChannelId);

        if (deleteError) {
          throw deleteError;
        }

        setSubscribed(false);
        setNotificationsEnabled(false);

        setSubscriberCount((count) =>
          Math.max(0, count - 1)
        );

        return;
      }

      // =================================================
      // SUBSCRIBE
      // =================================================

      const {
        error: insertError,
      } = await supabase
        .from("subscriptions")
        .insert({
          subscriber_id: currentUser.id,
          channel_id: resolvedChannelId,
          notifications_enabled: true,
        });

      if (insertError) {
        throw insertError;
      }

      setSubscribed(true);
      setNotificationsEnabled(true);

      setSubscriberCount((count) => count + 1);
    } catch (err) {
      console.error("SUBSCRIBE ERROR:", err);

      alert(
        err?.message ||
          "Subscribe update nahi ho paya."
      );
    } finally {
      setSubscribeLoading(false);
    }
  }

  // =====================================================
  // NOTIFICATIONS
  // =====================================================

  async function toggleChannelNotifications() {
    if (!currentUser?.id) {
      alert("Please login first.");
      return;
    }

    if (!subscribed) {
      alert("Pehle channel ko Subscribe karo.");
      return;
    }

    if (!resolvedChannelId) {
      return;
    }

    try {
      setNotificationLoading(true);

      const nextValue = !notificationsEnabled;

      const {
        error: updateError,
      } = await supabase
        .from("subscriptions")
        .update({
          notifications_enabled: nextValue,
        })
        .eq("subscriber_id", currentUser.id)
        .eq("channel_id", resolvedChannelId);

      if (updateError) {
        throw updateError;
      }

      setNotificationsEnabled(nextValue);

      if (nextValue) {
        alert("🔔 Channel notifications ON");
      } else {
        alert("🔕 Channel notifications OFF");
      }
    } catch (err) {
      console.error("NOTIFICATION ERROR:", err);

      alert(
        err?.message ||
          "Notification setting update nahi ho payi."
      );
    } finally {
      setNotificationLoading(false);
    }
  }

  // =====================================================
  // FORMAT COUNT
  // =====================================================

  function formatCount(value) {
    const n = Number(value || 0);

    if (n >= 1000000) {
      return (n / 1000000).toFixed(1) + "M";
    }

    if (n >= 1000) {
      return (n / 1000).toFixed(1) + "K";
    }

    return String(n);
  }

  // =====================================================
  // DATE
  // =====================================================

  function formatDate(date) {
    if (!date) return "";

    return new Date(date).toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  }

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div className="channel-state">
        <div className="loading-spinner"></div>

        <h2>Channel loading...</h2>

        <p>
          Creator profile laaye ja rahe hain.
        </p>
      </div>
    );
  }

  // =====================================================
  // ERROR
  // =====================================================

  if (error) {
    return (
      <div className="channel-state">
        <div className="channel-state-icon">
          ⚠️
        </div>

        <h2>Channel load nahi ho paya</h2>

        <p>{error}</p>

        <button
          className="red-btn"
          onClick={() =>
            resolvedChannelId &&
            loadChannel(resolvedChannelId)
          }
        >
          Try Again
        </button>
      </div>
    );
  }

  // =====================================================
  // CHANNEL DATA
  // =====================================================

  const channelName =
    profile?.full_name ||
    profile?.username ||
    "BharatTube Creator";

  const username =
    profile?.username ||
    "creator";

  const avatarUrl =
    profile?.avatar_url || "";

  const avatarLetter =
    channelName
      .charAt(0)
      .toUpperCase();

  const isOwnChannel =
    currentUser?.id === resolvedChannelId;

  // =====================================================
  // MAIN
  // =====================================================

  return (
    <div className="channel-page">

      {/* BACK BUTTON */}

      <button
        className="channel-back-btn"
        onClick={onBack}
      >
        ← Back
      </button>

      {/* COVER */}

      <section className="channel-cover">

        <div className="channel-cover-glow"></div>

        <div className="channel-cover-text">
          <span>
            BHARATTUBE CREATOR
          </span>
        </div>

      </section>

      {/* CHANNEL HEADER */}

      <section className="channel-header">

        {/* AVATAR */}

        <div className="channel-avatar">

          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={channelName}
              className="channel-avatar-image"
              onError={(e) => {
                e.currentTarget.style.display =
                  "none";

                const fallback =
                  e.currentTarget.parentElement?.querySelector(
                    ".channel-avatar-letter"
                  );

                if (fallback) {
                  fallback.style.display = "flex";
                }
              }}
            />
          ) : null}

          <span
            className="channel-avatar-letter"
            style={{
              display: avatarUrl
                ? "none"
                : "flex",
            }}
          >
            {avatarLetter}
          </span>

        </div>

        {/* CHANNEL INFO */}

        <div className="channel-info">

          <h1>
            {channelName}
          </h1>

          <p className="channel-username">
            @{username}
          </p>

          <div className="channel-stats">

            <span>
              🎬 {videos.length} videos
            </span>

            <span>
              👥 {formatCount(subscriberCount)} subscribers
            </span>

          </div>

          {profile?.bio && (
            <p className="channel-bio">
              {profile.bio}
            </p>
          )}

        </div>

        {/* ACTIONS */}

        <div className="channel-actions">

          {isOwnChannel ? (

            <button
              className="profile-edit-btn"
              onClick={onBack}
            >
              ✏️ Your Profile
            </button>

          ) : (

            <div className="channel-subscribe-group">

              {/* SUBSCRIBE */}

              <button
                className={
                  subscribed
                    ? "channel-subscribe-btn subscribed"
                    : "channel-subscribe-btn"
                }
                onClick={toggleSubscribe}
                disabled={subscribeLoading}
              >
                {subscribeLoading
                  ? "Please wait..."
                  : subscribed
                  ? "✓ Subscribed"
                  : "Subscribe"}
              </button>

              {/* NOTIFICATION */}

              <button
                className={
                  notificationsEnabled
                    ? "channel-notification-btn enabled"
                    : "channel-notification-btn"
                }
                title={
                  !subscribed
                    ? "Subscribe to enable notifications"
                    : notificationsEnabled
                    ? "Notifications ON"
                    : "Notifications OFF"
                }
                disabled={
                  !subscribed ||
                  notificationLoading
                }
                onClick={
                  toggleChannelNotifications
                }
              >
                {notificationLoading
                  ? "⏳"
                  : notificationsEnabled
                  ? "🔔"
                  : "🔕"}
              </button>

            </div>
          )}

        </div>

      </section>

      {/* DIVIDER */}

      <div className="channel-divider"></div>

      {/* VIDEOS */}

      <section className="channel-videos">

        <div className="channel-section-header">

          <div>
            <h2>🎬 Videos</h2>

            <p>
              Latest uploads from {channelName}
            </p>
          </div>

        </div>

        {/* EMPTY STATE */}

        {videos.length === 0 ? (

          <div className="channel-empty">

            <div className="channel-empty-icon">
              🎬
            </div>

            <h3>
              No videos yet
            </h3>

            <p>
              This creator has not uploaded any videos.
            </p>

          </div>

        ) : (

          <div className="channel-video-grid">

            {videos.map((video) => (

              <article
                className="channel-video-card"
                key={video.id}
                onClick={() =>
                  onSelectVideo?.(video)
                }
              >

                {/* THUMBNAIL */}

                <div className="channel-video-thumb">

                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={
                        video.title ||
                        "Video thumbnail"
                      }
                      className="channel-thumbnail-image"
                      onError={(e) => {
                        e.currentTarget.style.display =
                          "none";

                        const fallback =
                          e.currentTarget.parentElement?.querySelector(
                            ".channel-video-fallback"
                          );

                        if (fallback) {
                          fallback.style.display =
                            "block";
                        }
                      }}
                    />
                  ) : null}

                  <video
                    className="channel-video-fallback"
                    src={video.video_url}
                    muted
                    preload="metadata"
                    playsInline
                    style={{
                      display:
                        video.thumbnail_url
                          ? "none"
                          : "block",
                    }}
                    onLoadedData={(e) => {
                      e.currentTarget
                        .classList
                        .add("loaded");
                    }}
                  />

                  <div className="channel-play">
                    ▶
                  </div>

                  <span>
                    {video.category || "General"}
                  </span>

                </div>

                {/* VIDEO CONTENT */}

                <div className="channel-video-content">

                  <h3 title={video.title}>
                    {video.title ||
                      "Untitled Video"}
                  </h3>

                  <p>
                    {video.description ||
                      "BharatTube video"}
                  </p>

                  <small>
                    {formatDate(
                      video.created_at
                    )}
                  </small>

                </div>

              </article>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}

export default Channel;