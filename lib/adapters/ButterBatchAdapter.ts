import { Web3Provider } from "@ethersproject/providers";
import { formatEther, parseEther } from "@ethersproject/units";
import { BigNumber, Contract } from "ethers";

export enum BatchType {
  Mint,
  Redeem,
}

export interface CurrentBatches {
  mint: Batch;
  redeem: Batch;
}

export interface TimeTillBatchProcessing {
  timeTillProcessing: Date;
  progressPercentage: number;
}
export interface Batch {
  batchType: BatchType;
  batchId: string;
  claimable: boolean;
  unclaimedShares: BigNumber;
  suppliedTokenBalance: BigNumber;
  claimableTokenBalance: BigNumber;
  suppliedTokenAddress: string;
  claimableTokenAddress: string;
}

export interface AccountBatch extends Batch {
  accountSuppliedTokenBalance: BigNumber;
  accountClaimableTokenBalance: BigNumber;
}

export interface ComponentMap {
  // key is yTokenAddress
  [key: string]: {
    metaPool?: Contract;
    yPool?: Contract;
  };
}

class ButterBatchAdapter {
  constructor(private contract: Contract) {}

  async getBatch(batchId: string): Promise<Batch> {
    const batch = await this.contract.batches(batchId);
    return {
      batchType: batch.batchType,
      batchId: batch.batchId,
      claimable: batch.claimable,
      unclaimedShares: batch.unclaimedShares,
      suppliedTokenBalance: batch.suppliedTokenBalance,
      claimableTokenBalance: batch.claimableTokenBalance,
      suppliedTokenAddress: batch.suppliedTokenAddress,
      claimableTokenAddress: batch.claimableTokenAddress,
    };
  }

  async calculateAmountToReceiveForClaim(batchId, address): Promise<BigNumber> {
    const batch = await this.contract.batches(batchId);

    const unclaimedShares = batch.unclaimedShares;
    const claimableTokenBalance = batch.claimableTokenBalance;
    const accountBalance = await this.contract.accountBalances(
      batchId,
      address
    );
    if (
      claimableTokenBalance === BigNumber.from("0") ||
      accountBalance === BigNumber.from("0") ||
      unclaimedShares === BigNumber.from("0")
    ) {
      return BigNumber.from("0");
    }

    return claimableTokenBalance.mul(accountBalance).div(unclaimedShares);
  }

  static async getMinAmountOf3CrvToReceiveForBatchRedeem(
    slippage: number = 50, //in bps
    contracts: {
      hysiBatchInteraction: Contract;
      basicIssuanceModule: Contract;
      threePool: Contract;
    },
    setTokenAddress: string,
    componentMap: ComponentMap
  ): Promise<BigNumber> {
    const batchId = await contracts.hysiBatchInteraction.currentRedeemBatchId();

    // get expected units of HYSI given 3crv amount:
    const butterInBatch = (
      await contracts.hysiBatchInteraction.batches(batchId)
    ).suppliedTokenBalance;

    const butterBatchValue = await ButterBatchAdapter.getButterValue(
      contracts.basicIssuanceModule,
      componentMap,
      setTokenAddress,
      butterInBatch
    );

    const threeCrvVirtualPrice =
      (await contracts.threePool.get_virtual_price()) as BigNumber;

    const batchThreeCrvValue = butterBatchValue
      .div(threeCrvVirtualPrice)
      .mul(parseEther("1"));

    const denominator = 10000;
    const delta = batchThreeCrvValue.mul(slippage).div(denominator);
    const minAmountToMint = batchThreeCrvValue.sub(delta);

    console.log({
      batchId,
      slippage,
      butterInBatch: formatEther(butterInBatch),
      threeCrvVirtualPrice: formatEther(threeCrvVirtualPrice),
      batchThreeCrvValue: formatEther(batchThreeCrvValue),
      butterBatchValue: formatEther(butterBatchValue),
      delta: formatEther(delta),
      minAmountToMint: formatEther(minAmountToMint),
    });

    return minAmountToMint;
  }

  static async getMinAmountOfButterToReceiveForBatchMint(
    slippage: number = 50, // in bps
    contracts: {
      hysiBatchInteraction: Contract;
      basicIssuanceModule: Contract;
      threePool: Contract;
    },
    setTokenAddress: string,
    componentMap: ComponentMap
  ): Promise<BigNumber> {
    const batchId = await contracts.hysiBatchInteraction.currentMintBatchId();

    const threeCrvInBatch = (
      await contracts.hysiBatchInteraction.batches(batchId)
    ).suppliedTokenBalance;

    const threeCrvVirtualPrice =
      (await contracts.threePool.get_virtual_price()) as BigNumber;

    const threeCrvUsdValue = threeCrvInBatch
      .mul(threeCrvVirtualPrice)
      .div(parseEther("1"));

    const butterPrice = await ButterBatchAdapter.getButterValue(
      contracts.basicIssuanceModule,
      componentMap,
      setTokenAddress
    );

    const totalToMint = threeCrvUsdValue.mul(parseEther("1")).div(butterPrice);
    console.log({ totalToMint: formatEther(totalToMint) });

    const denominator = 10000;
    const delta = totalToMint.mul(slippage).div(denominator);
    const minAmountToMint = totalToMint.sub(delta);

    console.log({
      batchId,
      slippage,
      threeCrvInBatch: formatEther(threeCrvInBatch),
      threeCrvVirtualPrice: formatEther(threeCrvVirtualPrice),
      threeCrvUsdValue: formatEther(threeCrvUsdValue),
      butterPrice: formatEther(butterPrice),
      delta: formatEther(delta),
      minAmountToMint: formatEther(minAmountToMint),
    });

    return minAmountToMint;
  }

