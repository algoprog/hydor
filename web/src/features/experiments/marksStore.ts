// A count that goes up when runs were starred, noted or archived here: what the page keeps of older runs and other
// machines' runs is read again.
import { create } from 'zustand';

export const useExperimentMarks = create<{ n: number; changed: () => void }>((set) => ({ n: 0, changed: () => set((s) => ({ n: s.n + 1 })) }));
