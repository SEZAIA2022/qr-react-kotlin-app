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

  // Charger l'application depuis le localStorage
  useEffect(() => {
    const storedApplication = localStorage.getItem('userApplication');
    if (storedApplication) setApplication(storedApplication);
  }, []);
  useEffect(() => {
    if (application && application.trim() !== '') {
      fetchQuestions();
    }
  }, [application]);

  // Récupérer les questions
  const fetchQuestions = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/questions`, {params : {application}});
      if (Array.isArray(res.data)) {
        setQuestions(res.data);
      } else if (res.data?.questions && Array.isArray(res.data.questions)) {
        setQuestions(res.data.questions);
      } else {
        setQuestions([]);
        console.warn('Format de réponse inattendu :', res.data);
      }
      setSelected({});
      setEditId(null);
      setEditText('');
    } catch (error) {
      console.error('Erreur lors du chargement des questions :', error);
      setMessage('❌ Erreur de chargement des questions.');
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/questions`, {
        text,
        application,
      });
      setMessage('✅ Question ajoutée avec succès.');
      setText('');
      fetchQuestions();
    } catch (error) {
      console.error('Erreur ajout question :', error);
      setMessage('❌ Erreur lors de l’ajout de la question.');
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
      .map(([id]) => id);

    if (idsToDelete.length === 0) {
      setMessage('Veuillez sélectionner au moins une question à supprimer.');
      return;
    }

    try {
      await Promise.all(
        idsToDelete.map((id) =>
          axios.delete(`${process.env.REACT_APP_API_URL}/api/delete_question/${id}`)
        )
      );
      setMessage(`✅ ${idsToDelete.length} question(s) supprimée(s).`);
      fetchQuestions();
    } catch (error) {
      console.error('Erreur suppression multiple :', error);
      setMessage('❌ Erreur lors de la suppression.');
    }
  };

  const deleteQuestion = async (id) => {
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/delete_question/${id}`);
      setMessage('✅ Question supprimée.');
      fetchQuestions();
    } catch (error) {
      console.error('Erreur suppression :', error);
      setMessage('❌ Erreur lors de la suppression.');
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
      setMessage('Le texte ne peut pas être vide.');
      return;
    }

    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/edit_question/${editId}`, {
        text: editText,
      });
      setMessage('✅ Question modifiée.');
      setEditId(null);
      setEditText('');
      fetchQuestions();
    } catch (error) {
      console.error('Erreur modification :', error);
      setMessage('❌ Erreur lors de la modification.');
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Ajouter une question</h2>
      <form onSubmit={handleSubmit} style={formStyle}>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écris ta question ici..."
          style={textareaStyle}
          required
        />
        <button type="submit" style={buttonStyle}>Ajouter</button>
      </form>

      <h2 style={{ marginTop: '40px' }}>Liste des questions</h2>
      {message && <p style={messageStyle}>{message}</p>}

      <button
        onClick={deleteSelected}
        style={{ ...buttonStyle, marginBottom: '15px', backgroundColor: '#dc3545' }}
      >
        Supprimer la sélection
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
                <button onClick={saveEdit} style={iconButtonBase}>💾</button>
                <button onClick={cancelEditing} style={iconButtonBase}>✖️</button>
              </>
            ) : (
              <>
                <span style={questionTextStyle}>{text}</span>
                <button onClick={() => startEditing(id, text)} style={iconButtonBase}>✏️</button>
                <button
                  onClick={() => {
                    if (window.confirm('Supprimer cette question ?')) deleteQuestion(id);
                  }}
                  style={iconButtonBase}
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

// 🎨 Styles CSS-in-JS
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
