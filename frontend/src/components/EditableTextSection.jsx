import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EditableTextSection = ({ apiKey, title }) => {
  const [text, setText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchText = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/${apiKey}`);
      setText(res.data[apiKey]);
    } catch (err) {
      console.error(err);
      setMessage(`❌ Failed to load "${title}" text: ${err.response?.data?.message || err.message}`);
    }
  };

  useEffect(() => {
    fetchText();
  }, [apiKey]);

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
      setMessage("❌ Text cannot be empty.");
      return;
    }
    setLoading(true);
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/${apiKey}`, { [apiKey]: editedText });
      setText(editedText);
      setEditMode(false);
      setMessage(`✅ "${title}" text updated successfully.`);
    } catch (err) {
      console.error(err);
      setMessage(`❌ Failed to update: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>{title}</h2>

      {message && (
        <p
          style={{
            ...messageStyle,
            color: message.startsWith('✅') ? '#155724' : '#721c24',
            backgroundColor: message.startsWith('✅') ? '#d4edda' : '#f8d7da',
            borderColor: message.startsWith('✅') ? '#c3e6cb' : '#f5c6cb',
          }}
        >
          {message.startsWith('✅') && <span style={{ marginRight: 6 }}>✅</span>}
          {message.startsWith('❌') && <span style={{ marginRight: 6 }}>❌</span>}
          {message.replace(/^✅|❌/, '').trim()}
        </p>
      )}

      {editMode ? (
        <>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            style={textareaStyle}
            placeholder={`Edit your ${title} text here...`}
          />
          <div style={buttonGroupStyle}>
            <button onClick={handleSave} disabled={loading} style={buttonStyle}>
              {loading ? 'Saving...' : '💾 Save'}
            </button>
            <button onClick={handleCancel} style={{ ...buttonStyle, backgroundColor: '#dc3545' }}>
              ❌ Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={aboutTextBoxStyle}>{text}</div>
          <button onClick={handleEdit} style={editButtonStyle}>
            ✏️ Edit
          </button>
        </>
      )}
    </div>
  );
};

// Styles (identiques à ton composant AboutUs)

const containerStyle = {
  maxWidth: '720px',
  margin: '50px auto',
  padding: '30px 40px',
  backgroundColor: '#fff',
  borderRadius: '12px',
  boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'left',
};

const titleStyle = {
  marginBottom: '25px',
  fontWeight: '700',
  fontSize: '28px',
  width: '100%',
};

const messageStyle = {
  fontWeight: '600',
  padding: '10px 18px',
  borderRadius: '6px',
  border: '1px solid',
  width: '100%',
  marginBottom: '20px',
  textAlign: 'center',
};

const textareaStyle = {
  width: '100%',
  minHeight: '140px',
  fontSize: '16px',
  borderRadius: '8px',
  border: '1.5px solid #ccc',
  padding: '12px',
  fontFamily: 'inherit',
  resize: 'vertical',
};

const buttonStyle = {
  backgroundColor: '#007bff',
  color: '#fff',
  padding: '14px 30px',
  fontSize: '16px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  minWidth: '140px',
  fontWeight: '600',
  transition: 'background-color 0.3s ease',
};

const editButtonStyle = {
  ...buttonStyle,
  minWidth: '180px',
  padding: '16px 36px',
  fontSize: '18px',
};

const buttonGroupStyle = {
  marginTop: '15px',
  display: 'flex',
  justifyContent: 'center',
  gap: '12px',
  width: '100%',
  maxWidth: '300px',
};

const aboutTextBoxStyle = {
  fontSize: '16px',
  color: '#2c3e50',
  whiteSpace: 'pre-wrap',
  minHeight: '120px',
  border: '2px solid #D3D3D3',
  padding: '10px',
  borderRadius: '10px',
  backgroundColor: '#e6f0ff',
  marginBottom: '15px',
  boxShadow: '0 2px 8px rgba(0, 123, 255, 0.2)',
  width: '100%',
  maxHeight: '350px',
  overflowY: 'auto',
  textAlign: 'left',
};

export default EditableTextSection;
