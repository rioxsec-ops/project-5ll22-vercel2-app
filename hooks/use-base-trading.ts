'use client';

import { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useActiveSymbols, useTicks } from '@deriv/core';
import type {
  DerivWS,
  ActiveSymbol,
  Tick,
  DurationLimits,
  ContractInfo,
} from '@deriv/core';

import { useOpenPositions, type OpenPosition } from './use-open-positions';
import { useClosedPositions, type ClosedPosition } from './use-closed-positions';
import { useSellContract } from './use-sell-contract';

export interface UseBaseTradingParams {
  ws: DerivWS | null;
  isConnected: boolean;
  isExhausted?: boolean;
  isAuthenticated: boolean;
  onAuthWSFailed?: () => void;
  contractTypes: string[];
}

export interface UseBaseTradingReturn {
  ws: DerivWS | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;

  currentTick: Tick | null;
  prices: number[];
  pipSize: number;

  contracts: ContractInfo[];
  contractsAvailable: boolean;
  durationLimits: DurationLimits;
  defaultStake: number;

  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
  refreshClosedPositions: () => Promise<void>;

  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;

  /** 🔥 LIVE BALANCE */
  balance: number | null;
}

/**
 * Generic trading foundation shared across all template types.
 */
export function useBaseTrading({
  ws,
  isConnected,
  isExhausted,
  isAuthenticated,
  onAuthWSFailed,
  contractTypes,
}: UseBaseTradingParams): UseBaseTradingReturn {
  const [balance, setBalance] = useState<number | null>(null);

  // fallback logout if WS dies
  useEffect(() => {
    if (isExhausted && ws) {
      onAuthWSFailed?.();
    }
  }, [isExhausted, ws, onAuthWSFailed]);

  const {
    symbols,
    activeSymbol,
    selectSymbol,
    contracts,
    contractsAvailable,
    durationLimits,
    defaultStake,
    isLoading: symbolsLoading,
  } = useActiveSymbols(ws, isConnected, contractTypes);

  const { currentTick, prices, pipSize } = useTicks(ws, isConnected, activeSymbol);

  // WS error toast handler
  useEffect(() => {
    if (!ws || !isConnected) return;

    return ws.onMessage((data) => {
      if (!data.error) return;

      const msgType = data.msg_type as string | undefined;
      if (msgType === 'buy' || msgType === 'sell') return;

      const err = data.error as Record<string, string>;

      toast.error('Error', {
        description: err.message ?? 'Unexpected error occurred. Please try again.',
      });
    });
  }, [ws, isConnected]);

  // 🔥 OPEN POSITIONS
  const { positions: openPositions } = useOpenPositions(ws, isConnected, isAuthenticated);

  // 🔥 CLOSED POSITIONS
  const { positions: closedPositions, refresh: refreshClosedPositions } =
    useClosedPositions(ws, isConnected, isAuthenticated);

  const {
    sellContract: sellContractRaw,
    sellingId,
    sellError,
    clearSellError,
  } = useSellContract(ws, isConnected);

  // refresh closed after sell
  const sellContract = useCallback(
    async (contractId: number, bidPrice: string) => {
      await sellContractRaw(contractId, bidPrice);
      await refreshClosedPositions();
    },
    [sellContractRaw, refreshClosedPositions]
  );

  // 🔥 LIVE BALANCE SUBSCRIPTION (NEW)
  useEffect(() => {
    if (!ws || !isConnected || !isAuthenticated) return;

    const unsubscribe = ws.onMessage((data) => {
      if (data.msg_type !== 'balance') return;

      if (data.balance?.balance) {
        setBalance(parseFloat(data.balance.balance));
      }
    });

    ws.send({
      balance: 1,
      subscribe: 1,
    }).catch(() => {});

    return () => {
      unsubscribe?.();
      ws.send({ forget: 'balance' }).catch(() => {});
    };
  }, [ws, isConnected, isAuthenticated]);

  return {
    ws,
    isConnected,
    isLoading: !isConnected || symbolsLoading,
    error: null,

    symbols,
    activeSymbol,
    selectSymbol,

    currentTick,
    prices,
    pipSize,

    contracts,
    contractsAvailable,
    durationLimits,
    defaultStake,

    openPositions,
    closedPositions,
    refreshClosedPositions,

    sellContract,
    sellingId,
    sellError,
    clearSellError,

    balance, // 🔥 LIVE
  };
}
