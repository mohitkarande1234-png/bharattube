import { useEffect, useState } from "react";
import { supabase } from "../supabase";

function Subscriptions({ onSelectVideo }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSubscriptions() {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSubscriptions([]);
        setVideos([]);
        return;
      }

      // User ki subscriptions
      const { data: subscriptionData, error: subscriptionError } =
        await supabase
          .from("subscriptions")
          .select("id, subscriber_id, channel_id, created_at")
          .eq("subscriber_id", user.id)
          .order("created_at", {
            ascending: false,
          });

      if (subscriptionError) {
        throw subscriptionError;
      }

      const subs = subscriptionData || [];
      setSubscriptions(subs);

      // Agar kisi channel ko subscribe nahi kiya
      if (subs.length === 0) {
        setVideos([]);
        return;
      }

      const channelIds = subs.map((item) => item.channel_id);

      // Subscribed channels ke videos
      const { data: videoData, error: videoError } = await supabase
        .from("videos")
        .select(`
          id,
          user_id,
          title,
          description,
          category,
          video_url,
          created_at
        `)
        .in("user_id", channelIds)
        .order("created_at", {
          ascending: false,
        });

      if (videoError) {
        throw videoError;
      }

      setVideos(videoData || []);
    } catch (err) {
      console.error("SUBSCRIPTIONS ERROR:", err);
      setError(
        err.message || "Subscriptions load nahi ho pa rahi hain."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubscriptions();
  }, []);

  function formatDate(date) {
    if (!date) return "Recently uploaded";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getChannelName(video) {
    return video?.user_id
      ? "BharatTube Creator"
      : "BharatTube";
  }

  if (loading) {
    return (
      <section className="subscriptions-page">
        <div className="subscriptions-loading">
          <div className="loading-spinner"></div>

          <h2>Subscriptions loading...</h2>

          <p>
            Aapke subscribed channels laaye ja rahe hain.
          </p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="subscriptions-page">
        <div className="subscriptions-error">
          <div className="subscription-error-icon">
            ⚠️
          </div>

          <h2>Subscriptions load nahi ho pa rahi</h2>

          <p>{error}</p>

          <button onClick={loadSubscriptions}>
            ↻ Try Again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="subscriptions-page">

      {/* PAGE HEADER */}

      <div className="subscriptions-header">

        <div>
          <span className="subscriptions-label">
            BHARATTUBE
          </span>

          <h1>Subscriptions</h1>

          <p>
            Aapke subscribed channels ke latest videos.
          </p>
        </div>

        <button
          className="subscription-refresh"
          onClick={loadSubscriptions}
        >
          ↻ Refresh
        </button>

      </div>

      {/* CHANNEL COUNT */}

      <div className="subscription-summary">
        <div className="summary-icon">
          ▶
        </div>

        <div>
          <strong>
            {subscriptions.length}
          </strong>

          <span>
            subscribed channel
            {subscriptions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* EMPTY */}

      {subscriptions.length === 0 ? (
        <div className="subscriptions-empty">

          <div className="empty-subscription-icon">
            📺
          </div>

          <h2>Abhi koi subscription nahi hai</h2>

          <p>
            Kisi creator ko subscribe karo.
            Uske latest videos yahan dikhenge.
          </p>

        </div>
      ) : (
        <>
          {/* CHANNELS */}

          <div className="subscribed-channels">

            <h2>Your Channels</h2>

            <div className="channel-chip-list">

              {subscriptions.map((subscription) => (
                <div
                  className="channel-chip"
                  key={subscription.id}
                >
                  <div className="channel-chip-avatar">
                    B
                  </div>

                  <div>
                    <strong>
                      BharatTube Creator
                    </strong>

                    <small>
                      Subscribed
                    </small>
                  </div>
                </div>
              ))}

            </div>

          </div>

          {/* VIDEOS */}

          <div className="subscription-videos">

            <div className="subscription-videos-header">
              <div>
                <h2>Latest Videos</h2>

                <p>
                  Subscribed channels ke naye videos
                </p>
              </div>
            </div>

            {videos.length === 0 ? (
              <div className="no-subscription-videos">
                <div>🎬</div>

                <h3>
                  Abhi koi naya video nahi hai
                </h3>

                <p>
                  Aapke subscribed channels ne
                  abhi video upload nahi kiya.
                </p>
              </div>
            ) : (
              <div className="subscription-video-grid">

                {videos.map((video) => (
                  <article
                    className="subscription-video-card"
                    key={video.id}
                    onClick={() => {
                      if (onSelectVideo) {
                        onSelectVideo(video);
                      }
                    }}
                  >

                    <div className="subscription-thumbnail">

                      <video
                        src={video.video_url}
                        muted
                        preload="metadata"
                        playsInline
                      />

                      <div className="subscription-play">
                        ▶
                      </div>

                      <span>
                        {video.category || "General"}
                      </span>

                    </div>

                    <div className="subscription-video-info">

                      <div className="subscription-avatar">
                        B
                      </div>

                      <div className="subscription-video-text">

                        <h3 title={video.title}>
                          {video.title}
                        </h3>

                        <p>
                          {getChannelName(video)}
                        </p>

                        <small>
                          0 views •{" "}
                          {formatDate(video.created_at)}
                        </small>

                      </div>

                    </div>

                  </article>
                ))}

              </div>
            )}

          </div>
        </>
      )}

    </section>
  );
}

export default Subscriptions;