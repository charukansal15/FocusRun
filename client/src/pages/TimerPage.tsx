import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import { api } from '../lib/api';

import type {
  Group,
  Session,
  Subject,
  CompleteSessionResult
} from '../types';

import { TimerRing } from '../components/TimerRing';
import { ProgressMoments } from '../components/ProgressMoments';

type Phase =
  | 'idle'
  | 'focus'
  | 'stopped'
  | 'break'
  | 'break-stopped'
  | 'completed';

type Preset =
  | '25/5'
  | '50/10'
  | 'custom';

const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;

const PRESET_STORAGE_KEY = 'focusrun-preset';
const CUSTOM_FOCUS_STORAGE_KEY = 'focusrun-custom-focus';
const CUSTOM_BREAK_STORAGE_KEY = 'focusrun-custom-break';
const TASK_STORAGE_KEY = 'focusrun-task';
const PROJECT_STORAGE_KEY = 'focusrun-project';

const predefinedSubjects: Array<Subject | null> = [
  null,
  'DSA',
  'Development',
  'DBMS',
  'AI/ML',
  'College',
  'Other'
];

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(
    secs
  ).padStart(2, '0')}`;
}

function clampMinutes(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(
    min,
    Math.min(max, Number.isFinite(value) ? value : min)
  );
}

export function TimerPage({
  onProgress
}: {
  onProgress: () => void;
}): JSX.Element {
  /*
   * =========================================================
   * TIMER SETTINGS
   * =========================================================
   */

  const [preset, setPreset] = useState<Preset>(() => {
    const saved = localStorage.getItem(PRESET_STORAGE_KEY);

    if (
      saved === '25/5' ||
      saved === '50/10' ||
      saved === 'custom'
    ) {
      return saved;
    }

    return '25/5';
  });

  const [customFocusMinutes, setCustomFocusMinutes] =
    useState<number>(() => {
      const saved = Number(
        localStorage.getItem(CUSTOM_FOCUS_STORAGE_KEY)
      );

      return Number.isFinite(saved) && saved >= 1
        ? clampMinutes(saved, 1, 240)
        : DEFAULT_FOCUS_MINUTES;
    });

  const [customBreakMinutes, setCustomBreakMinutes] =
    useState<number>(() => {
      const saved = Number(
        localStorage.getItem(CUSTOM_BREAK_STORAGE_KEY)
      );

      return Number.isFinite(saved) && saved >= 1
        ? clampMinutes(saved, 1, 60)
        : DEFAULT_BREAK_MINUTES;
    });

  /*
   * =========================================================
   * STUDY CONTEXT
   * =========================================================
   */

  const [subject, setSubject] =
    useState<Subject | null>(null);

  const [customSubject, setCustomSubject] =
    useState('');

  const [groups, setGroups] =
    useState<Group[]>([]);

  const [groupId, setGroupId] =
    useState('');

  const [task, setTask] = useState(() => {
    return localStorage.getItem(TASK_STORAGE_KEY) ?? '';
  });

  const [project, setProject] = useState(() => {
    return (
      localStorage.getItem(PROJECT_STORAGE_KEY) ?? ''
    );
  });

  /*
   * =========================================================
   * TIMER STATE
   * =========================================================
   */

  const [phase, setPhase] =
    useState<Phase>('idle');

  const [secondsLeft, setSecondsLeft] =
    useState(DEFAULT_FOCUS_MINUTES * 60);

  const [activeId, setActiveId] =
    useState<string | null>(null);

  const [endsAt, setEndsAt] =
    useState<number | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [finishMessage, setFinishMessage] =
    useState('');

  const [completion, setCompletion] =
    useState<CompleteSessionResult | null>(null);

  /*
   * =========================================================
   * AUDIO
   * =========================================================
   *
   * One AudioContext for the page.
   *
   * It gets unlocked when the user presses Start.
   * This makes automatic completion sounds much more reliable.
   */

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const alarmOscillatorRef =
    useRef<OscillatorNode | null>(null);

  const alarmGainRef =
    useRef<GainNode | null>(null);

  const completingRef =
    useRef(false);

  const originalTitleRef =
    useRef(document.title || 'FocusRun');

  /*
   * =========================================================
   * DERIVED VALUES
   * =========================================================
   */

  const focusMinutes =
    preset === '25/5'
      ? 25
      : preset === '50/10'
        ? 50
        : customFocusMinutes;

  const breakMinutes =
    preset === '25/5'
      ? 5
      : preset === '50/10'
        ? 10
        : customBreakMinutes;

  const totalSeconds =
    phase === 'break' ||
    phase === 'break-stopped'
      ? breakMinutes * 60
      : focusMinutes * 60;

  /*
   * =========================================================
   * LOCAL STORAGE
   * =========================================================
   */

  useEffect(() => {
    localStorage.setItem(
      PRESET_STORAGE_KEY,
      preset
    );
  }, [preset]);

  useEffect(() => {
    localStorage.setItem(
      CUSTOM_FOCUS_STORAGE_KEY,
      String(customFocusMinutes)
    );
  }, [customFocusMinutes]);

  useEffect(() => {
    localStorage.setItem(
      CUSTOM_BREAK_STORAGE_KEY,
      String(customBreakMinutes)
    );
  }, [customBreakMinutes]);

  useEffect(() => {
    localStorage.setItem(
      TASK_STORAGE_KEY,
      task
    );
  }, [task]);

  useEffect(() => {
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      project
    );
  }, [project]);

  /*
   * =========================================================
   * LOAD GROUPS
   * =========================================================
   */

  useEffect(() => {
    void api<{ groups: Group[] }>('/groups')
      .then((result) => {
        setGroups(result.groups);
      })
      .catch(() => undefined);
  }, []);

  /*
   * =========================================================
   * RESET DISPLAY TIMER
   * =========================================================
   */

  useEffect(() => {
    if (
      phase === 'idle' ||
      phase === 'completed'
    ) {
      setSecondsLeft(
        focusMinutes * 60
      );
    }
  }, [
    focusMinutes,
    phase
  ]);

  /*
   * =========================================================
   * BACKGROUND-SAFE COUNTDOWN
   * =========================================================
   *
   * Instead of:
   *
   * secondsLeft--
   *
   * we calculate:
   *
   * endsAt - Date.now()
   *
   * This keeps the timer much more accurate if the tab
   * is backgrounded or Chrome throttles timers.
   */

  useEffect(() => {
    if (
      !endsAt ||
      (phase !== 'focus' &&
        phase !== 'break')
    ) {
      return undefined;
    }

    const tick = (): void => {
      const remaining =
        Math.max(
          0,
          Math.ceil(
            (endsAt - Date.now()) / 1000
          )
        );

      setSecondsLeft(remaining);
    };

    tick();

    const timer =
      window.setInterval(
        tick,
        250
      );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    endsAt,
    phase
  ]);

  /*
   * =========================================================
   * TAB TITLE
   * =========================================================
   */

  useEffect(() => {
    if (phase === 'focus') {
      document.title =
        `${formatTime(secondsLeft)} — FocusRun`;
    } else if (phase === 'stopped') {
      document.title =
        `${formatTime(secondsLeft)} — Paused | FocusRun`;
    } else if (phase === 'break') {
      document.title =
        `${formatTime(secondsLeft)} — Break | FocusRun`;
    } else if (phase === 'break-stopped') {
      document.title =
        `${formatTime(secondsLeft)} — Break paused | FocusRun`;
    } else {
      document.title =
        originalTitleRef.current;
    };
  }, [
    phase,
    secondsLeft
  ]);

  /*
   * =========================================================
   * AUDIO UNLOCK
   * =========================================================
   */

  const unlockAudio =
    useCallback((): void => {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current =
          new AudioContextClass();
      }

      if (
        audioContextRef.current.state ===
        'suspended'
      ) {
        void audioContextRef.current.resume();
      }
    }, []);

  /*
   * =========================================================
   * STOP CURRENT ALARM
   * =========================================================
   */

  const stopAlarm =
    useCallback((): void => {
      const oscillator =
        alarmOscillatorRef.current;

      const gain =
        alarmGainRef.current;

      const audioContext =
        audioContextRef.current;

      if (
        audioContext &&
        gain
      ) {
        try {
          gain.gain.cancelScheduledValues(
            audioContext.currentTime
          );

          gain.gain.setValueAtTime(
            0.001,
            audioContext.currentTime
          );
        } catch {
          // Ignore audio cleanup errors.
        }
      }

      if (oscillator) {
        try {
          oscillator.stop();
        } catch {
          // Already stopped.
        }
      }

      alarmOscillatorRef.current = null;
      alarmGainRef.current = null;
    }, []);

  /*
   * =========================================================
   * START ALARM
   * =========================================================
   *
   * Short repeating alarm.
   *
   * It is used for:
   *
   * 1. Focus finished
   * 2. Break finished
   *
   * The alarm automatically stops after 8 seconds.
   */

  const startAlarm =
    useCallback(
      (
        message: 'focus' | 'break'
      ): void => {
        const audioContext =
          audioContextRef.current;

        if (!audioContext) {
          return;
        }

        stopAlarm();

        if (
          audioContext.state ===
          'suspended'
        ) {
          void audioContext.resume();
        }

        const now =
          audioContext.currentTime;

        const oscillator =
          audioContext.createOscillator();

        const gain =
          audioContext.createGain();

        oscillator.type = 'sine';

        /*
         * Pleasant two-tone pattern.
         */
        const firstFrequency =
          message === 'focus'
            ? 880
            : 660;

        const secondFrequency =
          message === 'focus'
            ? 660
            : 880;

        oscillator.frequency.setValueAtTime(
          firstFrequency,
          now
        );

        oscillator.frequency.setValueAtTime(
          secondFrequency,
          now + 0.18
        );

        oscillator.frequency.setValueAtTime(
          firstFrequency,
          now + 0.36
        );

        const pulseLength = 0.28;
        const pulseGap = 0.72;
        const pulseInterval =
          pulseLength + pulseGap;

        const alarmDuration = 8;

        gain.gain.setValueAtTime(
          0.001,
          now
        );

        for (
          let elapsed = 0;
          elapsed < alarmDuration;
          elapsed += pulseInterval
        ) {
          const start =
            now + elapsed;

          gain.gain.setValueAtTime(
            0.001,
            start
          );

          gain.gain.exponentialRampToValueAtTime(
            0.22,
            start + 0.025
          );

          gain.gain.setValueAtTime(
            0.22,
            start + 0.18
          );

          gain.gain.exponentialRampToValueAtTime(
            0.001,
            start + pulseLength
          );
        }

        oscillator.connect(gain);
        gain.connect(
          audioContext.destination
        );

        oscillator.start(now);

        oscillator.stop(
          now + alarmDuration
        );

        alarmOscillatorRef.current =
          oscillator;

        alarmGainRef.current =
          gain;

        oscillator.addEventListener(
          'ended',
          () => {
            if (
              alarmOscillatorRef.current ===
              oscillator
            ) {
              alarmOscillatorRef.current =
                null;

              alarmGainRef.current =
                null;
            }
          }
        );
      },
      [stopAlarm]
    );

  /*
   * =========================================================
   * COMPLETE FOCUS SESSION
   * =========================================================
   */

  const endFocus =
    useCallback(
      async (): Promise<void> => {
        if (
          !activeId ||
          busy ||
          completingRef.current
        ) {
          return;
        }

        completingRef.current =
          true;

        setBusy(true);
        setError('');

        try {
          const result =
            await api<CompleteSessionResult>(
              `/sessions/${activeId}/complete`,
              {
                method: 'POST',
                body: '{}'
              }
            );

          setCompletion(result);

          onProgress();

          const minutes =
            Math.floor(
              result.session
                .durationSeconds / 60
            );

          setFinishMessage(
            `Recorded ${minutes} focused minute${
              minutes === 1
                ? ''
                : 's'
            } · +${
              result.xpAwarded
            } XP.`
          );

          setActiveId(null);

          /*
           * Tell the user focus ended.
           */
          startAlarm('focus');

          /*
           * Automatically start break.
           */
          setPhase('break');

          setSecondsLeft(
            breakMinutes * 60
          );

          setEndsAt(
            Date.now() +
              breakMinutes * 60_000
          );
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not complete the session.'
          );

          setPhase('idle');
          setEndsAt(null);
        } finally {
          setBusy(false);
          completingRef.current =
            false;
        }
      },
      [
        activeId,
        busy,
        breakMinutes,
        onProgress,
        startAlarm
      ]
    );

  /*
   * =========================================================
   * FOCUS REACHED ZERO
   * =========================================================
   */

  useEffect(() => {
    if (
      phase === 'focus' &&
      secondsLeft === 0
    ) {
      void endFocus();
    }
  }, [
    secondsLeft,
    phase,
    endFocus
  ]);

  /*
   * =========================================================
   * BREAK REACHED ZERO
   * =========================================================
   *
   * THIS IS THE NEW PART:
   *
   * Break ends
   *     ↓
   * alarm starts again
   *     ↓
   * user sees "Break over"
   *     ↓
   * ready for next focus
   */

  useEffect(() => {
    if (
      phase === 'break' &&
      secondsLeft === 0
    ) {
      setEndsAt(null);

      startAlarm('break');

      setFinishMessage(
        'Break over · ready for your next focus.'
      );

      setPhase('completed');
    }
  }, [
    secondsLeft,
    phase,
    startAlarm
  ]);

  /*
   * =========================================================
   * START / RESUME
   * =========================================================
   */

  async function startFocus(): Promise<void> {
    setError('');

    unlockAudio();

    /*
     * RESUME PAUSED FOCUS
     */

    if (
      phase === 'stopped' &&
      activeId
    ) {
      setPhase('focus');

      setEndsAt(
        Date.now() +
          secondsLeft * 1000
      );

      return;
    }

    /*
     * RESUME PAUSED BREAK
     */

    if (
      phase === 'break-stopped'
    ) {
      setPhase('break');

      setEndsAt(
        Date.now() +
          secondsLeft * 1000
      );

      return;
    }

    /*
     * NEW FOCUS SESSION
     */

    setFinishMessage('');
    setBusy(true);

    try {
      /*
       * The backend currently accepts the existing
       * predefined Subject values.
       *
       * If the user selected Other, we keep the custom
       * subject in the UI but send "Other" to the existing
       * API so the current backend contract stays safe.
       */

      const apiSubject =
        subject === 'Other'
          ? 'Other'
          : subject ?? undefined;

      const result =
        await api<{ session: Session }>(
          '/sessions/start',
          {
            method: 'POST',
            body: JSON.stringify({
              groupId:
                groupId || undefined,

              subject:
                apiSubject,

              plannedDurationSeconds:
                focusMinutes * 60
            })
          }
        );

      setActiveId(
        result.session.id
      );

      setPhase('focus');

      setSecondsLeft(
        focusMinutes * 60
      );

      setEndsAt(
        Date.now() +
          focusMinutes * 60_000
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not start your session.'
      );
    } finally {
      setBusy(false);
    }
  }

  /*
   * =========================================================
   * STOP FOCUS
   * =========================================================
   */

  function stopFocus(): void {
    if (
      !activeId ||
      phase !== 'focus'
    ) {
      return;
    }

    setEndsAt(null);
    setPhase('stopped');
  }

  /*
   * =========================================================
   * STOP BREAK
   * =========================================================
   */

  function stopBreak(): void {
    if (
      phase !== 'break'
    ) {
      return;
    }

    setEndsAt(null);
    setPhase('break-stopped');
  }

  /*
   * =========================================================
   * ABANDON FOCUS
   * =========================================================
   */

  async function abandon(): Promise<void> {
    if (!activeId) {
      return;
    }

    const confirmed =
      window.confirm(
        'Abandon this focus session? Your unfinished session will not count toward your study time.'
      );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await api(
        `/sessions/${activeId}/abandon`,
        {
          method: 'POST',
          body: '{}'
        }
      );

      setActiveId(null);
      setEndsAt(null);
      setPhase('idle');

      setSecondsLeft(
        focusMinutes * 60
      );

      setFinishMessage('');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not abandon this session.'
      );
    } finally {
      setBusy(false);
    }
  }

  /*
   * =========================================================
   * SKIP BREAK
   * =========================================================
   */

  function skipBreak(): void {
    setEndsAt(null);
    stopAlarm();

    setPhase('completed');

    setSecondsLeft(
      focusMinutes * 60
    );

    setFinishMessage(
      'Break skipped · ready for your next focus.'
    );
  }

  /*
   * =========================================================
   * SUBJECT SELECTION
   * =========================================================
   */

  function handleSubjectSelect(
    item: Subject | null
  ): void {
    setSubject(item);

    if (item !== 'Other') {
      setCustomSubject('');
    }
  }

  /*
   * =========================================================
   * CLEANUP
   * =========================================================
   */

  useEffect(() => {
    return () => {
      stopAlarm();

      const audioContext =
        audioContextRef.current;

      if (audioContext) {
        void audioContext.close();
      }

      document.title =
        originalTitleRef.current;
    };
  }, [stopAlarm]);

  /*
   * =========================================================
   * LABEL
   * =========================================================
   */

  const label =
    phase === 'focus'
      ? 'FOCUS'
      : phase === 'stopped'
        ? 'PAUSED'
        : phase === 'break'
          ? 'BREAK'
          : phase === 'break-stopped'
            ? 'BREAK PAUSED'
            : phase === 'completed'
              ? 'READY'
              : 'READY';

  const settingsLocked =
    phase === 'focus' ||
    phase === 'stopped' ||
    phase === 'break' ||
    phase === 'break-stopped';

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <div className="page timer-page">
      <ProgressMoments
        result={completion}
        onClose={() =>
          setCompletion(null)
        }
      />

      <div className="timer-header">
        <div>
          <p className="eyebrow">
            FOCUSRUN
          </p>

          <h1>
            Make your focus count.
          </h1>

          <p className="timer-subtitle">
            Pick a task, set your run,
            and get into flow.
          </p>
        </div>

        <div className="timer-status">
          <span
            className={
              phase === 'focus'
                ? 'status-dot active'
                : 'status-dot'
            }
          />

          <span>
            {phase === 'focus'
              ? 'In focus'
              : phase === 'break'
                ? 'On break'
                : phase === 'stopped'
                  ? 'Paused'
                  : phase === 'break-stopped'
                    ? 'Break paused'
                    : 'Ready'}
          </span>
        </div>
      </div>

      <section className="timer-layout">
        {/*
         * ===================================================
         * MAIN TIMER
         * ===================================================
         */}

        <main className="timer-main">
          <div className="timer-card">
            <div className="timer-context">
              <span>
                {phase === 'break' ||
                phase === 'break-stopped'
                  ? 'BREAK TIME'
                  : 'FOCUS SESSION'}
              </span>
            </div>

            <TimerRing
              secondsLeft={
                secondsLeft
              }
              totalSeconds={
                totalSeconds
              }
              label={label}
            />

            {finishMessage && (
              <div className="completion-note">
                <span>✓</span>

                <span>
                  {finishMessage}
                </span>
              </div>
            )}

            {error && (
              <p className="form-error">
                {error}
              </p>
            )}

            <div className="timer-actions">
              {phase === 'focus' && (
                <>
                  <button
                    className="button button-primary timer-primary-action"
                    onClick={
                      stopFocus
                    }
                    disabled={busy}
                  >
                    Stop
                  </button>

                  <button
                    className="button button-quiet"
                    onClick={() =>
                      void abandon()
                    }
                    disabled={busy}
                  >
                    Abandon
                  </button>
                </>
              )}

              {phase === 'stopped' && (
                <>
                  <button
                    className="button button-primary timer-primary-action"
                    onClick={() =>
                      void startFocus()
                    }
                    disabled={busy}
                  >
                    Start
                  </button>

                  <button
                    className="button button-quiet"
                    onClick={() =>
                      void abandon()
                    }
                    disabled={busy}
                  >
                    Abandon
                  </button>
                </>
              )}

              {phase === 'break' && (
                <>
                  <button
                    className="button button-primary timer-primary-action"
                    onClick={
                      stopBreak
                    }
                  >
                    Stop
                  </button>

                  <button
                    className="button button-quiet"
                    onClick={
                      skipBreak
                    }
                  >
                    Skip break
                  </button>
                </>
              )}

              {phase === 'break-stopped' && (
                <>
                  <button
                    className="button button-primary timer-primary-action"
                    onClick={() =>
                      void startFocus()
                    }
                    disabled={busy}
                  >
                    Start break
                  </button>

                  <button
                    className="button button-quiet"
                    onClick={
                      skipBreak
                    }
                  >
                    Skip break
                  </button>
                </>
              )}

              {(phase === 'idle' ||
                phase === 'completed') && (
                <button
                  className="button button-primary timer-primary-action"
                  onClick={() =>
                    void startFocus()
                  }
                  disabled={busy}
                >
                  {busy
                    ? 'Starting…'
                    : phase === 'completed'
                      ? 'Start next focus'
                      : 'Start focus'}
                </button>
              )}
            </div>
          </div>
        </main>

        {/*
         * ===================================================
         * RIGHT SIDEBAR
         * ===================================================
         */}

        <aside className="surface-panel timer-settings">
          <div className="settings-heading">
            <div>
              <p className="settings-kicker">
                PLAN YOUR RUN
              </p>

              <h2>
                What are you working on?
              </h2>
            </div>
          </div>

          {/*
           * TASK
           */}

          <div className="timer-field">
            <label htmlFor="focus-task">
              Task
            </label>

            <input
              id="focus-task"
              type="text"
              placeholder="e.g. Solve 3 binary search problems"
              value={task}
              onChange={(event) =>
                setTask(
                  event.target.value
                )
              }
              disabled={settingsLocked}
              maxLength={120}
            />
          </div>

          {/*
           * PROJECT
           */}

          <div className="timer-field">
            <label htmlFor="focus-project">
              Project
              <span>
                Optional
              </span>
            </label>

            <input
              id="focus-project"
              type="text"
              placeholder="e.g. FocusRun"
              value={project}
              onChange={(event) =>
                setProject(
                  event.target.value
                )
              }
              disabled={settingsLocked}
              maxLength={80}
            />
          </div>

          {/*
           * SESSION LENGTH
           */}

          <div className="settings-section">
            <div className="section-title">
              <span>
                Focus length
              </span>

              <strong>
                {focusMinutes} min
              </strong>
            </div>

            <div className="segmented timer-presets">
              {(
                [
                  '25/5',
                  '50/10',
                  'custom'
                ] as const
              ).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={
                    preset === item
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setPreset(item)
                  }
                  disabled={
                    settingsLocked
                  }
                >
                  {item === 'custom'
                    ? 'Custom'
                    : item}
                </button>
              ))}
            </div>
          </div>

          {/*
           * CUSTOM FOCUS + BREAK
           */}

          {preset === 'custom' && (
            <div className="custom-time-grid">
              <div className="timer-field">
                <label htmlFor="custom-focus">
                  Focus
                </label>

                <div className="number-input">
                  <input
                    id="custom-focus"
                    type="number"
                    min="1"
                    max="240"
                    value={
                      customFocusMinutes
                    }
                    onChange={(event) => {
                      const value =
                        Number(
                          event.target.value
                        );

                      setCustomFocusMinutes(
                        clampMinutes(
                          value,
                          1,
                          240
                        )
                      );
                    }}
                    disabled={
                      settingsLocked
                    }
                  />

                  <span>
                    min
                  </span>
                </div>
              </div>

              <div className="timer-field">
                <label htmlFor="custom-break">
                  Break
                </label>

                <div className="number-input">
                  <input
                    id="custom-break"
                    type="number"
                    min="1"
                    max="60"
                    value={
                      customBreakMinutes
                    }
                    onChange={(event) => {
                      const value =
                        Number(
                          event.target.value
                        );

                      setCustomBreakMinutes(
                        clampMinutes(
                          value,
                          1,
                          60
                        )
                      );
                    }}
                    disabled={
                      settingsLocked
                    }
                  />

                  <span>
                    min
                  </span>
                </div>
              </div>
            </div>
          )}

          {/*
           * QUICK BREAK SETTINGS
           *
           * Even for 25/5 and 50/10, the user can change
           * the break separately.
           */}

          {preset !== 'custom' && (
            <div className="timer-field">
              <label htmlFor="quick-break">
                Break length
                <span>
                  Current: {breakMinutes} min
                </span>
              </label>

              <div className="break-options">
                {[3, 5, 10, 15].map(
                  (minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={
                        breakMinutes ===
                        minutes
                          ? 'selected'
                          : ''
                      }
                      onClick={() => {
                        setPreset(
                          'custom'
                        );

                        setCustomFocusMinutes(
                          focusMinutes
                        );

                        setCustomBreakMinutes(
                          minutes
                        );
                      }}
                      disabled={
                        settingsLocked
                      }
                    >
                      {minutes}m
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/*
           * STUDY WITH
           */}

          <div className="timer-field">
            <label htmlFor="study-group">
              Study with
            </label>

            <select
              id="study-group"
              value={groupId}
              onChange={(event) =>
                setGroupId(
                  event.target.value
                )
              }
              disabled={settingsLocked}
            >
              <option value="">
                Solo focus
              </option>

              {groups.map(
                (group) => (
                  <option
                    value={group.id}
                    key={group.id}
                  >
                    {group.name}
                  </option>
                )
              )}
            </select>
          </div>

          {/*
           * SUBJECT
           */}

          <fieldset
            className="subject-section"
            disabled={settingsLocked}
          >
            <legend>
              Subject
              <span>
                Optional
              </span>
            </legend>

            <div className="subject-chips">
              {predefinedSubjects.map(
                (item) => (
                  <button
                    type="button"
                    key={
                      item ?? 'skip'
                    }
                    onClick={() =>
                      handleSubjectSelect(
                        item
                      )
                    }
                    className={
                      subject === item
                        ? 'selected'
                        : ''
                    }
                  >
                    {item ?? 'Skip'}
                  </button>
                )
              )}
            </div>

            {subject === 'Other' && (
              <input
                className="custom-subject-input"
                type="text"
                placeholder="Type your subject..."
                value={
                  customSubject
                }
                onChange={(event) =>
                  setCustomSubject(
                    event.target.value
                  )
                }
                maxLength={60}
              />
            )}
          </fieldset>

          {/*
           * CURRENT RUN SUMMARY
           */}

          <div className="run-summary">
            <div>
              <span>
                Focus
              </span>

              <strong>
                {focusMinutes} min
              </strong>
            </div>

            <div>
              <span>
                Break
              </span>

              <strong>
                {breakMinutes} min
              </strong>
            </div>

            {task && (
              <div className="summary-wide">
                <span>
                  Task
                </span>

                <strong>
                  {task}
                </strong>
              </div>
            )}
          </div>

          {phase === 'idle' && (
            <p className="integrity-note">
              Your session is recorded
              only when focus naturally
              reaches 00:00.
            </p>
          )}

          {phase === 'stopped' && (
            <p className="integrity-note">
              Paused. Start again to
              continue the same session.
            </p>
          )}

          {phase === 'break' && (
            <p className="integrity-note">
              🎉 Focus complete.
              Take your break.
            </p>
          )}

          {phase === 'break-stopped' && (
            <p className="integrity-note">
              Break paused. Start again
              when you're ready.
            </p>
          )}

          {phase === 'completed' && (
            <p className="integrity-note">
              ✨ Ready for your next
              focus session.
            </p>
          )}
        </aside>
      </section>
    </div>
  );
}