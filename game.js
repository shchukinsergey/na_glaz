"use strict";

const storageKey = "na-glaz:progress:v1";
const moscowDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" });
const prettyDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", timeZone: "UTC",
});
const valueFormat = new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 15 });
const factorFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const round = document.querySelector("#round");
const archive = document.querySelector("#archive");
const calc = document.querySelector("#calculator");
const calcInput = document.querySelector("#calc-input");
const calcStatus = document.querySelector("#calc-status");
let progress = readProgress();
let edition;
let dialogTrigger;

function currentEdition() {
  const today = moscowDate.format(new Date());
  return EDITIONS.findLast((item) => item.date <= today) ?? EDITIONS[0];
}

function editionNumber(item) {
  return String(EDITIONS.indexOf(item) + 1).padStart(2, "0");
}

function dateLabel(date) {
  return prettyDate.format(new Date(date + "T00:00:00Z"));
}

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function getRecord(item) {
  const saved = progress[item.date];
  if (!Array.isArray(saved?.guesses)) return { guesses: [], reveal: false };
  const guesses = [];
  for (const guess of saved.guesses.slice(0, item.questions.length)) {
    if (!Number.isFinite(guess) || !validGuess(guess)) break;
    guesses.push(guess);
  }
  return { guesses, reveal: guesses.length > 0 && saved.reveal === true };
}

function saveRecord(record) {
  progress[edition.date] = record;
  try {
    localStorage.setItem(storageKey, JSON.stringify(progress));
  } catch {
    // Keep this round playable in memory if storage is disabled.
  }
}

function validGuess(number) {
  return number >= 1e-12 && number <= 1e18;
}

function readGuess(input) {
  const normalized = input.trim();
  if (!/^(?:(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d+)?|[.,]\d+)$/.test(normalized)) return NaN;
  return Number(normalized.replace(/[ \u00a0\u202f]/g, "").replace(",", "."));
}

function score(guess, answer) {
  return Math.max(guess, answer) / Math.min(guess, answer);
}

function average(item, guesses) {
  const total = guesses.reduce((sum, guess, index) => sum + score(guess, item.questions[index].answer), 0);
  return total / guesses.length;
}

function formatFactor(value) {
  if (value > 1 && factorFormat.format(value) === "1") return "< 1,01×";
  return (value > 9999 ? value.toExponential(2).replace(".", ",") : factorFormat.format(value)) + "×";
}

function formatValue(value) {
  return valueFormat.format(value);
}

function selectEdition(item, focus = true) {
  edition = item;
  render(focus);
}

function progressMarkup(record, index) {
  return `<ol class="progress" aria-label="Ход выпуска">
    ${edition.questions.map((_, position) => {
      const done = position < record.guesses.length;
      const current = position === index;
      const number = String(position + 1).padStart(2, "0");
      return `<li class="${done ? "done" : ""} ${current ? "active" : ""}" ${current ? 'aria-current="step"' : ""}>
        <span>${number}</span>
        <span class="sr-only">${done ? "Отвечен" : current ? "Текущий вопрос" : "Впереди"}</span>
        ${done ? '<span aria-hidden="true">✓</span>' : ""}
      </li>`;
    }).join("")}
  </ol>`;
}

function render(focus = false) {
  const record = getRecord(edition);
  const position = record.guesses.length - Number(record.reveal);
  const finished = position === edition.questions.length;
  document.querySelector("#edition-label").textContent = "Выпуск № " + editionNumber(edition);
  const time = document.querySelector("#edition-date");
  time.textContent = dateLabel(edition.date);
  time.dateTime = edition.date;
  document.querySelector("#back-today").hidden = edition === currentEdition();
  document.querySelector("#release-note").textContent = currentEdition() === EDITIONS.at(-1)
    ? "Все выпуски доступны в архиве"
    : "Новые выпуски открываются в полночь по Москве";

  round.innerHTML = progressMarkup(record, position) + (finished ? summaryMarkup(record) : questionMarkup(position, record));
  if (focus) round.querySelector("h1").focus();
}

