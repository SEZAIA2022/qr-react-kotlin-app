import React, { useState, useEffect } from 'react';
import axios from 'axios';

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}

const HelpPage = () => {
  const width = useWindowWidth();
  const isMobile = width < 480;

  const [application, setApplication] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    const storedApp = localStorage.getItem('userApplication');
    if (storedApp) setApplication(storedApp);
  }, []);

  useEffect(() => {
    if (application && application.trim() !== '') fetchTasks();
  }, [application]);

  const fetchTasks = async () => {
    setLoadingTasks(true);
    setError('');
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/help_tasks`, {
        params: { application },
      });
      setTasks(res.data.tasks || []);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoadingTasks(false);
    }
  };

  const updateTask = async (id, newTitle, newContent) => {
    await axios.put(`${process.env.REACT_APP_API_URL}/api/help_tasks/${id}`, {
      title_help: newTitle,
      help: newContent,
    });
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, title_help: newTitle, help: newContent } : t)));
  };

  const deleteTask = async (id, onSuccess, onError) => {
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/help_tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
      onSuccess();
    } catch (err) {
      onError();
    }
  };

  const addTask = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      setAddMessage('❌ Title and content are required.');
      return;
    }
    setAddLoading(true);
    setAddMessage('');
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/help_tasks`, {
        title_help: newTitle.trim(),
        help: newContent.trim(),
        application,
      });
      const task = res.data.task || res.data;
      setTasks(prev => [...prev, task]);
      setNewTitle('');
      setNewContent('');
      setAddMessage('✅ New task added.');
      setAdding(false);
    } catch {
      setAddMessage('❌ Adding failed.');
    } finally {
      setAddLoading(false);
    }
  };

  const addMsgError = /^❌/.test(addMessage);
  const addMsgClass = addMsgError ? 'message message--error' : 'message message--success';

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
              onSave={updateTask}
              onDelete={deleteTask}
            />
          ))}
        </div>
      )}

      <div className="mt-20">
        {!adding ? (
          <button
            onClick={() => { setAdding(true); setAddMessage(''); }}
            className={`btn btn--info btn--lg ${isMobile ? 'w-100' : ''}`}
          >
            ➕ Add New Task
          </button>
        ) : (
          <div className="mt-10">
            <input
              type="text"
              placeholder="New task title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="input input--title"
              disabled={addLoading}
            />
            <textarea
              placeholder="New task content"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              className="textarea mt-10"
              disabled={addLoading}
            />
            <div className="btn-row">
              <button onClick={addTask} className="btn btn--success" disabled={addLoading}>
                💾 Add
              </button>
              <button
                onClick={() => { setAdding(false); setAddMessage(''); setNewTitle(''); setNewContent(''); }}
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

const HelpTaskItem = ({ task, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title_help || '');
  const [content, setContent] = useState(task.help || '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setMessage('❌ Title and content cannot be empty.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await onSave(task.id, title.trim(), content.trim());
      setIsEditing(false);
      setMessage('✅ Task saved successfully.');
    } catch {
      setMessage('❌ Saving failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    await onDelete(
      task.id,
      () => setMessage('✅ Deleted.'),
      () => setMessage('❌ Failed to delete.')
    );
  };

  const toggleContent = () => {
    if (!isEditing) setShowContent(prev => !prev);
  };

  const msgErr = /^❌/.test(message);
  const msgClass = msgErr ? 'message message--error' : 'message message--success';

  return (
    <div className="task card">
      {isEditing ? (
        <>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="input"
            disabled={loading}
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="textarea"
            disabled={loading}
          />
          <div className="btn-row right">
            <button onClick={handleSave} className="btn btn--success" disabled={loading}>
              💾 Save
            </button>
            <button onClick={() => setIsEditing(false)} className="btn btn--danger" disabled={loading}>
              ❌ Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h3
            className={`task__title ${showContent ? 'open' : ''}`}
            onClick={toggleContent}
            title="Click to toggle description"
          >
            {title}
            <span className="chev" aria-hidden="true">▶</span>
          </h3>

          {showContent && <p className="task__content">{content}</p>}

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
