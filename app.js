(() => {
  'use strict';

  const STORAGE_KEY = 'fit90Journal.v1';
  const THEME_STORAGE_KEY = 'fit90Journal.theme';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function shiftDate(dateKey, days) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + days);
    return localDateKey(date);
  }

  function formatDate(dateKey, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!dateKey) return '—';
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', options).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function numberFormat(value, maximumFractionDigits = 1) {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits }).format(Number(value) || 0);
  }

  function makeId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const defaultProfile = () => ({
    age: 20,
    height: 180,
    startingWeight: 68.5,
    startDate: localDateKey(),
    calories: 2400,
    protein: 115
  });

  function emptyState() {
    return { profile: defaultProfile(), measurements: [], sessions: [], habits: {}, plannedSessions: [], customWorkouts: [], restTimerSeconds: 90, timerSound: true };
  }

  function isValidCustomWorkout(workout) {
    return Boolean(workout && typeof workout.id === 'string' && typeof workout.name === 'string' && Array.isArray(workout.exercises) && workout.exercises.length > 0 && workout.exercises.every(exercise => typeof exercise.name === 'string' && Number.isInteger(exercise.sets) && typeof exercise.reps === 'string'));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      return {
        profile: { ...defaultProfile(), ...(parsed.profile || {}) },
        measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        habits: parsed.habits && typeof parsed.habits === 'object' ? parsed.habits : {},
        plannedSessions: Array.isArray(parsed.plannedSessions) ? parsed.plannedSessions.filter(item => item && typeof item.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.workoutId === 'string') : [],
        customWorkouts: Array.isArray(parsed.customWorkouts) ? parsed.customWorkouts.filter(isValidCustomWorkout) : [],
        restTimerSeconds: Number.isInteger(parsed.restTimerSeconds) && parsed.restTimerSeconds >= 15 && parsed.restTimerSeconds <= 600 ? parsed.restTimerSeconds : 90,
        timerSound: parsed.timerSound !== false
      };
    } catch (error) {
      console.warn('Could not read saved Fit90 data:', error);
      return emptyState();
    }
  }

  let state = loadState();
  let toastTimer;
  let restTimerRemaining = state.restTimerSeconds;
  let restTimerDeadline = 0;
  let restTimerInterval = null;
  let restTimerState = 'ready';
  let restTimerAudioContext = null;
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedCalendarDate = localDateKey();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error('Could not save Fit90 data:', error);
      showToast('Could not save data. Export a backup or check browser storage settings.');
      return false;
    }
  }

  const workouts = {
    A: {
      id: 'A', code: 'A', name: 'Full Body A', type: 'FOUNDATION · FULL BODY', phase: 'foundation',
      description: 'Practise the core movement patterns with controlled, comfortable weights.', duration: '45–60 min', focus: 'Full body',
      exercises: [
        { name: 'Leg press', target: 'Quads, glutes', sets: 2, reps: '8–12', cue: 'Keep your back supported; knees track with toes.' },
        { name: 'Machine chest press', target: 'Chest, triceps', sets: 2, reps: '8–12', cue: 'Use a comfortable range and lower the weight slowly.' },
        { name: 'Lat pulldown', target: 'Lats, upper back', sets: 2, reps: '8–12', cue: 'Pull to the upper chest without swinging.' },
        { name: 'Seated leg curl', target: 'Hamstrings', sets: 2, reps: '10–15', cue: 'Move smoothly; do not let the weight stack slam.' },
        { name: 'Seated cable row', target: 'Mid-back, biceps', sets: 2, reps: '8–12', cue: 'Stay tall and pull toward your lower ribs.' },
        { name: 'Dumbbell lateral raise', target: 'Side shoulders', sets: 2, reps: '12–15', cue: 'Use light weights and avoid shrugging.' },
        { name: 'Dumbbell biceps curl', target: 'Biceps', sets: 1, reps: '10–15', cue: 'Keep your elbows fairly still.' },
        { name: 'Dead bug', target: 'Core', sets: 2, reps: '6–8 / side', cue: 'Move slowly while keeping your trunk stable.' }
      ]
    },
    B: {
      id: 'B', code: 'B', name: 'Full Body B', type: 'FOUNDATION · FULL BODY', phase: 'foundation',
      description: 'Build balanced strength through a second set of beginner-friendly movements.', duration: '45–60 min', focus: 'Full body',
      exercises: [
        { name: 'Goblet squat to bench', target: 'Quads, glutes', sets: 2, reps: '8–12', cue: 'Use a stable posture and comfortable depth.' },
        { name: 'Incline machine chest press', target: 'Chest, shoulders, triceps', sets: 2, reps: '8–12', cue: 'Press smoothly without forcing the range.' },
        { name: 'Chest-supported row', target: 'Back, biceps', sets: 2, reps: '8–12', cue: 'Keep your chest supported; do not jerk the load.' },
        { name: 'Glute bridge', target: 'Glutes', sets: 2, reps: '10–15', cue: 'Extend the hips without arching your lower back.' },
        { name: 'Neutral-grip lat pulldown', target: 'Lats, biceps', sets: 2, reps: '8–12', cue: 'Pull toward your upper chest with control.' },
        { name: 'Calf raise', target: 'Calves', sets: 2, reps: '12–20', cue: 'Pause at the top and lower slowly.' },
        { name: 'Rope triceps pushdown', target: 'Triceps', sets: 1, reps: '10–15', cue: 'Keep elbows close to your body.' },
        { name: 'Plank', target: 'Core', sets: 2, reps: '20–40 sec', cue: 'Keep your hips and shoulders aligned.' }
      ]
    },
    UA: {
      id: 'UA', code: 'U1', name: 'Upper Body A', type: 'BUILD · UPPER BODY', phase: 'later',
      description: 'Build pressing and pulling strength with balanced upper-body work.', duration: '45–60 min', focus: 'Chest and back',
      exercises: [
        { name: 'Machine chest press', target: 'Chest, triceps', sets: 3, reps: '6–10', cue: 'Use stable technique and a pain-free range.' },
        { name: 'Lat pulldown', target: 'Lats, biceps', sets: 3, reps: '8–12', cue: 'Avoid swinging your torso.' },
        { name: 'Seated cable row', target: 'Mid-back', sets: 3, reps: '8–12', cue: 'Pull smoothly toward the lower ribs.' },
        { name: 'Dumbbell lateral raise', target: 'Side shoulders', sets: 2, reps: '12–20', cue: 'Use a controlled arc, not momentum.' },
        { name: 'Biceps curl', target: 'Biceps', sets: 2, reps: '10–15', cue: 'Keep your upper arms still.' },
        { name: 'Rope triceps pushdown', target: 'Triceps', sets: 2, reps: '10–15', cue: 'Avoid swinging the shoulders.' }
      ]
    },
    LA: {
      id: 'LA', code: 'L1', name: 'Lower Body A', type: 'BUILD · LOWER BODY', phase: 'later',
      description: 'Train legs, hamstrings, glutes, calves and trunk stability.', duration: '40–55 min', focus: 'Legs and glutes',
      exercises: [
        { name: 'Leg press', target: 'Quads, glutes', sets: 3, reps: '8–12', cue: 'Keep your pelvis and back supported.' },
        { name: 'Seated leg curl', target: 'Hamstrings', sets: 3, reps: '10–15', cue: 'Lower the weight without letting it slam.' },
        { name: 'Glute bridge / hip thrust', target: 'Glutes', sets: 3, reps: '8–12', cue: 'Finish with the hips, not an arched back.' },
        { name: 'Calf raise', target: 'Calves', sets: 2, reps: '12–20', cue: 'Use full comfortable range.' },
        { name: 'Dead bug', target: 'Core', sets: 2, reps: '8 / side', cue: 'Keep each repetition slow and controlled.' }
      ]
    },
    UB: {
      id: 'UB', code: 'U2', name: 'Upper Body B', type: 'BUILD · UPPER BODY', phase: 'later',
      description: 'Reinforce upper-body strength and train rear shoulders for balance.', duration: '45–60 min', focus: 'Upper-body balance',
      exercises: [
        { name: 'Incline machine chest press', target: 'Upper chest, triceps', sets: 3, reps: '8–12', cue: 'Only use a comfortable shoulder range.' },
        { name: 'Chest-supported row', target: 'Mid-back, lats', sets: 3, reps: '8–12', cue: 'Keep your chest supported.' },
        { name: 'Neutral-grip lat pulldown', target: 'Lats, biceps', sets: 3, reps: '8–12', cue: 'Pull smoothly without leaning far back.' },
        { name: 'Reverse pec deck', target: 'Rear shoulders', sets: 2, reps: '12–15', cue: 'Keep shoulders down and movement controlled.' },
        { name: 'Dumbbell lateral raise', target: 'Side shoulders', sets: 2, reps: '12–20', cue: 'Use light weights and no body swing.' },
        { name: 'Biceps curl', target: 'Biceps', sets: 2, reps: '10–15', cue: 'Avoid swinging the weight.' },
        { name: 'Rope triceps pushdown', target: 'Triceps', sets: 2, reps: '10–15', cue: 'Keep elbows near your sides.' }
      ]
    },
    LB: {
      id: 'LB', code: 'L2', name: 'Lower Body B', type: 'BUILD · LOWER BODY', phase: 'later',
      description: 'Train the squat pattern, hips and hamstrings without chasing maximal loads.', duration: '40–55 min', focus: 'Legs and hips',
      exercises: [
        { name: 'Goblet squat / hack squat', target: 'Quads, glutes', sets: 3, reps: '8–12', cue: 'Keep the range comfortable and stable.' },
        { name: 'Dumbbell Romanian deadlift', target: 'Hamstrings, glutes', sets: 2, reps: '8–10', cue: 'Learn the hip hinge with a trainer before loading.' },
        { name: 'Leg extension', target: 'Quads', sets: 2, reps: '10–15', cue: 'Extend smoothly; avoid kicking the weight.' },
        { name: 'Seated leg curl', target: 'Hamstrings', sets: 2, reps: '10–15', cue: 'Keep hips supported and return slowly.' },
        { name: 'Calf raise', target: 'Calves', sets: 2, reps: '12–20', cue: 'Pause and lower under control.' },
        { name: 'Plank', target: 'Core', sets: 2, reps: '20–45 sec', cue: 'Keep hips from sagging or rising.' }
      ]
    }
  };

  function findWorkout(workoutId) {
    return workouts[workoutId] || state.customWorkouts.find(workout => workout.id === workoutId) || null;
  }

  function parseLoggedLoad(value) {
    const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const pounds = /^lb/i.test(match[2] || '');
    return { kg: pounds ? amount / 2.2046226218 : amount, source: `${numberFormat(amount, 2)} ${pounds ? 'lb' : 'kg'}` };
  }

  function parseLoggedReps(value) {
    const text = String(value ?? '').trim();
    if (!text || !/^\d+(?:[\s,;/]+\d+)*$/.test(text)) return [];
    const reps = text.split(/[\s,;/]+/).map(Number);
    return reps.every(count => Number.isInteger(count) && count >= 1 && count <= 100) ? reps : [];
  }

  function getProgressiveOverloadSuggestion(exerciseName, prescribedSets, repTarget) {
    const targetNumbers = String(repTarget || '').match(/\d+/g);
    if (!targetNumbers?.length) return '';
    const topOfRange = Number(targetNumbers[targetNumbers.length - 1]);
    const recent = state.sessions.map(session => ({
      session,
      exercise: (session.exercises || []).find(item => String(item.name || '').toLocaleLowerCase() === exerciseName.toLocaleLowerCase())
    })).filter(item => item.exercise).sort((a, b) => String(b.session.date).localeCompare(String(a.session.date)) || String(b.session.createdAt).localeCompare(String(a.session.createdAt))).slice(0, 2);
    if (recent.length < 2) return '';
    const performances = recent.map(item => ({ load: parseLoggedLoad(item.exercise.load), reps: parseLoggedReps(item.exercise.reps) }));
    const [latest, previous] = performances;
    const targetReached = performance => performance.load && performance.reps.length === prescribedSets && performance.reps.every(reps => reps >= topOfRange);
    if (!targetReached(latest) || !targetReached(previous) || Math.abs(latest.load.kg - previous.load.kg) > 0.01) return '';
    return `Your last two logged sessions reached ${topOfRange} reps at ${numberFormat(latest.load.kg, 1)} kg for every recorded set. If technique stayed controlled, you had 2–4 reps in reserve, and there was no pain, consider the smallest available load increase next time. Otherwise, repeat this load.`;
  }

  function renderProgressiveOverloadHints() {
    $$('[data-overload-hint]').forEach(hint => {
      const row = hint.closest('.session-exercise-row');
      const substitute = String($('.session-substitution input', row)?.value || '').trim();
      const exerciseName = substitute || hint.dataset.exerciseName;
      const suggestion = getProgressiveOverloadSuggestion(exerciseName, Number(hint.dataset.sets), hint.dataset.repTarget);
      hint.textContent = suggestion || 'No increase suggested yet. Two same-load sessions with every logged set at the top of the rep range are required.';
      hint.classList.toggle('has-suggestion', Boolean(suggestion));
    });
  }

  function weekStart(dateKey) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return localDateKey(date);
  }

  const meals = [
    { icon: '☀', time: 'BEFORE TRAINING', name: 'Quick pre-workout', description: '1 medium banana and water. Optional if you prefer training without food.', calories: '≈ 100 kcal', protein: '≈ 1 g protein' },
    { icon: '◒', time: 'POST-WORKOUT BREAKFAST', name: 'Eggs, oats and milk', description: '2 eggs + 50 g dry oats + 250 ml milk. Boil the eggs or use minimal oil.', calories: '≈ 450–500 kcal', protein: '≈ 25–27 g protein' },
    { icon: '◈', time: 'LUNCH', name: 'Rice, dal, soy and vegetables', description: '200 g cooked rice + 200 g cooked dal + curry with 25 g dry soy chunks + 150 g vegetables + about 1 tsp oil.', calories: '≈ 600–700 kcal', protein: '≈ 30–35 g protein' },
    { icon: '◉', time: 'AFTERNOON SNACK', name: 'Roasted chana, curd and fruit', description: '40 g roasted chana + 150 g curd + 1 seasonal fruit.', calories: '≈ 300–330 kcal', protein: '≈ 12–14 g protein' },
    { icon: '◧', time: 'DINNER', name: 'Roti, dal, soy and vegetables', description: '3 medium rotis made from about 90 g dry atta + 150 g cooked dal + 25 g dry soy chunks + 150 g vegetables.', calories: '≈ 600–700 kcal', protein: '≈ 30–35 g protein' },
    { icon: '◯', time: 'EXTRA SERVING', name: 'Plain milk', description: '250 ml milk with a meal or in the evening. Skip or swap it if dairy does not suit you.', calories: '≈ 150 kcal', protein: '≈ 8 g protein' }
  ];

  const viewMeta = {
    dashboard: { title: 'Dashboard', eyebrow: 'YOUR OVERVIEW' },
    workouts: { title: 'Training plan', eyebrow: 'MOVE WITH PURPOSE' },
    nutrition: { title: 'Nutrition', eyebrow: 'FUEL THE WORK' },
    progress: { title: 'Progress log', eyebrow: 'TRACK THE TREND' },
    habits: { title: 'Daily habits', eyebrow: 'CONSISTENCY SYSTEM' },
    settings: { title: 'My settings', eyebrow: 'PERSONAL SETUP' }
  };

  function getProgramDay() {
    const start = new Date(`${state.profile.startDate}T00:00:00`);
    const now = new Date(`${localDateKey()}T00:00:00`);
    if (Number.isNaN(start.getTime())) return 1;
    const elapsed = Math.floor((now - start) / 86400000);
    return Math.max(1, elapsed + 1);
  }

  function getPhase(day = getProgramDay()) {
    if (day <= 30) return { number: 1, name: 'Foundation', range: 'Days 1–30', short: 'FOUNDATION' };
    if (day <= 60) return { number: 2, name: 'Build strength', range: 'Days 31–60', short: 'BUILD STRENGTH' };
    if (day <= 90) return { number: 3, name: 'Refine', range: 'Days 61–90', short: 'OPTIMIZATION' };
    return { number: 3, name: '90 days complete', range: 'Day 90+', short: 'PLAN COMPLETE' };
  }

  function getTodayPlan() {
    const day = getProgramDay();
    if (day > 90) return { type: 'complete', title: '90-day plan complete', description: 'Review your results and set the next realistic goal.', duration: 'Weekly review', focus: 'Review and plan' };
    let slot;
    if (day <= 30) {
      slot = (day - 1) % 7;
      const schedule = [
        { type: 'workout', id: 'A' }, { type: 'recovery' }, { type: 'workout', id: 'B' }, { type: 'rest' }, { type: 'workout', id: 'A' }, { type: 'walk' }, { type: 'rest' }
      ];
      return planFromSlot(schedule[slot]);
    }
    const phaseStartDay = day <= 60 ? 31 : 61;
    slot = (day - phaseStartDay) % 7;
    const schedule = [
      { type: 'workout', id: 'UA' }, { type: 'workout', id: 'LA' }, { type: 'recovery' }, { type: 'workout', id: 'UB' }, { type: 'workout', id: 'LB' }, { type: 'walk' }, { type: 'rest' }
    ];
    return planFromSlot(schedule[slot]);
  }

  function planFromSlot(slot) {
    if (slot.type === 'workout') return { type: 'workout', workoutId: slot.id, ...workouts[slot.id] };
    const plans = {
      recovery: { type: 'recovery', code: '↺', title: 'Active recovery', description: 'Take an easy walk, move gently, and let soreness settle.', duration: '15–25 min', focus: 'Recovery', exercises: [] },
      walk: { type: 'walk', code: '↗', title: 'Easy walk', description: 'Walk at a pace that lets you speak in full sentences.', duration: '20–30 min', focus: 'General fitness', exercises: [] },
      rest: { type: 'rest', code: '○', title: 'Rest day', description: 'No gym session today. Eat, hydrate, sleep and recover.', duration: 'No workout needed', focus: 'Recovery', exercises: [] }
    };
    return plans[slot.type];
  }

  function setView(viewName) {
    if (!viewMeta[viewName]) viewName = 'dashboard';
    $$('.view').forEach(view => {
      const active = view.id === `view-${viewName}`;
      view.classList.toggle('active', active);
      view.hidden = !active;
    });
    $$('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.nav === viewName));
    $('#pageTitle').textContent = viewMeta[viewName].title;
    $('#pageEyebrow').textContent = viewMeta[viewName].eyebrow;
    closeMobileMenu();
    if (viewName === 'progress') renderProgress();
    if (viewName === 'habits') renderHabitForm();
    if (viewName === 'settings') renderSettingsForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function getInitialTheme() {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch (error) {
      console.warn('Could not read saved Fit90 theme:', error);
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme, persist = false) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    const toggle = $('#themeToggle');
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    toggle.title = `Switch to ${isDark ? 'light' : 'dark'} theme`;
    $('.theme-toggle-label', toggle).textContent = isDark ? 'Light mode' : 'Dark mode';
    $('span[aria-hidden="true"]', toggle).textContent = isDark ? '☼' : '◐';
    if (!persist) return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch (error) {
      console.warn('Could not save Fit90 theme:', error);
      showToast('Theme changed for this visit, but browser storage is unavailable.');
    }
  }

  function closeMobileMenu(returnFocus = false) {
    const sidebar = $('#sidebar');
    const menu = $('#mobileMenu');
    sidebar.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open navigation');
    $('#mobileNavBackdrop').hidden = true;
    if (returnFocus) menu.focus();
  }

  function latestMeasurement() {
    const sorted = [...state.measurements].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return sorted[0] || null;
  }

  function dailyHabit(date = localDateKey()) {
    return state.habits[date] || {};
  }

  function daysSinceStart() {
    return getProgramDay();
  }

  function renderDashboard() {
    const day = daysSinceStart();
    const phase = getPhase(day);
    const plan = getTodayPlan();
    const completedDay = Math.min(day, 90);
    const progressPercent = Math.min(100, Math.max(1, (completedDay / 90) * 100));
    const weight = latestMeasurement()?.weight ?? state.profile.startingWeight;
    const recentSessions = state.sessions.filter(session => session.date >= shiftDate(localDateKey(), -6) && session.date <= localDateKey()).length;
    const habits = dailyHabit();
    const habitKeys = ['train', 'protein', 'water', 'sleep', 'learn'];
    const habitCount = habitKeys.filter(key => Boolean(habits[key])).length;

    $('#todayDate').textContent = formatDate(localDateKey(), { weekday: 'short', month: 'short', day: 'numeric' });
    $('#heroDay').textContent = String(completedDay).padStart(2, '0');
    $('#heroRing').style.setProperty('--ring-progress', `${progressPercent}%`);
    $('#heroDaysLeft').textContent = day > 90 ? 'Mission complete' : `${90 - day} days to go`;
    $('#heroStartCaption').textContent = day === 1 ? 'Your first day starts now.' : day > 90 ? 'Time to plan what comes next.' : `Started ${formatDate(state.profile.startDate, { month: 'short', day: 'numeric' })}. Keep going.`;
    $('#heroPhaseLabel').textContent = `PHASE 0${phase.number} · ${phase.short}`;
    $('#sideProgressLabel').textContent = `Day ${completedDay} / 90`;
    $('#sideProgressBar').style.width = `${progressPercent}%`;
    $('#footerDay').textContent = `DAY ${completedDay} / 90`;

    $('#statWeight').textContent = numberFormat(weight, 1);
    $('#statWeightFoot').textContent = latestMeasurement() ? `Last logged ${formatDate(latestMeasurement().date, { month: 'short', day: 'numeric' })}` : 'Starting point recorded in settings';
    $('#statProtein').textContent = numberFormat(state.profile.protein, 0);
    $('#statSessions').textContent = String(state.sessions.length);
    $('#statSessionsFoot').textContent = `${recentSessions} in the last 7 days`;
    $('#statCalories').textContent = numberFormat(state.profile.calories, 0);

    $('#todayDayLabel').textContent = day > 90 ? 'COMPLETE' : `DAY ${day}`;
    $('#todaySymbol').textContent = plan.code || '✓';
    $('#todayWorkoutTitle').textContent = plan.name || plan.title;
    $('#todayWorkoutDescription').textContent = plan.description;
    $('#todayDuration').textContent = plan.duration || '45–60 min';
    $('#todayFocus').textContent = plan.focus || 'Full body';
    $('#todayInstruction').textContent = plan.type === 'workout' ? 'Leave 3–4 good reps in reserve.' : plan.type === 'rest' ? 'Rest is part of the programme.' : 'Keep it easy; this is not another workout.';
    $('#todayExercisePreview').innerHTML = (plan.exercises || []).slice(0, 4).map(exercise => `<span class="exercise-chip">${escapeHtml(exercise.name)}</span>`).join('') || `<span class="exercise-chip">${plan.type === 'complete' ? 'Review measurements and plan ahead' : 'No gym session required'}</span>`;

    $('#habitCount').textContent = `${habitCount} / 5`;
    $('#habitProgressBar').style.width = `${habitCount / 5 * 100}%`;
    $$('[data-habit-check]').forEach(input => { input.checked = Boolean(habits[input.dataset.habitCheck]); });

    [1, 2, 3].forEach(number => {
      const card = $(`#phaseCard${number}`);
      card.classList.toggle('phase-current', number === phase.number && day <= 90);
      const tag = $('.phase-tag', card);
      if (number < phase.number) tag.textContent = 'COMPLETED WINDOW';
      else if (number === phase.number && day <= 90) tag.textContent = 'CURRENT PHASE';
      else if (day > 90) tag.textContent = number === 3 ? 'FINISHED' : 'COMPLETED';
      else tag.textContent = 'UP NEXT';
    });
    $('#workoutPhaseTitle').textContent = `Phase ${phase.number}`;
    $('#workoutPhaseSub').textContent = `${phase.name} · ${phase.range}`;
  }

  function renderWorkoutCards() {
    const renderCard = workout => `
      <article class="workout-card" data-phase="${workout.phase}">
        <div class="workout-card-top"><span class="workout-code">${escapeHtml(workout.code)}</span><span class="workout-type">${escapeHtml(workout.type)}</span></div>
        <h4>${escapeHtml(workout.name)}</h4><p>${escapeHtml(workout.description)}</p>
        <div class="workout-exercise-count">${workout.exercises.length} exercises · ${escapeHtml(workout.duration)}</div>
        <div class="workout-exercise-preview">${workout.exercises.slice(0, 4).map(ex => `<span>${escapeHtml(ex.name)} <em>${ex.sets} × ${escapeHtml(ex.reps)}</em></span>`).join('')}${workout.exercises.length > 4 ? `<span>+ ${workout.exercises.length - 4} more <em></em></span>` : ''}</div>
        <button class="button button-dark" type="button" data-action="log-workout" data-workout="${workout.id}">Log this workout <span aria-hidden="true">↗</span></button>
      </article>`;
    $('#foundationWorkoutGrid').innerHTML = [workouts.A, workouts.B].map(renderCard).join('');
    $('#upperLowerWorkoutGrid').innerHTML = [workouts.UA, workouts.LA, workouts.UB, workouts.LB].map(renderCard).join('');
    $('#customWorkoutGrid').innerHTML = state.customWorkouts.length ? state.customWorkouts.map(workout => `
      <article class="custom-workout-item"><div><strong>${escapeHtml(workout.name)}</strong><span>${workout.exercises.length} exercises</span></div>
        <div class="custom-workout-actions"><button class="button button-dark button-small" type="button" data-action="log-workout" data-workout="${escapeHtml(workout.id)}">Log session</button><button class="table-action" type="button" data-action="delete-custom-workout" data-workout="${escapeHtml(workout.id)}">Delete</button></div>
      </article>`).join('') : '<p class="empty-state">Your custom templates will appear here.</p>';
  }

  function getLoggedExerciseEntries() {
    return state.sessions.flatMap(session => (session.exercises || []).map(exercise => ({
      name: String(exercise.name || '').trim(),
      date: String(session.date || ''),
      load: parseLoggedLoad(exercise.load),
      reps: parseLoggedReps(exercise.reps)
    })).filter(entry => entry.name && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)));
  }

  function renderPersonalRecords(entries = getLoggedExerciseEntries()) {
    const records = new Map();
    entries.forEach(entry => {
      const key = entry.name.toLocaleLowerCase();
      const record = records.get(key) || { name: entry.name, load: null, reps: 0, sessions: new Set() };
      if (entry.load && (!record.load || entry.load.kg > record.load.kg)) record.load = { ...entry.load, date: entry.date };
      if (entry.reps.length) record.reps = Math.max(record.reps, ...entry.reps);
      if (entry.load || entry.reps.length) record.sessions.add(entry.date);
      records.set(key, record);
    });
    const ranked = [...records.values()].filter(record => record.load || record.reps).sort((a, b) => a.name.localeCompare(b.name));
    $('#personalRecords').innerHTML = ranked.length ? ranked.map(record => `
      <div class="record-row"><strong>${escapeHtml(record.name)}</strong><span>${record.load ? `Best load ${numberFormat(record.load.kg, 1)} kg` : 'No numeric load logged'}${record.reps ? ` · Best reps ${record.reps}` : ''}</span><small>${record.sessions.size} logged date${record.sessions.size === 1 ? '' : 's'}</small></div>`).join('') : '<p class="empty-state">No records yet. Add numeric reps and loads to a workout log; bodyweight and free-text loads are not ranked.</p>';
  }

  function renderStrengthProgression(entries = getLoggedExerciseEntries()) {
    const select = $('#strengthExerciseSelect');
    const previous = select.value;
    const names = [...new Map(entries.filter(entry => entry.load).map(entry => [entry.name.toLocaleLowerCase(), entry.name])).values()].sort((a, b) => a.localeCompare(b));
    select.innerHTML = names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    if (!names.length) {
      $('#strengthProgressChart').innerHTML = '<p class="empty-state">Log a numeric load for an exercise to see weekly progression. Free-text and bodyweight entries are kept in your workout history.</p>';
      return;
    }
    select.value = names.includes(previous) ? previous : names[0];
    const matching = entries.filter(entry => entry.name.toLocaleLowerCase() === select.value.toLocaleLowerCase() && entry.load);
    const weeks = new Map();
    matching.forEach(entry => {
      const start = weekStart(entry.date);
      const current = weeks.get(start);
      if (!current || entry.load.kg > current.load.kg) weeks.set(start, { load: entry.load, date: entry.date, reps: entry.reps });
    });
    const progression = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
    const maximum = Math.max(...progression.map(([, value]) => value.load.kg));
    $('#strengthProgressChart').innerHTML = `<p class="progression-note">${progression.length} week${progression.length === 1 ? '' : 's'} with logged loads · shown in kg (lb entries converted)</p>${progression.map(([week, value]) => `
      <div class="strength-week-row"><div class="strength-week-label"><span>Week of ${escapeHtml(formatDate(week, { month: 'short', day: 'numeric' }))}</span><strong>${numberFormat(value.load.kg, 1)} kg</strong></div><div class="strength-bar-track" role="img" aria-label="${escapeHtml(formatDate(week))}: best logged load ${numberFormat(value.load.kg, 1)} kilograms"><span style="width:${Math.max(4, value.load.kg / maximum * 100)}%"></span></div><small>Logged ${escapeHtml(formatDate(value.date, { month: 'short', day: 'numeric' }))}${value.reps.length ? ` · ${value.reps.join(', ')} reps` : ''}</small></div>`).join('')}`;
  }

  function renderCalendar() {
    const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(calendarCursor);
    $('#calendarMonth').textContent = monthLabel;
    const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(name => `<span class="calendar-weekday" role="columnheader">${name}</span>`).join('');
    const firstDay = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
    const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - firstDay.getDay());
    const cells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const dateKey = localDateKey(date);
      const inMonth = date.getMonth() === calendarCursor.getMonth();
      const completed = state.sessions.filter(session => session.date === dateKey);
      const planned = state.plannedSessions.filter(session => session.date === dateKey);
      const events = [
        ...completed.map(session => `<div class="calendar-entry is-completed"><span>${escapeHtml(session.name || 'Workout')}</span><small>Completed</small></div>`),
        ...planned.map(session => `<div class="calendar-entry is-planned"><span>${escapeHtml(findWorkout(session.workoutId)?.name || session.name || 'Workout')}</span><button type="button" data-action="delete-planned-session" data-id="${escapeHtml(session.id)}" aria-label="Remove planned session ${escapeHtml(findWorkout(session.workoutId)?.name || session.name || 'workout')} on ${escapeHtml(formatDate(dateKey))}">×</button></div>`)
      ].join('');
      return `<div class="calendar-day${inMonth ? '' : ' is-outside'}${dateKey === localDateKey() ? ' is-today' : ''}${dateKey === selectedCalendarDate ? ' is-selected' : ''}" role="gridcell"><button class="calendar-date" type="button" data-action="select-calendar-date" data-date="${dateKey}"${dateKey === localDateKey() ? ' aria-current="date"' : ''} aria-pressed="${dateKey === selectedCalendarDate}">${date.getDate()}</button><div class="calendar-events">${events || '<span class="calendar-empty-mark" aria-hidden="true">·</span>'}</div></div>`;
    }).join('');
    $('#calendarGrid').innerHTML = headers + cells;
  }

  function renderPlannedWorkoutOptions() {
    const select = $('#plannedWorkoutSelect');
    const selected = select.value;
    const available = [...Object.values(workouts), ...state.customWorkouts];
    select.innerHTML = available.map(workout => `<option value="${escapeHtml(workout.id)}">${escapeHtml(workout.name)}</option>`).join('');
    if (available.some(workout => workout.id === selected)) select.value = selected;
  }

  function renderWorkoutEnhancements() {
    renderPersonalRecords();
    renderStrengthProgression();
    renderPlannedWorkoutOptions();
    renderCalendar();
    const dateInput = $('#plannedSessionDate');
    if (!dateInput.value) dateInput.value = selectedCalendarDate;
    $('#restTimerDuration').value = state.restTimerSeconds;
    $('#restTimerSound').checked = state.timerSound;
    renderRestTimer();
  }

  function renderRestTimer() {
    const seconds = Math.max(0, Math.ceil(restTimerRemaining));
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secondsText = String(seconds % 60).padStart(2, '0');
    $('#restTimerDisplay').textContent = `${minutesText}:${secondsText}`;
    $('#restTimerDisplay').setAttribute('aria-label', `Rest timer, ${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`);
    $('#restTimerStart').disabled = restTimerState === 'running';
    $('#restTimerPause').disabled = restTimerState !== 'running';
    $('#restTimerDuration').disabled = restTimerState === 'running';
    $('#restTimerStatus').textContent = restTimerState === 'running' ? 'Timer running.' : restTimerState === 'paused' ? 'Timer paused.' : restTimerState === 'complete' ? 'Rest interval complete.' : 'Ready when you are.';
  }

  function startRestTimer() {
    if (restTimerInterval) return;
    if (restTimerRemaining <= 0) restTimerRemaining = state.restTimerSeconds;
    primeTimerSound();
    restTimerState = 'running';
    restTimerDeadline = Date.now() + restTimerRemaining * 1000;
    restTimerInterval = window.setInterval(() => {
      restTimerRemaining = Math.max(0, (restTimerDeadline - Date.now()) / 1000);
      if (restTimerRemaining <= 0) {
        window.clearInterval(restTimerInterval);
        restTimerInterval = null;
        restTimerState = 'complete';
        if (state.timerSound) playTimerSound();
        showToast('Rest timer complete.');
      }
      renderRestTimer();
    }, 200);
    renderRestTimer();
  }

  function pauseRestTimer() {
    if (!restTimerInterval) return;
    restTimerRemaining = Math.max(0, (restTimerDeadline - Date.now()) / 1000);
    window.clearInterval(restTimerInterval);
    restTimerInterval = null;
    restTimerState = restTimerRemaining > 0 ? 'paused' : 'complete';
    renderRestTimer();
  }

  function resetRestTimer() {
    if (restTimerInterval) window.clearInterval(restTimerInterval);
    restTimerInterval = null;
    restTimerRemaining = state.restTimerSeconds;
    restTimerState = 'ready';
    renderRestTimer();
  }

  function playTimerSound() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      const context = restTimerAudioContext && restTimerAudioContext.state !== 'closed' ? restTimerAudioContext : new AudioContext();
      restTimerAudioContext = context;
      if (context.state === 'suspended') context.resume().catch(() => {});
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.46);
    } catch (error) {
      console.warn('Could not play the rest timer sound:', error);
    }
  }

  function primeTimerSound() {
    if (!state.timerSound || restTimerAudioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      restTimerAudioContext = new AudioContext();
      if (restTimerAudioContext.state === 'suspended') restTimerAudioContext.resume().catch(() => {});
    } catch (error) {
      console.warn('Could not prepare the rest timer sound:', error);
    }
  }

  function saveRestTimerDuration() {
    const seconds = Number($('#restTimerDuration').value);
    if (!Number.isInteger(seconds) || seconds < 15 || seconds > 600) {
      $('#restTimerDuration').value = state.restTimerSeconds;
      showToast('Choose a rest interval from 15 to 600 seconds.');
      return;
    }
    state.restTimerSeconds = seconds;
    restTimerRemaining = seconds;
    restTimerState = 'ready';
    saveState();
    renderRestTimer();
  }

  function renderMeals() {
    $('#mealList').innerHTML = meals.map(meal => `
      <article class="meal-card">
        <div class="meal-symbol" aria-hidden="true">${escapeHtml(meal.icon)}</div>
        <div class="meal-info"><span class="meal-time">${escapeHtml(meal.time)}</span><h4>${escapeHtml(meal.name)}</h4><p>${escapeHtml(meal.description)}</p></div>
        <div class="meal-numbers"><strong>${escapeHtml(meal.calories)}</strong><span>${escapeHtml(meal.protein)}</span></div>
      </article>`).join('');
    $('#nutritionCalories').textContent = numberFormat(state.profile.calories, 0);
    $('#nutritionProtein').textContent = numberFormat(state.profile.protein, 0);
    $('#proteinMacroBar').style.width = `${Math.min(100, (state.profile.protein / 150) * 100)}%`;
  }

  function renderSettingsForm() {
    const form = $('#settingsForm');
    const p = state.profile;
    ['age', 'height', 'startingWeight', 'startDate', 'calories', 'protein'].forEach(key => {
      if (form.elements[key]) form.elements[key].value = p[key] ?? '';
    });
    $('#settingsCalorieNote').textContent = `${numberFormat(p.calories, 0)} kcal`;
    $('#settingsProteinNote').textContent = `${numberFormat(p.protein, 0)} g protein`;
  }

  function renderHabitForm() {
    const date = localDateKey();
    const habits = dailyHabit(date);
    const form = $('#habitForm');
    if (!form) return;
    ['train', 'protein', 'water', 'sleep', 'log', 'learn'].forEach(key => { form.elements[key].checked = Boolean(habits[key]); });
    form.elements.proteinGrams.value = habits.proteinGrams ?? '';
    form.elements.waterLitres.value = habits.waterLitres ?? '';
    form.elements.sleepHours.value = habits.sleepHours ?? '';
    form.elements.notes.value = habits.notes ?? '';
    $('#habitDateDisplay').textContent = formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
    $('#habitSavedLabel').textContent = habits.savedAt ? 'Saved for today' : 'Not saved yet';
    const allKeys = ['train', 'protein', 'water', 'sleep', 'log', 'learn'];
    const count = allKeys.filter(key => Boolean(habits[key])).length;
    $('#fullHabitCount').textContent = `${count} / 6`;
    renderWeekDots();
  }

  function renderWeekDots() {
    const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const today = new Date(`${localDateKey()}T12:00:00`);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const key = shiftDate(localDateKey(), -i);
      const date = new Date(`${key}T12:00:00`);
      const logged = state.sessions.some(session => session.date === key);
      const habitLogged = Boolean(state.habits[key]?.savedAt);
      days.push({ key, name: names[date.getDay()], logged: logged || habitLogged, session: logged });
    }
    $('#weekDots').innerHTML = days.map(d => `<div class="week-day"><span>${d.name}</span><i class="${d.logged ? 'done' : ''}" title="${escapeHtml(formatDate(d.key))}">${d.session ? '↗' : d.logged ? '✓' : '·'}</i></div>`).join('');
    const count = state.sessions.filter(session => session.date >= shiftDate(localDateKey(), -6) && session.date <= localDateKey()).length;
    $('#weekWorkoutCount').textContent = `${count} session${count === 1 ? '' : 's'}`;
  }

  function renderProgress() {
    const form = $('#measurementForm');
    if (form && !form.elements.date.value) form.elements.date.value = localDateKey();
    const measurements = [...state.measurements].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    $('#measurementCount').textContent = `${measurements.length} entr${measurements.length === 1 ? 'y' : 'ies'}`;
    const latest = measurements[measurements.length - 1];
    $('#chartLatestWeight').textContent = latest ? numberFormat(latest.weight, 1) : numberFormat(state.profile.startingWeight, 1);
    $('#chartWeightChange').textContent = measurements.length >= 2 ? `${Number(measurements[measurements.length - 1].weight - measurements[0].weight) > 0 ? '+' : ''}${numberFormat(measurements[measurements.length - 1].weight - measurements[0].weight, 1)} kg` : '—';
    renderWeightChart(measurements);
    renderMeasurementTable(measurements);
    renderSessionHistory();
  }

  function renderWeightChart(measurements) {
    const svg = $('#weightChart');
    if (measurements.length === 0) {
      svg.innerHTML = '<text x="320" y="120" text-anchor="middle" class="chart-empty">Add a few measurements to see your trend.</text>';
      return;
    }
    const width = 640, height = 240, left = 49, right = 20, top = 18, bottom = 39;
    const plotW = width - left - right, plotH = height - top - bottom;
    const values = measurements.map(m => Number(m.weight)).filter(Number.isFinite);
    if (!values.length) {
      svg.innerHTML = '<text x="320" y="120" text-anchor="middle" class="chart-empty">No valid weight values to display.</text>';
      return;
    }
    let min = Math.min(...values), max = Math.max(...values);
    if (max === min) { min -= 0.8; max += 0.8; }
    const padding = Math.max(0.4, (max - min) * 0.18);
    min -= padding; max += padding;
    const points = measurements.map((m, i) => ({
      x: measurements.length === 1 ? left + plotW / 2 : left + (i / (measurements.length - 1)) * plotW,
      y: top + ((max - Number(m.weight)) / (max - min)) * plotH,
      value: Number(m.weight), date: m.date
    }));
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaPath = `${path} L ${points[points.length - 1].x.toFixed(2)} ${top + plotH} L ${points[0].x.toFixed(2)} ${top + plotH} Z`;
    const grid = [0, 1, 2, 3].map(i => {
      const y = top + (plotH / 3) * i;
      const label = max - ((max - min) / 3) * i;
      return `<line class="chart-gridline" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="chart-axis-label" x="${left - 10}" y="${y + 4}" text-anchor="end">${label.toFixed(1)}</text>`;
    }).join('');
    const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    const ticks = tickIndexes.map(index => {
      const p = points[index];
      return `<text class="chart-axis-label" x="${p.x}" y="${height - 12}" text-anchor="middle">${escapeHtml(formatDate(p.date, { month: 'short', day: 'numeric' }))}</text>`;
    }).join('');
    const circles = points.map(p => `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4.5"><title>${escapeHtml(formatDate(p.date))}: ${p.value.toFixed(1)} kg</title></circle>`).join('');
    svg.innerHTML = `<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#cfe6a0" stop-opacity=".52"/><stop offset="100%" stop-color="#cfe6a0" stop-opacity=".02"/></linearGradient></defs>${grid}<path class="chart-area" d="${areaPath}"/><path class="chart-line" d="${path}"/>${circles}${ticks}`;
  }

  function renderMeasurementTable(measurements) {
    const tbody = $('#measurementTable');
    if (!measurements.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Your saved measurements will appear here. Add your first check-in above.</td></tr>';
      return;
    }
    tbody.innerHTML = [...measurements].reverse().map(m => `<tr><td>${escapeHtml(formatDate(m.date))}</td><td><strong>${numberFormat(m.weight, 1)} kg</strong></td><td>${m.waist !== '' && m.waist != null ? `${numberFormat(m.waist, 1)} cm` : '—'}</td><td>${escapeHtml(m.notes || '—')}</td><td><button class="table-action" type="button" data-action="delete-measurement" data-id="${escapeHtml(m.id)}" aria-label="Delete measurement">Delete</button></td></tr>`).join('');
  }

  function renderSessionHistory() {
    const history = $('#sessionHistory');
    const sessions = [...state.sessions].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
    if (!sessions.length) {
      history.innerHTML = '<p class="muted-text">Your completed workouts will appear here. Open the training plan and log your first session.</p>';
      return;
    }
    history.innerHTML = sessions.map(session => {
      const summary = (session.exercises || []).slice(0, 3).map(ex => `${escapeHtml(ex.name)}: ${escapeHtml(ex.load || '—')} × ${escapeHtml(ex.reps || '—')}`).join(' · ');
      const more = session.exercises?.length > 3 ? ` · +${session.exercises.length - 3} more` : '';
      return `<div class="session-history-item"><div><strong>${escapeHtml(session.name || 'Workout')}</strong><p>${summary}${more}${session.notes ? `<br>${escapeHtml(session.notes)}` : ''}</p></div><span class="session-date">${escapeHtml(formatDate(session.date, { month: 'short', day: 'numeric' }))}</span></div>`;
    }).join('');
  }

  function renderAll() {
    renderDashboard();
    renderWorkoutCards();
    renderWorkoutEnhancements();
    renderMeals();
    renderProgress();
    renderHabitForm();
    renderSettingsForm();
  }

  function openWorkoutDialog(workoutId) {
    const workout = findWorkout(workoutId);
    if (!workout) return;
    $('#sessionDialogTitle').textContent = `Log ${workout.name}`;
    $('#sessionWorkoutId').value = workoutId;
    $('#sessionExerciseList').innerHTML = workout.exercises.map((exercise, index) => `
      <div class="session-exercise-row">
        <div class="session-exercise-head"><strong>${index + 1}. ${escapeHtml(exercise.name)}</strong><span>${exercise.sets} sets × ${escapeHtml(exercise.reps)}</span></div>
        <label class="session-substitution">Exercise substitution <span class="optional-label">optional</span><input type="text" name="substitute_${index}" maxlength="60" placeholder="Log a replacement movement"></label>
        <p class="session-overload-hint" data-overload-hint data-exercise-name="${escapeHtml(exercise.name)}" data-sets="${exercise.sets}" data-rep-target="${escapeHtml(exercise.reps)}"></p>
        <div class="session-input-grid">
          <label>Working weight / load<input type="text" name="load_${index}" maxlength="30" placeholder="e.g. 20 kg, 45 lb or bodyweight"></label>
          <label>Reps completed<input type="text" name="reps_${index}" maxlength="30" inputmode="numeric" placeholder="e.g. 10, 10"></label>
        </div>
      </div>`).join('');
    $('#sessionForm').elements.notes.value = '';
    renderProgressiveOverloadHints();
    const dialog = $('#sessionDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', 'open');
  }

  function closeWorkoutDialog() {
    const dialog = $('#sessionDialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function handleWorkoutSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const workoutId = form.elements.workoutId.value;
    const workout = findWorkout(workoutId);
    if (!workout) return;
    const exercises = [];
    for (let index = 0; index < workout.exercises.length; index++) {
      const exercise = workout.exercises[index];
      const reps = String(form.elements[`reps_${index}`]?.value || '').trim();
      if (reps && !parseLoggedReps(reps).length) {
        showToast(`Enter whole-number reps from 1 to 100 for ${exercise.name}.`);
        form.elements[`reps_${index}`].focus();
        return;
      }
      const substitute = String(form.elements[`substitute_${index}`]?.value || '').trim();
      exercises.push({
        name: substitute || exercise.name,
        plannedExercise: substitute ? exercise.name : '',
        target: exercise.reps,
        sets: exercise.sets,
        load: String(form.elements[`load_${index}`]?.value || '').trim(),
        reps
      });
    }
    const session = {
      id: makeId(), date: localDateKey(), createdAt: new Date().toISOString(), workoutId,
      name: workout.name, exercises, notes: String(form.elements.notes.value || '').trim()
    };
    state.sessions.push(session);
    saveState();
    closeWorkoutDialog();
    renderAll();
    showToast(`${workout.name} saved. One session logged.`);
  }

  function handlePlannedSessionSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const date = form.elements.date.value;
    const workoutId = form.elements.workoutId.value;
    const workout = findWorkout(workoutId);
    if (!date || date < localDateKey() || !workout) {
      showToast('Choose today or a future date and a valid workout.');
      return;
    }
    if (state.plannedSessions.some(session => session.date === date && session.workoutId === workoutId)) {
      showToast('That workout is already planned for this date.');
      return;
    }
    state.plannedSessions.push({ id: makeId(), date, workoutId, name: workout.name });
    selectedCalendarDate = date;
    calendarCursor = new Date(`${date}T12:00:00`);
    form.elements.date.value = date;
    saveState();
    renderAll();
    showToast(`${workout.name} planned for ${formatDate(date, { month: 'short', day: 'numeric' })}.`);
  }

  function handleCustomWorkoutSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(form.elements.name.value || '').trim();
    const exerciseNames = String(form.elements.exercises.value || '').split(/\r?\n/).map(exercise => exercise.trim()).filter(Boolean);
    if (!name || !exerciseNames.length || exerciseNames.length > 12 || exerciseNames.some(exercise => exercise.length > 60)) {
      showToast('Add a name and between 1 and 12 exercises (60 characters max each).');
      return;
    }
    if (new Set(exerciseNames.map(exercise => exercise.toLocaleLowerCase())).size !== exerciseNames.length) {
      showToast('Remove duplicate exercise names from this template.');
      return;
    }
    if (state.customWorkouts.some(workout => workout.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      showToast('A template with that name already exists.');
      return;
    }
    state.customWorkouts.push({
      id: `custom-${makeId()}`,
      code: 'CUSTOM',
      name,
      type: 'CUSTOM · PERSONAL',
      phase: 'custom',
      description: 'A workout template you created.',
      duration: 'Set your own pace',
      focus: 'Personal plan',
      exercises: exerciseNames.map(exercise => ({ name: exercise, target: 'Personal plan', sets: 3, reps: '8–12', cue: 'Use a controlled, comfortable range.' }))
    });
    form.reset();
    saveState();
    renderAll();
    showToast(`${name} template saved.`);
  }

  function handleMeasurementSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const date = form.elements.date.value || localDateKey();
    const weight = Number(form.elements.weight.value);
    const waist = form.elements.waist.value === '' ? '' : Number(form.elements.waist.value);
    if (!Number.isFinite(weight) || weight < 25 || weight > 300) {
      showToast('Enter a valid body weight in kilograms.');
      return;
    }
    if (waist !== '' && (!Number.isFinite(waist) || waist < 30 || waist > 250)) {
      showToast('Enter a valid waist measurement in centimetres.');
      return;
    }
    state.measurements.push({ id: makeId(), date, weight, waist, notes: String(form.elements.notes.value || '').trim() });
    saveState();
    form.reset();
    form.elements.date.value = localDateKey();
    renderAll();
    setView('progress');
    showToast('Measurement saved. Look for the trend across weeks.');
  }

  function handleHabitSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const previous = dailyHabit();
    state.habits[localDateKey()] = {
      train: form.elements.train.checked,
      protein: form.elements.protein.checked,
      water: form.elements.water.checked,
      sleep: form.elements.sleep.checked,
      log: form.elements.log.checked,
      learn: form.elements.learn.checked,
      proteinGrams: form.elements.proteinGrams.value === '' ? '' : Number(form.elements.proteinGrams.value),
      waterLitres: form.elements.waterLitres.value === '' ? '' : Number(form.elements.waterLitres.value),
      sleepHours: form.elements.sleepHours.value === '' ? '' : Number(form.elements.sleepHours.value),
      notes: String(form.elements.notes.value || '').trim(),
      savedAt: new Date().toISOString(),
      createdFrom: previous.createdFrom || 'daily-check-in'
    };
    saveState();
    renderAll();
    setView('habits');
    showToast('Daily check-in saved. Keep the next day manageable too.');
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const next = {
      age: Number(form.elements.age.value),
      height: Number(form.elements.height.value),
      startingWeight: Number(form.elements.startingWeight.value),
      startDate: form.elements.startDate.value,
      calories: Number(form.elements.calories.value),
      protein: Number(form.elements.protein.value)
    };
    if (next.age < 13 || next.age > 100 || next.height < 100 || next.height > 250 || next.startingWeight < 25 || next.startingWeight > 300 || next.calories < 1000 || next.calories > 6000 || next.protein < 30 || next.protein > 300 || !next.startDate) {
      showToast('Check the values and enter realistic targets.');
      return;
    }
    state.profile = { ...state.profile, ...next };
    saveState();
    renderAll();
    setView('settings');
    showToast('Settings saved. Targets remain estimates, not guarantees.');
  }

  function exportData() {
    const backup = { app: '90D Fit Journal', version: 1, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fit90-backup-${localDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded. Keep it somewhere safe.');
  }

  function importDataFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const imported = parsed.data || parsed;
        if (!imported || typeof imported !== 'object' || !imported.profile || !Array.isArray(imported.measurements) || !Array.isArray(imported.sessions) || typeof imported.habits !== 'object') {
          throw new Error('That file does not look like a Fit90 backup.');
        }
        if (!window.confirm('Import this backup? It will replace the data currently saved in this browser.')) return;
        state = {
          ...emptyState(),
          profile: { ...defaultProfile(), ...imported.profile },
          measurements: imported.measurements,
          sessions: imported.sessions,
          habits: imported.habits || {},
          plannedSessions: Array.isArray(imported.plannedSessions) ? imported.plannedSessions.filter(item => item && typeof item.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.workoutId === 'string') : [],
          customWorkouts: Array.isArray(imported.customWorkouts) ? imported.customWorkouts.filter(isValidCustomWorkout) : [],
          restTimerSeconds: Number.isInteger(imported.restTimerSeconds) && imported.restTimerSeconds >= 15 && imported.restTimerSeconds <= 600 ? imported.restTimerSeconds : 90,
          timerSound: imported.timerSound !== false
        };
        resetRestTimer();
        saveState();
        renderAll();
        setView('dashboard');
        showToast('Backup restored. Your dashboard has been updated.');
      } catch (error) {
        showToast(error.message || 'Could not import that file. Choose a Fit90 JSON backup.');
      }
    };
    reader.onerror = () => showToast('Could not read that file.');
    reader.readAsText(file);
  }

  function resetData() {
    const confirmed = window.confirm('Reset all 90D Fit data in this browser? This deletes measurements, workout logs, habits and settings. Export a backup first if you want to keep them.');
    if (!confirmed) return;
    state = emptyState();
    resetRestTimer();
    saveState();
    renderAll();
    setView('dashboard');
    showToast('Local data reset. Your 90-day plan starts today.');
  }

  function handleAction(button) {
    const action = button.dataset.action;
    if (action === 'open-todays-workout') {
      const plan = getTodayPlan();
      if (plan.type === 'workout') openWorkoutDialog(plan.workoutId);
      else if (plan.type === 'complete') {
        setView('progress');
        showToast('Your 90 days are complete. Review your logs and plan the next phase.');
      } else {
        setView('habits');
        showToast(plan.type === 'rest' ? 'Rest is today’s assignment. Recovery counts.' : `${plan.title}: keep the effort easy today.`);
      }
    } else if (action === 'log-workout') {
      openWorkoutDialog(button.dataset.workout);
    } else if (action === 'close-dialog') {
      closeWorkoutDialog();
    } else if (action === 'timer-start') {
      startRestTimer();
    } else if (action === 'timer-pause') {
      pauseRestTimer();
    } else if (action === 'timer-reset') {
      resetRestTimer();
    } else if (action === 'calendar-prev' || action === 'calendar-next') {
      calendarCursor.setMonth(calendarCursor.getMonth() + (action === 'calendar-prev' ? -1 : 1));
      renderCalendar();
    } else if (action === 'calendar-today') {
      calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      selectedCalendarDate = localDateKey();
      $('#plannedSessionDate').value = selectedCalendarDate;
      renderCalendar();
    } else if (action === 'select-calendar-date') {
      selectedCalendarDate = button.dataset.date;
      $('#plannedSessionDate').value = selectedCalendarDate;
      renderCalendar();
    } else if (action === 'delete-planned-session') {
      const planned = state.plannedSessions.find(session => session.id === button.dataset.id);
      if (!planned || !window.confirm(`Remove the planned session on ${formatDate(planned.date)}?`)) return;
      state.plannedSessions = state.plannedSessions.filter(session => session.id !== planned.id);
      saveState();
      renderAll();
      showToast('Planned session removed.');
    } else if (action === 'delete-custom-workout') {
      const workout = findWorkout(button.dataset.workout);
      if (!workout || !window.confirm(`Delete the “${workout.name}” template and its planned sessions? Saved workout logs will remain.`)) return;
      state.customWorkouts = state.customWorkouts.filter(template => template.id !== workout.id);
      state.plannedSessions = state.plannedSessions.filter(session => session.workoutId !== workout.id);
      saveState();
      renderAll();
      showToast('Template deleted. Existing session history was kept.');
    } else if (action === 'export-data') {
      exportData();
    } else if (action === 'reset-data') {
      resetData();
    } else if (action === 'show-health-note') {
      window.alert('Chest enlargement can be caused by glandular gynecomastia, fatty tissue, or both. A website cannot diagnose which one you have. Arrange a routine medical assessment, especially if it is persistent or concerning. Seek prompt assessment for a firm/enlarging lump, skin changes, or nipple discharge. Stop training and seek urgent care for chest pain or severe unusual breathlessness during exercise.');
    } else if (action === 'delete-measurement') {
      if (!window.confirm('Delete this measurement entry?')) return;
      state.measurements = state.measurements.filter(measurement => measurement.id !== button.dataset.id);
      saveState();
      renderAll();
      showToast('Measurement deleted.');
    }
  }

  // Main navigation and action delegation.
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      setView(nav.dataset.nav);
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action) handleAction(action);
  });

  $('#mobileMenu').addEventListener('click', () => {
    const sidebar = $('#sidebar');
    const isOpen = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', isOpen);
    $('#mobileMenu').setAttribute('aria-expanded', String(isOpen));
    $('#mobileMenu').setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    $('#mobileNavBackdrop').hidden = !isOpen;
    if (isOpen) $('.nav-link', sidebar).focus();
  });
  $('#mobileNavBackdrop').addEventListener('click', () => closeMobileMenu(true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#sidebar').classList.contains('open')) closeMobileMenu(true);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMobileMenu();
  });
  $('#themeToggle').addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme, true);
  });
  $('#plannedSessionForm').addEventListener('submit', handlePlannedSessionSubmit);
  $('#customWorkoutForm').addEventListener('submit', handleCustomWorkoutSubmit);
  $('#strengthExerciseSelect').addEventListener('change', () => renderStrengthProgression());
  $('#restTimerDuration').addEventListener('change', saveRestTimerDuration);
  $('#restTimerSound').addEventListener('change', event => {
    state.timerSound = event.currentTarget.checked;
    if (state.timerSound) primeTimerSound();
    saveState();
  });
  document.addEventListener('input', event => {
    if (event.target.matches('.session-substitution input')) renderProgressiveOverloadHints();
  });
  $('#sessionForm').addEventListener('submit', handleWorkoutSubmit);
  $('#measurementForm').addEventListener('submit', handleMeasurementSubmit);
  $('#habitForm').addEventListener('submit', handleHabitSubmit);
  $('#settingsForm').addEventListener('submit', handleSettingsSubmit);
  $('#importFile').addEventListener('change', event => {
    importDataFile(event.target.files?.[0]);
    event.target.value = '';
  });

  // The small dashboard checklist saves each change immediately.
  $$('[data-habit-check]').forEach(input => {
    input.addEventListener('change', () => {
      const date = localDateKey();
      const habit = { ...dailyHabit(date), [input.dataset.habitCheck]: input.checked, savedAt: new Date().toISOString() };
      state.habits[date] = habit;
      saveState();
      renderDashboard();
      renderHabitForm();
    });
  });

  // Close the modal if the user clicks the shaded backdrop.
  $('#sessionDialog').addEventListener('click', event => {
    if (event.target === $('#sessionDialog')) closeWorkoutDialog();
  });
  window.addEventListener('pagehide', () => {
    if (restTimerInterval) window.clearInterval(restTimerInterval);
    if (restTimerAudioContext && restTimerAudioContext.state !== 'closed') restTimerAudioContext.close();
  });

  setTheme(getInitialTheme());
  renderAll();
})();
