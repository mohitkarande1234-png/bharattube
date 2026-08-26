import { useEffect, useState } from "react";
import { supabase } from "../supabase";

function Profile({ user, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [videos, setVideos] = useState([]);

  const [subscriberCount, setSubscriberCount] = useState(0);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeLoading, setSubscribeLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  useEffect(() => {
    if (!user?.id) return;

    loadProfile();
    loadVideos();
    loadSubscriberData();
  }, [user?.id]);

  // =====================================================
  // LOAD PROFILE
  // =====================================================

  async function loadProfile() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setFullName(data.full_name || "");
        setUsername(data.username || "");
        setBio(data.bio || "");
        setAvatarUrl(data.avatar_url || "");
      } else {
        const defaultUsername =
          user.email
            ?.split("@")[0]
            ?.replace(/[^a-zA-Z0-9_]/g, "")
            .substring(0, 20) || "creator";

        const defaultName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          defaultUsername;

        setFullName(defaultName);
        setUsername(defaultUsername);
        setBio("");
        setAvatarUrl("");
      }
    } catch (error) {
      console.error("PROFILE ERROR:", error);

      setMessage(
        error?.message || "Profile load nahi ho paya."
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // LOAD VIDEOS
  // =====================================================

  async function loadVideos() {
    try {
      const { data, error } = await supabase
        .from("videos")
        .select(
          `
          id,
          title,
          description,
          category,
          video_url,
          thumbnail_url,
          created_at
          `
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;

      setVideos(data || []);
    } catch (error) {
      console.error("PROFILE VIDEOS ERROR:", error);
    }
  }

  // =====================================================
  // LOAD SUBSCRIBER DATA
  // =====================================================

  async function loadSubscriberData() {
    try {
      const { count, error: countError } = await supabase
        .from("subscriptions")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("channel_id", user.id);

      if (countError) throw countError;

      setSubscriberCount(count || 0);

      const { data, error } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("subscriber_id", user.id)
        .eq("channel_id", user.id)
        .maybeSingle();

      if (error) {
        console.log("SELF SUB CHECK:", error.message);
      }

      setSubscribed(Boolean(data));
    } catch (error) {
      console.error("SUBSCRIBER DATA ERROR:", error);
    }
  }

  // =====================================================
  // SUBSCRIBE
  // =====================================================

  async function toggleSubscribe() {
    setMessage("ℹ️ Ye aapka own channel hai.");
    setMessageType("info");
  }

  // =====================================================
  // AVATAR UPLOAD
  // =====================================================

  async function handleAvatarUpload(file) {
    if (!file) return;

    // Image check
    if (!file.type.startsWith("image/")) {
      setMessage("❌ Sirf JPG, PNG ya WEBP image upload karo.");
      setMessageType("error");
      return;
    }

    // 5MB check
    if (file.size > 5 * 1024 * 1024) {
      setMessage("❌ Profile photo maximum 5MB ki ho sakti hai.");
      setMessageType("error");
      return;
    }

    try {
      setUploadingAvatar(true);
      setMessage("");
      setMessageType("");

      const fileExt =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

      // User ke folder ke andar unique avatar
      const filePath =
        `${user.id}/avatar-${Date.now()}.${fileExt}`;

      // Upload
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Public URL
      const { data: publicUrlData } =
        supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

      const publicUrl =
        publicUrlData?.publicUrl || "";

      if (!publicUrl) {
        throw new Error(
          "Avatar URL generate nahi ho paya."
        );
      }

      // Existing profile update
      const { data: updatedProfile, error: updateError } =
        await supabase
          .from("profiles")
          .update({
            avatar_url: publicUrl,
          })
          .eq("id", user.id)
          .select()
          .single();

      if (updateError) {
        // Agar profile row nahi hai to create karo
        if (updateError.code === "PGRST116") {
          const defaultUsername =
            username ||
            user.email
              ?.split("@")[0]
              ?.replace(/[^a-zA-Z0-9_]/g, "")
              .substring(0, 20) ||
            "creator";

          const defaultName =
            fullName ||
            user.user_metadata?.name ||
            defaultUsername;

          const { data: newProfile, error: insertError } =
            await supabase
              .from("profiles")
              .insert({
                id: user.id,
                username: defaultUsername,
                full_name: defaultName,
                bio: bio || "",
                avatar_url: publicUrl,
              })
              .select()
              .single();

          if (insertError) {
            throw insertError;
          }

          setProfile(newProfile);
        } else {
          throw updateError;
        }
      } else {
        setProfile(updatedProfile);
      }

      // UI immediately update
      setAvatarUrl(publicUrl);

      setMessage(
        "✅ Profile photo successfully update ho gayi!"
      );
      setMessageType("success");

    } catch (error) {
      console.error("AVATAR UPLOAD ERROR:", error);

      setMessage(
        "❌ Photo upload nahi hui: " +
          (error?.message || "Unknown error")
      );
      setMessageType("error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // =====================================================
  // SAVE PROFILE
  // =====================================================

  async function saveProfile(e) {
    e.preventDefault();

    setMessage("");
    setMessageType("");

    const cleanUsername =
      username.trim().toLowerCase();

    if (!cleanUsername) {
      setMessage("❌ Username enter karo.");
      setMessageType("error");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setMessage(
        "❌ Username me sirf letters, numbers aur _ use karo."
      );
      setMessageType("error");
      return;
    }

    if (!fullName.trim()) {
      setMessage("❌ Full Name enter karo.");
      setMessageType("error");
      return;
    }

    try {
      setSaving(true);

      const profileData = {
        id: user.id,
        username: cleanUsername,
        full_name: fullName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl || null,
      };

      const { data, error } = await supabase
        .from("profiles")
        .upsert(profileData, {
          onConflict: "id",
        })
        .select()
        .single();

      if (error) throw error;

      setProfile(data);

      setFullName(data.full_name || "");
      setUsername(data.username || "");
      setBio(data.bio || "");
      setAvatarUrl(data.avatar_url || "");

      setEditing(false);

      setMessage(
        "✅ Profile updated successfully!"
      );
      setMessageType("success");

    } catch (error) {
      console.error("SAVE PROFILE ERROR:", error);

      if (error?.code === "23505") {
        setMessage(
          "❌ Ye username already taken hai."
        );
      } else {
        setMessage(
          "❌ " +
            (error?.message ||
              "Profile save nahi hua.")
        );
      }

      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // DISPLAY DATA
  // =====================================================

  const displayName =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "BharatTube Creator";

  const displayUsername =
    profile?.username ||
    username ||
    "creator";

  const displayAvatar =
    profile?.avatar_url ||
    avatarUrl ||
    "";

  const avatarLetter =
    displayName.charAt(0).toUpperCase();

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner"></div>
        <p>Profile loading...</p>
      </div>
    );
  }

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="creator-profile-page">

      <style>{`
        .creator-profile-page {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
          padding: 0 16px 40px;
        }

        .creator-profile-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }

        .creator-main-info {
          min-width: 0;
          flex: 1 1 260px;
        }

        .creator-main-info h1,
        .creator-username,
        .creator-email {
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .creator-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .creator-stats-bar {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          width: 100%;
          box-sizing: border-box;
        }

        .creator-stat {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-align: center;
          box-sizing: border-box;
        }

        .creator-stat strong,
        .creator-stat span {
          white-space: nowrap;
        }

        .creator-video-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          width: 100%;
          box-sizing: border-box;
        }

        .creator-video-card {
          min-width: 0;
          overflow: hidden;
        }

        .creator-video-thumb {
          width: 100%;
          aspect-ratio: 16 / 9;
          height: auto !important;
          min-height: 0 !important;
          overflow: hidden;
          position: relative;
          background: #080b12;
        }

        .creator-video-thumb img,
        .creator-video-thumb video {
          display: block;
          width: 100%;
          height: 100% !important;
          object-fit: cover;
        }

        .edit-profile-card input,
        .edit-profile-card textarea {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        @media (max-width: 900px) {
          .creator-video-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .creator-profile-page {
            padding: 0 12px 32px;
          }

          .creator-cover {
            min-height: 170px;
          }

          .creator-avatar-large {
            width: 92px;
            height: 92px;
          }

          .creator-profile-header {
            align-items: flex-start;
            gap: 14px;
          }

          .creator-main-info {
            flex-basis: 100%;
          }

          .creator-main-info h1 {
            font-size: clamp(26px, 8vw, 36px);
            margin-bottom: 6px;
          }

          .creator-email {
            font-size: 14px;
            margin-top: 8px;
          }

          .creator-actions {
            width: 100%;
            gap: 8px;
          }

          .creator-actions button {
            flex: 1 1 140px;
            min-height: 42px;
          }

          .creator-stats-bar {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
          }

          .creator-stat {
            flex-direction: column;
            gap: 2px;
            padding: 12px 6px;
          }

          .creator-stat strong {
            font-size: 20px;
          }

          .creator-stat span {
            font-size: 12px;
          }

          .creator-video-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .creator-video-thumb {
            aspect-ratio: 16 / 9;
          }

          .creator-video-content h3 {
            overflow-wrap: anywhere;
          }

          .edit-profile-card {
            width: 100%;
            box-sizing: border-box;
          }

          .profile-photo-edit {
            flex-wrap: wrap;
          }

          .edit-profile-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .edit-profile-actions button {
            flex: 1 1 140px;
          }
        }

        @media (max-width: 420px) {
          .creator-profile-page {
            padding-left: 8px;
            padding-right: 8px;
          }

          .creator-cover {
            min-height: 145px;
          }

          .creator-avatar-large {
            width: 78px;
            height: 78px;
          }

          .creator-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .creator-actions button {
            width: 100%;
            flex: 1 1 auto;
          }

          .creator-stat {
            padding: 10px 3px;
          }

          .creator-stat strong {
            font-size: 18px;
          }

          .creator-stat span {
            font-size: 11px;
          }
        }
      `}</style>


      {/* COVER */}
      <section className="creator-cover">
        <div className="creator-cover-glow"></div>

        <div className="creator-avatar-large">

          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt={displayName}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            avatarLetter
          )}

        </div>
      </section>

      {/* PROFILE HEADER */}
      <section className="creator-profile-header">

        <div className="creator-main-info">

          <div>
            <h1>{displayName}</h1>

            <p className="creator-username">
              @{displayUsername}
            </p>

            <p className="creator-email">
              {user.email}
            </p>
          </div>

        </div>

        <div className="creator-actions">

          <button
            className="profile-edit-btn"
            onClick={() => {
              setEditing(true);
              setMessage("");
            }}
          >
            ✏️ Edit Profile
          </button>

          <button
            className="profile-logout-btn"
            onClick={onLogout}
          >
            Logout
          </button>

        </div>

      </section>

      {/* STATS */}
      <section className="creator-stats-bar">

        <div className="creator-stat">
          <strong>{videos.length}</strong>
          <span>Videos</span>
        </div>

        <div className="creator-stat">
          <strong>{subscriberCount}</strong>
          <span>Subscribers</span>
        </div>

        <div className="creator-stat">
          <strong>🇮🇳</strong>
          <span>BharatTube</span>
        </div>

      </section>

      {/* MESSAGE */}
      {message && (
        <div
          className={`profile-message ${messageType}`}
        >
          {message}
        </div>
      )}

      {/* EDIT PROFILE */}
      {editing && (
        <form
          className="edit-profile-card"
          onSubmit={saveProfile}
        >

          <div className="edit-profile-title">
            <div>
              <h2>Edit Your Profile</h2>
              <p>
                Apna creator profile customize karo.
              </p>
            </div>
          </div>

          {/* PROFILE PHOTO */}
          <div className="profile-photo-edit">

            <div className="profile-photo-preview">

              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                />
              ) : (
                avatarLetter
              )}

            </div>

            <div className="profile-photo-controls">

              <label className="avatar-upload-btn">

                {uploadingAvatar
                  ? "⏳ Uploading..."
                  : "📷 Change Photo"}

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={
                    uploadingAvatar ||
                    saving
                  }
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0];

                    handleAvatarUpload(file);

                    e.target.value = "";
                  }}
                />

              </label>

              <small>
                JPG, PNG, WEBP • Maximum 5MB
              </small>

            </div>

          </div>

          {/* FULL NAME */}
          <label>
            👤 Full Name
          </label>

          <input
            type="text"
            value={fullName}
            maxLength={60}
            placeholder="Your name"
            onChange={(e) =>
              setFullName(e.target.value)
            }
          />

          {/* USERNAME */}
          <label>
            @ Username
          </label>

          <input
            type="text"
            value={username}
            maxLength={20}
            placeholder="your_username"
            onChange={(e) =>
              setUsername(
                e.target.value.toLowerCase()
              )
            }
          />

          <small className="username-help">
            Sirf letters, numbers aur underscore (_) allowed.
          </small>

          {/* BIO */}
          <label>
            📝 Bio
          </label>

          <textarea
            value={bio}
            maxLength={300}
            rows={5}
            placeholder="Apne baare me kuch likho..."
            onChange={(e) =>
              setBio(e.target.value)
            }
          />

          <div className="bio-count">
            {bio.length}/300
          </div>

          {/* BUTTONS */}
          <div className="edit-profile-actions">

            <button
              type="button"
              className="profile-cancel-btn"
              onClick={() => {
                setEditing(false);

                setFullName(
                  profile?.full_name || ""
                );

                setUsername(
                  profile?.username || ""
                );

                setBio(
                  profile?.bio || ""
                );

                setAvatarUrl(
                  profile?.avatar_url || ""
                );

                setMessage("");
              }}
              disabled={
                saving ||
                uploadingAvatar
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              className="profile-save-btn"
              disabled={
                saving ||
                uploadingAvatar
              }
            >
              {saving
                ? "Saving..."
                : "💾 Save Profile"}
            </button>

          </div>

        </form>
      )}

      {/* ABOUT */}
      {!editing && (
        <section className="creator-about">

          <div>
            <h2>About</h2>

            <p>
              {profile?.bio ||
                "Is creator ne abhi apna bio add nahi kiya hai."}
            </p>
          </div>

        </section>
      )}

      {/* VIDEOS */}
      <section className="creator-videos">

        <div className="creator-section-title">

          <div>
            <h2>🎬 Videos</h2>

            <p>
              {videos.length === 0
                ? "No videos uploaded yet."
                : `${videos.length} videos uploaded`}
            </p>
          </div>

        </div>

        {videos.length === 0 ? (

          <div className="creator-empty">

            <div>🎬</div>

            <h3>No videos yet</h3>

            <p>
              Upload your first video
              to start your channel.
            </p>

          </div>

        ) : (

          <div className="creator-video-grid">

            {videos.map((video) => (

              <article
                className="creator-video-card"
                key={video.id}
              >

                <div className="creator-video-thumb">

                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                    />
                  ) : (
                    <video
                      src={video.video_url}
                      muted
                      preload="metadata"
                      playsInline
                    />
                  )}

                  <span>▶</span>

                </div>

                <div className="creator-video-content">

                  <h3 title={video.title}>
                    {video.title}
                  </h3>

                  <p>
                    {video.category || "General"}
                  </p>

                  <small>
                    {new Date(
                      video.created_at
                    ).toLocaleDateString(
                      "en-IN",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }
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

export default Profile;