function questionMarkup(position, record) {
  const question = edition.questions[position];
  return `<article class="question">
    <div class="question-meta">
      <span>${question.topic}</span>
      <span>Вопрос ${position + 1} из ${edition.questions.length}</span>
    </div>
    <h1 tabindex="-1">${question.text}</h1>
    ${question.context ? `<p class="context">${question.context}</p>` : ""}
    ${record.reveal ? revealMarkup(question, record.guesses[position], position) : `
      <form id="guess-form" novalidate>
        <div class="form-label"><label for="guess">Ваша оценка</label></div>
        <div class="number-entry">
          <input type="text" id="guess" inputmode="decimal" maxlength="36" autocomplete="off" spellcheck="false" placeholder="Введите число" aria-describedby="guess-unit guess-error">
          <span id="guess-unit">${question.unit}</span>
        </div>
        <p id="guess-error" class="form-error" aria-live="polite"></p>
        <div class="actions">
          <button class="primary" type="submit">Ответить <span aria-hidden="true">→</span></button>
          <button class="secondary calc-button" type="button" data-dialog="calculator">
            <span class="calc-icon" aria-hidden="true"></span> Калькулятор
          </button>
        </div>
      </form>`}
  </article>`;
}

function revealMarkup(question, guess, position) {
  const factor = score(guess, question.answer);
  const direction = guess === question.answer ? "Точное попадание" :
    guess > question.answer ? "Ваша оценка выше" : "Ваша оценка ниже";
  const marker = 50 + Math.max(-48, Math.min(48, Math.log10(guess / question.answer) * 20));
  const edge = Math.abs(Math.log10(guess / question.answer)) > 2.4;
  return `<div class="reveal" role="region" aria-label="Результат ответа">
    ${comparisonMarkup(question, guess)}
    <div class="reveal-heading">
      <strong class="score">${formatFactor(factor)}</strong>
      <span>${direction}</span>
    </div>
    <div class="ruler" aria-hidden="true">
      <div class="ruler-track"><span class="ruler-center"></span><span class="ruler-marker ${edge ? "ruler-edge" : ""}" style="--marker: ${marker}%"></span></div>
      <div class="ruler-labels"><span>÷100</span><span>÷10</span><span>1×</span><span>×10</span><span>×100</span></div>
    </div>
    ${methodMarkup(question)}
    <button class="primary" type="button" id="next">${position + 1 < edition.questions.length ? "Следующий вопрос" : "Итог выпуска"} <span aria-hidden="true">→</span></button>
  </div>`;
}

function comparisonMarkup(question, guess) {
  return `<dl class="comparison">
    <div>
      <dt>Ваш ответ</dt>
      <dd><strong>${formatValue(guess)}</strong><span>${question.unit}</span></dd>
    </div>
    <div class="correct-answer">
      <dt>Правильный ответ</dt>
      <dd>
        <strong>${question.exact ? "" : "≈ "}${formatValue(question.answer)}</strong>
        <span>${question.unit}</span>
        <p class="answer-basis">${question.answerBasis}${question.answerSource
          ? ` <a href="${question.answerSource.url}" target="_blank" rel="noopener">${question.answerSource.label}</a>`
          : ""}</p>
      </dd>
    </div>
  </dl>`;
}

function methodMarkup(question) {
  const { assumption, steps, estimate } = question.method;
  const comparison = estimate === question.answer ? "Совпадает" :
    `${formatFactor(score(estimate, question.answer))} ${estimate > question.answer ? "выше" : "ниже"}`;
  return `<details class="method" open>
    <summary>Прикидка по методу Ферми</summary>
    <p>${assumption}</p>
    <dl class="method-steps">
      ${steps.map(([label, calculation]) => `<div><dt>${label}</dt><dd>${calculation}</dd></div>`).join("")}
      <div class="method-estimate"><dt>Итог прикидки</dt><dd>≈ ${formatValue(estimate)}<span class="method-unit">${question.unit}</span></dd></div>
      <div><dt>В сравнении с ответом</dt><dd>${comparison}</dd></div>
    </dl>
  </details>`;
}

