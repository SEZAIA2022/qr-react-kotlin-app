import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";

// ===== Helpers =====
function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

function formatIso(raw) {
  if (!raw) return "N/A";
  try {
    // raw ex: 2025-12-18T15:11:35
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return raw;
  }
}

const LIMIT = 12;

// ===== Main =====
const RepportPage = () => {
  const width = useWindowWidth();
  const isMobile = width < 480;

  const API = process.env.REACT_APP_API_URL;

  const [application, setApplication] = useState("");

  // view mode
  const [tab, setTab] = useState("manage"); // "manage" | "history"

  // ---------- MANAGE STATES ----------
  const [titles, setTitles] = useState([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [titlesError, setTitlesError] = useState("");

  const [openTitle, setOpenTitle] = useState(null);
  const [subtitles, setSubtitles] = useState([]);
  const [loadingSubtitles, setLoadingSubtitles] = useState(false);
  const [subtitlesError, setSubtitlesError] = useState("");

  const [openSubtitle, setOpenSubtitle] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [addTitleMessage, setAddTitleMessage] = useState("");
  const [addTitleLoading, setAddTitleLoading] = useState(false);

  const [newSubtitle, setNewSubtitle] = useState("");
  const [addSubtitleMessage, setAddSubtitleMessage] = useState("");
  const [addSubtitleLoading, setAddSubtitleLoading] = useState(false);

  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState("open");
  const [newQuestionRequired, setNewQuestionRequired] = useState(false);
  const [newQuestionOptionsText, setNewQuestionOptionsText] = useState("");
  const [addQuestionMessage, setAddQuestionMessage] = useState("");
  const [addQuestionLoading, setAddQuestionLoading] = useState(false);

  const [showAddSubtitleForm, setShowAddSubtitleForm] = useState(false);
  const [showAddQuestionForm, setShowAddQuestionForm] = useState(false);

  // ---------- HISTORY STATES ----------
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState([]);
  const [pageHist, setPageHist] = useState(0);

  // modal report
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportBuilt, setReportBuilt] = useState(null); // { meta, groups: [{title, subtitle, questions:[{id,text,type,answer}]}] }

  // ---------- INIT ----------
  useEffect(() => {
    const storedApp = localStorage.getItem("userApplication");
    if (storedApp) setApplication(storedApp);
  }, []);

  useEffect(() => {
    if (!application || !application.trim()) return;
    // reset manage view
    fetchTitles();
    setOpenTitle(null);
    setSubtitles([]);
    setOpenSubtitle(null);
    setQuestions([]);
    setShowAddSubtitleForm(false);
    setShowAddQuestionForm(false);

    // reset history view
    setHistory([]);
    setPageHist(0);
  }, [application]);

  // ============= API (MANAGE) =============
  const fetchTitles = async () => {
    setLoadingTitles(true);
    setTitlesError("");
    try {
      const res = await axios.get(`${API}/api/repport/titles`, {
        params: { application },
      });
      setTitles(res.data?.data?.titles || []);
    } catch (err) {
      setTitlesError(err?.response?.data?.message || err.message || "Failed to load titles.");
    } finally {
      setLoadingTitles(false);
    }
  };

  const fetchSubtitles = async (title) => {
    if (!title) return;
    setLoadingSubtitles(true);
    setSubtitlesError("");
    try {
      const res = await axios.get(`${API}/api/repport/subtitles`, {
        params: { application, title },
      });
      setSubtitles(res.data?.data?.subtitles || []);
    } catch (err) {
      if (err?.response?.status === 404) {
        setSubtitles([]);
        setSubtitlesError("No subtitles for this title yet.");
      } else {
        setSubtitlesError(err?.response?.data?.message || err.message || "Failed to load subtitles.");
      }
    } finally {
      setLoadingSubtitles(false);
    }
  };

  const fetchQuestions = async (title, subtitle) => {
    if (!title || !subtitle) return;
    setLoadingQuestions(true);
    setQuestionsError("");
    try {
      const res = await axios.get(`${API}/api/repport/questions`, {
        params: { application, title, subtitle },
      });
      setQuestions(res.data?.data?.questions || []);
    } catch (err) {
      if (err?.response?.status === 404) {
        setQuestions([]);
        setQuestionsError("No questions for this subtitle yet.");
      } else {
        setQuestionsError(err?.response?.data?.message || err.message || "Failed to load questions.");
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  // ============= HANDLERS (MANAGE) =============
  const handleAddTitle = async () => {
    setAddTitleMessage("");
    if (!application.trim()) return setAddTitleMessage("❌ Application non définie (localStorage).");
    if (!newTitle.trim()) return setAddTitleMessage("❌ Title is required.");

    setAddTitleLoading(true);
    try {
      const payload = { application, title: newTitle.trim(), subtitle: "" };
      const res = await axios.post(`${API}/api/repport`, payload);
      const created = res.data?.data;

      if (created?.title && !titles.includes(created.title)) {
        setTitles((prev) => [...prev, created.title].sort());
      }
      setNewTitle("");
      setAddTitleMessage("✅ Title added.");
    } catch (err) {
      if (err?.response?.status === 409) {
        setAddTitleMessage("❌ This title already exists for this application.");
      } else {
        setAddTitleMessage("❌ Failed to add title: " + (err?.response?.data?.message || err.message));
      }
    } finally {
      setAddTitleLoading(false);
    }
  };

  const toggleTitleOpen = (title) => {
    if (openTitle === title) {
      setOpenTitle(null);
      setSubtitles([]);
      setOpenSubtitle(null);
      setQuestions([]);
      setSubtitlesError("");
      setQuestionsError("");
      setShowAddSubtitleForm(false);
      setShowAddQuestionForm(false);
      setAddSubtitleMessage("");
      setAddQuestionMessage("");
      return;
    }
    setOpenTitle(title);
    setOpenSubtitle(null);
    setQuestions([]);
    fetchSubtitles(title);
    setAddSubtitleMessage("");
    setAddQuestionMessage("");
    setShowAddSubtitleForm(false);
    setShowAddQuestionForm(false);
  };

  const handleDeleteTitle = async (title) => {
    if (!window.confirm(`Delete title "${title}" (all its subtitles & questions)?`)) return;
    try {
      await axios.delete(`${API}/api/repport`, { data: { application, title } });
      setTitles((prev) => prev.filter((t) => t !== title));
      if (openTitle === title) {
        setOpenTitle(null);
        setSubtitles([]);
        setOpenSubtitle(null);
        setQuestions([]);
        setShowAddSubtitleForm(false);
        setShowAddQuestionForm(false);
      }
    } catch (err) {
      alert("Failed to delete title: " + (err?.response?.data?.message || err.message));
    }
  };

  const handleAddSubtitle = async () => {
    setAddSubtitleMessage("");
    if (!openTitle) return setAddSubtitleMessage("❌ Select a title first.");
    if (!newSubtitle.trim()) return setAddSubtitleMessage("❌ Subtitle is required.");

    setAddSubtitleLoading(true);
    try {
      const payload = { application, title: openTitle, subtitle: newSubtitle.trim() };
      await axios.post(`${API}/api/repport`, payload);
      setSubtitles((prev) => [...prev, newSubtitle.trim()].filter((v, i, a) => a.indexOf(v) === i));
      setNewSubtitle("");
      setAddSubtitleMessage("✅ Subtitle added.");
      setShowAddSubtitleForm(false);
    } catch (err) {
      if (err?.response?.status === 409) setAddSubtitleMessage("❌ This subtitle already exists for this title.");
      else setAddSubtitleMessage("❌ Failed to add subtitle: " + (err?.response?.data?.message || err.message));
    } finally {
      setAddSubtitleLoading(false);
    }
  };

  const handleDeleteSubtitle = async (subtitle) => {
    if (!window.confirm(`Delete subtitle "${subtitle}" and all its questions?`)) return;
    try {
      await axios.delete(`${API}/api/repport`, { data: { application, title: openTitle, subtitle } });
      setSubtitles((prev) => prev.filter((s) => s !== subtitle));
      if (openSubtitle === subtitle) {
        setOpenSubtitle(null);
        setQuestions([]);
        setShowAddQuestionForm(false);
      }
    } catch (err) {
      alert("Failed to delete subtitle: " + (err?.response?.data?.message || err.message));
    }
  };

  const toggleSubtitleOpen = (subtitle) => {
    if (openSubtitle === subtitle) {
      setOpenSubtitle(null);
      setQuestions([]);
      setQuestionsError("");
      setAddQuestionMessage("");
      setShowAddQuestionForm(false);
      return;
    }
    setOpenSubtitle(subtitle);
    fetchQuestions(openTitle, subtitle);
    setAddQuestionMessage("");
    setShowAddQuestionForm(false);
  };

  const handleAddQuestion = async () => {
    setAddQuestionMessage("");
    if (!openTitle || !openSubtitle) return setAddQuestionMessage("❌ Select a title and subtitle first.");
    if (!newQuestionText.trim()) return setAddQuestionMessage("❌ Question text is required.");
    if (!["open", "qcm", "yes_no"].includes(newQuestionType)) return setAddQuestionMessage("❌ Invalid question type.");

    let options;
    if (newQuestionType === "qcm") {
      options = newQuestionOptionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!options.length) return setAddQuestionMessage("❌ For QCM, add at least one option (comma separated).");
    }

    setAddQuestionLoading(true);
    try {
      const payload = {
        application,
        title: openTitle,
        subtitle: openSubtitle,
        question_text: newQuestionText.trim(),
        question_type: newQuestionType,
        is_required: newQuestionRequired,
      };
      if (options) payload.options = options;

      await axios.post(`${API}/api/repport/questions`, payload);
      await fetchQuestions(openTitle, openSubtitle);

      setNewQuestionText("");
      setNewQuestionType("open");
      setNewQuestionRequired(false);
      setNewQuestionOptionsText("");
      setAddQuestionMessage("✅ Question added.");
      setShowAddQuestionForm(false);
    } catch (err) {
      setAddQuestionMessage("❌ Failed to add question: " + (err?.response?.data?.message || err.message));
    } finally {
      setAddQuestionLoading(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await axios.delete(`${API}/api/repport/questions/${questionId}`);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    } catch (err) {
      alert("Failed to delete question: " + (err?.response?.data?.message || err.message));
    }
  };

  // ============= HISTORY =============
  const fetchHistoryAll = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await axios.get(`${API}/api/repport/history/all`, {
        params: { application },
      });
      setHistory(res.data?.data?.submissions || []);
      setPageHist(0);
    } catch (err) {
      setHistoryError(err?.response?.data?.message || err.message || "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Build report like Android (meta -> groups -> questions)
  const buildReportForSubmission = async (submission) => {
    setReportError("");
    setReportLoading(true);
    setReportBuilt(null);

    try {
      const answers = submission?.answers || {};
      const questionIds = Object.keys(answers)
        .map((k) => parseInt(k, 10))
        .filter((n) => !Number.isNaN(n));

      if (!questionIds.length) {
        setReportBuilt({
          meta: { submission },
          groups: [],
        });
        return;
      }

      // 1) meta for question ids -> gives title/subtitle/repport_id/app
      const metaRes = await axios.get(`${API}/api/repport/meta/by-question-ids`, {
        params: { question_ids: questionIds.join(",") },
      });
      const rows = metaRes.data?.data || [];

      // group by (application,title,subtitle)
      const groupsMap = new Map();
      for (const r of rows) {
        const key = `${r.application}|||${r.title}|||${r.subtitle}`;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, { application: r.application, title: r.title, subtitle: r.subtitle, questions: [] });
        }
      }

      // stable sort by title/subtitle
      const groupsKeys = Array.from(groupsMap.keys()).sort((a, b) => {
        const [appA, tA, sA] = a.split("|||");
        const [appB, tB, sB] = b.split("|||");
        if (tA.toLowerCase() < tB.toLowerCase()) return -1;
        if (tA.toLowerCase() > tB.toLowerCase()) return 1;
        if (sA.toLowerCase() < sB.toLowerCase()) return -1;
        if (sA.toLowerCase() > sB.toLowerCase()) return 1;
        return appA.localeCompare(appB);
      });

      // 2) for each group fetch questions and inject answers
      for (const key of groupsKeys) {
        const g = groupsMap.get(key);
        const qRes = await axios.get(`${API}/api/repport/questions`, {
          params: { application: g.application, title: g.title, subtitle: g.subtitle },
        });
        const qs = qRes.data?.data?.questions || [];
        g.questions = qs.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          is_required: q.is_required,
          options: q.options,
          answer: (answers[String(q.id)] ?? "").toString(),
        }));
      }

      setReportBuilt({
        meta: { submission },
        groups: groupsKeys.map((k) => groupsMap.get(k)),
      });
    } catch (e) {
      console.error(e);
      setReportError("Failed to build report (meta/questions). Check backend responses.");
    } finally {
      setReportLoading(false);
    }
  };

  const openSubmissionModal = async (submission) => {
    setSelectedSubmission(submission);
    setModalOpen(true);
    await buildReportForSubmission(submission);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedSubmission(null);
    setReportBuilt(null);
    setReportError("");
  };

  // PDF generator (no PNG)
  const downloadPdfForBuiltReport = (built) => {
    if (!built?.meta?.submission) return;

    const sub = built.meta.submission;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const lineGap = 6;

    const safeText = (v) => (v === null || v === undefined || String(v).trim() === "" ? "N/A" : String(v));
    const wrap = (txt, maxW) => pdf.splitTextToSize(txt, maxW);

    let y = margin;

    const ensureSpace = (needed) => {
      if (y + needed > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
    };

    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Report", margin, y);
    y += 8;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const headerLines = [
      `Submitted: ${formatIso(sub.submitted_at)}`,
      `QR Code: ${safeText(sub.qr_code)}`,
      `Technician: ${safeText(sub.tech_user)}`,
      `Report ID: ${safeText(sub.repport_id)}`,
      `Status: ${safeText(sub.status)}`,
    ];

    headerLines.forEach((ln) => {
      ensureSpace(6);
      pdf.text(ln, margin, y);
      y += 6;
    });

    y += 4;

    // Body groups
    const groups = built.groups || [];
    if (!groups.length) {
      ensureSpace(10);
      pdf.text("No questions in this submission.", margin, y);
      y += 10;
    } else {
      let lastTitle = null;

      groups.forEach((g) => {
        // title once
        if (g.title !== lastTitle) {
          ensureSpace(10);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(12);
          pdf.text(safeText(g.title), margin, y);
          y += 7;
          lastTitle = g.title;
        }

        // subtitle
        ensureSpace(8);
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(10);
        pdf.text(safeText(g.subtitle), margin, y);
        y += 6;

        // table-like rows
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);

        const colQ = margin;
        const colA = pageW * 0.63; // answer column start
        const maxWQ = colA - margin - 2;
        const maxWA = pageW - margin - colA;

        // header row
        ensureSpace(8);
        pdf.setFont("helvetica", "bold");
        pdf.text("Question", colQ, y);
        pdf.text("Answer", colA, y);
        y += 5;

        pdf.setFont("helvetica", "normal");

        (g.questions || []).forEach((q) => {
          const qTxt = `${safeText(q.question_text)} (${safeText(q.question_type)})`;
          const aTxt = safeText(q.answer) === "N/A" || safeText(q.answer) === "" ? "Unanswered" : safeText(q.answer);

          const qLines = wrap(qTxt, maxWQ);
          const aLines = wrap(aTxt, maxWA);

          const rowLines = Math.max(qLines.length, aLines.length);
          const rowH = rowLines * 4 + 2;

          ensureSpace(rowH + 2);

          // draw texts line by line
          for (let i = 0; i < rowLines; i++) {
            const lq = qLines[i] || "";
            const la = aLines[i] || "";
            pdf.text(lq, colQ, y);
            pdf.text(la, colA, y);
            y += 4;
          }
          y += 2;
        });

        y += 4;
      });
    }

    // Footer
    ensureSpace(18);
    pdf.setDrawColor(0);
    pdf.line(margin, pageH - margin - 10, margin + 70, pageH - margin - 10);
    pdf.setFontSize(9);
    pdf.text("Signature", margin, pageH - margin - 5);

    const filename = `Report_${safeText(sub.qr_code)}_${Date.now()}.pdf`;
    pdf.save(filename);
  };

  // ============= UI HELPERS =============
  const titleMsgError = /^❌/.test(addTitleMessage);
  const titleMsgClass = titleMsgError ? "message message--error" : "message message--success";

  const subtitleMsgError = /^❌/.test(addSubtitleMessage);
  const subtitleMsgClass = subtitleMsgError ? "message message--error" : "message message--success";

  const questionMsgError = /^❌/.test(addQuestionMessage);
  const questionMsgClass = questionMsgError ? "message message--error" : "message message--success";

  // history pagination
  const totalHist = history.length;
  const totalPagesHist = Math.max(1, Math.ceil(totalHist / LIMIT));
  const pageHistClamped = Math.min(pageHist, totalPagesHist - 1);
  const histStart = pageHistClamped * LIMIT;
  const histEnd = Math.min(totalHist, histStart + LIMIT);
  const pageHistory = history.slice(histStart, histEnd);

  return (
    <div className="repport-page container card card--panel">
      <h1 className="title text-center">Report Management</h1>

      {/* Tabs */}
      <div className="segmented-bar" style={{ marginBottom: 14 }}>
        <div className="segmented segmented--pill" role="tablist" aria-label="Report tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "manage"}
            className={`segmented__btn ${tab === "manage" ? "active" : ""}`}
            onClick={() => setTab("manage")}
          >
            Manage
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            className={`segmented__btn ${tab === "history" ? "active" : ""}`}
            onClick={() => {
              setTab("history");
              fetchHistoryAll();
            }}
          >
            History
          </button>
        </div>
      </div>

      {/* ======================= MANAGE TAB ======================= */}
      {tab === "manage" && (
        <>
          {/* BOX : ajouter un TITLE (seulement) */}
          <div className="card add-question-section">
            <h2 className="subtitle subtitle--small">Add new title</h2>
            <input
              type="text"
              className="input mt-5"
              placeholder="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={addTitleLoading}
            />
            <button
              className={`btn btn--success mt-10 ${isMobile ? "w-100" : ""}`}
              onClick={handleAddTitle}
              disabled={addTitleLoading}
            >
              💾 Add title
            </button>
            {addTitleMessage && <p className={titleMsgClass + " mt-5"}>{addTitleMessage}</p>}
          </div>

          {/* LISTE DES TITLES */}
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
                    className={`task__title ${openTitle === title ? "open" : ""}`}
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
                      <div className="btn-row right mt-5">
                        <button className="btn btn--danger btn--sm" onClick={() => handleDeleteTitle(title)}>
                          🗑️ Delete this title
                        </button>
                      </div>

                      {loadingSubtitles ? (
                        <p className="message message--info mt-10">Loading subtitles...</p>
                      ) : subtitlesError ? (
                        <p className="message message--error mt-10">{subtitlesError}</p>
                      ) : (
                        <div className="mt-10">
                          {subtitles.length === 0 ? (
                            <p className="muted">No subtitles yet for this title.</p>
                          ) : (
                            subtitles.map((sub, idx) => (
                              <div className="card mt-10" key={sub ?? `s-${idx}`}>
                                <h4
                                  className={`task__title task__title--small ${openSubtitle === sub ? "open" : ""}`}
                                  onClick={() => toggleSubtitleOpen(sub)}
                                  title="Click to toggle questions"
                                >
                                  {sub}
                                  <span className="chev" aria-hidden="true">
                                    ▶
                                  </span>
                                </h4>

                                <div className="btn-row right mt-5">
                                  <button className="btn btn--danger btn--xs" onClick={() => handleDeleteSubtitle(sub)}>
                                    🗑️
                                  </button>
                                </div>

                                {openSubtitle === sub && (
                                  <div className="mt-10">
                                    {loadingQuestions ? (
                                      <p className="message message--info">Loading questions...</p>
                                    ) : questionsError ? (
                                      <p className="message message--error">{questionsError}</p>
                                    ) : questions.length === 0 ? (
                                      <p className="muted">No questions for this subtitle yet.</p>
                                    ) : (
                                      questions.map((q) => (
                                        <QuestionItem key={q.id} question={q} onDelete={handleDeleteQuestion} />
                                      ))
                                    )}

                                    <div className="mt-15">
                                      <button
                                        className="btn btn--info btn--sm"
                                        onClick={() => {
                                          setShowAddQuestionForm((prev) => !prev);
                                          setAddQuestionMessage("");
                                        }}
                                      >
                                        {showAddQuestionForm ? "❌ Cancel" : "➕ Add question"}
                                      </button>
                                    </div>

                                    {showAddQuestionForm && (
                                      <div className="card mt-10">
                                        <h5 className="subtitle subtitle--small">Add question</h5>

                                        <textarea
                                          className="textarea mt-5"
                                          placeholder="Question text"
                                          value={newQuestionText}
                                          onChange={(e) => setNewQuestionText(e.target.value)}
                                          disabled={addQuestionLoading}
                                        />

                                        <div className="mt-10">
                                          <label className="label">Type:</label>
                                          <select
                                            className="input"
                                            value={newQuestionType}
                                            onChange={(e) => setNewQuestionType(e.target.value)}
                                            disabled={addQuestionLoading}
                                          >
                                            <option value="open">Open</option>
                                            <option value="qcm">QCM</option>
                                            <option value="yes_no">Yes / No</option>
                                          </select>
                                        </div>

                                        {newQuestionType === "qcm" && (
                                          <div className="mt-10">
                                            <label className="label">Options (comma separated):</label>
                                            <input
                                              type="text"
                                              className="input"
                                              placeholder='e.g. "Low, Medium, High"'
                                              value={newQuestionOptionsText}
                                              onChange={(e) => setNewQuestionOptionsText(e.target.value)}
                                              disabled={addQuestionLoading}
                                            />
                                          </div>
                                        )}

                                        <div className="mt-10">
                                          <label>
                                            <input
                                              type="checkbox"
                                              checked={newQuestionRequired}
                                              onChange={(e) => setNewQuestionRequired(e.target.checked)}
                                              disabled={addQuestionLoading}
                                            />{" "}
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
                                          <p className={questionMsgClass + " mt-5"}>{addQuestionMessage}</p>
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

                      <div className="mt-15">
                        <button
                          className="btn btn--info btn--sm"
                          onClick={() => {
                            setShowAddSubtitleForm((prev) => !prev);
                            setAddSubtitleMessage("");
                          }}
                        >
                          {showAddSubtitleForm ? "❌ Cancel" : "➕ Add subtitle"}
                        </button>
                      </div>

                      {showAddSubtitleForm && (
                        <div className="card add-subtitle-section">
                          <h4 className="subtitle subtitle--small">Add subtitle for this title</h4>

                          <input
                            type="text"
                            className="input mt-5"
                            placeholder="New subtitle"
                            value={newSubtitle}
                            onChange={(e) => setNewSubtitle(e.target.value)}
                            disabled={addSubtitleLoading}
                          />

                          <button className="btn btn--success mt-10" onClick={handleAddSubtitle} disabled={addSubtitleLoading}>
                            ➕ Add subtitle
                          </button>

                          {addSubtitleMessage && <p className={subtitleMsgClass + " mt-5"}>{addSubtitleMessage}</p>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ======================= HISTORY TAB ======================= */}
      {tab === "history" && (
        <>
          {historyLoading ? (
            <p className="message message--info">Loading history...</p>
          ) : historyError ? (
            <p className="message message--error">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="message message--info">No submissions found.</p>
          ) : (
            <>
              {/* Pagination */}
              <div className="pagination">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => Math.max(0, p - 1))}
                  disabled={pageHistClamped === 0}
                >
                  ← Previous
                </button>
                <span>
                  {histStart + 1}-{histEnd} of {totalHist}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => (p + 1 < totalPagesHist ? p + 1 : p))}
                  disabled={pageHistClamped >= totalPagesHist - 1}
                >
                  Next →
                </button>
              </div>

              <div className="results">
                {pageHistory.map((s) => (
                  <div key={s.id} className="task card mt-10">
                    <p className="bold">QR: {s.qr_code}</p>
                    <p className="muted">
                      📅 {formatIso(s.submitted_at)} • 👷 {s.tech_user || "Unknown"} • Report ID: {s.repport_id}
                    </p>

                    <div className="btn-row right mt-10" style={{ gap: 8, display: "flex" }}>
                      <button className="btn btn--action" onClick={() => openSubmissionModal(s)}>
                        👁️ View
                      </button>

                      <button
                        className="btn btn--primary"
                        onClick={async () => {
                          // build report then download
                          await buildReportForSubmission(s);
                          // reportBuilt is state, but to avoid timing issues we rebuild locally:
                          // simplest: open modal already built then download from state
                          // here we do: open modal then user can download inside OR we do a local build:
                          // For reliability, we open modal (it builds) then user clicks download.
                          setSelectedSubmission(s);
                          setModalOpen(true);
                        }}
                      >
                        📄 Download PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination bottom */}
              <div className="pagination">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => Math.max(0, p - 1))}
                  disabled={pageHistClamped === 0}
                >
                  ← Previous
                </button>
                <span>
                  Page {pageHistClamped + 1}/{totalPagesHist}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPageHist((p) => (p + 1 < totalPagesHist ? p + 1 : p))}
                  disabled={pageHistClamped >= totalPagesHist - 1}
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {/* Modal */}
          {modalOpen && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: 12,
              }}
              onClick={closeModal}
            >
              <div
                className="card"
                style={{
                  width: "min(950px, 100%)",
                  maxHeight: "90vh",
                  overflow: "auto",
                  padding: 16,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>Report details</h2>
                  <button className="btn btn--danger btn--sm" onClick={closeModal}>
                    ✖ Close
                  </button>
                </div>

                {reportLoading ? (
                  <p className="message message--info mt-10">Building report...</p>
                ) : reportError ? (
                  <p className="message message--error mt-10">{reportError}</p>
                ) : !reportBuilt ? (
                  <p className="message message--info mt-10">No data.</p>
                ) : (
                  <>
                    {/* Header like app */}
                    <div className="card mt-10">
                      <p className="muted" style={{ margin: 0 }}>
                        📅 Submitted: <b>{formatIso(reportBuilt.meta.submission.submitted_at)}</b>
                      </p>
                      <p className="muted" style={{ margin: "6px 0 0 0" }}>
                        🔷 QR Code: <b>{reportBuilt.meta.submission.qr_code || "N/A"}</b> • 👷 Technician:{" "}
                        <b>{reportBuilt.meta.submission.tech_user || "N/A"}</b>
                      </p>
                      <p className="muted" style={{ margin: "6px 0 0 0" }}>
                        Report ID: <b>{reportBuilt.meta.submission.repport_id || "N/A"}</b> • Status:{" "}
                        <b>{reportBuilt.meta.submission.status || "N/A"}</b>
                      </p>

                      <div className="btn-row right mt-10" style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn--primary" onClick={() => downloadPdfForBuiltReport(reportBuilt)}>
                          📄 Download PDF
                        </button>
                      </div>
                    </div>

                    {/* Body grouped */}
                    <div className="mt-10">
                      {reportBuilt.groups.length === 0 ? (
                        <p className="message message--info">No questions in this submission.</p>
                      ) : (
                        (() => {
                          let lastTitle = null;
                          return reportBuilt.groups.map((g, idx) => (
                            <div key={`${g.title}-${g.subtitle}-${idx}`} className="card mt-10">
                              {g.title !== lastTitle && (
                                <>
                                  <h3 style={{ marginBottom: 6 }}>{g.title}</h3>
                                  {(lastTitle = g.title) && null}
                                </>
                              )}
                              <h4 style={{ marginTop: 0, color: "#555" }}>{g.subtitle}</h4>

                              <div style={{ display: "grid", gap: 10 }}>
                                {(g.questions || []).map((q) => (
                                  <div key={q.id} className="task card">
                                    <p className="bold" style={{ marginBottom: 4 }}>
                                      {q.question_text}
                                    </p>
                                    <p className="muted" style={{ marginTop: 0 }}>
                                      Type: <b>{q.question_type}</b>
                                    </p>
                                    <div className="card" style={{ background: "#f7f7f7" }}>
                                      <b>Answer:</b>{" "}
                                      {(q.answer || "").trim() ? (
                                        <span>{q.answer}</span>
                                      ) : (
                                        <span className="muted">Unanswered</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============ Question item (manage tab) ============
const QuestionItem = ({ question, onDelete }) => {
  const { id, question_text, question_type, is_required, options } = question;

  const labelType =
    question_type === "open" ? "Open" : question_type === "qcm" ? "QCM" : "Yes / No";

  return (
    <div className="task card mt-10">
      <p className="bold">{question_text}</p>
      <p className="muted">
        Type: <strong>{labelType}</strong> {is_required ? "• Required" : ""}
      </p>
      {question_type === "qcm" && options && options.length > 0 && (
        <ul className="list mt-5">
          {options.map((opt, idx) => (
            <li key={idx}>• {opt}</li>
          ))}
        </ul>
      )}

      <div className="btn-row right mt-5">
        <button className="btn btn--danger btn--sm" onClick={() => onDelete(id)}>
          🗑️ Delete
        </button>
      </div>
    </div>
  );
};

export default RepportPage;
