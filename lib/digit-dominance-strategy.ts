// ================================================================
// DIGIT DOMINANCE STRATEGY MODULE
// ================================================================
// Converted from STRATEGY.py — full 1:1 port to TypeScript.
// ================================================================

// ----------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------

export interface StrategyConfig {
  windowSize: number;
  digitThresholds: Record<number, number>;
  confirmationMinDigit: number;
  confirmationLookback: number;
  tradeCooldown: number;
  lossCooldown: number;
  lossStreakTrigger: number;
}

export function defaultConfig(): StrategyConfig {
  return {
    windowSize: 60,
    digitThresholds: { 0: 11, 1: 11, 2: 11 },
    confirmationMinDigit: 3,
    confirmationLookback: 3,
    tradeCooldown: 5,
    lossCooldown: 15,
    lossStreakTrigger: 2,
  };
}

// ----------------------------------------------------------------
// TRADE SIGNAL
// ----------------------------------------------------------------

export interface TradeSignal {
  tickIndex: number;
  triggerDigit: number;
  direction: string;
  timestamp: number;
}

// ----------------------------------------------------------------
// TRADE RECORD
// ----------------------------------------------------------------

export interface TradeRecord {
  tradeId: number;
  triggerDigit: number;
  nextDigit: number;
  result: "WIN" | "LOSS";
  tradePnl: number;
  runningPnl: number;
}

// ----------------------------------------------------------------
// STRATEGY STATE
// ----------------------------------------------------------------

export interface StrategyState {
  window: number[];
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  winStreak: number;
  lossStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
  peakPnl: number;
  maxDrawdown: number;
  cooldown: number;
  lastTradeIndex: number;
  halted: boolean;
  haltReason: string;
  tradesLog: TradeRecord[];
}

function createState(): StrategyState {
  return {
    window: [],
    trades: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    winStreak: 0,
    lossStreak: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    peakPnl: 0,
    maxDrawdown: 0,
    cooldown: 0,
    lastTradeIndex: -9999,
    halted: false,
    haltReason: "",
    tradesLog: [],
  };
}

export function stateSummary(state: StrategyState, config: StrategyConfig) {
  return {
    trades: state.trades,
    wins: state.wins,
    losses: state.losses,
    winRate: state.trades ? +((state.wins / state.trades) * 100).toFixed(2) : 0,
    pnl: +state.pnl.toFixed(2),
    winStreak: state.winStreak,
    lossStreak: state.lossStreak,
    maxWinStreak: state.maxWinStreak,
    maxLossStreak: state.maxLossStreak,
    maxDrawdown: +state.maxDrawdown.toFixed(2),
    halted: state.halted,
    haltReason: state.haltReason,
    windowSize: config.windowSize,
    tradeCooldown: config.tradeCooldown,
    lossCooldown: config.lossCooldown,
  };
}

// ----------------------------------------------------------------
// DIGIT DOMINANCE STRATEGY
// ----------------------------------------------------------------

export class DigitDominanceStrategy {
  config: StrategyConfig;
  state: StrategyState;
  private tickIndex: number = -1;

  onSignal?: (signal: TradeSignal) => void;
  onTrade?: (record: TradeRecord) => void;
  onHalt?: (reason: string) => void;

  constructor(
    config?: Partial<StrategyConfig>,
    callbacks?: {
      onSignal?: (signal: TradeSignal) => void;
      onTrade?: (record: TradeRecord) => void;
      onHalt?: (reason: string) => void;
    }
  ) {
    this.config = { ...defaultConfig(), ...config };
    this.state = createState();
    this.onSignal = callbacks?.onSignal;
    this.onTrade = callbacks?.onTrade;
    this.onHalt = callbacks?.onHalt;
  }

  // --- Process one tick ---
  processTick(tickValue: number): TradeSignal | null {
    if (this.state.halted) return null;

    this.tickIndex++;
    const { config, state } = this;

    state.window.push(tickValue);
    if (state.window.length > config.windowSize) {
      state.window.shift();
    }

    if (state.window.length < config.windowSize) return null;

    if (state.cooldown > 0) {
      state.cooldown--;
      return null;
    }

    if (this.tickIndex - state.lastTradeIndex < config.tradeCooldown) return null;

    if (this._dominanceSignal() && this._confirmationSignal()) {
      const signal: TradeSignal = {
        tickIndex: this.tickIndex,
        triggerDigit: tickValue,
        direction: "OVER_3",
        timestamp: Date.now(),
      };
      state.lastTradeIndex = this.tickIndex;
      this.onSignal?.(signal);
      return signal;
    }

    return null;
  }

  // --- Record trade outcome ---
  recordResult(
    nextDigit: number,
    signal: TradeSignal,
    winAmount: number,
    lossAmount: number,
    maxDrawdownStop: number = Infinity
  ): TradeRecord {
    const { config, state } = this;

    const result: "WIN" | "LOSS" = nextDigit >= config.confirmationMinDigit ? "WIN" : "LOSS";
    const tradePnl = result === "WIN" ? winAmount : lossAmount;

    state.trades++;
    state.pnl += tradePnl;

    const record: TradeRecord = {
      tradeId: state.trades,
      triggerDigit: signal.triggerDigit,
      nextDigit,
      result,
      tradePnl,
      runningPnl: +state.pnl.toFixed(2),
    };

    state.tradesLog.push(record);

    // Streaks
    if (result === "WIN") {
      state.wins++;
      state.winStreak++;
      state.lossStreak = 0;
      state.maxWinStreak = Math.max(state.maxWinStreak, state.winStreak);
    } else {
      state.losses++;
      state.lossStreak++;
      state.winStreak = 0;
      state.maxLossStreak = Math.max(state.maxLossStreak, state.lossStreak);
      if (state.lossStreak >= config.lossStreakTrigger) {
        state.cooldown = config.lossCooldown;
      }
    }

    // Drawdown
    if (state.pnl > state.peakPnl) state.peakPnl = state.pnl;
    const drawdown = state.peakPnl - state.pnl;
    state.maxDrawdown = Math.max(state.maxDrawdown, drawdown);

    if (state.maxDrawdown > maxDrawdownStop) {
      this._halt("MAX DRAWDOWN LIMIT REACHED");
    }

    this.onTrade?.(record);
    return record;
  }

  // --- Summary ---
  summary() {
    return stateSummary(this.state, this.config);
  }

  // --- Last N trades ---
  lastTrades(n: number = 10): TradeRecord[] {
    return this.state.tradesLog.slice(-n);
  }

  // --- Reset state, keep config ---
  reset() {
    this.state = createState();
    this.tickIndex = -1;
  }

  // ----------------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------------

  private _dominanceSignal(): boolean {
    const { window, } = this.state;
    const { windowSize, digitThresholds } = this.config;
    return Object.entries(digitThresholds).some(([digit, pct]) => {
      const count = window.filter((d) => d === Number(digit)).length;
      return (count / windowSize) * 100 > pct;
    });
  }

  private _confirmationSignal(): boolean {
    const { confirmationMinDigit, confirmationLookback } = this.config;
    const recent = this.state.window.slice(-confirmationLookback);
    return recent.every((d) => d >= confirmationMinDigit);
  }

  private _halt(reason: string) {
    this.state.halted = true;
    this.state.haltReason = reason;
    this.onHalt?.(reason);
  }
}