function summaryMarkup(record) {
  return `<article class="question summary">
    <div class="question-meta"><span>3 из 3</span><span>Выпуск пройден</span></div>
    <h1 tabindex="-1">Ваш результат</h1>
    <p class="summary-score score">${formatFactor(average(edition, record.guesses))}</p>
    <p class="summary-caption">Средний множитель ошибки</p>
    <div class="summary-list">${edition.questions.map((question, position) => `
      <details class="summary-question">
        <summary><span>${question.text}</span><strong>${formatFactor(score(record.guesses[position], question.answer))}</strong></summary>
        ${comparisonMarkup(question, record.guesses[position])}
        ${methodMarkup(question)}
      </details>`).join("")}</div>
    <div class="actions">
      <button id="share" class="primary" type="button">Поделиться <span aria-hidden="true">↗</span></button>
      <button class="secondary" type="button" data-dialog="archive">Архив выпусков</button>
    </div>
    <p id="share-status" class="share-status" aria-live="polite"></p>
    <textarea id="share-text" class="share-text" aria-label="Текст результата" readonly hidden></textarea>
  </article>`;
}

function renderArchive() {
  const today = currentEdition();
  const released = EDITIONS.slice(0, EDITIONS.indexOf(today) + 1).reverse();
  document.querySelector("#archive-list").innerHTML = released.map((item) => {
    const record = getRecord(item);
    const answered = record.guesses.length;
    const progressLabel = answered === item.questions.length
      ? formatFactor(average(item, record.guesses))
      : answered ? `${answered} из ${item.questions.length}` : "Играть";
    return `<button class="archive-item" type="button" data-edition="${item.date}">
      <span><strong>Выпуск № ${editionNumber(item)}</strong><span>${dateLabel(item.date)}${item === today ? " · текущий" : ""}</span></span>
      <span>${progressLabel} <span aria-hidden="true">→</span></span>
    </button>`;
  }).join("");
}

function openDialog(id, trigger) {
  if (id === "archive") renderArchive();
  if (id === "calculator") {
    calcInput.value = "";
    calcStatus.textContent = "";
  }
  dialogTrigger = trigger;
  document.getElementById(id).showModal();
}

async function shareRound() {
  const record = getRecord(edition);
  const scores = record.guesses.map((guess, index) => formatFactor(score(guess, edition.questions[index].answer)));
  const lines = [
    `На глаз · Выпуск № ${editionNumber(edition)} · ${dateLabel(edition.date)}`,
    scores.join(" · "),
    `Итог ${formatFactor(average(edition, record.guesses))}`,
  ];
  if (location.protocol === "https:") {
    const url = new URL(location.href);
    url.search = "";
    url.hash = edition.date;
    lines.push(url.href);
  }
  const result = lines.join("\n");
  const status = document.querySelector("#share-status");
  const field = document.querySelector("#share-text");
  try {
    await navigator.clipboard.writeText(result);
    status.textContent = "Результат скопирован.";
  } catch {
    field.value = result;
    field.hidden = false;
    field.select();
    status.textContent = "Скопируйте выделенный результат.";
  }
}

