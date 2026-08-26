import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

function Upload({ onUploadComplete }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Technology");

  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");

  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);

  // ==========================================
  // VIDEO SELECT
  // ==========================================

  function handleVideoChange(e) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setMessage("❌ Please select a valid video file.");
      setMessageType("error");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setMessage("❌ Video 500 MB se kam hona chahiye.");
      setMessageType("error");
      return;
    }

    setVideoFile(file);
    setMessage("");
    setMessageType("");
  }

  // ==========================================
  // DRAG VIDEO
  // ==========================================

  function handleDragOver(e) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setDragActive(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setMessage("❌ Please select a valid video file.");
      setMessageType("error");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setMessage("❌ Video 500 MB se kam hona chahiye.");
      setMessageType("error");
      return;
    }

    setVideoFile(file);
    setMessage("");
    setMessageType("");
  }

  // ==========================================
  // REMOVE VIDEO
  // ==========================================

  function removeVideo() {
    setVideoFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // ==========================================
  // THUMBNAIL SELECT
  // ==========================================

  function handleThumbnailChange(e) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("❌ Please select a valid image.");
      setMessageType("error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage("❌ Thumbnail 10 MB se kam hona chahiye.");
      setMessageType("error");
      return;
    }

    if (thumbnailPreview) {
      URL.revokeObjectURL(thumbnailPreview);
    }

    setThumbnailFile(file);

    const preview = URL.createObjectURL(file);

    setThumbnailPreview(preview);

    setMessage("");
    setMessageType("");
  }

  // ==========================================
  // REMOVE THUMBNAIL
  // ==========================================

  function removeThumbnail() {
    if (thumbnailPreview) {
      URL.revokeObjectURL(thumbnailPreview);
    }

    setThumbnailFile(null);
    setThumbnailPreview("");

    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  useEffect(() => {
    return () => {
      if (thumbnailPreview) {
        URL.revokeObjectURL(thumbnailPreview);
      }
    };
  }, [thumbnailPreview]);

  // ==========================================
  // FILE SIZE
  // ==========================================

  function formatSize(bytes) {
    if (!bytes) {
      return "0 MB";
    }

    const mb = bytes / (1024 * 1024);

    if (mb < 1024) {
      return mb.toFixed(2) + " MB";
    }

    return (mb / 1024).toFixed(2) + " GB";
  }

  // ==========================================
  // UPLOAD
  // ==========================================

  async function handleUpload(e) {
    e.preventDefault();

    setMessage("");
    setMessageType("");

    if (!videoFile) {
      setMessage("❌ Pehle video select karo.");
      setMessageType("error");
      return;
    }

    if (!title.trim()) {
      setMessage("❌ Video title enter karo.");
      setMessageType("error");
      return;
    }

    try {
      setUploading(true);

      // USER
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("Please login first.");
      }

      // ========================================
      // VIDEO UPLOAD
      // ========================================

      setMessage("⬆️ Video upload ho raha hai...");
      setMessageType("info");

      const videoExtension =
        videoFile.name.split(".").pop()?.toLowerCase() || "mp4";

      const videoName =
        `${user.id}/${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 10)}.${videoExtension}`;

      const {
        error: videoError,
      } = await supabase.storage
        .from("videos")
        .upload(videoName, videoFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: videoFile.type || "video/mp4",
        });

      if (videoError) {
        throw new Error(
          "Video upload failed: " +
            videoError.message
        );
      }

      const {
        data: videoPublicData,
      } = supabase.storage
        .from("videos")
        .getPublicUrl(videoName);

      const videoUrl =
        videoPublicData?.publicUrl;

      // ========================================
      // THUMBNAIL UPLOAD
      // ========================================

      let thumbnailUrl = null;

      if (thumbnailFile) {
        setMessage(
          "🖼️ Thumbnail upload ho raha hai..."
        );

        setMessageType("info");

        const thumbnailExtension =
          thumbnailFile.name
            .split(".")
            .pop()
            ?.toLowerCase() || "jpg";

        const thumbnailName =
          `${user.id}/${Date.now()}-thumbnail-${Math.random()
            .toString(36)
            .substring(2, 10)}.${thumbnailExtension}`;

        const {
          error: thumbnailError,
        } = await supabase.storage
          .from("thumbnails")
          .upload(
            thumbnailName,
            thumbnailFile,
            {
              cacheControl: "3600",
              upsert: false,
              contentType:
                thumbnailFile.type ||
                "image/jpeg",
            }
          );

        if (thumbnailError) {
          throw new Error(
            "Thumbnail upload failed: " +
              thumbnailError.message
          );
        }

        const {
          data: thumbnailPublicData,
        } = supabase.storage
          .from("thumbnails")
          .getPublicUrl(
            thumbnailName
          );

        thumbnailUrl =
          thumbnailPublicData?.publicUrl;
      }

      // ========================================
      // DATABASE
      // ========================================

      setMessage(
        "💾 Video details save ho rahe hain..."
      );

      setMessageType("info");

      const {
        data: savedVideo,
        error: databaseError,
      } = await supabase
        .from("videos")
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: description.trim(),
          category,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
        })
        .select()
        .single();

      if (databaseError) {
        throw new Error(
          "Database error: " +
            databaseError.message
        );
      }

      console.log(
        "BHARATTUBE VIDEO:",
        savedVideo
      );

      // ========================================
      // SUCCESS
      // ========================================

      setMessage(
        "✅ Video aur thumbnail successfully upload ho gaya!"
      );

      setMessageType("success");

      setTitle("");
      setDescription("");
      setCategory("Technology");

      setVideoFile(null);
      setThumbnailFile(null);

      if (thumbnailPreview) {
        URL.revokeObjectURL(
          thumbnailPreview
        );
      }

      setThumbnailPreview("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = "";
      }

      if (onUploadComplete) {
        setTimeout(() => {
          onUploadComplete(savedVideo);
        }, 800);
      }

    } catch (error) {
      console.error(
        "BHARATTUBE UPLOAD ERROR:",
        error
      );

      setMessage(
        "❌ " +
          (
            error?.message ||
            "Upload failed."
          )
      );

      setMessageType("error");

    } finally {
      setUploading(false);
    }
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <div
      className="upload-page"
      style={{
        width: "100%",
        minHeight: "100vh",
      }}
    >

      <div className="upload-card">

        {/* HEADER */}

        <div className="upload-header">

          <div className="upload-icon">
            ↑
          </div>

          <div>

            <div className="upload-eyebrow">
              BHARATTUBE CREATOR
            </div>

            <h1>
              Upload Video
            </h1>

            <p>
              Share your video with
              BharatTube community.
            </p>

          </div>

        </div>

        <form
          className="upload-form"
          onSubmit={handleUpload}
        >

          {/* =================================
              VIDEO
          ================================= */}

          <label>
            🎬 Video File
          </label>

          <div
            className={
              dragActive
                ? "upload-dropzone active"
                : "upload-dropzone"
            }
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >

            {!videoFile ? (

              <>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoChange}
                  disabled={uploading}
                  hidden
                />

                <button
                  type="button"
                  className="drop-content"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={uploading}
                >

                  <div className="drop-icon">
                    🎬
                  </div>

                  <h3>
                    Drop your video here
                  </h3>

                  <p>
                    or click to browse
                  </p>

                  <small>
                    MP4, WebM, MOV • Max 500 MB
                  </small>

                </button>

              </>

            ) : (

              <div className="selected-file">

                <div className="selected-file-icon">
                  🎥
                </div>

                <div className="selected-file-info">

                  <strong>
                    {videoFile.name}
                  </strong>

                  <span>
                    {formatSize(videoFile.size)}
                  </span>

                </div>

                <button
                  type="button"
                  className="remove-file"
                  onClick={removeVideo}
                  disabled={uploading}
                >
                  ✕
                </button>

              </div>

            )}

          </div>

          {/* =================================
              THUMBNAIL
          ================================= */}

          <div
            style={{
              display: "block",
              width: "100%",
              marginTop: "30px",
              marginBottom: "25px",
              padding: "0",
              visibility: "visible",
              opacity: 1,
            }}
          >

            <div
              style={{
                display: "block",
                color: "#ffffff",
                fontSize: "20px",
                fontWeight: "800",
                marginBottom: "12px",
              }}
            >
              🖼️ VIDEO THUMBNAIL
            </div>

            <div
              style={{
                display: "block",
                width: "100%",
                minHeight: "160px",
                padding: "20px",
                boxSizing: "border-box",
                border: "3px dashed #ff6b2c",
                borderRadius: "16px",
                background: "#111827",
                visibility: "visible",
                opacity: 1,
              }}
            >

              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailChange}
                disabled={uploading}
                style={{
                  display: "none",
                }}
              />

              {!thumbnailFile ? (

                <button
                  type="button"
                  onClick={() =>
                    thumbnailInputRef.current?.click()
                  }
                  disabled={uploading}
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: "100px",
                    border: "none",
                    borderRadius: "12px",
                    background: "#273244",
                    color: "#ffffff",
                    fontSize: "20px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  🖼️ CHOOSE THUMBNAIL
                </button>

              ) : (

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "20px",
                    flexWrap: "wrap",
                  }}
                >

                  <img
                    src={thumbnailPreview}
                    alt="Thumbnail"
                    style={{
                      display: "block",
                      width: "240px",
                      height: "135px",
                      objectFit: "cover",
                      borderRadius: "12px",
                      border: "2px solid #ff6b2c",
                    }}
                  />

                  <div
                    style={{
                      color: "#ffffff",
                    }}
                  >

                    <div
                      style={{
                        fontSize: "17px",
                        fontWeight: "700",
                        marginBottom: "8px",
                        wordBreak: "break-word",
                      }}
                    >
                      {thumbnailFile.name}
                    </div>

                    <div
                      style={{
                        color: "#9ca3af",
                        marginBottom: "12px",
                      }}
                    >
                      {formatSize(
                        thumbnailFile.size
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={removeThumbnail}
                      disabled={uploading}
                      style={{
                        border: "none",
                        borderRadius: "8px",
                        padding: "9px 14px",
                        background: "#ef4444",
                        color: "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      ✕ Remove Thumbnail
                    </button>

                  </div>

                </div>

              )}

              <div
                style={{
                  color: "#9ca3af",
                  textAlign: "center",
                  marginTop: "12px",
                  fontSize: "14px",
                }}
              >
                JPG, PNG, WEBP • Max 10 MB
              </div>

            </div>

          </div>

          {/* =================================
              TITLE
          ================================= */}

          <label>
            📝 Video Title
          </label>

          <input
            className="upload-input"
            type="text"
            placeholder="Enter an attractive video title"
            value={title}
            maxLength={120}
            onChange={(e) =>
              setTitle(e.target.value)
            }
            disabled={uploading}
          />

          <div className="input-count">
            {title.length}/120
          </div>

          {/* =================================
              DESCRIPTION
          ================================= */}

          <label>
            📄 Description
          </label>

          <textarea
            className="upload-textarea"
            placeholder="Tell viewers about your video..."
            value={description}
            maxLength={2000}
            rows={6}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            disabled={uploading}
          />

          <div className="input-count">
            {description.length}/2000
          </div>

          {/* =================================
              CATEGORY
          ================================= */}

          <label>
            📂 Category
          </label>

          <select
            className="upload-select"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value)
            }
            disabled={uploading}
          >

            <option value="Technology">
              Technology
            </option>

            <option value="Entertainment">
              Entertainment
            </option>

            <option value="Gaming">
              Gaming
            </option>

            <option value="Education">
              Education
            </option>

            <option value="News">
              News
            </option>

            <option value="Music">
              Music
            </option>

            <option value="Shorts">
              Shorts
            </option>

            <option value="Trending">
              Trending
            </option>

          </select>

          {/* =================================
              UPLOAD BUTTON
          ================================= */}

          <button
            type="submit"
            className="upload-submit"
            disabled={uploading}
          >
            {uploading
              ? "⏳ Uploading..."
              : "🚀 Upload to BharatTube"}
          </button>

        </form>

        {/* MESSAGE */}

        {message && (
          <div
            className={`upload-message ${messageType}`}
          >
            {message}
          </div>
        )}

        {/* INFO */}

        <div className="upload-info">

          <div className="upload-info-icon">
            🇮🇳
          </div>

          <div>

            <strong>
              BharatTube
            </strong>

            <p>
              Your video and thumbnail
              will be saved securely to
              your BharatTube account.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Upload;