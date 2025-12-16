import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Même hook que ta HelpPage
function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}

const RepportPage = () => {
  const width = useWindowWidth();
  const isMobile = width < 480;

  const [application, setApplication] = useState('');

  const [titles, setTitles] = useState([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [titlesError, setTitlesError] = useState('');

  const [openTitle, setOpenTitle] = useState(null);        // title actuellement ouvert
  const [subtitles, setSubtitles] = useState([]);          // sous-titres du title ouvert
  const [loadingSubtitles, setLoadingSubtitles] = useState(false);
  const [subtitlesError, setSubtitlesError] = useState('');

  const [openSubtitle, setOpenSubtitle] = useState(null);  // sous-titre actuellement ouvert
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState('');

  // Form add title
  const [newTitle, setNewTitle] = useState('');
  const [addTitleMessage, setAddTitleMessage] = useState('');
  const [addTitleLoading, setAddTitleLoading] = useState(false);

  // Form add subtitle (pour le title ouvert)
  const [newSubtitle, setNewSubtitle] = useState('');
  const [addSubtitleMessage, setAddSubtitleMessage] = useState('');
  const [addSubtitleLoading, setAddSubtitleLoading] = useState(false);

  // Form add question (pour title + sous-titre ouverts)
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionType, setNewQuestionType] = useState('open');
  const [newQuestionRequired, setNewQuestionRequired] = useState(false);
  const [newQuestionOptionsText, setNewQuestionOptionsText] = useState('');
  const [addQuestionMessage, setAddQuestionMessage] = useState('');
  const [addQuestionLoading, setAddQuestionLoading] = useState(false);

  // Affichage des formulaires
  const [showAddSubtitleForm, setShowAddSubtitleForm] = useState(false);
  const [showAddQuestionForm, setShowAddQuestionForm] = useState(false);

  useEffect(() => {
    const storedApp = localStorage.getItem('userApplication');
    if (storedApp) setApplication(storedApp);
  }, []);

  useEffect(() => {
    if (application && application.trim() !== '') {
      fetchTitles();
      setOpenTitle(null);
      setSubtitles([]);
      setOpenSubtitle(null);
      setQuestions([]);
      setShowAddSubtitleForm(false);
      setShowAddQuestionForm(false);
    }
  }, [application]);

  // ------- API calls -------

  const fetchTitles = async () => {
    setLoadingTitles(true);
    setTitlesError('');
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/repport/titles`,
        { params: { application } }
      );
      const t = res.data?.data?.titles || [];
      setTitles(t);
    } catch (err) {
      setTitlesError(
        err?.response?.data?.message || err.message || 'Failed to load titles.'
      );
    } finally {
      setLoadingTitles(false);
    }
  };

  const fetchSubtitles = async (title) => {
    if (!title) return;
    setLoadingSubtitles(true);
    setSubtitlesError('');
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/repport/subtitles`,
        { params: { application, title } }
      );
      const subs = res.data?.data?.subtitles || [];
      setSubtitles(subs);
    } catch (err) {
      if (err?.response?.status === 404) {
        setSubtitles([]);
        setSubtitlesError('No subtitles for this title yet.');
      } else {
        setSubtitlesError(
          err?.response?.data?.message ||
            err.message ||
            'Failed to load subtitles.'
        );
      }
    } finally {
      setLoadingSubtitles(false);
    }
  };

  const fetchQuestions = async (title, subtitle) => {
    if (!title || !subtitle) return;
    setLoadingQuestions(true);
    setQuestionsError('');
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/repport/questions`,
        { params: { application, title, subtitle } }
      );
      const qs = res.data?.data?.questions || [];
      setQuestions(qs);
    } catch (err) {
      if (err?.response?.status === 404) {
        setQuestions([]);
        setQuestionsError('No questions for this subtitle yet.');
      } else {
        setQuestionsError(
          err?.response?.data?.message ||
            err.message ||
            'Failed to load questions.'
        );
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  // ------- Handlers -------

  // Ajout d'un TITLE (on crée une ligne avec subtitle = "")
  const handleAddTitle = async () => {
    setAddTitleMessage('');
    if (!application.trim()) {
      setAddTitleMessage('❌ Application non définie (localStorage).');
      return;
    }
    if (!newTitle.trim()) {
      setAddTitleMessage('❌ Title is required.');
      return;
    }

    setAddTitleLoading(true);
    try {
      const payload = {
        application,
        title: newTitle.trim(),
        subtitle: ''   // on stocke un sous-titre vide, mais on ne l’affichera jamais
      };

      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/repport`,
        payload
      );
      const created = res.data?.data;

      if (created?.title && !titles.includes(created.title)) {
        setTitles(prev => [...prev, created.title].sort());
      }

      setNewTitle('');
      setAddTitleMessage('✅ Title added.');
    } catch (err) {
      if (err?.response?.status === 409) {
        setAddTitleMessage('❌ This title already exists for this application.');
      } else {
        setAddTitleMessage(
          '❌ Failed to add title: ' +
            (err?.response?.data?.message || err.message)
        );
      }
    } finally {
      setAddTitleLoading(false);
    }
  };

  const toggleTitleOpen = (title) => {
    if (openTitle === title) {
      // fermer
      setOpenTitle(null);
      setSubtitles([]);
      setOpenSubtitle(null);
      setQuestions([]);
      setSubtitlesError('');
      setQuestionsError('');
      setShowAddSubtitleForm(false);
      setShowAddQuestionForm(false);
      setAddSubtitleMessage('');
      setAddQuestionMessage('');
    } else {
      // ouvrir ce title
      setOpenTitle(title);
      setOpenSubtitle(null);
      setQuestions([]);
      fetchSubtitles(title);
      setAddSubtitleMessage('');
      setAddQuestionMessage('');
      setShowAddSubtitleForm(false);
      setShowAddQuestionForm(false);
    }
  };

  const handleDeleteTitle = async (title) => {
    if (!window.confirm(`Delete title "${title}" (all its subtitles & questions)?`)) return;

    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/repport`, {
        data: { application, title }
      });

      setTitles(prev => prev.filter(t => t !== title));
      if (openTitle === title) {
        setOpenTitle(null);
        setSubtitles([]);
        setOpenSubtitle(null);
        setQuestions([]);
        setShowAddSubtitleForm(false);
        setShowAddQuestionForm(false);
      }
    } catch (err) {
      alert(
        'Failed to delete title: ' +
          (err?.response?.data?.message || err.message)
      );
    }
  };

  const handleAddSubtitle = async () => {
    setAddSubtitleMessage('');
    if (!openTitle) {
      setAddSubtitleMessage('❌ Select a title first.');
      return;
    }
    if (!newSubtitle.trim()) {
      setAddSubtitleMessage('❌ Subtitle is required.');
      return;
    }

    setAddSubtitleLoading(true);
    try {
      const payload = {
        application,
        title: openTitle,
        subtitle: newSubtitle.trim()
      };

      await axios.post(`${process.env.REACT_APP_API_URL}/api/repport`, payload);

      setSubtitles(prev =>
        [...prev, newSubtitle.trim()].filter((v, i, a) => a.indexOf(v) === i)
      );
      setNewSubtitle('');
      setAddSubtitleMessage('✅ Subtitle added.');
      setShowAddSubtitleForm(false);
    } catch (err) {
      if (err?.response?.status === 409) {
        setAddSubtitleMessage(
          '❌ This subtitle already exists for this title.'
        );
      } else {
        setAddSubtitleMessage(
          '❌ Failed to add subtitle: ' +
            (err?.response?.data?.message || err.message)
        );
      }
    } finally {
      setAddSubtitleLoading(false);
    }
  };

  const handleDeleteSubtitle = async (subtitle) => {
    if (!window.confirm(`Delete subtitle "${subtitle}" and all its questions?`))
      return;

    try {
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/repport`, {
        data: { application, title: openTitle, subtitle }
      });

      setSubtitles(prev => prev.filter(s => s !== subtitle));
      if (openSubtitle === subtitle) {
        setOpenSubtitle(null);
        setQuestions([]);
        setShowAddQuestionForm(false);
      }
    } catch (err) {
      alert(
        'Failed to delete subtitle: ' +
          (err?.response?.data?.message || err.message)
      );
    }
  };

  const toggleSubtitleOpen = (subtitle) => {
    if (openSubtitle === subtitle) {
      setOpenSubtitle(null);
      setQuestions([]);
      setQuestionsError('');
      setAddQuestionMessage('');
      setShowAddQuestionForm(false);
    } else {
      setOpenSubtitle(subtitle);
      fetchQuestions(openTitle, subtitle);
      setAddQuestionMessage('');
      setShowAddQuestionForm(false);
    }
  };

  const handleAddQuestion = async () => {
    setAddQuestionMessage('');
    if (!openTitle || !openSubtitle) {
      setAddQuestionMessage('❌ Select a title and subtitle first.');
      return;
    }
    if (!newQuestionText.trim()) {
      setAddQuestionMessage('❌ Question text is required.');
      return;
    }

    if (!['open', 'qcm', 'yes_no'].includes(newQuestionType)) {
      setAddQuestionMessage('❌ Invalid question type.');
      return;
    }

    let options;
    if (newQuestionType === 'qcm') {
      options = newQuestionOptionsText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (!options.length) {
        setAddQuestionMessage(
          '❌ For QCM, add at least one option (comma separated).'
        );
        return;
      }
    }

    setAddQuestionLoading(true);
    try {
      const payload = {
        application,
        title: openTitle,
        subtitle: openSubtitle,
        question_text: newQuestionText.trim(),
        question_type: newQuestionType,
        is_required: newQuestionRequired
      };
      if (options) payload.options = options;

      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/repport/questions`,
        payload
      );

      await fetchQuestions(openTitle, openSubtitle);

      setNewQuestionText('');
      setNewQuestionType('open');
      setNewQuestionRequired(false);
      setNewQuestionOptionsText('');
      setAddQuestionMessage('✅ Question added.');
      setShowAddQuestionForm(false);
    } catch (err) {
      setAddQuestionMessage(
        '❌ Failed to add question: ' +
          (err?.response?.data?.message || err.message)
      );
    } finally {
      setAddQuestionLoading(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Delete this question?')) return;

    try {
      await axios.delete(
        `${process.env.REACT_APP_API_URL}/api/repport/questions/${questionId}`
      );
      setQuestions(prev => prev.filter(q => q.id !== questionId));
    } catch (err) {
      alert(
        'Failed to delete question: ' +
          (err?.response?.data?.message || err.message)
      );
    }
  };

  // Classes de messages
  const titleMsgError = /^❌/.test(addTitleMessage);
  const titleMsgClass = titleMsgError
    ? 'message message--error'
    : 'message message--success';

  const subtitleMsgError = /^❌/.test(addSubtitleMessage);
  const subtitleMsgClass = subtitleMsgError
    ? 'message message--error'
    : 'message message--success';

  const questionMsgError = /^❌/.test(addQuestionMessage);
  const questionMsgClass = questionMsgError
    ? 'message message--error'
    : 'message message--success';

  return (
    <div className="repport-page container card card--panel">
      <h1 className="title text-center">Report Management</h1>

      {/* BOX : ajouter un TITLE (seulement) */}
      <div className="card add-question-section">
        <h2 className="subtitle subtitle--small">Add new title</h2>
        <input
          type="text"
          className="input mt-5"
          placeholder="Title"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          disabled={addTitleLoading}
        />
        <button
          className={`btn btn--success mt-10 ${isMobile ? 'w-100' : ''}`}
          onClick={handleAddTitle}
          disabled={addTitleLoading}
        >
          💾 Add title
        </button>
        {addTitleMessage && (
          <p className={titleMsgClass + ' mt-5'}>{addTitleMessage}</p>
        )}
      </div>

      {/* LISTE DES TITLES, style HelpPage (cards + header cliquable pour ouvrir) */}
      <div className="mt-20">
        {loadingTitles ? (
          <p className="message message--info">Loading titles...</p>
        ) : titlesError ? (
          <p className="message message--error">{titlesError}</p>
        ) : titles.length === 0 ? (
          <p className="message message--info">No titles yet.</p>
        ) : (
          titles.map((title, index) => (
            <div className="task card mt-10" key={title ?? `t-${index}`}>
              <h3
                className={`task__title ${
                  openTitle === title ? 'open' : ''
                }`}
                onClick={() => toggleTitleOpen(title)}
                title="Click to toggle subtitles"
              >
                {title}
                <span className="chev" aria-hidden="true">
                  ▶
                </span>
              </h3>

              {openTitle === title && (
                <>
                  {/* Bouton supprimer le title */}
                  <div className="btn-row right mt-5">
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => handleDeleteTitle(title)}
                    >
                      🗑️ Delete this title
                    </button>
                  </div>

                  {/* Sous-titres */}
                  {loadingSubtitles ? (
                    <p className="message message--info mt-10">
                      Loading subtitles...
                    </p>
                  ) : subtitlesError ? (
                    <p className="message message--error mt-10">
                      {subtitlesError}
                    </p>
                  ) : (
                    <div className="mt-10">
                      {subtitles.length === 0 ? (
                        <p className="muted">
                          No subtitles yet for this title.
                        </p>
                      ) : (
                        subtitles.map((sub, idx) => (
                          <div className="card mt-10" key={sub ?? `s-${idx}`}>
                            <h4
                              className={`task__title task__title--small ${
                                openSubtitle === sub ? 'open' : ''
                              }`}
                              onClick={() => toggleSubtitleOpen(sub)}
                              title="Click to toggle questions"
                            >
                              {sub}
                              <span className="chev" aria-hidden="true">
                                ▶
                              </span>
                            </h4>
                            <div className="btn-row right mt-5">
                              <button
                                className="btn btn--danger btn--xs"
                                onClick={() => handleDeleteSubtitle(sub)}
                              >
                                🗑️
                              </button>
                            </div>

                            {openSubtitle === sub && (
                              <div className="mt-10">
                                {/* Questions */}
                                {loadingQuestions ? (
                                  <p className="message message--info">
                                    Loading questions...
                                  </p>
                                ) : questionsError ? (
                                  <p className="message message--error">
                                    {questionsError}
                                  </p>
                                ) : questions.length === 0 ? (
                                  <p className="muted">
                                    No questions for this subtitle yet.
                                  </p>
                                ) : (
                                  questions.map(q => (
                                    <QuestionItem
                                      key={q.id}
                                      question={q}
                                      onDelete={handleDeleteQuestion}
                                    />
                                  ))
                                )}

                                {/* Bouton pour afficher / masquer le formulaire d’ajout de question */}
                                <div className="mt-15">
                                  <button
                                    className="btn btn--info btn--sm"
                                    onClick={() => {
                                      setShowAddQuestionForm(prev => !prev);
                                      setAddQuestionMessage('');
                                    }}
                                  >
                                    {showAddQuestionForm
                                      ? '❌ Cancel'
                                      : '➕ Add question'}
                                  </button>
                                </div>

                                {/* Form add question */}
                                {showAddQuestionForm && (
                                  <div className="card mt-10">
                                    <h5 className="subtitle subtitle--small">
                                      Add question
                                    </h5>
                                    <textarea
                                      className="textarea mt-5"
                                      placeholder="Question text"
                                      value={newQuestionText}
                                      onChange={e =>
                                        setNewQuestionText(e.target.value)
                                      }
                                      disabled={addQuestionLoading}
                                    />
                                    <div className="mt-10">
                                      <label className="label">Type:</label>
                                      <select
                                        className="input"
                                        value={newQuestionType}
                                        onChange={e =>
                                          setNewQuestionType(e.target.value)
                                        }
                                        disabled={addQuestionLoading}
                                      >
                                        <option value="open">Open</option>
                                        <option value="qcm">QCM</option>
                                        <option value="yes_no">Yes / No</option>
                                      </select>
                                    </div>
                                    {newQuestionType === 'qcm' && (
                                      <div className="mt-10">
                                        <label className="label">
                                          Options (comma separated):
                                        </label>
                                        <input
                                          type="text"
                                          className="input"
                                          placeholder='e.g. "Low, Medium, High"'
                                          value={newQuestionOptionsText}
                                          onChange={e =>
                                            setNewQuestionOptionsText(
                                              e.target.value
                                            )
                                          }
                                          disabled={addQuestionLoading}
                                        />
                                      </div>
                                    )}
                                    <div className="mt-10">
                                      <label>
                                        <input
                                          type="checkbox"
                                          checked={newQuestionRequired}
                                          onChange={e =>
                                            setNewQuestionRequired(
                                              e.target.checked
                                            )
                                          }
                                          disabled={addQuestionLoading}
                                        />{' '}
                                        Required
                                      </label>
                                    </div>
                                    <button
                                      className="btn btn--success mt-10"
                                      onClick={handleAddQuestion}
                                      disabled={addQuestionLoading}
                                    >
                                      ➕ Add question
                                    </button>
                                    {addQuestionMessage && (
                                      <p className={questionMsgClass + ' mt-5'}>
                                        {addQuestionMessage}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Bouton + formulaire d’ajout de sous-titre */}
                  <div className="mt-15">
                    <button
                      className="btn btn--info btn--sm"
                      onClick={() => {
                        setShowAddSubtitleForm(prev => !prev);
                        setAddSubtitleMessage('');
                      }}
                    >
                      {showAddSubtitleForm ? '❌ Cancel' : '➕ Add subtitle'}
                    </button>
                  </div>

                  {showAddSubtitleForm && (
                    <div className="card add-subtitle-section">
                      <h4 className="subtitle subtitle--small">
                        Add subtitle for this title
                      </h4>
                      <input
                        type="text"
                        className="input mt-5"
                        placeholder="New subtitle"
                        value={newSubtitle}
                        onChange={e => setNewSubtitle(e.target.value)}
                        disabled={addSubtitleLoading}
                      />
                      <button
                        className="btn btn--success mt-10"
                        onClick={handleAddSubtitle}
                        disabled={addSubtitleLoading}
                      >
                        ➕ Add subtitle
                      </button>
                      {addSubtitleMessage && (
                        <p className={subtitleMsgClass + ' mt-5'}>
                          {addSubtitleMessage}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const QuestionItem = ({ question, onDelete }) => {
  const { id, question_text, question_type, is_required, options } = question;

  const labelType =
    question_type === 'open'
      ? 'Open'
      : question_type === 'qcm'
      ? 'QCM'
      : 'Yes / No';

  return (
    <div className="task card mt-10">
      <p className="bold">{question_text}</p>
      <p className="muted">
        Type: <strong>{labelType}</strong>{' '}
        {is_required ? '• Required' : ''}
      </p>
      {question_type === 'qcm' && options && options.length > 0 && (
        <ul className="list mt-5">
          {options.map((opt, idx) => (
            <li key={idx}>• {opt}</li>
          ))}
        </ul>
      )}

      <div className="btn-row right mt-5">
        <button
          className="btn btn--danger btn--sm"
          onClick={() => onDelete(id)}
        >
          🗑️ Delete
        </button>
      </div>
    </div>
  );
};

export default RepportPage;
