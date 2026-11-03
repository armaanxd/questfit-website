// JD's attitude toward the player thaws with level, and both his celebration move and his lines follow it.
const TIERS = [
  { from: 1, label: "Aloof", move: "scorn", greet: "scorn" },
  { from: 6, label: "Grudging", move: "sideeye", greet: "sideeye" },
  { from: 11, label: "Warm", move: "thumbsup", greet: "greet" },
  { from: 16, label: "Proud", move: "fistpump", greet: "greet" },
];

export function jdTier(level) {
  const index = TIERS.findLastIndex((tier) => level >= tier.from);
  const tier = TIERS[Math.max(index, 0)];
  return { ...tier, tier: Math.max(index, 0), next: TIERS[index + 1]?.from ?? null };
}

const LINES = {
  waiting: ["Main quest's up. Try to keep up.", "Main quest. Show me something.", "Main quest's ready when you are.", "Big day. Let's get it done."],
  partial: ["That's all? Keep going.", "Okay. A start.", "Good start. Keep going.", "Look at you go. Keep it up."],
  nearly: ["Don't slow down now.", "Not bad. Finish it.", "Almost there. You've got this.", "Nearly done. I knew you would."],
  done: ["Done. About time.", "Fine. That counts.", "Nice work. Really.", "That's how it's done. Proud of you."],
  levelup: [
    (n) => `Level ${n}. Don't let it go to your head.`,
    (n) => `Level ${n}. Huh. Didn't see that coming.`,
    (n) => `Level ${n}. You earned that.`,
    (n) => `Level ${n}! You're not the person who started.`,
  ],
  missed: ["You skipped it. Typical.", "A miss. Tomorrow, then.", "Rough day. Tomorrow's another shot.", "It happens. Rest up and come back."],
};

// kind: waiting | partial | nearly | done | levelup | missed
export function jdLine(level, kind) {
  const line = LINES[kind][jdTier(level).tier];
  return typeof line === "function" ? line(level) : line;
}
