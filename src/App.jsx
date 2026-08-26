import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import Auth from "./components/Auth.jsx";
import Upload from "./components/Upload.jsx";
import Channel from "./components/Channel.jsx";
import Shorts from "./components/Shorts.jsx";
import Notifications from "./components/Notifications.jsx";
import Profile from "./components/Profile.jsx";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState("home");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedChannelId, setSelectedChannelId] = useState(null);

  const [subscriptions, setSubscriptions] = useState([]);
  const [history, setHistory] = useState([]);

  const [category, setCategory] = useState("All");

  const [profileOpen, setProfileOpen] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  // =====================================================
  // SESSION
  // =====================================================

  useEffect(() => {
    async function checkSession() {
      const { data, error } =
        await supabase.auth.getSession();

      if (error) {
        console.error("SESSION ERROR:", error);
      }

      setUser(data?.session?.user || null);
      setLoading(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // =====================================================
  // LOAD VIDEOS
  // =====================================================

  async function loadVideos() {
    try {
      setVideosLoading(true);
      setVideosError("");

      const { data, error } = await supabase
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
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;

      const baseVideos = data || [];

      // Load creator profiles separately so every video gets the
      // real creator name/avatar from public.profiles.
      const userIds = [
        ...new Set(
          baseVideos
            .map((video) => video.user_id)
            .filter(Boolean)
        ),
      ];

      let profilesMap = {};

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } =
          await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .in("id", userIds);

        if (profilesError) {
          console.error("PROFILES ERROR:", profilesError);
        } else {
          profilesMap = (profiles || []).reduce(
            (map, profile) => {
              map[profile.id] = profile;
              return map;
            },
            {}
          );
        }
      }

      const enriched = await Promise.all(
        baseVideos.map(async (video) => {
          const [
            { count: viewsCount },
            { count: likesCount },
          ] = await Promise.all([
            supabase
              .from("video_views")
              .select("*", {
                count: "exact",
                head: true,
              })
              .eq("video_id", video.id),

            supabase
              .from("video_likes")
              .select("*", {
                count: "exact",
                head: true,
              })
              .eq("video_id", video.id),
          ]);

          const profile = profilesMap[video.user_id] || null;

          const creatorName =
            profile?.username ||
            profile?.full_name ||
            "BharatTube Creator";

          return {
            ...video,
            profile,
            creator_name: creatorName,
            creator_avatar_url: profile?.avatar_url || "",
            views: viewsCount || 0,
            likes: likesCount || 0,
          };
        })
      );

      setVideos(enriched);
    } catch (error) {
      console.error("VIDEOS ERROR:", error);
      setVideosError(
        error?.message ||
          "Videos load nahi ho pa rahe."
      );
    } finally {
      setVideosLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadVideos();
    }
  }, [user]);


  // =====================================================
  // REAL-TIME VIDEO FEED
  // =====================================================

  useEffect(() => {
    if (!user) return;

    const videoChannel = supabase
      .channel("videos-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "videos",
        },
        async () => {
          console.log("VIDEO INSERT RECEIVED");
          await loadVideos();
        }
      )
      .subscribe((status) => {
        console.log("VIDEOS REALTIME STATUS:", status);
      });

    return () => {
      supabase.removeChannel(videoChannel);
    };
  }, [user]);

  // =====================================================
  // LOAD SUBSCRIPTIONS
  // =====================================================

  async function loadSubscriptions() {
    if (!user) return;

    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id, subscriber_id, channel_id, created_at"
      )
      .eq("subscriber_id", user.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "SUBSCRIPTIONS ERROR:",
        error
      );
      return;
    }

    setSubscriptions(data || []);
  }

  // =====================================================
  // LOAD HISTORY
  // =====================================================

  async function loadHistory() {
    if (!user) return;

    const { data, error } = await supabase
      .from("watch_history")
      .select(
        "id, user_id, video_id, watched_at"
      )
      .eq("user_id", user.id)
      .order("watched_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "HISTORY ERROR:",
        error
      );
      return;
    }

    setHistory(data || []);
  }

  useEffect(() => {
    if (!user) return;

    loadSubscriptions();
    loadHistory();
  }, [user]);

  // =====================================================
  // LOAD NOTIFICATIONS
  // =====================================================

  async function loadNotifications() {
    if (!user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, actor_id, type, video_id, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("NOTIFICATIONS ERROR:", error);
      return;
    }

    setNotifications(data || []);
  }

  async function markNotificationRead(id) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("NOTIFICATION READ ERROR:", error);
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, is_read: true } : item
      )
    );
  }

  async function markAllNotificationsRead() {
    const unread = notifications.filter((item) => !item.is_read);
    if (!unread.length) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("MARK ALL READ ERROR:", error);
      alert(error.message);
      return;
    }

    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );
  }

  useEffect(() => {
    if (!user) return;

    loadNotifications();

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // =====================================================
  // LOGIN
  // =====================================================

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setPage("home");
  }

  // =====================================================
  // LOGOUT
  // =====================================================

  async function handleLogout() {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      alert(error.message);
      return;
    }

    setUser(null);
    setSelectedVideo(null);
    setProfileOpen(false);
    setPage("home");
  }

  // =====================================================
  // USER NAME
  // =====================================================

  const userName =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "User";

  // =====================================================
  // SEARCH + CATEGORY FILTER
  // =====================================================

  const filteredVideos = useMemo(() => {
    let result = [...videos];

    if (category !== "All") {
      result = result.filter(
        (video) =>
          (video.category || "")
            .toLowerCase() ===
          category.toLowerCase()
      );
    }

    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter((video) => {
        const title =
          video.title?.toLowerCase() || "";

        const description =
          video.description?.toLowerCase() || "";

        const videoCategory =
          video.category?.toLowerCase() || "";

        return (
          title.includes(query) ||
          description.includes(query) ||
          videoCategory.includes(query)
        );
      });
    }

    return result;
  }, [videos, search, category]);

  // =====================================================
  // TRENDING
  // =====================================================

  const trendingVideos = useMemo(() => {
    return [...videos]
      .sort((a, b) => {
        const scoreA =
          (a.views || 0) * 3 +
          (a.likes || 0) * 5;

        const scoreB =
          (b.views || 0) * 3 +
          (b.likes || 0) * 5;

        return scoreB - scoreA;
      })
      .slice(0, 20);
  }, [videos]);

  // =====================================================
  // HISTORY VIDEOS
  // =====================================================

  const historyVideos = useMemo(() => {
    const map = new Map(
      videos.map((video) => [
        video.id,
        video,
      ])
    );

    return history
      .map((item) => {
        const video = map.get(item.video_id);

        if (!video) return null;

        return {
          ...video,
          watched_at: item.watched_at,
        };
      })
      .filter(Boolean);
  }, [history, videos]);

  // =====================================================
  // RECOMMENDED FEED
  // =====================================================

  const recommendedVideos = useMemo(() => {
    const historyVideoIds = new Set(
      history.map((item) => item.video_id)
    );

    const subscribedChannelIds = new Set(
      subscriptions.map((item) => item.channel_id)
    );

    const historyCategoryScores = historyVideos.reduce(
      (scores, video) => {
        const key = (video.category || "").toLowerCase();
        if (key) scores[key] = (scores[key] || 0) + 3;
        return scores;
      },
      {}
    );

    return [...videos]
      .filter((video) => video.user_id !== user?.id)
      .map((video) => {
        const categoryKey = (video.category || "").toLowerCase();

        let score = 0;

        if (subscribedChannelIds.has(video.user_id)) {
          score += 100;
        }

        score += (historyCategoryScores[categoryKey] || 0) * 10;
        score += Math.min(video.likes || 0, 20) * 2;
        score += Math.min(video.views || 0, 1000) * 0.01;

        // Prefer fresh content slightly.
        const ageHours =
          Math.max(
            0,
            (Date.now() - new Date(video.created_at).getTime()) /
              (1000 * 60 * 60)
          );

        score += Math.max(0, 24 - ageHours) * 0.5;

        // Avoid filling the top of recommendations with videos
        // the user has already watched.
        if (historyVideoIds.has(video.id)) {
          score -= 25;
        }

        return { video, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.video)
      .slice(0, 8);
  }, [videos, history, historyVideos, subscriptions, user]);

  // =====================================================
  // LIBRARY
  // =====================================================

  const libraryVideos = useMemo(() => {
    return videos.filter(
      (video) => video.user_id === user?.id
    );
  }, [videos, user]);

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-logo">
          ▶ Bharat<span>Tube</span>
        </div>

        <div className="loading-spinner"></div>

        <p>
          BharatTube loading...
        </p>
      </div>
    );
  }

  // =====================================================
  // AUTH
  // =====================================================

  if (!user) {
    return (
      <Auth onLogin={handleLogin} />
    );
  }

  // =====================================================
  // OPEN VIDEO
  // =====================================================

  async function openVideo(video) {
    setSelectedVideo(video);

    if (!user?.id || !video?.id) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from("watch_history")
          .upsert(
            {
              user_id: user.id,
              video_id: video.id,
              watched_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                "user_id,video_id",
            }
          );

      if (error) {
        console.error(
          "HISTORY SAVE ERROR:",
          error
        );
      }

      await loadHistory();
    } catch (error) {
      console.error(
        "HISTORY ERROR:",
        error
      );
    }
  }

  // =====================================================
  // CATEGORY LIST
  // =====================================================

  const categories = [
    "All",
    "Technology",
    "Entertainment",
    "Gaming",
    "Education",
    "News",
    "Music",
    "Shorts",
  ];

  // =====================================================
  // HOME PAGE
  // =====================================================

  function HomePage() {
    return (
      <div className="home-page">

        <section className="hero">

          <div className="hero-content">

            <div className="hero-badge">
              🇮🇳 INDIA'S VIDEO PLATFORM
            </div>

            <h1>
              Welcome to
              <br />
              <span>BharatTube</span>
            </h1>

            <p>
              Watch. Create. Share.
              <br />
              Apna Indian video platform.
            </p>

            <div className="hero-buttons">

              <button
                className="hero-upload-btn"
                onClick={() =>
                  setPage("upload")
                }
              >
                ⬆ Upload Video
              </button>

              <button
                className="hero-watch-btn"
                onClick={() =>
                  setPage("videos")
                }
              >
                ▶ Watch Videos
              </button>

            </div>

          </div>

          <div className="hero-visual">
            <div className="hero-circle">
              ▶
            </div>
          </div>

        </section>

        <div className="category-row">

          {categories.map((item) => (
            <button
              key={item}
              className={
                category === item
                  ? "category active"
                  : "category"
              }
              onClick={() => {
                if (item === "Shorts") {
                  setPage("shorts");
                  return;
                }
                setCategory(item);
              }}
            >
              {item}
            </button>
          ))}

        </div>

        <section className="home-videos">

          <div className="section-heading">

            <div>
              <h2>
                🎬 Latest Videos
              </h2>

              <p>
                Recently uploaded on
                BharatTube
              </p>
            </div>

            <button
              className="see-all-btn"
              onClick={() =>
                setPage("videos")
              }
            >
              See all →
            </button>

          </div>

          <VideoGrid
            videos={
              filteredVideos.slice(0, 8)
            }
            loading={videosLoading}
            error={videosError}
            onRefresh={loadVideos}
            onSelect={openVideo}
          />

        </section>

        {recommendedVideos.length > 0 && (
          <section className="home-videos recommended-section">
            <div className="section-heading">
              <div>
                <h2>✨ Recommended for You</h2>
                <p>
                  Aapki watch history, subscriptions aur popular videos
                  ke basis par.
                </p>
              </div>

              <button
                className="see-all-btn"
                onClick={() => setPage("videos")}
              >
                See all →
              </button>
            </div>

            <VideoGrid
              videos={recommendedVideos}
              loading={false}
              error=""
              onRefresh={loadVideos}
              onSelect={openVideo}
            />
          </section>
        )}

      </div>
    );
  }

  // =====================================================
  // VIDEOS PAGE
  // =====================================================

  function VideosPage() {
    return (
      <div className="page-container">

        <div className="page-heading">

          <div>
            <h1>🎬 Videos</h1>

            <p>
              Search and watch videos
              on BharatTube.
            </p>
          </div>

          <button
            className="red-btn"
            onClick={() =>
              setPage("upload")
            }
          >
            ⬆ Upload Video
          </button>

        </div>

        <div className="category-row page-categories">

          {categories.map((item) => (
            <button
              key={item}
              className={
                category === item
                  ? "category active"
                  : "category"
              }
              onClick={() => {
                if (item === "Shorts") {
                  setPage("shorts");
                  return;
                }
                setCategory(item);
              }}
            >
              {item}
            </button>
          ))}

        </div>

        {search && (
          <div className="search-result-title">
            Search results for:
            <strong> "{search}"</strong>
          </div>
        )}

        <VideoGrid
          videos={filteredVideos}
          loading={videosLoading}
          error={videosError}
          onRefresh={loadVideos}
          onSelect={openVideo}
        />

      </div>
    );
  }

  // =====================================================
  // TRENDING PAGE
  // =====================================================

  function TrendingPage() {
    return (
      <div className="page-container">

        <div className="page-heading">

          <div>
            <div className="page-eyebrow">
              🔥 HOT RIGHT NOW
            </div>

            <h1>
              Trending
            </h1>

            <p>
              BharatTube par sabse
              popular videos.
            </p>
          </div>

          <button
            className="refresh-btn"
            onClick={loadVideos}
          >
            ↻ Refresh
          </button>

        </div>

        <VideoGrid
          videos={trendingVideos}
          loading={videosLoading}
          error={videosError}
          onRefresh={loadVideos}
          onSelect={openVideo}
        />

      </div>
    );
  }

  // =====================================================
  // SUBSCRIPTIONS PAGE
  // =====================================================

  function SubscriptionsPage() {

    const channelIds =
      subscriptions.map(
        (item) => item.channel_id
      );

    const subscribedVideos =
      videos.filter((video) =>
        channelIds.includes(
          video.user_id
        )
      );

    return (
      <div className="page-container">

        <div className="page-heading">

          <div>
            <div className="page-eyebrow">
              📺 YOUR CHANNELS
            </div>

            <h1>
              Subscriptions
            </h1>

            <p>
              Jin creators ko aapne
              subscribe kiya hai.
            </p>
          </div>

        </div>

        {subscriptions.length === 0 ? (

          <EmptyState
            icon="📺"
            title="No subscriptions yet"
            text="Kisi creator ko subscribe karne ke baad uske videos yahan dikhenge."
            buttonText="Watch Videos"
            onClick={() =>
              setPage("videos")
            }
          />

        ) : (

          <VideoGrid
            videos={subscribedVideos}
            loading={videosLoading}
            error={videosError}
            onRefresh={loadVideos}
            onSelect={openVideo}
          />

        )}

      </div>
    );
  }

  // =====================================================
  // HISTORY PAGE
  // =====================================================

  function HistoryPage() {
    return (
      <div className="page-container">

        <div className="page-heading">

          <div>
            <div className="page-eyebrow">
              🕘 WATCHED VIDEOS
            </div>

            <h1>
              History
            </h1>

            <p>
              Aapne recently jo videos
              dekhe hain.
            </p>
          </div>

          {historyVideos.length > 0 && (
            <button
              className="clear-btn"
              onClick={async () => {
                const { error } =
                  await supabase
                    .from("watch_history")
                    .delete()
                    .eq(
                      "user_id",
                      user.id
                    );

                if (error) {
                  alert(error.message);
                  return;
                }

                setHistory([]);
              }}
            >
              Clear History
            </button>
          )}

        </div>

        {historyVideos.length === 0 ? (

          <EmptyState
            icon="🕘"
            title="History is empty"
            text="Jo videos aap dekhenge woh yahan automatically save honge."
            buttonText="Watch Videos"
            onClick={() =>
              setPage("videos")
            }
          />

        ) : (

          <VideoGrid
            videos={historyVideos}
            loading={false}
            error=""
            onRefresh={loadHistory}
            onSelect={openVideo}
          />

        )}

      </div>
    );
  }

  // =====================================================
  // LIBRARY PAGE
  // =====================================================

  function LibraryPage() {
    return (
      <div className="page-container">

        <div className="page-heading">

          <div>
            <div className="page-eyebrow">
              📚 YOUR CONTENT
            </div>

            <h1>
              Library
            </h1>

            <p>
              Aapke uploaded videos
              yahan milenge.
            </p>
          </div>

          <button
            className="red-btn"
            onClick={() =>
              setPage("upload")
            }
          >
            ⬆ Upload Video
          </button>

        </div>

        {libraryVideos.length === 0 ? (

          <EmptyState
            icon="📚"
            title="Your Library is empty"
            text="Apna pehla video upload karke yahan dekho."
            buttonText="Upload Video"
            onClick={() =>
              setPage("upload")
            }
          />

        ) : (

          <VideoGrid
            videos={libraryVideos}
            loading={false}
            error=""
            onRefresh={loadVideos}
            onSelect={openVideo}
          />

        )}

      </div>
    );
  }

  // =====================================================
  // UPLOAD PAGE
  // =====================================================

  function UploadPage() {
    return (
      <div className="page-container">

        <div className="page-heading">

          <div>
            <h1>
              ⬆ Upload Video
            </h1>

            <p>
              Share your video with
              BharatTube.
            </p>
          </div>

        </div>

        <Upload
          onUploadComplete={() => {
            loadVideos();
            setPage("videos");
          }}
        />

      </div>
    );
  }

  function openCreatorChannel(channelId) {
    if (!channelId) return;
    setSelectedVideo(null);
    setSelectedChannelId(channelId);
    setPage("channel");
  }

  // =====================================================
  // CHANNEL PAGE
  // =====================================================

  function ChannelPage() {
    return (
      <div className="page-container">
        <Channel
          channelId={selectedChannelId || user.id}
          currentUser={user}
          onSelectVideo={openVideo}
          onBack={() => {
            setSelectedChannelId(null);
            setPage("home");
          }}
        />
      </div>
    );
  }

  // =====================================================
  // PROFILE PAGE
  // =====================================================

  function ProfilePage() {
    return (
      <Profile
        user={user}
        onBack={() => setPage("home")}
        onLogout={handleLogout}
        onSelectVideo={openVideo}
      />
    );
  }

  // =====================================================
  // PAGE RENDER
  // =====================================================

  function renderPage() {

    if (page === "home") {
      return <HomePage />;
    }

    if (page === "shorts") {
      return (
        <Shorts
          user={user}
          onOpenVideo={openVideo}
        />
      );
    }

    if (page === "videos") {
      return <VideosPage />;
    }

    if (page === "trending") {
      return <TrendingPage />;
    }

    if (page === "subscriptions") {
      return <SubscriptionsPage />;
    }

    if (page === "library") {
      return <LibraryPage />;
    }

    if (page === "history") {
      return <HistoryPage />;
    }

    if (page === "upload") {
      return <UploadPage />;
    }

    if (page === "channel") {
      return <ChannelPage />;
    }

    if (page === "profile") {
      return <ProfilePage />;
    }

    if (page === "notifications") {
      return (
        <Notifications
          user={user}
          notifications={notifications}
          onRefresh={loadNotifications}
          onMarkRead={markNotificationRead}
          onMarkAllRead={markAllNotificationsRead}
          onBack={() => setPage("home")}
        />
      );
    }

    return <HomePage />;
  }

  // =====================================================
  // MAIN UI
  // =====================================================

  return (
    <div className="app">

      {/* HEADER */}

      <header className="top-header">

        <div className="header-left">

          <button
            className="menu-btn"
            onClick={() =>
              setSidebarOpen(
                !sidebarOpen
              )
            }
          >
            ☰
          </button>

          <button
            className="brand"
            onClick={() =>
              setPage("home")
            }
          >
            <span className="brand-play">
              ▶
            </span>

            <strong>
              Bharat
              <span>Tube</span>
            </strong>
          </button>

        </div>

        <div className="search-box">

          <input
            type="text"
            placeholder="Search videos..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage("videos");
              }
            }}
          />

          {search && (
            <button
              className="search-clear"
              onClick={() =>
                setSearch("")
              }
            >
              ✕
            </button>
          )}

          <button
            onClick={() =>
              setPage("videos")
            }
          >
            🔍
          </button>

        </div>

        <div className="header-right">

          <button
            className="header-upload"
            onClick={() =>
              setPage("upload")
            }
          >
            + Upload
          </button>

          <button
            className="notification-header-btn"
            title="Notifications"
            onClick={() => setPage("notifications")}
          >
            🔔
            {unreadNotifications > 0 && (
              <span className="notification-badge">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </button>

          <div className="profile-area">

            <button
              className="header-avatar"
              onClick={() =>
                setProfileOpen(
                  !profileOpen
                )
              }
            >
              {userName
                .charAt(0)
                .toUpperCase()}
            </button>

            {profileOpen && (
              <div className="profile-menu">

                <div className="profile-menu-user">

                  <div className="small-avatar">
                    {userName
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div>
                    <strong>
                      {userName}
                    </strong>

                    <small>
                      {user.email}
                    </small>
                  </div>

                </div>

                <button
                  onClick={() => {
                    setPage("channel");
                    setProfileOpen(false);
                  }}
                >
                  📺 Your Channel
                </button>

                <button
                  onClick={() => {
                    setPage("profile");
                    setProfileOpen(false);
                  }}
                >
                  👤 Your Profile
                </button>

                <button
                  onClick={() => {
                    setPage("history");
                    setProfileOpen(false);
                  }}
                >
                  🕘 Watch History
                </button>

                <button
                  className="profile-menu-logout"
                  onClick={handleLogout}
                >
                  Logout
                </button>

              </div>
            )}

          </div>

        </div>

      </header>

      {/* BODY */}

      <div className="app-body">

        {sidebarOpen && (
          <aside className="sidebar">

            <button
              className={
                page === "home"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("home")
              }
            >
              <span>🏠</span>
              Home
            </button>

            <button
              className={
                page === "trending"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("trending")
              }
            >
              <span>🔥</span>
              Trending
            </button>

            <button
              className={
                page === "shorts"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("shorts")
              }
            >
              <span>🎞️</span>
              Shorts
            </button>

            <button
              className={
                page === "videos"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("videos")
              }
            >
              <span>🎬</span>
              Videos
            </button>

            <button
              className={
                page === "subscriptions"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("subscriptions")
              }
            >
              <span>📺</span>
              Subscriptions
            </button>

            <button
              className={
                page === "notifications"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() => setPage("notifications")}
            >
              <span>🔔</span>
              Notifications
              {unreadNotifications > 0 && (
                <span className="sidebar-notification-count">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </button>

            <div className="sidebar-line"></div>

            <button
              className={
                page === "library"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("library")
              }
            >
              <span>📚</span>
              Library
            </button>

            <button
              className={
                page === "history"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("history")
              }
            >
              <span>🕘</span>
              History
            </button>

            <div className="sidebar-line"></div>

            <button
              className={
                page === "upload"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("upload")
              }
            >
              <span>⬆️</span>
              Upload Video
            </button>

            <button
              className={
                page === "channel"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("channel")
              }
            >
              <span>📺</span>
              Your Channel
            </button>

            <button
              className={
                page === "profile"
                  ? "sidebar-item active"
                  : "sidebar-item"
              }
              onClick={() =>
                setPage("profile")
              }
            >
              <span>👤</span>
              Your Profile
            </button>

            <div className="sidebar-bottom">

              <p>
                © 2026 BharatTube
              </p>

              <button
                className="logout-sidebar"
                onClick={handleLogout}
              >
                Logout
              </button>

            </div>

          </aside>
        )}

        <main className="main-content">
          {renderPage()}
        </main>

      </div>

      {/* VIDEO MODAL */}

      {selectedVideo && (
        <VideoModal
          video={selectedVideo}
          user={user}
          onClose={() =>
            setSelectedVideo(null)
          }
          onLikeChange={loadVideos}
          onOpenChannel={openCreatorChannel}
        />
      )}

    </div>
  );
}


// =========================================================
// VIDEO GRID
// =========================================================

function VideoGrid({
  videos,
  loading,
  error,
  onRefresh,
  onSelect,
}) {

  if (loading) {
    return (
      <div className="videos-state">

        <div className="loading-spinner"></div>

        <h2>
          Videos loading...
        </h2>

        <p>
          BharatTube se videos
          laaye ja rahe hain.
        </p>

      </div>
    );
  }

  if (error) {
    return (
      <div className="videos-state error-state">

        <div className="state-icon">
          ⚠️
        </div>

        <h2>
          Videos load nahi ho pa rahe
        </h2>

        <p>{error}</p>

        <button
          className="red-btn"
          onClick={onRefresh}
        >
          Try Again
        </button>

      </div>
    );
  }

  if (!videos.length) {
    return (
      <div className="videos-state">

        <div className="state-icon">
          🎬
        </div>

        <h2>
          Abhi koi video nahi hai
        </h2>

        <p>
          BharatTube par pehla
          video upload karo.
        </p>

      </div>
    );
  }

  return (
    <div className="modern-video-grid">

      {videos.map((video) => (

        <article
          className="modern-video-card"
          key={video.id}
          onClick={() =>
            onSelect(video)
          }
        >

          <div className="modern-thumbnail">

            {video.thumbnail_url ? (
              <img
                src={String(video.thumbnail_url).trim()}
                alt={video.title || "Video thumbnail"}
                className="modern-thumbnail-image"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.parentElement?.querySelector(
                    ".thumbnail-video-fallback"
                  );
                  if (fallback) {
                    fallback.style.display = "block";
                  }
                }}
              />
            ) : null}

            <video
              className="thumbnail-video-fallback"
              src={video.video_url}
              muted
              preload="metadata"
              playsInline
              style={{
                display: video.thumbnail_url ? "none" : "block",
              }}
            />

            <div className="thumbnail-play">
              ▶
            </div>

            <span className="thumbnail-category">
              {video.category ||
                "General"}
            </span>

          </div>

          <div className="modern-video-info">

            <div className="creator-avatar">
              {video.creator_avatar_url ? (
                <img
                  src={video.creator_avatar_url}
                  alt={video.creator_name || "Creator"}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                (video.creator_name || "B")
                  .charAt(0)
                  .toUpperCase()
              )}
            </div>

            <div className="modern-video-text">

              <h3 title={video.title}>
                {video.title ||
                  "Untitled Video"}
              </h3>

              <p>
                {video.creator_name ||
                  "BharatTube Creator"}
              </p>

              <small>
                👁 {video.views || 0} views
                {" • "}
                ❤️ {video.likes || 0}
                {" • "}
                {formatDate(
                  video.created_at
                )}
              </small>

            </div>

            <button
              className="video-more"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              ⋮
            </button>

          </div>

        </article>

      ))}

    </div>
  );
}


// =========================================================
// EMPTY STATE
// =========================================================

function EmptyState({
  icon,
  title,
  text,
  buttonText,
  onClick,
}) {
  return (
    <div className="empty-state">

      <div className="empty-state-icon">
        {icon}
      </div>

      <h2>{title}</h2>

      <p>{text}</p>

      <button
        className="red-btn"
        onClick={onClick}
      >
        {buttonText}
      </button>

    </div>
  );
}


// =========================================================
// DATE FORMAT
// =========================================================

function formatDate(date) {
  if (!date) {
    return "Recently";
  }

  return new Date(date).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}


// =========================================================
// VIDEO MODAL
// =========================================================

function VideoModal({
  video,
  user,
  onClose,
  onLikeChange,
  onOpenChannel,
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [views, setViews] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    loadVideoData();
  }, [video.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
    el.playbackRate = speed;
  }, [volume, muted, speed]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else onClose();
      }
      if (e.target?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowLeft") seekBy(-10);
      if (e.key === "ArrowRight") seekBy(10);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  async function loadVideoData() {
    try {
      setLoading(true);
      const videoId = video.id;
      const [likesResult, myLikeResult, viewsResult, commentsResult] = await Promise.all([
        supabase.from("video_likes").select("*", { count: "exact", head: true }).eq("video_id", videoId),
        supabase.from("video_likes").select("id").eq("video_id", videoId).eq("user_id", user.id).maybeSingle(),
        supabase.from("video_views").select("*", { count: "exact", head: true }).eq("video_id", videoId),
        supabase.from("comments").select("id, video_id, user_id, comment, created_at").eq("video_id", videoId).order("created_at", { ascending: false }),
      ]);

      setLikes(likesResult.count || 0);
      setLiked(Boolean(myLikeResult.data));
      setViews(viewsResult.count || 0);
      setComments(commentsResult.data || []);

      if (video.user_id) {
        const { data } = await supabase.from("subscriptions").select("id").eq("subscriber_id", user.id).eq("channel_id", video.user_id).maybeSingle();
        setSubscribed(Boolean(data));
      }
    } catch (error) {
      console.error("VIDEO DATA ERROR:", error);
    } finally {
      setLoading(false);
    }
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  function seekBy(seconds) {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
  }

  function handleTimeUpdate() {
    const el = videoRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime || 0);
  }

  function handleLoadedMetadata() {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration || 0);
    setVolume(el.volume);
  }

  function handleProgress(e) {
    const el = videoRef.current;
    if (!el) return;
    const value = Number(e.target.value);
    el.currentTime = value;
    setCurrentTime(value);
  }

  function changeVolume(e) {
    const value = Number(e.target.value);
    setVolume(value);
    setMuted(value === 0);
    if (videoRef.current) {
      videoRef.current.volume = value;
      videoRef.current.muted = value === 0;
    }
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setMuted(next);
    if (!next && el.volume === 0) {
      el.volume = 0.7;
      setVolume(0.7);
    }
  }

  function chooseSpeed(value) {
    setSpeed(value);
    setSpeedOpen(false);
    if (videoRef.current) videoRef.current.playbackRate = value;
  }

  async function toggleFullscreen() {
    const el = playerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch (error) {
      console.error("FULLSCREEN ERROR:", error);
    }
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) return "0:00";
    const total = Math.floor(value);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }

  async function toggleLike() {
    try {
      if (liked) {
        const { error } = await supabase.from("video_likes").delete().eq("video_id", video.id).eq("user_id", user.id);
        if (error) throw error;
        setLiked(false);
        setLikes((value) => Math.max(0, value - 1));
      } else {
        const { error } = await supabase.from("video_likes").insert({ video_id: video.id, user_id: user.id });
        if (error) throw error;
        setLiked(true);
        setLikes((value) => value + 1);
      }
      if (onLikeChange) onLikeChange();
    } catch (error) {
      console.error("LIKE ERROR:", error);
      alert(error?.message || "Like update nahi ho paya.");
    }
  }

  async function toggleSubscription() {
    if (!video.user_id || video.user_id === user.id) return;
    try {
      setSubscriptionLoading(true);
      if (subscribed) {
        const { error } = await supabase.from("subscriptions").delete().eq("subscriber_id", user.id).eq("channel_id", video.user_id);
        if (error) throw error;
        setSubscribed(false);
      } else {
        const { error } = await supabase.from("subscriptions").insert({ subscriber_id: user.id, channel_id: video.user_id });
        if (error) throw error;
        setSubscribed(true);
      }
    } catch (error) {
      console.error("SUBSCRIBE ERROR:", error);
      alert(error?.message || "Subscription update nahi ho paya.");
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function addComment(e) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    try {
      setCommentLoading(true);
      const { data, error } = await supabase.from("comments").insert({ video_id: video.id, user_id: user.id, comment: text }).select().single();
      if (error) throw error;
      setComments((current) => [data, ...current]);
      setCommentText("");
    } catch (error) {
      console.error("COMMENT ERROR:", error);
      alert(error?.message || "Comment post nahi ho paya.");
    } finally {
      setCommentLoading(false);
    }
  }

  async function deleteComment(id) {
    const { error } = await supabase.from("comments").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      alert(error.message);
      return;
    }
    setComments((current) => current.filter((comment) => comment.id !== id));
  }

  function getName(comment) {
    if (comment.user_id === user.id) {
      return user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "You";
    }
    return "BharatTube User";
  }

  async function shareVideo() {
    try {
      if (navigator.share) {
        await navigator.share({ title: video.title || "BharatTube Video", text: "Watch this video on BharatTube", url: window.location.href });
      } else {
        await navigator.clipboard?.writeText(window.location.href);
        alert("Link copied!");
      }
    } catch (error) {
      console.log("Share cancelled");
    }
  }

  return (
    <div className="video-modal" onClick={onClose}>
      <div className="video-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-video" onClick={onClose}>✕</button>

        <div className={`bt-player ${fullscreen ? "bt-player-fullscreen" : ""}`} ref={playerRef}>
          <video
            ref={videoRef}
            className="bt-player-video"
            src={video.video_url}
            poster={video.thumbnail_url || undefined}
            autoPlay
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setPlaying(false)}
            onClick={togglePlay}
          />

          <div className="bt-player-gradient" />

          <div className="bt-player-controls">
            <input className="bt-progress" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={handleProgress} aria-label="Video progress" />

            <div className="bt-controls-row">
              <div className="bt-controls-left">
                <button className="bt-control-btn" onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
                <button className="bt-control-btn" onClick={() => seekBy(-10)}>↶10</button>
                <button className="bt-control-btn" onClick={() => seekBy(10)}>10↷</button>
                <button className="bt-control-btn" onClick={toggleMute}>{muted || volume === 0 ? "🔇" : "🔊"}</button>
                <input className="bt-volume" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={changeVolume} aria-label="Volume" />
                <span className="bt-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>

              <div className="bt-controls-right">
                <div className="bt-speed-wrap">
                  <button className="bt-control-btn bt-speed-btn" onClick={() => setSpeedOpen((v) => !v)}>{speed}×</button>
                  {speedOpen && (
                    <div className="bt-speed-menu">
                      {[0.5, 1, 1.5, 2].map((value) => (
                        <button key={value} className={speed === value ? "active" : ""} onClick={() => chooseSpeed(value)}>{value}×</button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="bt-control-btn" onClick={toggleFullscreen}>{fullscreen ? "⛶" : "⛶"}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-video-info">
          <div className="modal-top-row">
            <span className="video-category-big">{video.category || "General"}</span>
            {video.user_id !== user.id && (
              <button className={subscribed ? "subscribe-btn subscribed" : "subscribe-btn"} onClick={toggleSubscription} disabled={subscriptionLoading}>
                {subscriptionLoading ? "..." : subscribed ? "✓ Subscribed" : "🔔 Subscribe"}
              </button>
            )}
          </div>

          <h1>{video.title}</h1>

          <div className="video-stats">
            👁 {views} views <span>•</span> ❤️ {likes} likes <span>•</span> 💬 {comments.length} comments
          </div>

          <div className="video-actions">
            <button className={liked ? "action-btn liked" : "action-btn"} onClick={toggleLike}>{liked ? "❤️ Liked" : "🤍 Like"} {likes}</button>
            <button className="action-btn" onClick={() => document.getElementById("comment-input")?.focus()}>💬 Comment</button>
            <button className="action-btn" onClick={shareVideo}>🔗 Share</button>
          </div>

          <div className="description-box">
            <button
              type="button"
              className="video-creator-link"
              onClick={() => onOpenChannel?.(video.user_id)}
            >
              🇮🇳 {video.creator_name || "BharatTube Creator"}
            </button>
            <p>{video.description || "No description available."}</p>
          </div>

          <div className="comments-section">
            <h2>💬 Comments ({comments.length})</h2>
            <form className="comment-form" onSubmit={addComment}>
              <div className="comment-avatar">{user.email?.charAt(0).toUpperCase() || "U"}</div>
              <input id="comment-input" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment..." maxLength={500} />
              <button type="submit" disabled={commentLoading || !commentText.trim()}>{commentLoading ? "..." : "Post"}</button>
            </form>

            <div className="comments-list">
              {loading ? (
                <div className="comment-loading">Loading...</div>
              ) : comments.length === 0 ? (
                <div className="no-comments">No comments yet.<br />Be the first! 🇮🇳</div>
              ) : (
                comments.map((comment) => (
                  <div className="comment" key={comment.id}>
                    <div className="comment-avatar">{getName(comment).charAt(0).toUpperCase()}</div>
                    <div className="comment-body">
                      <div className="comment-top">
                        <strong>{getName(comment)}</strong>
                        <small>{new Date(comment.created_at).toLocaleDateString("en-IN")}</small>
                      </div>
                      <p>{comment.comment}</p>
                      {comment.user_id === user.id && <button className="delete-comment" onClick={() => deleteComment(comment.id)}>Delete</button>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;