'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useProposal,
  useBuy,
} from '@deriv/core';

import type {
  ActiveSymbol,
  Tick,
  ProposalInfo,
  ProposalParams,
  DurationLimits,
  BuyResult,
} from '@deriv/core';

import { useBaseTrading } from '@/hooks/use-base-trading';
import type { UseBaseTradingParams } from '@/hooks/use-base-trading';

import { computeDigitStats, getLastDigit } from '../lib/digit-stats';
import type {
  ContractMode,
  TradeType,
  DigitStats,
  OpenPosition,
  ClosedPosition,
} from '../lib/types';

const CONTRACT_TYPES = [
  'DIGITMATCH',
  'DIGITDIFF',
  'DIGITOVER',
  'DIGITUNDER',
  'DIGITEVEN',
  'DIGITODD',
];

/* ---------------- TRADE EVENT ---------------- */

export interface TradeEvent {
  type: 'open' | 'won' | 'lost';
  profit?: number;
  contract_id?: number;

  sessionPnL: number;
  winRate: number;
  winStreak: number;
  lossStreak: number;
}

/* ---------------- RETURN TYPE ---------------- */

interface UseDigitsTradingReturn {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;

  currentTick: Tick | null;
  lastDigit: number | null;
  digitStats: DigitStats;

  tradeType: TradeType;
  setTradeType: (type: TradeType) => void;

  contractMode: ContractMode;
  setContractMode: (mode: ContractMode) => void;

  selectedDigit: number;
  setSelectedDigit: (digit: number) => void;

  contractsAvailable: boolean;
  pipSize: number;

  stake: string;
  setStake: (value: string) => void;

  duration: number;
  setDuration: (value: number) => void;

  durationLimits: DurationLimits;
  defaultStake: number;

  proposal: ProposalInfo | null;
  isProposalLoading: boolean;

  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;

  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];

  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;

  /* 🔥 NEW: SINGLE TRADE EVENT STREAM */
  tradeEvent: TradeEvent | null;

  /* 📊 STATS */
  sessionPnL: number;
  winRate: number;
  winStreak: number;
  lossStreak: number;
}

/* ---------------- HOOK ---------------- */

export type UseDigitsTradingParams = Pick<
  UseBaseTradingParams,
  'ws' | 'isConnected' | 'isExhausted' | 'isAuthenticated' | 'onAuthWSFailed'
>;

export function useDigitsTrading({
  ws,
  isConnected,
  isExhausted,
  isAuthenticated,
  onAuthWSFailed,
}: UseDigitsTradingParams): UseDigitsTradingReturn {

  const {
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    contractsAvailable,
    durationLimits,
    defaultStake,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  } = useBaseTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated,
    onAuthWSFailed,
    contractTypes: CONTRACT_TYPES,
  });

  /* ---------------- TRADE STATE ---------------- */

  const [tradeType, setTradeTypeRaw] = useState<TradeType>('matches-differs');
  const [contractMode, setContractMode] = useState<ContractMode>('DIGITMATCH');
  const [selectedDigit, setSelectedDigit] = useState<number>(5);
  const [stake, setStake] = useState<string>('10');
  const [duration, setDuration] = useState<number>(5);

  /* ---------------- STATS ENGINE ---------------- */

  const [sessionPnL, setSessionPnL] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [lossStreak, setLossStreak] = useState(0);

  const [tradeEvent, setTradeEvent] = useState<TradeEvent | null>(null);

  /* ---------------- EVENT HANDLER ---------------- */

  const handleTradeUpdate = useCallback((profit: number, contractId?: number) => {
    const isWin = profit >= 0;

    if (isWin) {
      setWins((w) => w + 1);
      setWinStreak((s) => s + 1);
      setLossStreak(0);
    } else {
      setLosses((l) => l + 1);
      setLossStreak((s) => s + 1);
      setWinStreak(0);
    }

    setSessionPnL((p) => p + profit);

    const total = wins + losses + 1;

    const event: TradeEvent = {
      type: isWin ? 'won' : 'lost',
      profit,
      contract_id: contractId,
      sessionPnL: sessionPnL + profit,
      winRate: (wins / total) * 100,
      winStreak: isWin ? winStreak + 1 : 0,
      lossStreak: isWin ? 0 : lossStreak + 1,
    };

    setTradeEvent(event);
  }, [wins, losses, sessionPnL, winStreak, lossStreak]);

  /* ---------------- DIGIT HELPERS ---------------- */

  const digitStats: DigitStats = useMemo(
    () => computeDigitStats(prices, pipSize),
    [prices, pipSize]
  );

  const lastDigit = useMemo(() => {
    if (currentTick) {
      return getLastDigit(currentTick.quote, pipSize);
    }
    if (prices.length > 0) {
      return getLastDigit(prices[prices.length - 1], pipSize);
    }
    return null;
  }, [currentTick, prices, pipSize]);

  /* ---------------- PROPOSAL + BUY ---------------- */

  const {
    buyContract: buyWithProposal,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
  } = useBuy(ws, isConnected);

  const proposalParams: ProposalParams | null = useMemo(() => {
    if (isBuying || !activeSymbol) return null;

    const stakeNum = parseFloat(stake);
    if (!stakeNum || stakeNum <= 0) return null;

    const needsBarrier =
      contractMode !== 'DIGITEVEN' && contractMode !== 'DIGITODD';

    return {
      contractType: contractMode,
      symbol: activeSymbol.underlying_symbol,
      amount: stakeNum,
      duration,
      durationUnit: 't',
      basis: 'stake',
      currency: 'USD',
      ...(needsBarrier ? { barrier: selectedDigit } : {}),
    };
  }, [activeSymbol, contractMode, stake, duration, selectedDigit, isBuying]);

  const { proposal } = useProposal(ws, isConnected, proposalParams);

  const buyContract = useCallback(async () => {
    if (proposal) {
      setTradeEvent({
        type: 'open',
        contract_id: 0,
        sessionPnL,
        winRate: wins / Math.max(wins + losses, 1) * 100,
        winStreak,
        lossStreak,
      });

      await buyWithProposal(proposal);
    }
  }, [proposal, buyWithProposal]);

  /* ---------------- WIN/LOSS FROM BUY RESULT ---------------- */

  useEffect(() => {
    if (!buyResult) return;

    const profit = buyResult.profit ?? 0;

    handleTradeUpdate(profit, buyResult.contract_id);
    clearBuyResult();
  }, [buyResult]);

  /* ---------------- RETURN ---------------- */

  return {
    isConnected,
    isLoading,
    error,

    symbols,
    activeSymbol,
    selectSymbol,

    currentTick,
    lastDigit,
    digitStats,

    tradeType,
    setTradeType: setTradeTypeRaw,

    contractMode,
    setContractMode,

    selectedDigit,
    setSelectedDigit,

    contractsAvailable,
    pipSize,

    stake,
    setStake,

    duration,
    setDuration,

    durationLimits,
    defaultStake,

    proposal,
    isProposalLoading: isConnected && proposalParams !== null && proposal === null,

    buyContract,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,

    openPositions,
    closedPositions,

    sellContract,
    sellingId,
    sellError,
    clearSellError,

    tradeEvent,

    sessionPnL,
    winRate: wins + losses === 0 ? 0 : (wins / (wins + losses)) * 100,
    winStreak,
    lossStreak,
  };
}
