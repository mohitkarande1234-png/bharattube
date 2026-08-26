import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./VideoPlayer.css";

function VideoPlayer({ video, onBack }) {
  const [likes, setLikes] = useState(0);
  const [views, setViews] = useState(0);
  const [comments, setComments] = useState([]);

  const [commentText, setCommentText] = useState("");

  const [liked, setLiked] = useState(false);

  const [subscribed, setSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] =
    useState(false);
  const [subscribeLoading, setSubscribeLoading] =
    useState(false);

  const [message, setMessage] = useState("");

  const [likeLoading, setLikeLoading] = useState(false);

  /* =========================================
     GET CURRENT USER
  ========================================= */

  async function getUser() {
    const { data } = await supabase.auth.getUser();

    return data?.user || null;
  }

  /* =========================================
     LOAD VIDEO STATS
  ========================================= */

  async function loadStats() {
    if (!video?.id) return;

    try {
      const { count: likeCount } = await supabase
        .from("video_likes")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("video_id", video.id);

      const { count: viewCount } = await supabase
        .from("video_views")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("video_id", video.id);

      setLikes(likeCount || 0);
      setViews(viewCount || 0);
    } catch (error) {
      console.error("STATS ERROR:", error);
    }
  }

  /* =========================================
     CHECK LIKE
  ========================================= */

  async function checkLike() {
    const user = await getUser();

    if (!user || !video?.id) {
      setLiked(false);
      return;
    }

    const { data, error } = await supabase
      .from("video_likes")
      .select("id")
      .eq("video_id", video.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error) {
      setLiked(!!data);
    }
  }

  /* =========================================
     ADD VIEW
  ========================================= */

  async function addView() {
    const user = await getUser();

    if (!user || !video?.id) return;

    try {
      // Count one view per logged-in user per video.
      // If the database has a unique constraint on
      // (video_id, user_id), a repeat open is ignored.
      const { error } = await supabase
        .from("video_views")
        .insert({
          video_id: video.id,
          user_id: user.id,
        });

      if (error) {
        // 23505 = duplicate key. This means this user
        // has already counted a view for this video.
        if (error.code !== "23505") {
          console.warn("VIEW:", error.message);
        }
      }
    } catch (error) {
      // View tracking must never stop the player.
      console.warn("VIEW TRACKING:", error);
    }

    await loadStats();
  }

  /* =========================================
     SAVE WATCH HISTORY
  ========================================= */

  async function saveWatchHistory() {
    const user = await getUser();

    if (!user || !video?.id) {
      return;
    }

    try {
      const { data: existing, error: findError } =
        await supabase
          .from("watch_history")
          .select("id")
          .eq("user_id", user.id)
          .eq("video_id", video.id)
          .maybeSingle();

      if (findError) {
        throw findError;
      }

      const watchedAt = new Date().toISOString();

      if (existing?.id) {
        const { error: updateError } =
          await supabase
            .from("watch_history")
            .update({
              watched_at: watchedAt,
            })
            .eq("id", existing.id)
            .eq("user_id", user.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } =
          await supabase
            .from("watch_history")
            .insert({
              user_id: user.id,
              video_id: video.id,
              watched_at: watchedAt,
            });

        if (insertError) {
          if (insertError.code === "23505") {
            const { error: retryError } =
              await supabase
                .from("watch_history")
                .update({
                  watched_at: watchedAt,
                })
                .eq("user_id", user.id)
                .eq("video_id", video.id);

            if (retryError) {
              throw retryError;
            }
          } else {
            throw insertError;
          }
        }
      }
    } catch (error) {
      // History failure should never stop video playback.
      console.error(
        "WATCH HISTORY ERROR:",
        error
      );
    }
  }

  /* =========================================
     LOAD COMMENTS
  ========================================= */

  async function loadComments() {
    if (!video?.id) return;

    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("video_id", video.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "COMMENTS ERROR:",
        error
      );

      return;
    }

    setComments(data || []);
  }

  /* =========================================
     LIKE / UNLIKE
  ========================================= */

  async function likeVideo() {
    if (likeLoading) return;

    const user = await getUser();

    if (!user) {
      setMessage(
        "Like karne ke liye login karo."
      );
      return;
    }

    if (!video?.id) return;

    try {
      setLikeLoading(true);
      setMessage("");

      if (liked) {
        const { error } = await supabase
          .from("video_likes")
          .delete()
          .eq("video_id", video.id)
          .eq("user_id", user.id);

        if (error) {
          throw error;
        }

        setLiked(false);

        setLikes((old) =>
          Math.max(0, old - 1)
        );
      } else {
        const { error } = await supabase
          .from("video_likes")
          .insert({
            video_id: video.id,
            user_id: user.id,
          });

        if (error) {
          // If the database already has this like,
          // simply sync the UI instead of showing an error.
          const duplicate =
            error.code === "23505" ||
            error.message
              ?.toLowerCase()
              .includes("duplicate");

          if (!duplicate) {
            throw error;
          }

          setLiked(true);
          await loadStats();
          return;
        }

        setLiked(true);

        setLikes((old) => old + 1);
      }

      // Sync the final count from Supabase.
      await loadStats();
    } catch (error) {
      console.error(
        "LIKE ERROR:",
        error
      );

      setMessage(
        error?.message ||
          "Like update nahi ho paya."
      );
    } finally {
      setLikeLoading(false);
    }
  }

  /* =========================================
     CHECK SUBSCRIPTION
  ========================================= */

  async function checkSubscription() {
    const user = await getUser();

    if (!user || !video?.user_id) {
      setSubscribed(false);
      return;
    }

    // Apne hi channel ko subscribe nahi kar sakte
    if (user.id === video.user_id) {
      setSubscribed(false);
      return;
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("subscriber_id", user.id)
      .eq("channel_id", video.user_id)
      .maybeSingle();

    if (error) {
      console.error(
        "SUBSCRIPTION CHECK ERROR:",
        error
      );

      return;
    }

    setSubscribed(!!data);
  }

  /* =========================================
     LOAD SUBSCRIBER COUNT
  ========================================= */

  async function loadSubscriberCount() {
    if (!video?.user_id) return;

    const { count, error } = await supabase
      .from("subscriptions")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("channel_id", video.user_id);

    if (error) {
      console.error(
        "SUBSCRIBER COUNT ERROR:",
        error
      );

      return;
    }

    setSubscriberCount(count || 0);
  }

  /* =========================================
     SUBSCRIBE / UNSUBSCRIBE
  ========================================= */

  async function toggleSubscription() {
    const user = await getUser();

    if (!user) {
      setMessage(
        "Subscribe karne ke liye login karo."
      );

      return;
    }

    if (!video?.user_id) {
      setMessage(
        "Creator information available nahi hai."
      );

      return;
    }

    // Apne channel ko subscribe nahi kar sakte
    if (user.id === video.user_id) {
      setMessage(
        "Aap apne khud ke channel ko subscribe nahi kar sakte."
      );

      return;
    }

    try {
      setSubscribeLoading(true);
      setMessage("");

      if (subscribed) {
        /* UNSUBSCRIBE */

        const { error } = await supabase
          .from("subscriptions")
          .delete()
          .eq("subscriber_id", user.id)
          .eq("channel_id", video.user_id);

        if (error) {
          throw error;
        }

        setSubscribed(false);

        setSubscriberCount((old) =>
          Math.max(0, old - 1)
        );

        setMessage(
          "Channel unsubscribe ho gaya."
        );
      } else {
        /* SUBSCRIBE */

        const { error } = await supabase
          .from("subscriptions")
          .insert({
            subscriber_id: user.id,
            channel_id: video.user_id,
          });

        if (error) {
          throw error;
        }

        setSubscribed(true);

        setSubscriberCount(
          (old) => old + 1
        );

        setMessage(
          "Channel subscribe ho gaya! 🔔"
        );
      }
    } catch (error) {
      console.error(
        "SUBSCRIBE ERROR:",
        error
      );

      setMessage(
        error.message ||
          "Subscription update nahi ho paya."
      );
    } finally {
      setSubscribeLoading(false);
    }
  }

  /* =========================================
     ADD COMMENT
  ========================================= */

  async function addComment() {
    const user = await getUser();

    if (!user) {
      setMessage(
        "Comment karne ke liye login karo."
      );

      return;
    }

    if (!commentText.trim()) {
      return;
    }

    if (!video?.id) return;

    try {
      setCommentLoading(true);

      const { error } = await supabase
        .from("comments")
        .insert({
          video_id: video.id,
          user_id: user.id,
          content: commentText.trim(),
        });

      if (error) {
        throw error;
      }

      setCommentText("");
      setMessage("");

      await loadComments();
    } catch (error) {
      console.error(
        "COMMENT ERROR:",
        error
      );

      setMessage(
        error.message ||
          "Comment post nahi ho paya."
      );
    } finally {
      setCommentLoading(false);
    }
  }

  /* =========================================
     SHARE
  ========================================= */

  async function shareVideo() {
    if (!video?.id) return;

    // Create a direct BharatTube video URL.
    // The App can read ?video=<id> and open this video.
    const url =
      `${window.location.origin}${window.location.pathname}?video=${encodeURIComponent(video.id)}`;

    const title =
      video?.title ||
      "BharatTube Video";

    const text =
      video?.description ||
      "BharatTube par ye video dekho!";

    try {
      if (
        navigator.share &&
        /Android|iPhone|iPad|iPod/i.test(
          navigator.userAgent
        )
      ) {
        await navigator.share({
          title,
          text,
          url,
        });

        return;
      }

      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea =
          document.createElement("textarea");

        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        document.execCommand("copy");
        textarea.remove();
      }

      setMessage(
        "Video link copy ho gaya ✅"
      );

      setTimeout(() => {
        setMessage("");
      }, 2500);
    } catch (error) {
      // User canceling the native share dialog is not an error to show.
      if (error?.name !== "AbortError") {
        console.error(
          "SHARE ERROR:",
          error
        );

        setMessage(
          "Share link copy nahi ho paya."
        );
      }
    }
  }

  /* =========================================
     FORMAT COUNT
  ========================================= */

  function formatCount(number) {
    const n = Number(number || 0);

    if (n >= 1000000) {
      return (
        (n / 1000000).toFixed(1) +
        "M"
      );
    }

    if (n >= 1000) {
      return (
        (n / 1000).toFixed(1) +
        "K"
      );
    }

    return String(n);
  }

  /* =========================================
     FORMAT DATE
  ========================================= */

  function formatDate(date) {
    if (!date) return "";

    return new Date(
      date
    ).toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  }

  /* =========================================
     LOAD EVERYTHING
  ========================================= */

  useEffect(() => {
    if (!video?.id) return;

    async function start() {
      setLoading(true);

      await Promise.all([
        loadStats(),
        checkLike(),
        loadComments(),
        checkSubscription(),
        loadSubscriberCount(),
        saveWatchHistory(),
      ]);

      await addView();

      setLoading(false);
    }

    start();
  }, [video?.id]);

  /* =========================================
     NO VIDEO
  ========================================= */

  if (!video) {
    return (
      <div className="player-empty">

        <div className="player-empty-icon">
          🎬
        </div>

        <h2>
          Video select nahi hua
        </h2>

        <button onClick={onBack}>
          ← Back
        </button>

      </div>
    );
  }

  /* =========================================
     WATCH PAGE
  ========================================= */

  return (
    <section className="watch-page">

      {/* BACK */}

      <div className="watch-topbar">

        <button
          className="back-button"
          onClick={onBack}
        >
          ← Back to Videos
        </button>

      </div>

      {/* VIDEO */}

      <div className="watch-video-box">

        <video
          className="main-video"
          src={video.video_url}
          controls
          playsInline
          autoPlay
        />

      </div>

      {/* INFORMATION */}

      <div className="watch-info">

        <div className="watch-category">
          {video.category ||
            "General"}
        </div>

        <h1>
          {video.title ||
            "Untitled Video"}
        </h1>

        {/* META */}

        <div className="watch-meta">

          <span>
            👁 {formatCount(views)} views
          </span>

          <span>•</span>

          <span>
            {formatDate(
              video.created_at
            )}
          </span>

          <span>•</span>

          <span>
            ❤️ {formatCount(likes)} likes
          </span>

          <span>•</span>

          <span>
            🔔{" "}
            {formatCount(
              subscriberCount
            )} subscribers
          </span>

        </div>

        {/* ACTIONS */}

        <div className="watch-actions">

          <button
            className={
              liked
                ? "watch-action liked"
                : "watch-action"
            }
            onClick={likeVideo}
            disabled={likeLoading}
            aria-label={
              liked
                ? "Unlike video"
                : "Like video"
            }
          >
            {likeLoading
              ? "⏳ Updating..."
              : liked
              ? "❤️ Liked"
              : "♡ Like"}
          </button>

          <button
            className="watch-action"
            onClick={() =>
              document
                .getElementById(
                  "comments-section"
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                })
            }
          >
            💬 Comment
          </button>

          <button
            className="watch-action"
            onClick={shareVideo}
          >
            🔗 Share
          </button>

        </div>

        {/* MESSAGE */}

        {message && (
          <div className="watch-message">
            {message}
          </div>
        )}

        {/* CREATOR */}

        <div className="creator-box">

          <div className="creator-avatar-large">
            B
          </div>

          <div className="creator-info">

            <strong>
              BharatTube Creator
            </strong>

            <span>
              {formatCount(
                subscriberCount
              )}{" "}
              subscribers
            </span>

          </div>

          <button
            className={
              subscribed
                ? "subscribe-button subscribed"
                : "subscribe-button"
            }
            onClick={
              toggleSubscription
            }
            disabled={
              subscribeLoading
            }
          >
            {subscribeLoading
              ? "Please wait..."
              : subscribed
              ? "✓ Subscribed"
              : "Subscribe"}
          </button>

        </div>

        {/* DESCRIPTION */}

        <div className="description-box">

          <h3>
            Description
          </h3>

          <p>
            {video.description ||
              "Is video ke creator ne abhi description nahi diya hai."}
          </p>

        </div>

      </div>

      {/* COMMENTS */}

      <div
        className="comments-section"
        id="comments-section"
      >

        <div className="comments-heading">

          <h2>
            💬 Comments
          </h2>

          <span>
            {comments.length}
          </span>

        </div>

        {/* COMMENT INPUT */}

        <div className="comment-input-box">

          <div className="comment-avatar">
            M
          </div>

          <div className="comment-input-area">

            <textarea
              value={commentText}
              onChange={(e) =>
                setCommentText(
                  e.target.value
                )
              }
              placeholder="Add a comment..."
              rows="3"
            />

            <div className="comment-buttons">

              <button
                className="comment-cancel"
                onClick={() =>
                  setCommentText("")
                }
              >
                Cancel
              </button>

              <button
                className="comment-post"
                onClick={addComment}
                disabled={
                  commentLoading ||
                  !commentText.trim()
                }
              >
                {commentLoading
                  ? "Posting..."
                  : "Post Comment"}
              </button>

            </div>

          </div>

        </div>

        {/* COMMENT LIST */}

        <div className="comment-list">

          {loading ? (
            <div className="comments-loading">
              Comments loading...
            </div>
          ) : comments.length === 0 ? (
            <div className="no-comments">

              <div>
                💬
              </div>

              <h3>
                No comments yet
              </h3>

              <p>
                Be the first one to comment!
              </p>

            </div>
          ) : (
            comments.map(
              (comment) => (
                <div
                  className="comment-item"
                  key={comment.id}
                >

                  <div className="comment-avatar">
                    M
                  </div>

                  <div className="comment-body">

                    <div className="comment-header">

                      <strong>
                        BharatTube User
                      </strong>

                      <span>
                        {formatDate(
                          comment.created_at
                        )}
                      </span>

                    </div>

                    <p>
                      {comment.content}
                    </p>

                  </div>

                </div>
              )
            )
          )}

        </div>

      </div>

    </section>
  );
}

export default V