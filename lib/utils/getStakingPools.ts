// ------------------------ TODO - Should be moved to script helpers --------------------
export type Pool = {
  poolName: string;
  contract: string;
  inputToken: string;
  rewardsToken?: string;
};

export async function getStakingPools(
  chainId: number,
  addresses,
  deployments
): Promise<Pool[]> {
  const { pop, popUsdcLp, butter } = addresses;
  switch (chainId) {
    case 1:
      return [
        {
          poolName: "PopLocker",
          contract: "PopLocker",
          inputToken: pop,
        },
        {
          poolName: "popUsdcLPStaking",
          contract: "Staking",
          inputToken: popUsdcLp,
          rewardsToken: pop,
        },
        {
          poolName: "butterStaking",
          contract: "Staking",
          inputToken: butter,
          rewardsToken: pop,
        },
      ];
    case 1337:
      return [
        {
          poolName: "PopLocker",
          contract: "PopLocker",
          inputToken: (await deployments.get("TestPOP")).address,
        },
        {
          poolName: "popUsdcLPStaking",
          contract: "Staking",
          inputToken: (await deployments.get("POP_USDC_LP")).address,
          rewardsToken: (await deployments.get("TestPOP")).address,
        },
        {
          poolName: "butterStaking",
          contract: "Staking",
          inputToken: butter,
          rewardsToken: (await deployments.get("TestPOP")).address,
        },
      ];
    case 31337:
      return [
        {
          poolName: "PopLocker",
          contract: "PopLocker",
          inputToken: (await deployments.get("TestPOP")).address,
        },
        {
          poolName: "popUsdcLPStaking",
          contract: "Staking",
          inputToken: (await deployments.get("POP_USDC_LP")).address,
          rewardsToken: (await deployments.get("TestPOP")).address,
        },
        {
          poolName: "butterStaking",
          contract: "Staking",
          inputToken: butter,
          rewardsToken: (await deployments.get("TestPOP")).address,
        },
      ];
    case 137:
      return [
        {
          poolName: "PopLocker",
          contract: "PopLocker",
          inputToken: pop,
        },
        {
          poolName: "popUsdcLPStaking",
          contract: "Staking",
          inputToken: popUsdcLp,
          rewardsToken: pop,
        },
      ];
    default:
      return [
        {
          poolName: "PopLocker",
          contract: "PopLocker",
          inputToken: (await deployments.get("TestPOP")).address,
        },
        {
          poolName: "popUsdcLPStaking",
          contract: "Staking",
          inputToken: (await deployments.get("POP_USDC_LP")).address,
          rewardsToken: (await deployments.get("TestPOP")).address,
        },
      ];
  }
}
// -------------------------
