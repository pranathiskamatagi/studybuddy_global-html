// A custom, in-app-styled date + time picker - replaces the browser's
// own native <input type="date">/<input type="time"> entirely. Those
// can't be restyled at all (the popup calendar/time list is drawn by
// the OS, completely outside CSS's reach) and edit by tiny individual
// segments that aren't obvious to click into - this is a real calendar
// grid and a real list of time slots, both built from plain HTML/CSS
// that actually matches the rest of the app, and both work with normal
// clicks.
//
// initDateTimePicker(containerId, onChange) - builds the whole widget
// inside the given (empty) container element, calling onChange(Date) or
// onChange(null) every time a full date+time is chosen or cleared.
// Returns { getValue, reset } for the caller's own validation/submit.
function initDateTimePicker(containerId, onChange) {
  const container = document.getElementById(containerId);
  container.className = 'dt-picker';
  container.innerHTML = `
    <button type="button" class="dt-picker-trigger" id="${containerId}-trigger">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>
      <span class="dt-picker-trigger-text" id="${containerId}-trigger-text">Pick a date and time</span>
    </button>
    <div class="dt-picker-panel" id="${containerId}-panel" hidden>
      <button type="button" class="dt-picker-close-btn" id="${containerId}-close" aria-label="Close">✕</button>
      <div class="dt-picker-cal-header">
        <button type="button" class="dt-picker-nav-btn" id="${containerId}-prev" aria-label="Previous month">‹</button>
        <p class="dt-picker-month-label" id="${containerId}-month-label"></p>
        <button type="button" class="dt-picker-nav-btn" id="${containerId}-next" aria-label="Next month">›</button>
      </div>
      <div class="dt-picker-weekday-row">
        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
      </div>
      <div class="dt-picker-day-grid" id="${containerId}-day-grid"></div>
      <p class="dt-picker-time-label">Time</p>
      <div class="dt-picker-time-grid" id="${containerId}-time-grid"></div>
      <p class="dt-picker-custom-label">Or enter your own time</p>
      <div class="dt-picker-custom-time">
        <input type="number" min="1" max="12" placeholder="HH" class="dt-picker-custom-input" id="${containerId}-custom-hour" aria-label="Hour" />
        <span class="dt-picker-custom-colon">:</span>
        <input type="number" min="0" max="59" placeholder="MM" class="dt-picker-custom-input" id="${containerId}-custom-minute" aria-label="Minute" />
        <div class="dt-picker-ampm-toggle">
          <button type="button" class="dt-picker-ampm-btn" id="${containerId}-am-btn">AM</button>
          <button type="button" class="dt-picker-ampm-btn" id="${containerId}-pm-btn">PM</button>
        </div>
      </div>
      <button type="button" class="dt-picker-done-btn" id="${containerId}-done">Done</button>
    </div>
  `;

  const trigger = document.getElementById(`${containerId}-trigger`);
  const triggerText = document.getElementById(`${containerId}-trigger-text`);
  const panel = document.getElementById(`${containerId}-panel`);
  const monthLabel = document.getElementById(`${containerId}-month-label`);
  const dayGrid = document.getElementById(`${containerId}-day-grid`);
  const timeGrid = document.getElementById(`${containerId}-time-grid`);
  const prevBtn = document.getElementById(`${containerId}-prev`);
  const nextBtn = document.getElementById(`${containerId}-next`);
  const customHourInput = document.getElementById(`${containerId}-custom-hour`);
  const customMinuteInput = document.getElementById(`${containerId}-custom-minute`);
  const amBtn = document.getElementById(`${containerId}-am-btn`);
  const pmBtn = document.getElementById(`${containerId}-pm-btn`);
  const doneBtn = document.getElementById(`${containerId}-done`);
  const closeBtn = document.getElementById(`${containerId}-close`);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  let viewDate = new Date();
  viewDate.setDate(1);
  let selectedDay = null; // { year, month, day } - month is 0-11
  let selectedMinutes = null; // minutes since midnight, in steps of 30

  function formatTriggerText() {
    if (selectedDay === null || selectedMinutes === null) return 'Pick a date and time';
    const d = new Date(selectedDay.year, selectedDay.month, selectedDay.day);
    const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `${dateStr}, ${formatTime(selectedMinutes)}`;
  }

  function formatTime(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const period = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function emitChange() {
    triggerText.textContent = formatTriggerText();
    doneBtn.disabled = selectedDay === null || selectedMinutes === null;
    if (selectedDay === null || selectedMinutes === null) {
      onChange(null);
      return;
    }
    const d = new Date(selectedDay.year, selectedDay.month, selectedDay.day, Math.floor(selectedMinutes / 60), selectedMinutes % 60);
    onChange(d);
  }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    monthLabel.textContent = `${MONTH_NAMES[month]} ${year}`;

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dayGrid.innerHTML = '';
    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement('span');
      blank.className = 'dt-picker-day blank';
      dayGrid.appendChild(blank);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < today;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dt-picker-day';
      if (isPast) btn.classList.add('disabled');
      if (selectedDay && selectedDay.year === year && selectedDay.month === month && selectedDay.day === day) {
        btn.classList.add('selected');
      }
      if (cellDate.getTime() === today.getTime()) btn.classList.add('today');
      btn.textContent = day;
      btn.disabled = isPast;
      btn.addEventListener('click', (event) => {
        // renderCalendar() below rebuilds the whole day grid (including
        // THIS button) while this very click is still bubbling up toward
        // document's own "click outside closes the panel" listener -
        // stopping it here means that listener never sees this click at
        // all, instead of seeing a detached button and wrongly treating
        // it as a click outside the widget (which was closing the panel
        // the instant any day was picked).
        event.stopPropagation();
        selectedDay = { year, month, day };
        renderCalendar();
        emitChange();
      });
      dayGrid.appendChild(btn);
    }
  }

  function renderTimeGrid() {
    timeGrid.innerHTML = '';
    // Every 30 minutes, 7:00 AM - 10:30 PM - a real study-session range,
    // without turning into an unusably long scroll list.
    for (let totalMin = 7 * 60; totalMin <= 22 * 60 + 30; totalMin += 30) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dt-picker-time-slot';
      if (selectedMinutes === totalMin) btn.classList.add('selected');
      btn.textContent = formatTime(totalMin);
      btn.addEventListener('click', (event) => {
        // Same reasoning as the day grid above - renderTimeGrid()
        // rebuilds this very button mid-click, which would otherwise
        // read as a click outside the widget to document's listener.
        event.stopPropagation();
        selectedMinutes = totalMin;
        // Keep the custom fields in sync too, so clicking a slot then
        // nudging the minute by hand starts from the right place.
        const h = Math.floor(totalMin / 60);
        customPeriod = h < 12 ? 'AM' : 'PM';
        customHourInput.value = h % 12 === 0 ? 12 : h % 12;
        customMinuteInput.value = String(totalMin % 60).padStart(2, '0');
        amBtn.classList.toggle('selected', customPeriod === 'AM');
        pmBtn.classList.toggle('selected', customPeriod === 'PM');
        renderTimeGrid();
        emitChange();
      });
      timeGrid.appendChild(btn);
    }
  }

  // A typed, exact time (9:15, 2:47, ...) alongside the quick-pick slots
  // above - the slots cover the common cases fast, but a real session
  // sometimes needs a specific minute a 30-minute grid can't offer.
  let customPeriod = null; // 'AM' | 'PM' | null

  function applyCustomTime() {
    const hour = parseInt(customHourInput.value, 10);
    const minute = parseInt(customMinuteInput.value, 10);
    if (!customPeriod || isNaN(hour) || hour < 1 || hour > 12 || isNaN(minute) || minute < 0 || minute > 59) {
      return; // incomplete - wait for all three parts before treating this as a real choice
    }
    const hour24 = customPeriod === 'AM' ? (hour % 12) : (hour % 12) + 12;
    selectedMinutes = hour24 * 60 + minute;
    renderTimeGrid(); // reflects the new selection if it happens to match a slot, clears the rest
    emitChange();
  }

  customHourInput.addEventListener('input', applyCustomTime);
  customMinuteInput.addEventListener('input', applyCustomTime);
  amBtn.addEventListener('click', () => {
    customPeriod = 'AM';
    amBtn.classList.add('selected');
    pmBtn.classList.remove('selected');
    applyCustomTime();
  });
  pmBtn.addEventListener('click', () => {
    customPeriod = 'PM';
    pmBtn.classList.add('selected');
    amBtn.classList.remove('selected');
    applyCustomTime();
  });

  prevBtn.addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderCalendar();
  });
  nextBtn.addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderCalendar();
  });

  trigger.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  // A real, explicit way to close the panel once a real choice has been
  // made - the day/time buttons themselves used to close it accidentally
  // (see their own stopPropagation comments above), so there was no
  // reliable way to close it on PURPOSE either. Only allows closing once
  // both a day and a time are actually picked - an incomplete pick isn't
  // "done" yet.
  doneBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (selectedDay === null || selectedMinutes === null) return;
    panel.hidden = true;
  });

  // A plain, always-available way to back out without picking anything -
  // unlike Done above, this doesn't require a day/time to already be
  // selected.
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.hidden = true;
  });

  // Clicking anywhere outside the whole widget closes the panel - same
  // dropdown-style behavior as every other overlay in this app.
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) panel.hidden = true;
  });

  renderCalendar();
  renderTimeGrid();
  doneBtn.disabled = true; // nothing picked yet

  return {
    getValue() {
      if (selectedDay === null || selectedMinutes === null) return null;
      return new Date(selectedDay.year, selectedDay.month, selectedDay.day, Math.floor(selectedMinutes / 60), selectedMinutes % 60);
    },
    reset() {
      selectedDay = null;
      selectedMinutes = null;
      viewDate = new Date();
      viewDate.setDate(1);
      renderCalendar();
      renderTimeGrid();
      triggerText.textContent = 'Pick a date and time';
      doneBtn.disabled = true;
    },
  };
}