function calculate(source) {
  const input = source.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-").replaceAll(",", ".").trim();
  const tokens = input.match(/\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+|[+*/()-]|\s+|./gi)?.filter((token) => !/^\s+$/.test(token)) ?? [];
  let index = 0;
  const peek = () => tokens[index];

  function atom() {
    const token = tokens[index++];
    if (token === "-") return -atom();
    if (token === "+") return atom();
    if (token === "(") {
      const value = expression();
      if (tokens[index++] !== ")") throw new Error("Закройте скобку.");
      return value;
    }
    if (!token || !/^\d|^\.\d/.test(token)) throw new Error("Проверьте выражение.");
    return Number(token);
  }

  function term() {
    let value = atom();
    while (peek() === "*" || peek() === "/") {
      const operator = tokens[index++];
      const next = atom();
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  }

  function expression() {
    let value = term();
    while (peek() === "+" || peek() === "-") {
      const operator = tokens[index++];
      const next = term();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  }

  const value = expression();
  if (index < tokens.length || !Number.isFinite(value)) throw new Error("Проверьте выражение и деление на ноль.");
  return Number(value.toPrecision(15));
}

document.querySelector("#calc-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    calcInput.value = String(calculate(calcInput.value)).replace(".", ",");
    calcStatus.textContent = "Готово.";
  } catch (error) {
    calcStatus.textContent = error.message;
  }
});

calcInput.addEventListener("input", () => { calcStatus.textContent = ""; });

document.addEventListener("submit", (event) => {
  if (event.target.id !== "guess-form") return;
  event.preventDefault();
  const input = document.querySelector("#guess");
  const guess = readGuess(input.value);
  if (!validGuess(guess)) {
    input.setAttribute("aria-invalid", "true");
    document.querySelector("#guess-error").textContent = Number.isNaN(guess) || guess <= 0
      ? "Введите положительное число."
      : "Число должно быть от 0,000000000001 до 10¹⁸.";
    input.focus();
    return;
  }
  const record = getRecord(edition);
  if (record.reveal || record.guesses.length >= edition.questions.length) return;
  saveRecord({ guesses: [...record.guesses, guess], reveal: true });
  render();
  round.querySelector(".reveal").setAttribute("tabindex", "-1");
  round.querySelector(".reveal").focus();
});

round.addEventListener("input", (event) => {
  if (event.target.id === "guess") {
    event.target.removeAttribute("aria-invalid");
    document.querySelector("#guess-error").textContent = "";
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.dialog) openDialog(button.dataset.dialog, button);
  if (button.hasAttribute("data-close")) button.closest("dialog").close();
  if (button.dataset.edition) {
    archive.close();
    selectEdition(EDITIONS.find((item) => item.date === button.dataset.edition));
  }
  if (button.id === "home" || button.id === "back-today") selectEdition(currentEdition());
  if (button.id === "next") {
    saveRecord({ ...getRecord(edition), reveal: false });
    render(true);
  }
  if (button.id === "share") void shareRound();
  const key = button.dataset.key;
  if (key) {
    const start = calcInput.selectionStart;
    const end = calcInput.selectionEnd;
    if (key === "clear") calcInput.value = "";
    else if (key === "back") calcInput.setRangeText("", start === end ? Math.max(0, start - 1) : start, end, "end");
    else if (calcInput.value.length - end + start < calcInput.maxLength) calcInput.setRangeText(key, start, end, "end");
    calcStatus.textContent = "";
    calcInput.focus();
  }
  if (button.id === "use-calculation") {
    try {
      const value = calculate(calcInput.value);
      if (!validGuess(value)) throw new Error("Для ответа нужно положительное число от 0,000000000001 до 10¹⁸.");
      calc.close();
      const guess = document.querySelector("#guess");
      guess.value = formatValue(value);
      guess.dispatchEvent(new Event("input", { bubbles: true }));
      guess.focus();
    } catch (error) {
      calcStatus.textContent = error.message;
    }
  }
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("close", () => {
    if (document.activeElement === document.body && dialogTrigger?.isConnected) dialogTrigger.focus();
  });
});

window.addEventListener("storage", (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  progress = readProgress();
  if (calc.open) calc.close();
  render();
  if (archive.open) renderArchive();
});

const linkedEdition = EDITIONS.find((item) => "#" + item.date === location.hash && item.date <= currentEdition().date);
selectEdition(linkedEdition ?? currentEdition(), false);
