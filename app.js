(() => {
  const modules = window.CUET_MODULES || [];
  const STORAGE_KEY = "cuet_daily_prep_v1";

  const defaultState = {
    dark: false,
    readIds: {},
    savedItems: {}, // id -> { id, date, type, title, detail }
    quizResults: {}, // date -> { answers: {}, submitted: bool, score: number, correct: number, wrong: number }
    activeDays: []
  };

  let state = loadState();
  let currentDayIndex = 0;
  let activeCategory = "All";
  let quizMode = "practice"; // 'practice' | 'exam'
  let timerId = null;
  let secondsLeft = 20 * 60;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultState, ...JSON.parse(raw) } : { ...defaultState };
    } catch {
      return { ...defaultState };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function currentModule() {
    return modules[currentDayIndex] || modules[0];
  }

  function markDayActive(dateStr) {
    if (!state.activeDays.includes(dateStr)) {
      state.activeDays.push(dateStr);
      saveState();
    }
  }

  // Theme
  function applyTheme() {
    document.body.classList.toggle("dark", state.dark);
    document.getElementById("themeToggle").textContent = state.dark ? "☀️" : "🌙";
  }

  // Init controls
  function initDaySelect() {
    const sel = document.getElementById("daySelect");
    sel.innerHTML = "";
    modules.forEach((m, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = idx === 0 ? `Today · ${m.displayDate}` : m.displayDate;
      sel.appendChild(opt);
    });
    sel.value = currentDayIndex;
    sel.addEventListener("change", (e) => {
      currentDayIndex = Number(e.target.value);
      activeCategory = "All";
      stopTimer();
      renderAll();
    });
  }

  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      });
    });
  }

  function updateStats() {
    const mod = currentModule();
    const totalCA = mod.currentAffairs.length;
    const readCA = mod.currentAffairs.filter((item) => state.readIds[item.id]).length;
    document.getElementById("streakCount").textContent = state.activeDays.length || 1;
    document.getElementById("readCount").textContent = `${readCA}/${totalCA}`;
    document.getElementById("savedCount").textContent = Object.keys(state.savedItems).length;

    const scores = Object.entries(state.quizResults)
      .filter(([, r]) => r.submitted)
      .map(([date, r]) => {
        const m = modules.find((x) => x.date === date);
        const max = (m ? m.questions.length : 25) * 5;
        return { score: r.score, max };
      });
    if (scores.length) {
      const best = scores.reduce((a, b) => (b.score > a.score ? b : a), scores[0]);
      document.getElementById("bestScore").textContent = `${best.score}/${best.max}`;
    } else {
      document.getElementById("bestScore").textContent = "—";
    }
  }

  // Current Affairs
  function renderCurrentAffairs() {
    const mod = currentModule();
    document.getElementById("caTitle").textContent = `Current Affairs · ${mod.displayDate}`;
    document.getElementById("caSubtitle").textContent = `Focus: ${mod.theme}`;

    const categories = ["All", ...new Set(mod.currentAffairs.map((c) => c.category))];
    const filterRow = document.getElementById("caFilters");
    filterRow.innerHTML = "";
    categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = `filter-chip ${activeCategory === cat ? "active" : ""}`;
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        activeCategory = cat;
        renderCurrentAffairs();
      });
      filterRow.appendChild(btn);
    });

    const list = document.getElementById("caList");
    list.innerHTML = "";
    const filtered =
      activeCategory === "All"
        ? mod.currentAffairs
        : mod.currentAffairs.filter((c) => c.category === activeCategory);

    filtered.forEach((item) => {
      const isRead = !!state.readIds[item.id];
      const isSaved = !!state.savedItems[item.id];
      const card = document.createElement("article");
      card.className = `card ${isRead ? "is-read" : ""}`;
      card.innerHTML = `
        <div class="card-top">
          <span class="badge">${item.category}</span>
          <span class="muted" style="font-size:0.78rem">${isRead ? "✓ Read" : "Unread"}</span>
        </div>
        <h3>${item.title}</h3>
        <p>${item.summary}</p>
        ${
          item.keyPoints && item.keyPoints.length
            ? `<ul class="gk-points">${item.keyPoints.map((pt) => `<li>${pt}</li>`).join("")}</ul>`
            : ""
        }
        <div class="exam-tip"><strong>🎯 CUET Exam Tip:</strong> ${item.examTip}</div>
        <div class="card-actions">
          <button class="mini-btn ${isRead ? "active" : ""}" data-read="${item.id}">
            ${isRead ? "✓ Marked Read" : "Mark as Read"}
          </button>
          <button class="mini-btn ${isSaved ? "saved" : ""}" data-save="${item.id}">
            ${isSaved ? "🔖 Saved" : "Save for Revision"}
          </button>
        </div>
      `;

      card.querySelector(`[data-read]`).addEventListener("click", () => {
        state.readIds[item.id] = !state.readIds[item.id];
        markDayActive(mod.date);
        saveState();
        renderCurrentAffairs();
        updateStats();
      });

      card.querySelector(`[data-save]`).addEventListener("click", () => {
        if (state.savedItems[item.id]) {
          delete state.savedItems[item.id];
        } else {
          state.savedItems[item.id] = {
            id: item.id,
            date: mod.displayDate,
            type: `Current Affairs · ${item.category}`,
            title: item.title,
            detail: `${item.summary} — Tip: ${item.examTip}`
          };
        }
        saveState();
        renderCurrentAffairs();
        renderSaved();
        updateStats();
      });

      list.appendChild(card);
    });
  }

  // Static GK
  function renderStaticGK() {
    const mod = currentModule();
    const container = document.getElementById("gkContainer");
    container.innerHTML = "";

    mod.staticGK.forEach((sec, idx) => {
      const isSaved = !!state.savedItems[sec.id];
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-top">
          <span class="badge">Section ${idx + 1} · ${sec.tag}</span>
          <button class="mini-btn ${isSaved ? "saved" : ""}" data-save-gk="${sec.id}">
            ${isSaved ? "🔖 Saved" : "Save Section"}
          </button>
        </div>
        <h3>${sec.title}</h3>
        <p class="muted">${sec.overview}</p>
        <ul class="gk-points">
          ${sec.points.map((p) => `<li>${p}</li>`).join("")}
        </ul>
        <h4 style="margin:14px 0 6px;">⚡ Quick Flashcards (Tap to flip)</h4>
        <div class="flashcard-grid">
          ${sec.flashcards
            .map(
              (fc, fIdx) => `
            <div class="flashcard" data-fc="${sec.id}-${fIdx}">
              <div class="flashcard-label">Question (Tap to reveal)</div>
              <div class="fc-body">${fc.q}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `;

      card.querySelectorAll(".flashcard").forEach((el, fIdx) => {
        let flipped = false;
        el.addEventListener("click", () => {
          flipped = !flipped;
          el.querySelector(".flashcard-label").textContent = flipped
            ? "Answer (Tap to hide)"
            : "Question (Tap to reveal)";
          el.querySelector(".fc-body").textContent = flipped
            ? sec.flashcards[fIdx].a
            : sec.flashcards[fIdx].q;
        });
      });

      card.querySelector(`[data-save-gk]`).addEventListener("click", () => {
        if (state.savedItems[sec.id]) {
          delete state.savedItems[sec.id];
        } else {
          state.savedItems[sec.id] = {
            id: sec.id,
            date: mod.displayDate,
            type: `Static GK · ${sec.tag}`,
            title: sec.title,
            detail: sec.points.join(" | ")
          };
        }
        saveState();
        renderStaticGK();
        renderSaved();
        updateStats();
      });

      container.appendChild(card);
    });
  }

  // Quiz
  function getDayQuizState() {
    const mod = currentModule();
    if (!state.quizResults[mod.date]) {
      state.quizResults[mod.date] = {
        answers: {},
        submitted: false,
        score: 0,
        correct: 0,
        wrong: 0
      };
    }
    return state.quizResults[mod.date];
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    const mod = currentModule();
    secondsLeft = (mod.questions ? mod.questions.length : 25) * 60;
    updateTimerText();
    timerId = setInterval(() => {
      secondsLeft--;
      updateTimerText();
      if (secondsLeft <= 0) {
        stopTimer();
        submitExam();
      }
    }, 1000);
  }

  function updateTimerText() {
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const s = String(secondsLeft % 60).padStart(2, "0");
    document.getElementById("timerDisplay").textContent = `${m}:${s}`;
  }

  function submitExam() {
    stopTimer();
    const mod = currentModule();
    const qState = getDayQuizState();
    let correct = 0;
    let wrong = 0;
    mod.questions.forEach((q) => {
      const ans = qState.answers[q.id];
      if (ans !== undefined) {
        if (ans === q.answer) correct++;
        else wrong++;
      }
    });
    qState.submitted = true;
    qState.correct = correct;
    qState.wrong = wrong;
    qState.score = correct * 5 - wrong * 1;
    markDayActive(mod.date);
    saveState();
    renderQuiz();
    renderSaved();
    updateStats();
  }

  function renderQuiz() {
    const mod = currentModule();
    const qState = getDayQuizState();

    document.getElementById("practiceModeBtn").classList.toggle("active", quizMode === "practice");
    document.getElementById("examModeBtn").classList.toggle("active", quizMode === "exam");
    document.getElementById("examBar").classList.toggle("hidden", quizMode !== "exam");

    const summaryEl = document.getElementById("quizSummary");
    if (quizMode === "exam" && qState.submitted) {
      const skipped = mod.questions.length - qState.correct - qState.wrong;
      summaryEl.classList.remove("hidden");
      summaryEl.innerHTML = `
        <h3 style="margin-top:0;">📊 NTA Score Card: ${qState.score} / ${mod.questions.length * 5}</h3>
        <p style="margin:6px 0;">
          ✅ Correct: <strong>${qState.correct}</strong> (+${qState.correct * 5}) ·
          ❌ Wrong: <strong>${qState.wrong}</strong> (-${qState.wrong}) ·
          ⏭️ Skipped: <strong>${skipped}</strong> (0)
        </p>
        <p class="muted">Scroll down to review every explanation.</p>
      `;
    } else {
      summaryEl.classList.add("hidden");
    }

    // Palette
    const palette = document.getElementById("questionPalette");
    palette.innerHTML = "";
    mod.questions.forEach((q, idx) => {
      const dot = document.createElement("button");
      dot.className = "palette-dot";
      dot.textContent = idx + 1;
      const ans = qState.answers[q.id];
      if (ans !== undefined) {
        if (quizMode === "practice" || qState.submitted) {
          dot.classList.add(ans === q.answer ? "correct" : "wrong");
        } else {
          dot.classList.add("answered");
        }
      }
      dot.addEventListener("click", () => {
        document.getElementById(`q-card-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      palette.appendChild(dot);
    });

    // Questions
    const container = document.getElementById("quizContainer");
    container.innerHTML = "";
    mod.questions.forEach((q, idx) => {
      const userAns = qState.answers[q.id];
      const reveal =
        (quizMode === "practice" && userAns !== undefined) ||
        (quizMode === "exam" && qState.submitted);

      const card = document.createElement("article");
      card.className = "card";
      card.id = `q-card-${idx}`;
      card.innerHTML = `
        <div class="card-top">
          <span class="badge">Q${idx + 1} · ${q.topic}</span>
          <span class="badge format">${q.format}</span>
        </div>
        <div class="q-stem">${q.question}</div>
        <div class="options-list">
          ${q.options
            .map((opt, oIdx) => {
              let cls = "option-btn";
              if (reveal) {
                if (oIdx === q.answer) cls += " correct";
                else if (oIdx === userAns) cls += " wrong";
              } else if (oIdx === userAns) {
                cls += " selected";
              }
              return `<button class="${cls}" data-opt="${oIdx}">${String.fromCharCode(65 + oIdx)}. ${opt}</button>`;
            })
            .join("")}
        </div>
        ${
          reveal
            ? `<div class="explanation-box">
                <strong>${userAns === q.answer ? "✅ Correct (+5)" : userAns === undefined ? "⏭️ Unattempted (0)" : "❌ Incorrect (-1)"}</strong><br/>
                ${q.explanation}
              </div>`
            : ""
        }
      `;

      card.querySelectorAll("[data-opt]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (quizMode === "exam" && qState.submitted) return;
          qState.answers[q.id] = Number(btn.dataset.opt);
          markDayActive(mod.date);
          saveState();
          renderQuiz();
          updateStats();
        });
      });

      container.appendChild(card);
    });
  }

  // Saved & Score History
  function renderSaved() {
    const historyEl = document.getElementById("scoreHistory");
    const entries = Object.entries(state.quizResults).filter(([, r]) => r.submitted);
    historyEl.innerHTML = entries.length
      ? `<h3 style="margin-top:0;">📈 Timed Test History</h3>` +
        entries
          .map(
            ([date, r]) =>
              `<p style="margin:4px 0;"><strong>${date}</strong>: ${r.score}/100 (✅ ${r.correct}, ❌ ${r.wrong})</p>`
          )
          .join("")
      : `<h3 style="margin-top:0;">📈 Timed Test History</h3><p class="muted">Complete a Timed Exam Mode test to track your NTA scores here.</p>`;

    const savedList = document.getElementById("savedList");
    const items = Object.values(state.savedItems);
    if (!items.length) {
      savedList.innerHTML = `<div class="card"><p class="muted">No bookmarks yet. Tap "Save for Revision" on any Current Affairs card or Static GK section.</p></div>`;
      return;
    }

    savedList.innerHTML = "";
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-top">
          <span class="badge">${item.type} · ${item.date}</span>
          <button class="mini-btn" data-remove="${item.id}">Remove</button>
        </div>
        <h3>${item.title}</h3>
        <p>${item.detail}</p>
      `;
      card.querySelector(`[data-remove]`).addEventListener("click", () => {
        delete state.savedItems[item.id];
        saveState();
        renderAll();
      });
      savedList.appendChild(card);
    });
  }

  function renderAll() {
    renderCurrentAffairs();
    renderStaticGK();
    renderQuiz();
    renderSaved();
    updateStats();
  }

  // Event listeners
  document.getElementById("themeToggle").addEventListener("click", () => {
    state.dark = !state.dark;
    saveState();
    applyTheme();
  });

  document.getElementById("practiceModeBtn").addEventListener("click", () => {
    quizMode = "practice";
    stopTimer();
    renderQuiz();
  });

  document.getElementById("examModeBtn").addEventListener("click", () => {
    quizMode = "exam";
    const qState = getDayQuizState();
    if (!qState.submitted) startTimer();
    renderQuiz();
  });

  document.getElementById("submitExamBtn").addEventListener("click", submitExam);

  document.getElementById("resetQuizBtn").addEventListener("click", () => {
    const mod = currentModule();
    state.quizResults[mod.date] = {
      answers: {},
      submitted: false,
      score: 0,
      correct: 0,
      wrong: 0
    };
    saveState();
    if (quizMode === "exam") startTimer();
    renderQuiz();
    updateStats();
  });

  document.getElementById("clearSavedBtn").addEventListener("click", () => {
    state.savedItems = {};
    saveState();
    renderAll();
  });

  // Boot
  applyTheme();
  initDaySelect();
  initTabs();
  if (modules.length) markDayActive(modules[0].date);
  renderAll();
})();
