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
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/questions`, {
        params: { application },
      });
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
      .map(([id]) => Number(id));

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

  const msgErr = /^❌|failed|error/i.test(message);
  const msgClass = msgErr ? 'message message--error' : 'message message--success';

  return (
    <div className="container card card--panel">
      <h2 className="title">Add a Question</h2>

      <form onSubmit={handleSubmit} className="form">
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your question here..."
          className="textarea"
          required
        />
        <button type="submit" className="btn btn--success">Add</button>
      </form>

      <h2 className="title mt-20">Questions List</h2>
      {message && <p className={msgClass}>{message}</p>}

      <button onClick={deleteSelected} className="btn btn--danger mt-10">
        Delete Selected
      </button>

      <ul className="list mt-10">
        {questions.map(({ id, text }) => (
          <li key={id} className="list-item">
            <input
              type="checkbox"
              checked={!!selected[id]}
              onChange={() => toggleSelect(id)}
              className="checkbox"
              aria-label={`Select question ${id}`}
            />

            {editId === id ? (
              <>
                <textarea
                  rows={2}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="textarea-inline"
                />
                <button onClick={saveEdit} className="icon-btn" aria-label="Save">💾</button>
                <button onClick={cancelEditing} className="icon-btn" aria-label="Cancel">✖️</button>
              </>
            ) : (
              <>
                <span className="q-text">{text}</span>
                <button onClick={() => startEditing(id, text)} className="icon-btn" aria-label="Edit">✏️</button>
                <button
                  onClick={() => {
                    if (window.confirm('Delete this question?')) deleteQuestion(id);
                  }}
                  className="icon-btn"
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

export default QuestionForm;
