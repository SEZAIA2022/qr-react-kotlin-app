import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

/**
 * Hook: window width (safe in SSR)
 */
function useWindowWidth() {
  const get = () => (typeof window !== "undefined" ? window.innerWidth : 1024);
  const [width, setWidth] = useState(get());
  useEffect(() => {
    const onResize = () => setWidth(get());
    if (typeof window !== "undefined") {
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
  }, []);
  return width;
}

/**
 * Resolve absolute/relative media URL from backend
 */
function resolveMediaUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url; // already absolute
  const base = process.env.REACT_APP_API_URL?.replace(/\/$/, "") || "";
  const path = String(url).startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}

const styles = {
  container: {
    maxWidth: "820px",
    margin: "0 auto",
    padding: "20px",
  },
  buttonBase: {
    backgroundColor: "#007bff",
    color: "white",
    padding: "10px 20px",
    fontSize: "14px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  cancelButton: {
    backgroundColor: "#6c757d",
    color: "white",
    border: "none",
    padding: "10px 20px",
    fontSize: "14px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  inputTitle: {
    width: "100%",
    padding: "10px",
    fontSize: "16px",
    marginBottom: "12px",
    border: "1px solid #ccc",
    borderRadius: "6px",
  },
  textarea: {
    width: "100%",
    padding: "10px",
    fontSize: "16px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    resize: "vertical",
    minHeight: "120px",
  },
  message: {
    padding: "10px",
    border: "1px solid",
    borderRadius: "6px",
    marginTop: "12px",
  },
  taskItem: {
    border: "1px solid #e1e1e1",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "20px",
    backgroundColor: "#f8f9fa",
  },
  input: {
    width: "100%",
    padding: "8px",
    marginBottom: "10px",
    fontSize: "16px",
    borderRadius: "6px",
    border: "1px solid #ccc",
  },
  editButton: {
    backgroundColor: "#17a2b8",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  saveButton: {
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  deleteButton: {
    backgroundColor: "#dc3545",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

/**
 * Parent page
 */
const HelpPage = () => {
  const width = useWindowWidth();
  const isMobile = width < 480;

  const [application, setApplication] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState("");

  // add form
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newVideo, setNewVideo] = useState(null);
  const [addMessage, setAddMessage] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Base API instance (can add interceptors/timeouts here)
  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: process.env.REACT_APP_API_URL,
      timeout: 30000,
    });
    return instance;
  }, []);

  useEffect(() => {
    const storedApp = localStorage.getItem("userApplication");
    if (storedApp) setApplication(storedApp);
  }, []);

  useEffect(() => {
    if (application && application.trim() !== "") {
      fetchTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application]);

  const fetchTasks = async () => {
    setLoadingTasks(true);
    setError("");
    const controller = new AbortController();
    try {
      const res = await api.get("/api/help_tasks", {
        params: { application },
        signal: controller.signal,
      });
      const list = res.data?.tasks || [];
      setTasks(Array.isArray(list) ? list : []);
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error(err);
        setError(`${err.response?.data?.error || err.message}`);
      }
    } finally {
      setLoadingTasks(false);
    }
    return () => controller.abort();
  };

  /** Create */
  const addTask = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      setAddMessage("❌ Title and content are required.");
      return;
    }
    if (!application) {
      setAddMessage("❌ Application is required.");
      return;
    }

    setAddLoading(true);
    setAddMessage("");
    try {
      const formData = new FormData();
      formData.append("title_help", newTitle.trim());
      formData.append("help", newContent.trim());
      formData.append("application", application);
      if (newVideo) formData.append("video", newVideo);

      const res = await api.post("/api/help_tasks", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const task = res.data.task || res.data;
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
      setNewContent("");
      setNewVideo(null);
      setAddMessage("✅ New task added.");
      setAdding(false);
    } catch (err) {
      console.error(err);
      setAddMessage(`❌ Adding failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setAddLoading(false);
    }
  };

  /** Update */
  const updateTask = async (id, newTitle, newContent, videoFile, deleteVideo) => {
    const url = `/api/help_tasks/${id}`;
    const formData = new FormData();
    formData.append("title_help", newTitle);
    formData.append("help", newContent);
    formData.append("delete_video", deleteVideo ? "true" : "false");
    if (videoFile) formData.append("video", videoFile);

    const res = await api.put(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    const updated = res.data.task || res.data;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
  };

  /** Delete */
  const deleteTask = async (id, onSuccess, onError) => {
    try {
      await api.delete(`/api/help_tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      onSuccess?.();
    } catch (err) {
      console.error(err);
      onError?.(err);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={{ textAlign: "center", marginBottom: 24 }}>Help Tasks Management</h1>

      {loadingTasks ? (
        <p style={{ textAlign: "center" }}>Loading...</p>
      ) : error ? (
        <p style={{ color: "#dc3545", textAlign: "center" }}>{error}</p>
      ) : (
        tasks.map((task, index) => (
          <HelpTaskItem
            key={task.id ?? `task-${index}`}
            task={task}
            onSave={updateTask}
            onDelete={deleteTask}
          />
        ))
      )}

      <div style={{ marginTop: 32 }}>
        {!adding ? (
          <button
            onClick={() => {
              setAdding(true);
              setAddMessage("");
            }}
            style={{
              ...styles.buttonBase,
              width: isMobile ? "100%" : "auto",
              padding: "12px 24px",
              fontSize: "16px",
              fontWeight: 700,
              minWidth: "160px",
            }}
          >
            ➕ Add New Task
          </button>
        ) : (
          <div style={{ marginTop: 16 }}>
            <input
              type="text"
              placeholder="New task title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={styles.inputTitle}
              disabled={addLoading}
            />
            <textarea
              placeholder="New task content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              style={{ ...styles.textarea, marginTop: 8 }}
              disabled={addLoading}
            />
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setNewVideo(e.target.files?.[0] || null)}
              disabled={addLoading}
              style={{ marginTop: 8 }}
            />

            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: isMobile ? "center" : "flex-end",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button onClick={addTask} style={styles.buttonBase} disabled={addLoading}>
                💾 Add
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setAddMessage("");
                  setNewTitle("");
                  setNewContent("");
                  setNewVideo(null);
                }}
                style={styles.cancelButton}
                disabled={addLoading}
              >
                ❌ Cancel
              </button>
            </div>
            {addMessage && (
              <p
                style={{
                  ...styles.message,
                  color: addMessage.startsWith("✅") ? "#155724" : "#721c24",
                  backgroundColor: addMessage.startsWith("✅") ? "#d4edda" : "#f8d7da",
                  borderColor: addMessage.startsWith("✅") ? "#c3e6cb" : "#f5c6cb",
                }}
              >
                {addMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Child item component
 */
const HelpTaskItem = ({ task, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title_help || "");
  const [content, setContent] = useState(task.help || "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const [videoFile, setVideoFile] = useState(null); // new uploaded file
  const [deleteVideo, setDeleteVideo] = useState(false);

  const videoUrl = resolveMediaUrl(task.video_url);

  const toggleContent = () => {
    if (!isEditing) setShowContent((prev) => !prev);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setMessage("❌ Title and content cannot be empty.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await onSave(task.id, title.trim(), content.trim(), videoFile, deleteVideo);
      setIsEditing(false);
      setVideoFile(null);
      setDeleteVideo(false);
      setMessage("✅ Task saved successfully.");
    } catch (err) {
      console.error(err);
      setMessage("❌ Saving failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    await onDelete(
      task.id,
      () => setMessage("✅ Deleted."),
      () => setMessage("❌ Failed to delete.")
    );
  };

  return (
    <div style={styles.taskItem}>
      {isEditing ? (
        <>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            disabled={loading}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={styles.textarea}
            disabled={loading}
          />

          {/* Video controls while editing */}
          {task.video_url && (
            <label style={{ display: "block", marginTop: 8 }}>
              <input
                type="checkbox"
                checked={deleteVideo}
                onChange={(e) => setDeleteVideo(e.target.checked)}
                disabled={loading}
              />{" "}
              Remove existing video
            </label>
          )}

          <input
            type="file"
            accept="video/*"
            onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
            disabled={loading}
            style={{ marginTop: 8 }}
          />

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={handleSave} style={styles.saveButton} disabled={loading}>
              💾 Save
            </button>
            <button onClick={() => setIsEditing(false)} style={styles.cancelButton} disabled={loading}>
              ❌ Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h3
            onClick={toggleContent}
            style={{
              position: "relative",
              cursor: "pointer",
              userSelect: "none",
              marginBottom: 8,
              fontWeight: 700,
              paddingRight: 20,
            }}
            title="Click to toggle description"
          >
            {title}
            <span
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                fontSize: 18,
                lineHeight: 1,
                userSelect: "none",
                transition: "transform 0.3s ease",
                display: "inline-block",
                transform: showContent ? "rotate(90deg)" : "rotate(0deg)",
              }}
              aria-hidden="true"
            >
              ▶
            </span>
          </h3>

          {showContent && (
            <>
              <p style={{ whiteSpace: "pre-wrap" }}>{content}</p>
              {videoUrl && (
                <video
                  src={videoUrl}
                  controls
                  style={{ width: "100%", maxHeight: 360, marginTop: 8, borderRadius: 8 }}
                />
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setIsEditing(true)} style={styles.editButton}>
              ✏️ Edit
            </button>
            <button onClick={handleDelete} style={styles.deleteButton}>
              🗑️ Delete
            </button>
          </div>
        </>
      )}

      {message && (
        <p
          style={{
            ...styles.message,
            color: message.startsWith("✅") ? "#155724" : "#721c24",
            backgroundColor: message.startsWith("✅") ? "#d4edda" : "#f8d7da",
            borderColor: message.startsWith("✅") ? "#c3e6cb" : "#f5c6cb",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
};

export default HelpPage;
