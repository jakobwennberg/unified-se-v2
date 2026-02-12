'use client';

import { useEffect, useState, useRef } from 'react';
import { Sparkles, Brain, ShieldCheck, FileSpreadsheet, BarChart3, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  label: string;
  icon: React.ElementType;
  startsAt: number; // seconds
}

const STEPS: Step[] = [
  { label: 'Preparing company profile', icon: Sparkles, startsAt: 0 },
  { label: 'Generating financial blueprint', icon: Brain, startsAt: 2 },
  { label: 'Validating accounting data', icon: ShieldCheck, startsAt: 17 },
  { label: 'Building SIE transactions', icon: FileSpreadsheet, startsAt: 20 },
  { label: 'Calculating financial KPIs', icon: BarChart3, startsAt: 23 },
];

type StepState = 'pending' | 'active' | 'complete';

interface GenerationProgressProps {
  /** Set to true when the API response has arrived */
  done: boolean;
}

export function GenerationProgress({ done }: GenerationProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(() =>
    STEPS.map((_, i) => (i === 0 ? 'active' : 'pending')),
  );
  const startRef = useRef(Date.now());
  const completingRef = useRef(false);

  // Tick elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Advance steps based on elapsed time
  useEffect(() => {
    if (done || completingRef.current) return;

    setStepStates((prev) => {
      const next = [...prev];
      for (let i = 0; i < STEPS.length; i++) {
        if (elapsed >= STEPS[i]!.startsAt) {
          if (i > 0 && next[i - 1] === 'active') {
            next[i - 1] = 'complete';
          }
          if (next[i] === 'pending') {
            next[i] = 'active';
          }
        }
      }
      return next;
    });
  }, [elapsed, done]);

  // Rapid-complete remaining steps when done
  useEffect(() => {
    if (!done || completingRef.current) return;
    completingRef.current = true;

    const incomplete = stepStates
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s !== 'complete');

    incomplete.forEach(({ i }, idx) => {
      setTimeout(() => {
        setStepStates((prev) => {
          const next = [...prev];
          next[i] = 'complete';
          return next;
        });
      }, idx * 300);
    });
  }, [done, stepStates]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const state = stepStates[i];
          const Icon = step.icon;
          return (
            <div key={i} className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
                  state === 'complete' && 'bg-green-500/15 text-green-600',
                  state === 'active' && 'bg-blue-500/15 text-blue-600',
                  state === 'pending' && 'bg-muted text-muted-foreground/50',
                )}
              >
                {state === 'complete' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      state === 'active' && 'animate-pulse',
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'text-sm transition-colors duration-300',
                  state === 'complete' && 'text-foreground',
                  state === 'active' && 'font-medium text-foreground',
                  state === 'pending' && 'text-muted-foreground/50',
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Elapsed: {formatTime(elapsed)}
      </p>
    </div>
  );
}
