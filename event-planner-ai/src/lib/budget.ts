export interface RawAllocation {
  category: string;
  percent: number;
  notes: string;
}

export interface BudgetLine {
  category: string;
  notes: string;
  percent: number;
  amount: number;
}

/**
 * Turns the model's suggested percentages into exact amounts.
 *
 * LLMs are unreliable at arithmetic, so the model only proposes *weights*; we
 * normalise them and split the budget in integer minor units (cents/paise)
 * using the largest-remainder method. The lines always add up to the total.
 */
export function allocateBudget(items: RawAllocation[], total: number): BudgetLine[] {
  if (items.length === 0) return [];

  const totalMinor = Math.round(total * 100);
  const positive = items.map((item) => Math.max(0, item.percent));
  const positiveSum = positive.reduce((a, b) => a + b, 0);

  // If the model returned all zeros, fall back to an even split.
  const weights = positiveSum > 0 ? positive : items.map(() => 1);
  const weightSum = positiveSum > 0 ? positiveSum : items.length;

  const exact = weights.map((w) => (w / weightSum) * totalMinor);
  const shares = exact.map(Math.floor);

  let remainder = totalMinor - shares.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let k = 0; remainder > 0; k++, remainder--) {
    const target = byFraction[k % byFraction.length];
    if (target) shares[target.index] = (shares[target.index] ?? 0) + 1;
  }

  return items.map((item, index) => {
    const minor = shares[index] ?? 0;
    return {
      category: item.category,
      notes: item.notes,
      amount: minor / 100,
      percent: totalMinor > 0 ? Math.round((minor / totalMinor) * 1000) / 10 : 0,
    };
  });
}
