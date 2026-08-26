import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./Videos.css";

function Videos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadVideos();
  }, []);

  async function loadVideos() {
    setLoading(true);
    setError("");

    try {
      // ---------------------------------------------------------
      // 1. Videos load karo
      // ---------------------------------------------------------
      const { data: videoData, error: videoError } = await supabase
        .from("videos")
        .select(`
          id,
          user_id,
          title,
          description,
          category,
          video_url,
          thumbnail_url,
          views,
          likes,
          dislikes,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (videoError) {
        throw videoError;
      }

      const list = videoData || [];

      // ---------------------------------------------------------
      // 2. Videos me jitne user_id hain unko collect karo
      // ---------------------------------------------------------
      const userIds = [
        ...new Set(
          list
            .map((video) => video.user_id)
            .filter(Boolean)
            .map((id) => String(id))
        ),
      ];

      let profiles = [];

      // ---------------------------------------------------------
      // 3. Profiles table se creators load karo
      // ---------------------------------------------------------
      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(`
            id,
            username,
            full_name,
            avatar_url,
            bio
          `)
          .in("id", userIds);

        if (profileError) {
          console.error("Profile loading error:", profileError);
        } else {
          profiles = profileData || [];
        }
      }

      // ---------------------------------------------------------
      // 4. Profile map banao
      // IMPORTANT:
      // String(id) use kar rahe hain taaki UUID matching properly ho
      // ---------------------------------------------------------
      const profilesMap = {};

      profiles.forEach((profile) => {
        if (profile?.id) {
          profilesMap[String(profile.id)] = profile;
        }
      });

      // ---------------------------------------------------------
      // 5. Har video ke saath creator attach karo
      // ---------------------------------------------------------
      const finalVideos = list.map((video) => {
        const profile = profilesMap[String(video.user_id)] || null;

        const creatorName =
          profile?.username?.trim() ||
          profile?.full_name?.trim() ||
          "BharatTube Creator";

        return {
          ...video,

          profile,

          // Creator name
          username: creatorName,

          // Creator avatar
          avatar_url: profile?.avatar_url || "",

          // Safe counters
          views_count: Number(video.views || 0),
          likes_count: Number(video.likes || 0),
          dislikes_count: Number(video.dislikes || 0),
        };
      });

      console.log("VIDEOS WITH CREATORS:", finalVideos);

      setVideos(finalVideos);
    } catch (err) {
      console.error("Videos loading error:", err);
      setError(err?.message || "Videos load nahi ho paaye.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------
  // Date format
  // ---------------------------------------------------------
  function formatDate(date) {
    if (!date) return "";

    const d = new Date(date);

    if (Number.isNaN(d.getTime())) {
      return "";
    }

    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // ---------------------------------------------------------
  // Number format
  // ---------------------------------------------------------
  function formatNumber(number) {
    const n = Number(number || 0);

    if (n >= 10000000) {
      return `${(n / 10000000).toFixed(1)}Cr`;
    }

    if (n >= 100000) {
      return `${(n / 100000).toFixed(1)}L`;
    }

    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }

    return String(n);
  }

  // ---------------------------------------------------------
  // Video open
  // ---------------------------------------------------------
  function openVideo(video) {
    if (!video?.id) return;

    // Agar tumhare App.jsx me /watch/:id route hai
    // to ye direct video page open karega.
    window.location.href = `/watch/${video.id}`;
  }

  // ---------------------------------------------------------
  // Loading
  // ---------------------------------------------------------
  if (loading) {
    return (
      <section className="videos-page">
        <div className="videos-header">
          <div>
            <h1>🎬 Videos</h1>
            <p>Latest videos on BharatTube</p>
          </div>
        </div>

        <div className="videos-loading">
          <div className="loading-spinner"></div>
          <p>Videos loading...</p>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------
  // Error
  // ---------------------------------------------------------
  if (error) {
    return (
      <section className="videos-page">
        <div className="videos-header">
          <div>
            <h1>🎬 Videos</h1>
            <p>Latest videos on BharatTube</p>
          </div>
        </div>

        <div className="videos-error">
          <div className="error-icon">⚠️</div>
          <h2>Videos load nahi hue</h2>
          <p>{error}</p>

          <button
            className="retry-button"
            onClick={loadVideos}
          >
            🔄 Try Again
          </button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------
  // Main UI
  // ---------------------------------------------------------
  return (
    <section className="videos-page">

      {/* Header */}
      <div className="videos-header">
        <div>
          <h1>🎬 Videos</h1>
          <p>Latest uploads from BharatTube creators</p>
        </div>

        <div className="video-count">
          {videos.length} videos
        </div>
      </div>

      {/* Empty */}
      {videos.length === 0 ? (
        <div className="videos-empty">
          <div className="empty-icon">🎬</div>
          <h2>No videos found</h2>
          <p>Abhi BharatTube par koi video upload nahi hua.</p>
        </div>
      ) : (
        <div className="videos-grid">

          {videos.map((video) => {

            // -------------------------------------------------
            // Creator information
            // -------------------------------------------------
            const creatorName =
              video.profile?.username ||
              video.profile?.full_name ||
              video.username ||
              "BharatTube Creator";

            const avatar =
              video.profile?.avatar_url ||
              video.avatar_url ||
              "";

            // First letter avatar
            const avatarLetter =
              creatorName
                .charAt(0)
                .toUpperCase() || "B";

            return (
              <article
                className="video-card"
                key={video.id}
              >

                {/* -------------------------------------------
                    Thumbnail
                -------------------------------------------- */}
                <div
                  className="video-thumbnail"
                  onClick={() => openVideo(video)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      openVideo(video);
                    }
                  }}
                >

                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title || "Video thumbnail"}
                      className="thumbnail-image"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <span>▶</span>
                    </div>
                  )}

                  <div className="thumbnail-overlay">
                    <div className="play-button">
                      ▶
                    </div>
                  </div>

                  {video.category && (
                    <span className="video-category">
                      {video.category}
                    </span>
                  )}
                </div>

                {/* -------------------------------------------
                    Video information
                -------------------------------------------- */}
                <div className="video-info">

                  <h2
                    className="video-title"
                    title={video.title}
                    onClick={() => openVideo(video)}
                  >
                    {video.title || "Untitled Video"}
                  </h2>

                  {/* -----------------------------------------
                      CREATOR
                      YAHI MAIN FIX HAI
                  ------------------------------------------ */}
                  <div className="creator-row">

                    <div className="creator-avatar">

                      {avatar ? (
                        <img
                          src={avatar}
                          alt={creatorName}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";

                            if (
                              e.currentTarget.parentElement
                                ?.querySelector(".avatar-letter")
                            ) {
                              e.currentTarget.parentElement
                                .querySelector(".avatar-letter")
                                .style.display = "flex";
                            }
                          }}
                        />
                      ) : null}

                      <span
                        className="avatar-letter"
                        style={{
                          display: avatar ? "none" : "flex",
                        }}
                      >
                        {avatarLetter}
                      </span>

                    </div>

                    <div className="creator-details">

                      {/* ACTUAL CREATOR NAME */}
                      <div className="creator-name">
                        {creatorName}
                      </div>

                      <div className="creator-handle">
                        {video.profile?.username
                          ? `@${video.profile.username}`
                          : ""}
                      </div>

                    </div>

                  </div>

                  {/* -----------------------------------------
                      Stats
                  ------------------------------------------ */}
                  <div className="video-stats">

                    <span>
                      👁️ {formatNumber(video.views_count)} views
                    </span>

                    <span>•</span>

                    <span>
                      ❤️ {formatNumber(video.likes_count)}
                    </span>

                    <span>•</span>

                    <span>
                      {formatDate(video.created_at)}
                    </span>

                  </div>

                </div>

              </article>
            );
          })}

        </div>
      )}
    </section>
  );
}

export default Videos;