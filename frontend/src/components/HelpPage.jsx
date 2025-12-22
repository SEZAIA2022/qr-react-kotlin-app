import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}

const HelpPage = () => {
  const width = useWindowWidth();
  const isMobile = width < 480;

  const API = process.env.REACT_APP_API_URL;

  const [application, setApplication] = useState("");

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState("");

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [addMessage, setAddMessage] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // ---------- INIT ----------
  useEffect(() => {
    const storedApp = localStorage.getItem("userApplication");
    if (storedApp) setApplication(storedApp);
  }, []);

  const fetchTasks = useCallback(async () => {
    // évite les appels inutiles
    if (!application || application.trim() === "") return;

    setLoadingTasks(true);
    setError("");
    try {
      const res = await axios.get(`${API}/api/help_tasks`, {
        params: { application },
      });
      setTasks(res.data?.tasks || []);
    } catch (err) {
      setError(
        err?.response?.data?.error || err?.message || "Failed to load tasks."
      );
    } finally {
      setLoadingTasks(false);
    }
  }, [API, application]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTask = async (id, newTitleHelp, newHelp) => {
    await axios.put(`${API}/api/help_tasks/${id}`, {
      title_help: newTitleHelp,
      help: newHelp,
    });

    // garder video_path si existant
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, title_help: newTitleHelp, help: newHelp } : t
      )
    );
  };

  const deleteTask = async (id, onSuccess, onError) => {
    try {
      await axios.delete(`${API}/api/help_tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      onSuccess();
    } catch (err) {
      onError(err);
    }
  };

  const addTask = async () => {
    setAddMessage("");

    if (!newTitle.trim() || !newContent.trim()) {
      setAddMessage("❌ Title and content are required.");
      return;
    }
    if (!application.trim()) {
      setAddMessage("❌ Application is missing (localStorage userApplication).");
      return;
    }

    setAddLoading(true);
    try {
      // IMPORTANT:
      // ton backend POST attend souvent application_name.
      // on envoie les DEUX pour être compatible.
      const res = await axios.post(`${API}/api/help_tasks`, {
        title_help: newTitle.trim(),
        help: newContent.trim(),
        application, // pour tes nouveaux endpoints
        application_name: application, // pour tes anciens endpoints
      });

      const task = res.data?.task || res.data;
      setTasks((prev) => [...prev, task]);

      setNewTitle("");
      setNewContent("");
      setAddMessage("✅ New task added.");
      setAdding(false);
    } catch (err) {
      setAddMessage(
        "❌ Adding failed: " +
          (err?.response?.data?.error || err?.message || "")
      );
    } finally {
      setAddLoading(false);
    }
  };

  const addMsgError = /^❌/.test(addMessage);
  const addMsgClass = addMsgError
    ? "message message--error"
    : "message message--success";

  return (
    <div className="container card card--panel">
      <h1 className="title text-center">Help Tasks Management</h1>

      {loadingTasks ? (
        <p className="message message--info">Loading...</p>
      ) : error ? (
        <p className="message message--error">{error}</p>
      ) : (
        <div className="tasks">
          {tasks.map((task, index) => (
            <HelpTaskItem
              key={task.id ?? `task-${index}`}
              task={task}
              apiBase={API}
              onSave={updateTask}
              onDelete={deleteTask}
              onVideoUploaded={(id, video_path) => {
                setTasks((prev) =>
                  prev.map((t) => (t.id === id ? { ...t, video_path } : t))
                );
              }}
            />
          ))}
        </div>
      )}

      <div className="mt-20">
        {!adding ? (
          <button
            onClick={() => {
              setAdding(true);
              setAddMessage("");
            }}
            className={`btn btn--info btn--lg ${isMobile ? "w-100" : ""}`}
          >
            ➕ Add New Task
          </button>
        ) : (
          <div className="mt-10">
            <input
              type="text"
              placeholder="New task title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="input input--title"
              disabled={addLoading}
            />
            <textarea
              placeholder="New task content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="textarea mt-10"
              disabled={addLoading}
            />
            <div className="btn-row">
              <button
                onClick={addTask}
                className="btn btn--success"
                disabled={addLoading}
              >
                💾 Add
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setAddMessage("");
                  setNewTitle("");
                  setNewContent("");
                }}
                className="btn btn--danger"
                disabled={addLoading}
              >
                ❌ Cancel
              </button>
            </div>
            {addMessage && <p className={addMsgClass}>{addMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

const HelpTaskItem = ({ task, apiBase, onSave, onDelete, onVideoUploaded }) => {
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState(task.title_help || "");
  const [content, setContent] = useState(task.help || "");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [showContent, setShowContent] = useState(false);

  // upload video
  const [videoFile, setVideoFile] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoMsg, setVideoMsg] = useState("");
  const inputId = `video-input-${task.id}`;

  // keep inputs in sync if parent updates
  useEffect(() => setTitle(task.title_help || ""), [task.title_help]);
  useEffect(() => setContent(task.help || ""), [task.help]);

  const fullVideoUrl = useMemo(() => {
    if (!task.video_path) return "";
    // si backend renvoie déjà un full URL, on le garde
    if (/^https?:\/\//i.test(task.video_path)) return task.video_path;
    return `${apiBase}${task.video_path}`;
  }, [task.video_path, apiBase]);

  const handleSave = async () => {
    setMessage("");
    if (!title.trim() || !content.trim()) {
      setMessage("❌ Title and content cannot be empty.");
      return;
    }
    setLoading(true);
    try {
      await onSave(task.id, title.trim(), content.trim());
      setIsEditing(false);
      setMessage("✅ Task saved successfully.");
    } catch (err) {
      setMessage(
        "❌ Saving failed: " + (err?.response?.data?.error || err?.message || "")
      );
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

  const toggleContent = () => {
    if (!isEditing) setShowContent((prev) => !prev);
  };

  const uploadVideo = async () => {
    setVideoMsg("");

    if (!videoFile) {
      setVideoMsg("❌ Please choose a video file.");
      return;
    }

    setVideoUploading(true);
    try {
      const fd = new FormData();
      fd.append("video", videoFile);

      const res = await axios.post(`${apiBase}/api/help_tasks/${task.id}/video`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const video_path = res.data?.video_url || res.data?.video_path;
      if (video_path) {
        onVideoUploaded(task.id, video_path);
      }

      setVideoFile(null);
      setVideoMsg("✅ Video uploaded.");
      setShowContent(true);
    } catch (err) {
      setVideoMsg(
        "❌ Upload failed: " + (err?.response?.data?.error || err?.message || "")
      );
    } finally {
      setVideoUploading(false);
    }
  };

  const msgErr = /^❌/.test(message);
  const msgClass = msgErr ? "message message--error" : "message message--success";

  return (
    <div className="task card">
      {isEditing ? (
        <>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            disabled={loading}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="textarea"
            disabled={loading}
          />

          <div className="btn-row right">
            <button onClick={handleSave} className="btn btn--success" disabled={loading}>
              💾 Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="btn btn--danger"
              disabled={loading}
            >
              ❌ Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h3
            className={`task__title ${showContent ? "open" : ""}`}
            onClick={toggleContent}
            title="Click to toggle description"
          >
            {title}
            <span className="chev" aria-hidden="true">
              ▶
            </span>
          </h3>

          {showContent && (
            <>
              <p className="task__content">{content}</p>

              {/* VIDEO VIEW */}
              {fullVideoUrl && (
                <div className="mt-10">
                  <video controls style={{ width: "100%", maxHeight: 360 }}>
                    <source src={fullVideoUrl} />
                  </video>
                </div>
              )}

              {/* VIDEO UPLOAD */}
              <div className="mt-10">
                <label className="label" style={{ display: "block", marginBottom: 6 }}>
                  Upload a video (from your PC)
                </label>

                <input
                  id={inputId}
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  disabled={videoUploading}
                  style={{ position: "absolute", left: "-9999px" }}
                />

                <div className={`file-native ${videoUploading ? "is-disabled" : ""}`}>
                  <button
                    type="button"
                    className="file-native__btn"
                    onClick={() => document.getElementById(inputId)?.click()}
                    disabled={videoUploading}
                  >
                    Choose file
                  </button>

                  <span className="file-native__text">
                    {videoFile ? videoFile.name : "No file selected"}
                  </span>
                </div>

                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button
                    className="btn btn--success"
                    onClick={uploadVideo}
                    disabled={!videoFile || videoUploading}
                  >
                    {videoUploading ? "Uploading..." : "Upload"}
                  </button>
                </div>

                {videoMsg && (
                  <p
                    className={
                      /^❌/.test(videoMsg) ? "message message--error" : "message message--success"
                    }
                  >
                    {videoMsg}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="btn-row right">
            <button onClick={() => setIsEditing(true)} className="btn btn--info">
              ✏️ Edit
            </button>
            <button onClick={handleDelete} className="btn btn--danger">
              🗑️ Delete
            </button>
          </div>
        </>
      )}

      {message && <p className={msgClass}>{message}</p>}
    </div>
  );
};

export default HelpPage;
