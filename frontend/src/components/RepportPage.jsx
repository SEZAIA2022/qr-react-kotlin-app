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
  const [historyQuery, setHistoryQuery] = useState("");

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

  useEffect(() => {      
    setPageHist(0);
  }, [historyQuery]);
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
  // ===== HTML -> Print (Save as PDF) =====
  const downloadPdfForBuiltReport = (built) => {
    if (!built?.meta?.submission) return;

    const html = buildHtmlFromBuiltReport(built);

    const w = window.open("", "_blank");
    if (!w) {
      alert("Popup blocked. Please allow popups to download the PDF.");
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();

    // attendre que le HTML soit rendu
    w.onload = () => {
      w.focus();
      w.print();
      // tu peux fermer après print si tu veux:
      // w.close();
    };
  };

  const buildHtmlFromBuiltReport = (built) => {
    const sub = built.meta.submission;

    const esc = (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const safe = (v) => {
      const s = String(v ?? "").trim();
      return s ? s : "N/A";
    };

    const groups = built.groups || [];

    let body = "";
    let lastTitle = null;

    groups.forEach((g) => {
      const title = safe(g.title);
      const subtitle = safe(g.subtitle);

      // ✅ titre une seule fois
      if (title !== lastTitle) {
        body += `<h3 class="h3">${esc(title)}</h3>`;
        lastTitle = title;
      }

      // ✅ sous-titre
      body += `<div class="subtitle">${esc(subtitle)}</div>`;

      // ✅ table (1 table par sous-titre)
      body += `
        <table class="tbl">
          <thead>
            <tr>
              <th class="th q">Question</th>
              <th class="th a">Answer</th>
            </tr>
          </thead>
          <tbody>
      `;

      (g.questions || []).forEach((q) => {
        const qText = safe(q.question_text);
        const qType = safe(q.question_type);
        const ans = String(q.answer ?? "").trim() ? String(q.answer).trim() : "Unanswered";

        body += `
          <tr>
            <td class="td">
              <b>${esc(qText)}</b><br/>
              <span class="qtype">(${esc(qType)})</span>
            </td>
            <td class="td">${esc(ans)}</td>
          </tr>
        `;
      });

      body += `
          </tbody>
        </table>
      `;
    });

    return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Report</title>

    <style>
      body { font-family: sans-serif; padding: 16px; color: #111; }

      .meta { margin: 4px 0; color: #222; font-size: 16px; }
      .meta b { font-weight: 700; }

      /* ✅ comme Android: titre = h3 avec margin-top:18px */
      .h3 { margin-top: 18px; margin-bottom: 8px; font-size: 22px; font-weight: 700; }

      /* ✅ comme Android: sous-titre en gris #555, margin-bottom:8px */
      .subtitle { color: #555; margin-bottom: 8px; font-size: 16px; }

      /* ✅ table full width + border-collapse */
      .tbl { width: 100%; border-collapse: collapse; margin-bottom: 12px; }

      /* ✅ EXACT Android: padding 8px, gris #f2f2f2, border #ddd, widths 60/40 */
      .th { text-align: left; padding: 8px; background: #f2f2f2; border: 1px solid #ddd; font-size: 16px; }
      .th.q { width: 60%; }
      .th.a { width: 40%; }

      /* ✅ EXACT Android: padding 8px + border */
      .td { padding: 8px; border: 1px solid #ddd; vertical-align: top; font-size: 16px; }
      .qtype { color: #666; }

      .footer { margin-top: 24px; }
      .sigline { margin-top: 24px; border-top: 1px solid #000; width: 260px; }
      .siglabel { color:#666; font-size:12px; margin-top: 6px; }

      @media print {
        body { padding: 10mm; }
        .tbl, tr { page-break-inside: avoid; }
      }
    </style>
  </head>

  <body>
    <div class="meta"><b>Date:</b> ${esc(formatIso(sub.submitted_at))}</div>
    <div class="meta"><b>QR ID:</b> ${esc(safe(sub.qr_id))}</div>
    <div class="meta"><b>Serial Number:</b> ${esc(safe(sub.serial_number))}</div>
    <div class="meta"><b>Username:</b> ${esc(safe(sub.username))}</div>

    ${body}

    <div class="footer">
      <div class="meta"><b>Technician:</b> ${esc(safe(sub.tech_user))}</div>
      <div class="sigline"></div>
      <div class="siglabel">Signature</div>
    </div>
  </body>
  </html>
    `;
  };



  // ============= UI HELPERS =============
  const titleMsgError = /^❌/.test(addTitleMessage);
  const titleMsgClass = titleMsgError ? "message message--error" : "message message--success";

  const subtitleMsgError = /^❌/.test(addSubtitleMessage);
  const subtitleMsgClass = subtitleMsgError ? "message message--error" : "message message--success";

  const questionMsgError = /^❌/.test(addQuestionMessage);
  const questionMsgClass = questionMsgError ? "message message--error" : "message message--success";

  // ✅ filter + pagination
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;

    return history.filter((s) => {
      const username = String(s.username ?? "").toLowerCase();
      const qrId = String(s.qr_id ?? "").toLowerCase();
      const serial = String(s.serial_number ?? "").toLowerCase();
      const tech = String(s.tech_user ?? "").toLowerCase();

      // filtre principal sur username, et bonus sur qr/serial/tech si tu veux
      return (
        username.includes(q) ||
        qrId.includes(q) ||
        serial.includes(q) ||
        tech.includes(q)
      );
    });
  }, [history, historyQuery]);

  const totalHist = filteredHistory.length;
  const totalPagesHist = Math.max(1, Math.ceil(totalHist / LIMIT));
  const pageHistClamped = Math.min(pageHist, totalPagesHist - 1);
  const histStart = pageHistClamped * LIMIT;
  const histEnd = Math.min(totalHist, histStart + LIMIT);
  const pageHistory = filteredHistory.slice(histStart, histEnd);

  

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
              setHistoryQuery("");
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


              <div className="card mt-10" style={{ padding: 12 }}>
                <label className="label" style={{ display: "block", marginBottom: 6 }}>
                  Filter by client (username)
                </label>

                <input
                  className="input"
                  type="text"
                  placeholder="Type username… (ex: ehsan)"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                />

                {historyQuery.trim() && (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Showing <b>{totalHist}</b> result(s)
                  </p>
                )}
              </div>




              <div className="results">
                {pageHistory.map((s) => (
                  <div key={s.id} className="task card mt-10">
                    <p className="bold">QR: {s.qr_id} • Serial number: {s.serial_number}</p>
                    <p className="bold">👤 Client: {s.username || "Unknown"}</p>
                    <p className="bold">👷 Technicien: {s.tech_user || "Unknown"}</p>

                    <p className="muted">📅 {formatIso(s.submitted_at)}</p>

                    <div className="btn-row right mt-10" style={{ gap: 8, display: "flex" }}>
                      <button className="btn btn--action" onClick={() => openSubmissionModal(s)}>
                        View
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
                        👤 Client: <b>{reportBuilt.meta.submission.username || "N/A"}</b> • 👷 Technician:{" "}
                        <b>{reportBuilt.meta.submission.tech_user || "N/A"}</b>
                      </p>

                      <p className="muted" style={{ margin: "6px 0 0 0" }}>
                        🔷 QR ID: <b>{reportBuilt.meta.submission.qr_id || "N/A"}</b> • 🔢 Serial:{" "}
                        <b>{reportBuilt.meta.submission.serial_number || "N/A"}</b>
                      </p>

                      <div className="btn-row right mt-10" style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn--primary" onClick={() => downloadPdfForBuiltReport(reportBuilt)}>
                          Download PDF
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
          Delete
        </button>
      </div>
    </div>
  );
};

export default RepportPage;
