export interface RuleConfig {
  totalTiles: number;
  canChi: boolean;
  maxLossPerPlayer: number;
  dalanMinHonorTypes: number;
  dalanMinDiff: number;
  allowQiangXingPaoGang: boolean;
  zhiChanRequireTenpai: boolean;
  allowMultipleRon: boolean;
  enableCap: boolean;
  capAmount: number;
}

export const DEFAULT_RULES: RuleConfig = {
  totalTiles: 136,
  canChi: false,
  maxLossPerPlayer: 16,
  dalanMinHonorTypes: 5,
  dalanMinDiff: 3,
  allowQiangXingPaoGang: true,
  zhiChanRequireTenpai: true,
  allowMultipleRon: false,
  enableCap: true,
  capAmount: 16,
};
