import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ProblemTypeForm = () => {
  const [typeName, setTypeName] = useState('');
  const [types, setTypes] = useState([]);            // array<string>
  const [selected, setSelected] = useState({});       // { [typeName]: boolean }
  const [message, setMessage] = useState('');
  const [application, setApplication] = useState('');

  // (optionnel) pour édition si tu ajoutes un endpoint PUT
  const [editKey, setEditKey] = useState(null);       // old type_name
  const [editText, setEditText] = useState('');

  // Charger application depuis localStorage
  useEffect(() => {
    const storedApplication = localStorage.getItem('userApplication');
    if (storedApplication) setApplication(storedApplication);
  }, []);

  useEffect(() => {
    if (application && application.trim() !== '') {
      fetchTypes();
    }
  }, [application]);

  const fetchTypes = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/problem-types`, {
        params: { application: application.toLowerCase() },
      });

      // API attendue: { status, application, types: [...] }
      const arr = Array.isArray(res.data?.types) ? res.data.types : [];
      setTypes(arr);
      setSelected({});
      setEditKey(null);
      setEditText('');
      setMessage('');
    } catch (error) {
      console.error('Error loading types:', error);
      setMessage('❌ Failed to load problem types.');
      setTypes([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!typeName.trim()) return;

    try {
      const payload = {
        type_name: typeName.trim(),
        application_name: application.toLowerCase(),
      };

      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/problem-types`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      setMessage(res.data?.message || '✅ Type added successfully.');
      setTypeName('');
      fetchTypes();
    } catch (error) {
      console.error('Error adding type:', error);
      if (error.response?.status === 409) {
        setMessage('⚠️ Ce type existe déjà pour cette application.');
      } else {
        setMessage(error.response?.data?.message || '❌ Failed to add type.');
      }
    }
  };

  const toggleSelect = (name) => {
    setSelected((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const deleteSelected = async () => {
    const namesToDelete = Object.entries(selected)
      .filter(([_, isChecked]) => isChecked)
      .map(([name]) => name);

    if (namesToDelete.length === 0) {
      setMessage('Please select at least one type to delete.');
      return;
    }

    try {
      // Supprimer en parallèle
      await Promise.all(
        namesToDelete.map((name) =>
          axios.delete(
            `${process.env.REACT_APP_API_URL}/api/problem-types/${encodeURIComponent(name)}?application=${encodeURIComponent(application.toLowerCase())}`
          )
        )
      );
      setMessage(`✅ Deleted ${namesToDelete.length} type(s).`);
      fetchTypes();
      setSelected({});
    } catch (error) {
      console.error('Error deleting multiple types:', error);
      setMessage(error.response?.data?.message || '❌ Failed to delete selected types.');
    }
  };

  const deleteType = async (name) => {
    try {
      const res = await axios.delete(
        `${process.env.REACT_APP_API_URL}/api/problem-types/${encodeURIComponent(name)}?application=${encodeURIComponent(application.toLowerCase())}`
      );
      setMessage(res.data?.message || '✅ Type deleted.');
      fetchTypes();
    } catch (error) {
      console.error('Error deleting type:', error);
      setMessage(error.response?.data?.message || '❌ Failed to delete type.');
    }
  };


  const msgErr = /^❌|failed|error/i.test(message);
  const msgClass = msgErr ? 'message message--error' : 'message message--success';

  return (
    <div className="container card card--panel">
      <h2 className="title">Add a Problem Type</h2>

      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          value={typeName}
          onChange={(e) => setTypeName(e.target.value)}
          placeholder="Type (e.g., Technical, Mechanical, Electrical...)"
          className="input"
          required
        />
        <button type="submit" className="btn btn--success">Add</button>
      </form>

      <h2 className="title mt-20">Problem Types</h2>
      {message && <p className={msgClass}>{message}</p>}

      <button onClick={deleteSelected} className="btn btn--danger mt-10">
        Delete Selected
      </button>

      <ul className="list mt-10">
        {types.map((name) => (
          <li key={name} className="list-item">
            <input
              type="checkbox"
              checked={!!selected[name]}
              onChange={() => toggleSelect(name)}
              className="checkbox"
              aria-label={`Select type ${name}`}
            />

            {editKey === name ? (
              <>
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="input input--inline"
                />
              </>
            ) : (
              <>
                <span className="q-text">{name}</span>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete type "${name}" ?`)) deleteType(name);
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

export default ProblemTypeForm;