  static async getButterValue(
    basicIssuanceModule: Contract,
    componentMap: ComponentMap,
    butterAddress: string,
    units?: BigNumber
  ): Promise<BigNumber> {
    const components =
      await basicIssuanceModule.getRequiredComponentUnitsForIssue(
        butterAddress,
        units ? units : parseEther("1")
      );

    const componentAddresses = components[0];
    const componentAmounts = components[1];

    const componentVirtualPrices = await Promise.all(
      componentAddresses.map(async (address) => {
        const metapool = componentMap[address.toLowerCase()].metaPool;
        const yPool = componentMap[address.toLowerCase()].yPool;
        const yPoolPricePerShare = await yPool.pricePerShare();
        const metapoolPrice = await metapool.get_virtual_price();
        return yPoolPricePerShare
          .mul(metapoolPrice)
          .div(parseEther("1")) as BigNumber;
      })
    );

    const butterValue = componentVirtualPrices.reduce(
      (sum: BigNumber, componentPrice: BigNumber, i) => {
        return sum.add(
          componentPrice.mul(componentAmounts[i]).div(parseEther("1"))
        );
      },
      parseEther("0")
    );

    return butterValue as BigNumber;
  }

  public async getThreeCrvPrice(contract: Contract): Promise<BigNumber> {
    return await contract.get_virtual_price();
  }

  public async getStableCoinPrice(
    contract: Contract,
    tokenAmount: BigNumber[]
  ): Promise<BigNumber> {
    const threeCrvPrice = await contract.get_virtual_price();
    const threeCrvAmountforStable = await contract.calc_token_amount(
      tokenAmount,
      true
    );
    return threeCrvPrice.mul(threeCrvAmountforStable).div(parseEther("1"));
  }

  public async getTokenSupply(contract: Contract): Promise<BigNumber> {
    return await contract.totalSupply();
  }

  public async getBatches(account: string): Promise<AccountBatch[]> {
    const batchIds = await this.contract.getAccountBatches(account);
    const batches = await Promise.all(
      batchIds.map(async (id) => {
        const batch = await this.contract.batches(id);
        const shares = await this.contract.accountBalances(id, account);
        return {
          ...batch,
          accountSuppliedTokenBalance: shares,
          accountClaimableTokenBalance: batch.unclaimedShares.eq(
            BigNumber.from("0")
          )
            ? 0
            : batch.claimableTokenBalance
                .mul(shares)
                .div(batch.unclaimedShares),
        };
      })
    );
    return (batches as AccountBatch[]).filter(
      (batch) => batch.accountSuppliedTokenBalance > BigNumber.from("0")
    );
  }

  public async getBatchCooldowns(): Promise<BigNumber[]> {
    const lastMintedAt = await this.contract.lastMintedAt();
    const lastRedeemedAt = await this.contract.lastRedeemedAt();
    const cooldown = await this.contract.batchCooldown();
    return [lastMintedAt.add(cooldown), lastRedeemedAt.add(cooldown)];
  }

  public async calcBatchTimes(
    library: Web3Provider
  ): Promise<TimeTillBatchProcessing[]> {
    const cooldowns = await this.getBatchCooldowns();
    const currentBlockTime = await (await library.getBlock("latest")).timestamp;
    const secondsTillMint = new Date(
      (currentBlockTime / Number(cooldowns[0].toString())) * 1000
    );
    const secondsTillRedeem = new Date(
      (currentBlockTime / Number(cooldowns[1].toString())) * 1000
    );
    const percentageTillMint =
      currentBlockTime / Number(cooldowns[0].toString());
    const percentageTillRedeem =
      (currentBlockTime / Number(cooldowns[1].toString())) * 100;
    return [
      {
        timeTillProcessing: secondsTillMint,
        progressPercentage: percentageTillMint,
      },
      {
        timeTillProcessing: secondsTillRedeem,
        progressPercentage: percentageTillRedeem,
      },
    ];
  }

  public async getCurrentBatches(): Promise<CurrentBatches> {
    const mintId = await this.contract.currentMintBatchId();
    const redeemId = await this.contract.currentRedeemBatchId();

    const mintBatch = await this.getBatch(mintId);
    const redeemBatch = await this.getBatch(redeemId);

    return { mint: mintBatch, redeem: redeemBatch };
  }
}

export default ButterBatchAdapter;
