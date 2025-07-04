import React, { useState, useEffect } from 'react';
import axios from 'axios';

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
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

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const fetchTasks = async () => {
    setLoadingTasks(true);
    setError('');
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/help_tasks`);
      setTasks(res.data.tasks || []);
    } catch (err) {
      console.error(err);
      setError('❌ Failed to load help tasks.');
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const updateTask = async (id, newTitle, newContent) => {
    await axios.put(`${process.env.REACT_APP_API_URL}/api/help_tasks/${id}`, {
      title_help: newTitle,
      help: newContent,
    });
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, title_help: newTitle, help: newContent } : t))
    );
  };

  const deleteTask = async (id, onSuccess, onError) => {
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/help_tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
      onSuccess();
    } catch (err) {
      console.error(err);
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
      });
      const task = res.data.task || res.data;
      setTasks(prev => [...prev, task]);
      setNewTitle('');
      setNewContent('');
      setAddMessage('✅ New task added.');
      setAdding(false);
    } catch (err) {
      console.error(err);
      setAddMessage('❌ Adding failed.');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Help Tasks Management</h1>

      {loadingTasks ? (
        <p style={{ textAlign: 'center' }}>Loading...</p>
      ) : error ? (
        <p style={{ color: '#dc3545', textAlign: 'center' }}>{error}</p>
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

      <div style={{ marginTop: '40px' }}>
        {!adding ? (
          <button
            onClick={() => { setAdding(true); setAddMessage(''); }}
            style={{
              ...styles.buttonBase,
              width: isMobile ? '100%' : 'auto',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: '700',
              minWidth: '160px',
            }}
          >
            ➕ Add New Task
          </button>
        ) : (
          <div style={{ marginTop: '20px' }}>
            <input
              type="text"
              placeholder="New task title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              style={styles.inputTitle}
              disabled={addLoading}
            />
            <textarea
              placeholder="New task content"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              style={{ ...styles.textarea, marginTop: '12px' }}
              disabled={addLoading}
            />
            <div style={{
              marginTop: '12px',
              display: 'flex',
              justifyContent: isMobile ? 'center' : 'flex-end',
              gap: '8px',
              flexWrap: 'wrap',
            }}>
              <button onClick={addTask} style={styles.buttonBase} disabled={addLoading}>
                💾 Add
              </button>
              <button
                onClick={() => {
                    setAdding(false);
                    setAddMessage('');
                    setNewTitle('');
                    setNewContent('');
                }}
                style={styles.cancelButton}
                disabled={addLoading}
                >
                ❌ Cancel
              </button>
            </div>
            {addMessage && (
              <p style={{
                ...styles.message,
                color: addMessage.startsWith('✅') ? '#155724' : '#721c24',
                backgroundColor: addMessage.startsWith('✅') ? '#d4edda' : '#f8d7da',
                borderColor: addMessage.startsWith('✅') ? '#c3e6cb' : '#f5c6cb',
              }}>
                {addMessage}
              </p>
            )}
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
    } catch (err) {
      console.error(err);
      setMessage('❌ Saving failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    await onDelete(task.id, () => {
      setMessage('✅ Deleted.');
    }, () => {
      setMessage('❌ Failed to delete.');
    });
  };

  const toggleContent = () => {
    if (!isEditing) {
      setShowContent(prev => !prev);
    }
  };

  return (
    <div style={styles.taskItem}>
      {isEditing ? (
        <>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={styles.input}
            disabled={loading}
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            style={styles.textarea}
            disabled={loading}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
                position: 'relative',
                cursor: 'pointer',
                userSelect: 'none',
                marginBottom: '8px',
                fontWeight: '700',
                paddingRight: '20px',  // pour espace à droite pour la flèche
            }}
            title="Click to toggle description"
            >
            {title}
            <span
                style={{
                position: 'absolute',
                right: 0,
                top: '0',
                fontSize: '18px',
                lineHeight: '1',
                userSelect: 'none',
                transition: 'transform 0.3s ease',
                display: 'inline-block',
                transform: showContent ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
                aria-hidden="true"
            >
                ▶
            </span>
            </h3>
          {showContent && <p>{content}</p>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
        <p style={{
          ...styles.message,
          color: message.startsWith('✅') ? '#155724' : '#721c24',
          backgroundColor: message.startsWith('✅') ? '#d4edda' : '#f8d7da',
          borderColor: message.startsWith('✅') ? '#c3e6cb' : '#f5c6cb',
        }}>
          {message}
        </p>
      )}
    </div>
  );
};


const styles = {
  container: {
    maxWidth: '700px',
    margin: '0 auto',
    padding: '20px',
  },
  buttonBase: {
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    fontSize: '14px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  inputTitle: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    marginBottom: '12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    resize: 'vertical',
    minHeight: '100px',
  },
  message: {
    padding: '10px',
    border: '1px solid',
    borderRadius: '4px',
    marginTop: '12px',
  },
  taskItem: {
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
    backgroundColor: '#f8f9fa',
  },
  input: {
    width: '100%',
    padding: '8px',
    marginBottom: '10px',
    fontSize: '16px',
  },
  editButton: {
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  saveButton: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};

export default HelpPage;
