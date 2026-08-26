import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import "./Shorts.css";

function Shorts({ user, onOpenVideo }) {
  const [shorts, setShorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [likedIds, setLikedIds] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [viewCounts, setViewCounts] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const videoRefs = useRef({});
  const viewedRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadShorts() {
      setLoading(true);
      setError("");

      try {
        const { data, error: videosError } = await supabase
          .from("videos")
          .select(
            "id, user_id, title, description, category, video_url, thumbnail_url, created_at"
          )
          .eq("category", "Shorts")
          .order("created_at", { ascending: false });

        if (videosError) throw videosError;

        const base = data || [];

        const enriched = await Promise.all(
          base.map(async (video) => {
            const [
              likesResult,
              myLikeResult,
              viewsResult,
              commentsResult,
              profileResult,
            ] = await Promise.all([
              supabase
                .from("video_likes")
                .select("id", { count: "exact", head: true })
                .eq("video_id", video.id),

              user?.id
                ? supabase
                    .from("video_likes")
                    .select("id")
                    .eq("video_id", video.id)
                    .eq("user_id", user.id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),

              supabase
                .from("video_views")
                .select("id", { count: "exact", head: true })
                .eq("video_id", video.id),

              supabase
                .from("comments")
                .select("id", { count: "exact", head: true })
                .eq("video_id", video.id),

              video.user_id
                ? supabase
                    .from("profiles")
                    .select("id, name, username, avatar_url")
                    .eq("id", video.user_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);

            return {
              ...video,
              creator: profileResult.data || null,
              liked: Boolean(myLikeResult.data),
              likes: likesResult.count || 0,
              views: viewsResult.count || 0,
              comments: commentsResult.count || 0,
            };
          })
        );

        if (cancelled) return;

        const likes = {};
        const views = {};
        const comments = {};
        const liked = {};

        enriched.forEach((video) => {
          likes[video.id] = video.likes;
          views[video.id] = video.views;
          comments[video.id] = video.comments;
          liked[video.id] = video.liked;
        });

        setShorts(enriched);
        setLikeCounts(likes);
        setViewCounts(views);
        setCommentCounts(comments);
        setLikedIds(liked);
      } catch (err) {
        console.error("SHORTS LOAD ERROR:", err);
        if (!cancelled) {
          setError(err?.message || "Shorts load nahi ho paaye.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadShorts();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // =====================================================
  // STEP 17 - REAL-TIME SHORTS FEED
  // =====================================================
  useEffect(() => {
    const shortsChannel = supabase
      .channel("bharattube-shorts-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "videos",
          filter: "category=eq.Shorts",
        },
        async () => {
          const { data, error: videosError } = await supabase
            .from("videos")
            .select(
              "id, user_id, title, description, category, video_url, thumbnail_url, created_at"
            )
            .eq("category", "Shorts")
            .order("created_at", { ascending: false });

          if (videosError) {
            console.error("SHORTS REALTIME LOAD ERROR:", videosError);
            return;
          }

          const base = data || [];

          const enriched = await Promise.all(
            base.map(async (video) => {
              const [likesResult, myLikeResult, viewsResult, commentsResult, profileResult] =
                await Promise.all([
                  supabase
                    .from("video_likes")
                    .select("id", { count: "exact", head: true })
                    .eq("video_id", video.id),

                  user?.id
                    ? supabase
                        .from("video_likes")
                        .select("id")
                        .eq("video_id", video.id)
                        .eq("user_id", user.id)
                        .maybeSingle()
                    : Promise.resolve({ data: null }),

                  supabase
                    .from("video_views")
                    .select("id", { count: "exact", head: true })
                    .eq("video_id", video.id),

                  supabase
                    .from("comments")
                    .select("id", { count: "exact", head: true })
                    .eq("video_id", video.id),

                  video.user_id
                    ? supabase
                        .from("profiles")
                        .select("id, name, username, avatar_url")
                        .eq("id", video.user_id)
                        .maybeSingle()
                    : Promise.resolve({ data: null }),
                ]);

              return {
                ...video,
                creator: profileResult.data || null,
                liked: Boolean(myLikeResult.data),
                likes: likesResult.count || 0,
                views: viewsResult.count || 0,
                comments: commentsResult.count || 0,
              };
            })
          );

          setShorts(enriched);

          const likes = {};
          const views = {};
          const comments = {};
          const liked = {};

          enriched.forEach((video) => {
            likes[video.id] = video.likes;
            views[video.id] = video.views;
            comments[video.id] = video.comments;
            liked[video.id] = video.liked;
          });

          setLikeCounts(likes);
          setViewCounts(views);
          setCommentCounts(comments);
          setLikedIds(liked);
        }
      )
      .subscribe((status) => {
        console.log("SHORTS REALTIME STATUS:", status);
      });

    return () => {
      supabase.removeChannel(shortsChannel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!shorts.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            Object.values(videoRefs.current).forEach((other) => {
              if (other && other !== video) {
                other.pause();
              }
            });

            video.play().catch(() => {});

            const id = video.dataset.videoId;

            if (id && !viewedRef.current.has(id) && user?.id) {
              viewedRef.current.add(id);

              supabase
                .from("video_views")
                .insert({
                  video_id: id,
                  user_id: user.id,
                })
                .then(({ error }) => {
                  if (error) {
                    // A unique constraint may already have recorded this view.
                    console.warn("SHORT VIEW:", error.message);
                  } else {
                    setViewCounts((current) => ({
                      ...current,
                      [id]: (current[id] || 0) + 1,
                    }));
                  }
                });
            }
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0.65] }
    );

    Object.values(videoRefs.current).forEach((video) => {
      if (video) observer.observe(video);
    });

    return () => observer.disconnect();
  }, [shorts, user?.id]);

  async function toggleLike(video) {
    if (!user?.id) {
      alert("Like karne ke liye login zaroori hai.");
      return;
    }

    const liked = Boolean(likedIds[video.id]);

    try {
      if (liked) {
        const { error } = await supabase
          .from("video_likes")
          .delete()
          .eq("video_id", video.id)
          .eq("user_id", user.id);

        if (error) throw error;

        setLikedIds((current) => ({
          ...current,
          [video.id]: false,
        }));

        setLikeCounts((current) => ({
          ...current,
          [video.id]: Math.max(0, (current[video.id] || 0) - 1),
        }));
      } else {
        const { error } = await supabase.from("video_likes").insert({
          video_id: video.id,
          user_id: user.id,
        });

        if (error) throw error;

        setLikedIds((current) => ({
          ...current,
          [video.id]: true,
        }));

        setLikeCounts((current) => ({
          ...current,
          [video.id]: (current[video.id] || 0) + 1,
        }));
      }
    } catch (err) {
      console.error("SHORT LIKE ERROR:", err);
      alert(err?.message || "Like update nahi hua.");
    }
  }

  async function shareShort(video) {
    const shareData = {
      title: video.title || "BharatTube Short",
      text: video.description || "Watch this Short on BharatTube",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        alert("Short link copied!");
      }
    } catch {
      // User closed share dialog.
    }
  }

  if (loading) {
    return (
      <div className="shorts-page-state">
        <div className="shorts-spinner" />
        <h2>Shorts loading...</h2>
        <p>BharatTube Shorts taiyar ho rahe hain.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shorts-page-state">
        <div className="shorts-error-icon">⚠️</div>
        <h2>Shorts load nahi ho paaye</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!shorts.length) {
    return (
      <div className="shorts-page-state">
        <div className="shorts-empty-icon">🎬</div>
        <h2>Abhi koi Short nahi hai</h2>
        <p>
          Upload karte waqt category <b>Shorts</b> select karke pehla Short
          upload karo.
        </p>
      </div>
    );
  }

  return (
    <div className="shorts-page">
      <div className="shorts-heading">
        <div>
          <div className="shorts-eyebrow">⚡ BHARATTUBE SHORTS</div>
          <h1>Shorts</h1>
          <p>Swipe karke next Short dekho.</p>
        </div>
      </div>

      <div className="shorts-feed">
        {shorts.map((video) => {
          const creatorName =
            video.creator?.name ||
            video.creator?.username ||
            "BharatTube Creator";

          return (
            <article className="short-card" key={video.id}>
              <div className="short-video-shell">
                <video
                  ref={(node) => {
                    videoRefs.current[video.id] = node;
                  }}
                  data-video-id={video.id}
                  className="short-video"
                  src={video.video_url}
                  poster={video.thumbnail_url || undefined}
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  onClick={(event) => {
                    const current = event.currentTarget;
                    if (current.paused) current.play().catch(() => {});
                    else current.pause();
                  }}
                />

                <div className="short-gradient" />

                <div className="short-top-badge">SHORTS</div>

                <div className="short-bottom-info">
                  <button
                    className="short-creator"
                    onClick={() => onOpenVideo?.(video)}
                  >
                    <span className="short-avatar">
                      {creatorName.charAt(0).toUpperCase()}
                    </span>
                    <span>@{video.creator?.username || "creator"}</span>
                  </button>

                  <h2>{video.title}</h2>

                  {video.description && (
                    <p>{video.description}</p>
                  )}

                  <div className="short-stats">
                    👁 {viewCounts[video.id] || 0} • ❤️{" "}
                    {likeCounts[video.id] || 0} • 💬{" "}
                    {commentCounts[video.id] || 0}
                  </div>
                </div>

                <div className="short-actions">
                  <button
                    className={
                      likedIds[video.id]
                        ? "short-action liked"
                        : "short-action"
                    }
                    onClick={() => toggleLike(video)}
                    title="Like"
                  >
                    <span>❤️</span>
                    <small>{likeCounts[video.id] || 0}</small>
                  </button>

                  <button
                    className="short-action"
                    onClick={() => onOpenVideo?.(video)}
                    title="Comments"
                  >
                    <span>💬</span>
                    <small>{commentCounts[video.id] || 0}</small>
                  </button>

                  <button
                    className="short-action"
                    onClick={() => shareShort(video)}
                    title="Share"
                  >
                    <span>🔗</span>
                    <small>Share</small>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default Shorts;