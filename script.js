/* Course site - shared behaviour for the overview and the section pages.
   Storage keys are namespaced by course slug (never by window.location), so
   progress and notes survive entering the site at "/course/" or at
   "/course/index.html", and survive videos being reordered or renamed: the
   key is the Drive file id, not the position. */

(function () {
  "use strict";

  var body = document.body;
  var COURSE = body.dataset.course || "course";
  var COURSE_NAME = body.dataset.courseName || document.title;
  var KIND = body.dataset.pageKind || "overview";
  var PREFIX = "cs:" + COURSE + ":";
  var K_DONE = PREFIX + "v:";
  var K_NOTE = PREFIX + "n:";
  var K_LAST = PREFIX + "last";
  var K_MIGRATED = PREFIX + "migrated";
  var K_THEME = "cs:theme";

  /* ---------- storage ---------- */
  var storageWorks = (function () {
    try {
      var probe = "cs:probe";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  })();

  var memory = {};

  function get(key) {
    if (!storageWorks) return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function set(key, value) {
    if (!storageWorks) {
      memory[key] = value;
      return false;
    }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      memory[key] = value;
      toast(
        err && err.name === "QuotaExceededError"
          ? "Browser storage is full - this change was not saved."
          : "This change could not be saved in your browser.",
        "error"
      );
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    if (!storageWorks) return;
    try {
      localStorage.removeItem(key);
    } catch (err) {
      /* ignore */
    }
  }

  function isDone(id) { return get(K_DONE + id) === "1"; }
  function setDone(id, done) { done ? set(K_DONE + id, "1") : remove(K_DONE + id); }
  function getNote(id) { return get(K_NOTE + id) || ""; }

  function setNote(id, text) {
    if (text) set(K_NOTE + id, text);
    else remove(K_NOTE + id);
  }

  /* ---------- one-time migration from the V6 key scheme ---------- */
  function migrate() {
    if (!storageWorks || get(K_MIGRATED) === "1") return;
    var moved = 0;
    document.querySelectorAll("[data-video-id][data-legacy-id]").forEach(function (node) {
      var id = node.dataset.videoId;
      var legacyId = node.dataset.legacyId;
      var legacyPage = node.dataset.legacyPage || "";
      var paths = ["/" + COURSE + "/" + legacyPage, "/" + COURSE + "/"];
      paths.forEach(function (path) {
        if (!isDone(id) && get(path + "-" + legacyId)) {
          setDone(id, true);
          moved++;
        }
        var note = get(path + "-notes-" + legacyId);
        if (note && !getNote(id)) {
          setNote(id, note);
          moved++;
        }
      });
    });
    set(K_MIGRATED, "1");
    if (moved) toast("Restored progress saved by the previous version.", "success");
  }

  /* ---------- toasts ---------- */
  function toast(message, kind) {
    var stack = document.getElementById("toastStack");
    if (!stack) return;
    var node = document.createElement("div");
    node.className = "toast" + (kind ? " " + kind : "");
    var icon = kind === "error" ? "circle-exclamation" : kind === "success" ? "circle-check" : "circle-info";
    node.innerHTML = '<i class="fas fa-' + icon + '" aria-hidden="true"></i><span></span>';
    node.querySelector("span").textContent = message;
    stack.appendChild(node);
    setTimeout(function () {
      node.classList.add("fade");
      setTimeout(function () { node.remove(); }, 320);
    }, 4200);
  }

  /* ---------- theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var icon = document.querySelector("#themeToggle i");
    if (icon) icon.className = theme === "light" ? "fas fa-sun" : "fas fa-moon";
  }

  function initTheme() {
    /* Dark is the course design's default look; light is opt-in and sticky. */
    applyTheme(get(K_THEME) === "light" ? "light" : "dark");
    var toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      set(K_THEME, next);
    });
  }

  /* ---------- header chrome ---------- */
  function initNavCarousel() {
    var rail = document.getElementById("navCarousel");
    var left = document.getElementById("leftScroll");
    var right = document.getElementById("rightScroll");
    if (!rail || !left || !right) return;

    function update() {
      var max = rail.scrollWidth - rail.clientWidth - 1;
      left.disabled = rail.scrollLeft <= 0;
      right.disabled = rail.scrollLeft >= max;
      var hide = rail.scrollWidth <= rail.clientWidth + 1;
      left.hidden = hide;
      right.hidden = hide;
    }

    left.addEventListener("click", function () { rail.scrollBy({ left: -240, behavior: "smooth" }); });
    right.addEventListener("click", function () { rail.scrollBy({ left: 240, behavior: "smooth" }); });
    rail.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    var active = rail.querySelector(".nav-item.active");
    if (active) active.scrollIntoView({ block: "nearest", inline: "center" });
    update();
  }

  function initFab() {
    var menu = document.getElementById("fabMenu");
    var main = document.getElementById("mainFab");
    if (!menu || !main) return;
    main.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = menu.classList.toggle("active");
      main.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target)) {
        menu.classList.remove("active");
        main.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initPageTransitions() {
    var overlay = document.getElementById("loadingOverlay");
    if (!overlay) return;
    document.querySelectorAll("a[data-nav], .nav-link, .chapter-open, .chapter-title, .video-link").forEach(function (link) {
      link.addEventListener("click", function (event) {
        var href = link.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#" || event.metaKey || event.ctrlKey || event.shiftKey || link.target === "_blank") return;
        var samePage = href.split("#")[0] === "" || href.split("#")[0] === body.dataset.page;
        if (samePage) return;
        overlay.classList.add("active");
      });
    });
    window.addEventListener("pagehide", function () { overlay.classList.remove("active"); });
  }

  /* ---------- export / import / reset ---------- */
  function collectAll() {
    var completed = [];
    var notes = {};
    if (storageWorks) {
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (!key || key.indexOf(PREFIX) !== 0) continue;
          if (key.indexOf(K_DONE) === 0 && localStorage.getItem(key) === "1") {
            completed.push(key.slice(K_DONE.length));
          } else if (key.indexOf(K_NOTE) === 0) {
            notes[key.slice(K_NOTE.length)] = localStorage.getItem(key);
          }
        }
      } catch (err) {
        /* fall through with whatever was collected */
      }
    }
    return {
      format: "course-progress/1",
      course: COURSE,
      courseName: COURSE_NAME,
      exported: new Date().toISOString(),
      completed: completed,
      notes: notes,
      last: safeParse(get(K_LAST))
    };
  }

  function safeParse(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (err) { return null; }
  }

  function exportProgress() {
    var data = collectAll();
    if (!data.completed.length && !Object.keys(data.notes).length) {
      toast("Nothing to export yet.", "error");
      return;
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = COURSE + "-progress.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Exported " + data.completed.length + " completed video(s) and " + Object.keys(data.notes).length + " note(s).", "success");
  }

  function importProgress(file) {
    var reader = new FileReader();
    reader.onload = function (event) {
      var data = safeParse(event.target.result);
      if (!data) {
        toast("That file is not valid JSON.", "error");
        return;
      }
      var applied = 0;

      if (Array.isArray(data.completed) || data.notes) {
        if (data.course && data.course !== COURSE) {
          toast('That backup is for "' + (data.courseName || data.course) + '", not this course.', "error");
          return;
        }
        (data.completed || []).forEach(function (id) { setDone(id, true); applied++; });
        Object.keys(data.notes || {}).forEach(function (id) { setNote(id, data.notes[id]); applied++; });
        if (data.last) set(K_LAST, JSON.stringify(data.last));
      } else {
        /* A raw localStorage dump from the previous version. */
        Object.keys(data).forEach(function (key) {
          var match = /-(?:notes-)?(section\d+)$/.exec(key);
          if (!match) return;
          var isNote = key.indexOf("-notes-") !== -1;
          var node = document.querySelector('[data-legacy-id="' + match[1] + '"]');
          if (!node) return;
          if (isNote) setNote(node.dataset.videoId, data[key]);
          else setDone(node.dataset.videoId, true);
          applied++;
        });
      }

      if (!applied) {
        toast("That backup contained nothing for this course.", "error");
        return;
      }
      toast("Imported " + applied + " item(s).", "success");
      setTimeout(function () { location.reload(); }, 700);
    };
    reader.onerror = function () { toast("Could not read that file.", "error"); };
    reader.readAsText(file);
  }

  function initTransfer() {
    var input = document.getElementById("importInput");
    ["exportButton", "exportButtonTop"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.addEventListener("click", exportProgress);
    });
    ["importDataButton", "importButtonTop"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node && input) node.addEventListener("click", function () { input.click(); });
    });
    if (input) {
      input.addEventListener("change", function (event) {
        var file = event.target.files && event.target.files[0];
        if (file) importProgress(file);
        input.value = "";
      });
    }
    var reset = document.getElementById("resetButton");
    if (reset) {
      reset.addEventListener("click", function () {
        if (!confirm("Clear all progress and notes for this course in this browser?")) return;
        if (storageWorks) {
          var keys = [];
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(PREFIX) === 0) keys.push(key);
          }
          keys.forEach(remove);
        }
        memory = {};
        toast("Progress cleared.", "success");
        setTimeout(function () { location.reload(); }, 600);
      });
    }
  }

  /* ---------- overview page ---------- */
  function initOverview() {
    var cards = Array.prototype.slice.call(document.querySelectorAll(".chapter-card"));
    var rows = Array.prototype.slice.call(document.querySelectorAll(".video-row"));
    var total = parseInt(body.dataset.totalVideos, 10) || rows.length;

    function refresh() {
      var doneTotal = 0;
      cards.forEach(function (card) {
        var number = card.dataset.chapter;
        var cardRows = card.querySelectorAll(".video-row");
        var done = 0;
        cardRows.forEach(function (row) {
          var complete = isDone(row.dataset.videoId);
          row.classList.toggle("done", complete);
          var icon = row.querySelector(".video-state i");
          if (icon) icon.className = complete ? "fas fa-circle-check" : "fas fa-circle-play";
          if (complete) done++;
        });
        doneTotal += done;
        var fill = card.querySelector('[data-chapter-fill="' + number + '"]');
        var text = card.querySelector('[data-chapter-text="' + number + '"]');
        var pct = cardRows.length ? Math.round((done / cardRows.length) * 100) : 0;
        if (fill) fill.style.width = pct + "%";
        if (text) text.textContent = done + "/" + cardRows.length;
      });

      var pct = total ? Math.round((doneTotal / total) * 100) : 0;
      var fill = document.getElementById("overallFill");
      var bar = document.getElementById("overallProgress");
      var label = document.getElementById("overallText");
      var stat = document.getElementById("statDone");
      if (fill) fill.style.width = pct + "%";
      if (bar) bar.setAttribute("aria-valuenow", String(pct));
      if (label) label.textContent = doneTotal + " of " + total + " videos complete (" + pct + "%)";
      if (stat) stat.textContent = String(doneTotal);
      updateResume(doneTotal, total);
    }

    function updateResume(doneTotal, totalCount) {
      var button = document.getElementById("resumeBtn");
      var label = document.getElementById("resumeLabel");
      if (!button || !label) return;

      if (doneTotal >= totalCount && totalCount > 0) {
        label.textContent = "Review from the start";
        button.href = button.dataset.startHref;
        return;
      }

      var last = safeParse(get(K_LAST));
      if (last && last.href) {
        var row = document.querySelector('.video-row[data-video-id="' + last.id + '"] .video-link');
        label.textContent = "Resume: " + (last.title || "last video");
        button.href = row ? row.getAttribute("href") : last.href;
        return;
      }

      var next = rows.filter(function (row) { return !isDone(row.dataset.videoId); })[0];
      if (next && doneTotal > 0) {
        label.textContent = "Continue course";
        button.href = next.querySelector(".video-link").getAttribute("href");
      } else {
        label.textContent = "Start course";
        button.href = button.dataset.startHref;
      }
    }

    /* collapse / expand */
    cards.forEach(function (card) {
      var toggle = card.querySelector(".chapter-toggle");
      if (!toggle) return;
      toggle.addEventListener("click", function () {
        var collapsed = card.classList.toggle("collapsed");
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      });
    });

    var toggleAll = document.getElementById("toggleAll");
    if (toggleAll) {
      toggleAll.addEventListener("click", function () {
        var collapse = toggleAll.getAttribute("aria-pressed") !== "true";
        cards.forEach(function (card) {
          card.classList.toggle("collapsed", collapse);
          var toggle = card.querySelector(".chapter-toggle");
          if (toggle) toggle.setAttribute("aria-expanded", collapse ? "false" : "true");
        });
        toggleAll.setAttribute("aria-pressed", collapse ? "true" : "false");
        toggleAll.querySelector("span").textContent = collapse ? "Expand all" : "Collapse all";
        toggleAll.querySelector("i").className = collapse ? "fas fa-chevron-down" : "fas fa-chevron-up";
      });
    }

    /* search */
    var search = document.getElementById("courseSearch");
    var clear = document.getElementById("searchClear");
    var empty = document.getElementById("noResults");

    function runSearch() {
      var term = (search.value || "").trim().toLowerCase();
      if (clear) clear.hidden = !term;
      var visible = 0;

      cards.forEach(function (card) {
        var chapterMatch = (card.dataset.title || "").toLowerCase().indexOf(term) !== -1;
        var shown = 0;
        card.querySelectorAll(".video-row").forEach(function (row) {
          var match = !term || chapterMatch || (row.dataset.title || "").toLowerCase().indexOf(term) !== -1;
          row.hidden = !match;
          if (match) shown++;
        });
        var keep = !term || chapterMatch || shown > 0;
        card.hidden = !keep;
        if (keep) visible++;
        if (term) card.classList.remove("collapsed");
      });

      if (empty) empty.hidden = visible > 0;
    }

    if (search) {
      search.addEventListener("input", runSearch);
      search.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { search.value = ""; runSearch(); search.blur(); }
      });
    }
    if (clear && search) {
      clear.addEventListener("click", function () { search.value = ""; runSearch(); search.focus(); });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "/" && search && document.activeElement !== search) {
        var tag = (document.activeElement && document.activeElement.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        event.preventDefault();
        search.focus();
      }
    });

    refresh();
    window.addEventListener("storage", refresh);
  }

  /* ---------- section pages ---------- */
  function initSection() {
    var articles = Array.prototype.slice.call(document.querySelectorAll(".video-section"));
    if (!articles.length) return;

    function paint(article, done) {
      article.classList.toggle("completed", done);
      var button = article.querySelector(".complete-btn");
      var label = article.querySelector(".complete-label");
      var text = article.querySelector(".status-text");
      if (button) button.setAttribute("aria-pressed", done ? "true" : "false");
      if (label) label.textContent = done ? "Completed" : "Mark complete";
      if (text) text.textContent = done ? "Completed" : "Ready to watch";
    }

    function refreshProgress() {
      var done = articles.filter(function (a) { return isDone(a.dataset.videoId); }).length;
      var pct = Math.round((done / articles.length) * 100);
      var fill = document.getElementById("pageFill");
      var bar = document.getElementById("pageProgress");
      var label = document.getElementById("pageText");
      if (fill) fill.style.width = pct + "%";
      if (bar) bar.setAttribute("aria-valuenow", String(pct));
      if (label) label.textContent = done + " of " + articles.length + " videos complete";
    }

    articles.forEach(function (article, position) {
      var id = article.dataset.videoId;
      paint(article, isDone(id));

      var complete = article.querySelector(".complete-btn");
      if (complete) {
        complete.addEventListener("click", function () {
          var next = !isDone(id);
          setDone(id, next);
          paint(article, next);
          refreshProgress();
          rememberLast(article);
          if (next) {
            var following = articles[position + 1];
            if (following) scrollTo(following);
            else if (body.dataset.nextVideo) toast("Section complete - the next section is one click away.", "success");
            else toast("That was the last video. Course complete.", "success");
          }
        });
      }

      /* previous / next, including across page boundaries */
      var prev = article.querySelector("[data-video-prev]");
      var next = article.querySelector("[data-video-next]");
      if (prev) {
        if (position > 0) prev.setAttribute("href", "#" + articles[position - 1].id);
        else if (body.dataset.prevVideo) prev.setAttribute("href", body.dataset.prevVideo);
        else { prev.setAttribute("href", "index.html"); prev.setAttribute("aria-disabled", "true"); }
      }
      if (next) {
        if (position < articles.length - 1) next.setAttribute("href", "#" + articles[position + 1].id);
        else if (body.dataset.nextVideo) next.setAttribute("href", body.dataset.nextVideo);
        else { next.setAttribute("href", "index.html"); next.setAttribute("aria-disabled", "true"); }
      }

      initNotes(article, id);
    });

    /* in-page anchors scroll smoothly instead of jumping */
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest('a[href^="#"]');
      if (!link) return;
      var target = document.getElementById(link.getAttribute("href").slice(1));
      if (!target) return;
      event.preventDefault();
      scrollTo(target);
      history.replaceState(null, "", "#" + target.id);
    });

    function scrollTo(article) {
      article.scrollIntoView({ behavior: "smooth", block: "start" });
      article.classList.remove("flash");
      void article.offsetWidth;
      article.classList.add("flash");
      rememberLast(article);
    }

    function rememberLast(article) {
      var title = article.querySelector(".video-title");
      set(K_LAST, JSON.stringify({
        id: article.dataset.videoId,
        href: body.dataset.page + "#" + article.id,
        title: title ? title.textContent : ""
      }));
    }

    /* land on the exact video when arriving from the overview */
    function openFromHash() {
      var hash = location.hash;
      if (!hash || hash.length < 2) return;
      var target = document.getElementById(hash.slice(1));
      if (target && target.classList.contains("video-section")) {
        setTimeout(function () { scrollTo(target); }, 60);
      }
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);

    /* remember the video the reader is actually looking at */
    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.55) rememberLast(entry.target);
        });
      }, { threshold: [0.55] });
      articles.forEach(function (article) { observer.observe(article); });
    }

    /* keyboard: alt+arrows move between sections, j/k between videos */
    document.addEventListener("keydown", function (event) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || event.ctrlKey || event.metaKey) return;
      if (event.altKey && event.key === "ArrowLeft") {
        var left = document.querySelector(".left-nav");
        if (left) { event.preventDefault(); left.click(); }
      } else if (event.altKey && event.key === "ArrowRight") {
        var right = document.querySelector(".right-nav");
        if (right) { event.preventDefault(); right.click(); }
      } else if (event.key === "j" || event.key === "k") {
        var current = nearestArticle();
        var index = articles.indexOf(current);
        var target = articles[event.key === "j" ? index + 1 : index - 1];
        if (target) { event.preventDefault(); scrollTo(target); }
      }
    });

    function nearestArticle() {
      var best = articles[0];
      var bestDistance = Infinity;
      articles.forEach(function (article) {
        var distance = Math.abs(article.getBoundingClientRect().top - 90);
        if (distance < bestDistance) { bestDistance = distance; best = article; }
      });
      return best;
    }

    refreshProgress();
    window.addEventListener("storage", function () {
      articles.forEach(function (article) { paint(article, isDone(article.dataset.videoId)); });
      refreshProgress();
    });
  }

  /* ---------- video player sizing ---------- */

  /* Below this width the Drive player stops reflowing and starts overflowing
     its iframe, so narrower containers get a full-size player scaled down. */
  var PLAYER_WIDTH = 640;

  function fitPlayer(container) {
    var frame = container.querySelector(".video-frame");
    if (!frame || frame.classList.contains("is-fullscreen")) return;
    var width = container.clientWidth;
    if (!width) return;

    if (width >= PLAYER_WIDTH) {
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.transform = "none";
      return;
    }
    var scale = width / PLAYER_WIDTH;
    frame.style.width = PLAYER_WIDTH + "px";
    frame.style.height = Math.round(container.clientHeight / scale) + "px";
    frame.style.transform = "scale(" + scale + ")";
  }

  function fitPlayers() {
    document.querySelectorAll(".video-container").forEach(fitPlayer);
  }

  function watchPlayers() {
    var containers = document.querySelectorAll(".video-container");
    if (!containers.length) return;
    fitPlayers();

    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) { fitPlayer(entry.target); });
      });
      containers.forEach(function (container) { observer.observe(container); });
    } else {
      window.addEventListener("resize", fitPlayers);
    }
    // Rotating a phone changes the width before resize always fires.
    window.addEventListener("orientationchange", function () {
      setTimeout(fitPlayers, 120);
    });

    // A scaled ancestor would shrink the fullscreen player too, so the
    // transform is dropped for as long as the player is fullscreen.
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (name) {
      document.addEventListener(name, function () {
        var active = document.fullscreenElement || document.webkitFullscreenElement;
        document.querySelectorAll(".video-frame.is-fullscreen").forEach(function (frame) {
          frame.classList.remove("is-fullscreen");
        });
        if (active && active.closest) {
          var frame = active.closest(".video-frame");
          if (frame) frame.classList.add("is-fullscreen");
        }
        fitPlayers();
      });
    });
  }

  /* ---------- notes ---------- */
  function initNotes(article, id) {
    var input = article.querySelector(".notes-input");
    if (!input) return;
    var counter = article.querySelector(".char-count");
    var flag = article.querySelector(".notes-flag");
    var details = article.querySelector(".notes-container");

    var limit = parseInt(input.getAttribute("maxlength"), 10) || 5000;

    function count() {
      if (counter) counter.textContent = String(input.value.length);
      if (flag) flag.hidden = !input.value.length;
    }

    input.value = getNote(id);
    count();
    if (input.value && details) details.open = true;

    var timer = null;
    input.addEventListener("input", function () {
      if (input.value.length > limit) input.value = input.value.slice(0, limit);
      count();
      clearTimeout(timer);
      timer = setTimeout(function () { setNote(id, input.value); }, 350);
    });
    input.addEventListener("blur", function () { setNote(id, input.value); });

    article.querySelectorAll("[data-wrap]").forEach(function (button) {
      button.addEventListener("click", function () {
        var mark = button.dataset.wrap;
        var start = input.selectionStart;
        var end = input.selectionEnd;
        if (start === end) { input.focus(); return; }
        var selected = input.value.substring(start, end);
        input.value = input.value.substring(0, start) + mark + selected + mark + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + mark.length, end + mark.length);
        count();
        setNote(id, input.value);
      });
    });

    var clear = article.querySelector("[data-clear]");
    if (clear) {
      clear.addEventListener("click", function () {
        if (!input.value || !confirm("Clear your notes for this video?")) return;
        input.value = "";
        count();
        setNote(id, "");
        input.focus();
      });
    }
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    migrate();
    initNavCarousel();
    initFab();
    initTransfer();
    initPageTransitions();
    if (KIND === "section") { initSection(); watchPlayers(); }
    else initOverview();
    if (!storageWorks) toast("Your browser is blocking storage, so progress will not be kept.", "error");
  });
})();
