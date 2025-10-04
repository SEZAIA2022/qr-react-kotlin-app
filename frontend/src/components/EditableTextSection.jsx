import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EditableTextSection = ({ apiKey, title }) => {
  const [application, setApplication] = useState('');
  const [text, setText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Récupère l'application depuis le localStorage
  useEffect(() => {
    const storedApp = localStorage.getItem('userApplication');
    if (storedApp) setApplication(storedApp);
  }, []);

  // Récupère le texte quand application connue
  useEffect(() => {
    if (application && application.trim() !== '') fetchText();
  }, [application, apiKey]);

  const fetchText = async () => {
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/${apiKey}`,
        { params: { application } }
      );
      setText(res.data[apiKey] ?? '');
    } catch (err) {
      console.error(err);
      setMessage(`Failed to load "${title}" text: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleEdit = () => {
    setEditMode(true);
    setEditedText(text);
    setMessage('');
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditedText('');
    setMessage('');
  };

  const handleSave = async () => {
    if (!editedText.trim()) {
      setMessage('Text cannot be empty.');
      return;
    }
    setLoading(true);
    try {
      await axios.put(
        `${process.env.REACT_APP_API_URL}/api/${apiKey}`,
        { [apiKey]: editedText },
        { params: { application } }
      );
      setText(editedText);
      setEditMode(false);
      setMessage(`"${title}" text updated successfully.`);
    } catch (err) {
      console.error(err);
      setMessage(`Failed to update: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isError = /failed|error|cannot|empty/i.test(message);
  const messageClass = isError ? 'message message--error' : 'message message--success';

  return (
    <div className="container--lg card">
      <h2 className="title">{title}</h2>

      {message && <p className={messageClass}>{message}</p>}

      {editMode ? (
        <>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="textarea textarea--lg"
            placeholder={`Edit your ${title} text here...`}
          />
          <div className="btn-group">
            <button onClick={handleSave} disabled={loading} className="btn btn--success">
              {loading ? 'Saving...' : '💾 Save'}
            </button>
            <button onClick={handleCancel} className="btn btn--danger">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="about-box">{text}</div>
          <button onClick={handleEdit} className="btn btn--info btn--xl">
            ✏️ Edit
          </button>
        </>
      )}
    </div>
  );
};

export default EditableTextSection;
