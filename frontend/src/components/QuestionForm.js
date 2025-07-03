import React, { useState, useEffect } from 'react';
import axios from 'axios';

const QuestionForm = () => {
  const [text, setText] = useState('');
  const [questions, setQuestions] = useState([]);
  const [selected, setSelected] = useState({});
  const [message, setMessage] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  // Charger les questions depuis l'API Flask
  const fetchQuestions = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/questions`);
      setQuestions(res.data);
      setSelected({});
      setEditId(null);
      setEditText('');
    } catch (error) {
      setMessage('Error loading questions.');
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // Ajouter une question
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/questions`, { text });
      setMessage('✅ Question successfully added !');
      setText('');
      fetchQuestions();
    } catch (error) {
      setMessage("❌ Error adding.");
    }
  };

  // Gérer la sélection des checkboxes
  const toggleSelect = (id) => {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Supprimer plusieurs questions sélectionnées
  const deleteSelected = async () => {
    const idsToDelete = Object.entries(selected)
      .filter(([_, isChecked]) => isChecked)
      .map(([id]) => id);

    if (idsToDelete.length === 0) {
      setMessage('Please select at least one question to delete.');
      return;
    }

    try {
      await Promise.all(
        idsToDelete.map((id) =>
          axios.delete(`${process.env.REACT_APP_API_URL}/api/delete_question/${id}`)
        )
      );
      setMessage(`✅ ${idsToDelete.length} question(s) successfully deleted.`);
      fetchQuestions();
    } catch (error) {
      setMessage('Error when deleting questions.');
    }
  };

  // Supprimer une seule question
  const deleteQuestion = async (id) => {
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/delete_question/${id}`);
      setMessage('✅ Question successfully deleted.');
      fetchQuestions();
    } catch (error) {
      setMessage('Error deleting question.');
    }
  };

  // Démarrer l'édition
  const startEditing = (id, currentText) => {
    setEditId(id);
    setEditText(currentText);
  };

  // Annuler édition
  const cancelEditing = () => {
    setEditId(null);
    setEditText('');
  };

  // Sauvegarder édition
  const saveEdit = async () => {
    if (!editText.trim()) {
      setMessage('Text cannot be empty.');
      return;
    }
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/edit_question/${editId}`, {
        text: editText,
      });
      setMessage('✅ Question successfully modified.');
      setEditId(null);
      setEditText('');
      fetchQuestions();
    } catch (error) {
      setMessage('Error during modification.');
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
          placeholder="Write your question here"
          style={textareaStyle}
          required
        />
        <button type="submit" style={buttonStyle}>
          ADD
        </button>
      </form>

      <h2 style={{ marginTop: '40px' }}>Liste des Questions</h2>
      {message && <p style={messageStyle}>{message}</p>}

      <button
        onClick={deleteSelected}
        style={{ ...buttonStyle, marginBottom: '15px', backgroundColor: '#dc3545' }}
      >
        Delete selection
      </button>

      <ul style={listStyle}>
        {questions.map(({ id, text }) => (
          <li
            key={id}
            className="question-item"
            style={listItemStyle}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f5ff'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <input
              type="checkbox"
              checked={!!selected[id]}
              onChange={() => toggleSelect(id)}
              style={checkboxStyle}
              aria-label={`Sélectionner la question ${id}`}
            />

            {editId === id ? (
              <>
                <textarea
                  rows={2}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={textareaEditStyle}
                />
                <button
                  onClick={saveEdit}
                  className="question-icon-button"
                  title="Save"
                  style={{ marginRight: '8px' }}
                >
                  💾
                </button>
                <button
                  onClick={cancelEditing}
                  className="question-icon-button"
                  title="Cancel"
                >
                  ✖️
                </button>
              </>
            ) : (
              <>
                <span style={questionTextStyle}>{text}</span>

                <button
                  onClick={() => startEditing(id, text)}
                  className="question-icon-button"
                  aria-label={`Éditer la question ${id}`}
                  title="Edit"
                  style={{ marginRight: '10px' }}
                >
                  ✏️
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("Do you really want to delete this question ?")) {
                      deleteQuestion(id);
                    }
                  }}
                  className="question-icon-button"
                  aria-label={`Supprimer la question ${id}`}
                  title="Delete"
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

// Styles

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

const iconButtonHover = {
  backgroundColor: '#007bff',
  color: '#fff',
};

// On applique iconButtonBase pour chaque bouton, inline style dans JSX ci-dessus.

export default QuestionForm;
