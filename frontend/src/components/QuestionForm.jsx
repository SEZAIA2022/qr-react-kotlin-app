import React, { useState, useEffect } from 'react';
import axios from 'axios';

const QuestionForm = () => {
  const [text, setText] = useState('');
  const [questions, setQuestions] = useState([]);
  const [selected, setSelected] = useState({});
  const [message, setMessage] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [application, setApplication] = useState('');

  // Load application from localStorage
  useEffect(() => {
    const storedApplication = localStorage.getItem('userApplication');
    if (storedApplication) setApplication(storedApplication);
  }, []);

  useEffect(() => {
    if (application && application.trim() !== '') {
      fetchQuestions();
    }
  }, [application]);

  // Fetch questions
  const fetchQuestions = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/questions`, { params: { application } });
      if (Array.isArray(res.data)) {
        setQuestions(res.data);
      } else if (res.data?.questions && Array.isArray(res.data.questions)) {
        setQuestions(res.data.questions);
      } else {
        setQuestions([]);
        console.warn('Unexpected response format:', res.data);
      }
      setSelected({});
      setEditId(null);
      setEditText('');
    } catch (error) {
      console.error('Error loading questions:', error);
      setMessage('❌ Failed to load questions.');
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/questions`, {
        text,
        application,
      });
      setMessage(res.data?.message || '✅ Question added successfully.');
      setText('');
      fetchQuestions();
    } catch (error) {
      console.error('Error adding question:', error);
      if (error.response?.data?.message) {
        setMessage(error.response.data.message);
      } else {
        setMessage('❌ Failed to add question.');
      }
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const deleteSelected = async () => {
    const idsToDelete = Object.entries(selected)
      .filter(([_, isChecked]) => isChecked)
      .map(([id]) => Number(id)); // Convertir en nombre

    if (idsToDelete.length === 0) {
      setMessage('Please select at least one question to delete.');
      return;
    }

    try {
      for (const id of idsToDelete) {
        const res = await axios.delete(`${process.env.REACT_APP_API_URL}/api/delete_question/${id}`);
        setMessage(res.data?.message || `✅ Question ${id} deleted.`);
      }
      fetchQuestions();
      setSelected({});
    } catch (error) {
      console.error('Error deleting multiple questions:', error);
      setMessage(error.response?.data?.message || '❌ Failed to delete selected questions.');
    }
  };

  const deleteQuestion = async (id) => {
    try {
      const res = await axios.delete(`${process.env.REACT_APP_API_URL}/api/delete_question/${id}`);
      setMessage(res.data?.message || '✅ Question deleted.');
      fetchQuestions();
    } catch (error) {
      console.error('Error deleting question:', error);
      setMessage(error.response?.data?.message || '❌ Failed to delete question.');
    }
  };

  const startEditing = (id, currentText) => {
    setEditId(id);
    setEditText(currentText);
  };

  const cancelEditing = () => {
    setEditId(null);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editText.trim()) {
      setMessage('Text cannot be empty.');
      return;
    }

    try {
      const res = await axios.put(`${process.env.REACT_APP_API_URL}/api/update_question/${editId}`, {
        text: editText,
      });
      setMessage(res.data?.message || '✅ Question updated.');
      setEditId(null);
      setEditText('');
      fetchQuestions();
    } catch (error) {
      console.error('Error updating question:', error);
      if (error.response?.data?.message) {
        setMessage(error.response.data.message);
      } else {
        setMessage('❌ Failed to update question.');
      }
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Add a Question</h2>
      <form onSubmit={handleSubmit} style={formStyle}>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your question here..."
          style={textareaStyle}
          required
        />
        <button type="submit" style={buttonStyle}>Add</button>
      </form>

      <h2 style={{ marginTop: '40px' }}>Questions List</h2>
      {message && <p style={messageStyle}>{message}</p>}

      <button
        onClick={deleteSelected}
        style={{ ...buttonStyle, marginBottom: '15px', backgroundColor: '#dc3545' }}
      >
        Delete Selected
      </button>

      <ul style={listStyle}>
        {questions.map(({ id, text }) => (
          <li
            key={id}
            style={listItemStyle}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f5ff'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <input
              type="checkbox"
              checked={!!selected[id]}
              onChange={() => toggleSelect(id)}
              style={checkboxStyle}
              aria-label={`Select question ${id}`}
            />

            {editId === id ? (
              <>
                <textarea
                  rows={2}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={textareaEditStyle}
                />
                <button onClick={saveEdit} style={iconButtonBase} aria-label="Save">💾</button>
                <button onClick={cancelEditing} style={iconButtonBase} aria-label="Cancel">✖️</button>
              </>
            ) : (
              <>
                <span style={questionTextStyle}>{text}</span>
                <button onClick={() => startEditing(id, text)} style={iconButtonBase} aria-label="Edit">✏️</button>
                <button
                  onClick={() => {
                    if (window.confirm('Delete this question?')) deleteQuestion(id);
                  }}
                  style={iconButtonBase}
                  aria-label="Delete"
                >
                  🗑️
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

// 🎨 Styles CSS-in-JS (inchangés)
const containerStyle = {
  maxWidth: '600px',
  margin: '20px auto',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  padding: '20px',
  backgroundColor: '#f9faff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
};

const textareaStyle = {
  padding: '10px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  resize: 'vertical',
  minHeight: '100px',
  fontFamily: 'inherit',
};

const buttonStyle = {
  backgroundColor: '#007bff',
  color: '#fff',
  fontWeight: 'bold',
  border: 'none',
  padding: '12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '16px',
  transition: 'background-color 0.3s',
};

const messageStyle = {
  fontWeight: 'bold',
  color: '#333',
};

const listStyle = {
  listStyleType: 'none',
  padding: 0,
  maxHeight: '350px',
  overflowY: 'auto',
  borderTop: '2px solid #007bff',
  borderRadius: '0 0 8px 8px',
  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.05)',
  backgroundColor: '#ffffff',
};

const listItemStyle = {
  padding: '12px 15px',
  borderBottom: '1px solid #e1e7f0',
  display: 'flex',
  alignItems: 'center',
  cursor: 'default',
  transition: 'background-color 0.25s ease',
};

const checkboxStyle = {
  marginRight: '15px',
  width: '20px',
  height: '20px',
  cursor: 'pointer',
};

const questionTextStyle = {
  flex: 1,
  fontSize: '16px',
  color: '#2c3e50',
  userSelect: 'none',
};

const textareaEditStyle = {
  padding: '8px',
  fontSize: '15px',
  borderRadius: '6px',
  border: '1.5px solid #007bff',
  boxShadow: '0 0 8px rgba(0,123,255,0.2)',
  resize: 'vertical',
  minHeight: '60px',
  marginRight: '12px',
  flex: 1,
  fontFamily: 'inherit',
};

const iconButtonBase = {
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '22px',
  padding: '6px 10px',
  color: '#007bff',
  borderRadius: '6px',
  transition: 'background-color 0.3s, color 0.3s',
};

export default QuestionForm;
