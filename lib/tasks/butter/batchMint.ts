import { formatEther, formatUnits } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import ButterBatchAdapter, {
  ComponentMap,
} from "../../adapters/ButterBatchAdapter";
import { getNamedAccountsFromNetwork } from "../../utils/getNamedAccounts";

interface Args {
  dryRun: string;
}

export default task("butter:batch-mint", "process current batch for minting")
  .addOptionalParam("dryRun", "will not submit transaction if set to 1")

  .setAction(async (args: Args, hre: HardhatRuntimeEnvironment) => {
    const {
      butter,
      butterBatch,
      threePool,
      setBasicIssuanceModule,
      yMim,
      yFrax,
      crvMimMetapool,
      crvFraxMetapool,
    } = getNamedAccountsFromNetwork(hre);

    const {
      butterBatchProcessing,
      threePoolContract,
      basicIssuanceModule,
      crvMimMetapoolContract,
      crvFraxMetapoolContract,
      yMimVault,
      yFraxVault,
    } = await getContractDependencies(hre);

    const componentMap = await getComponentMap(
      [crvMimMetapoolContract, crvFraxMetapoolContract],
      [yMimVault, yFraxVault]
    );

    const minAmountOfButter =
      await ButterBatchAdapter.getMinAmountOfButterToReceiveForBatchMint(
        5,
        {
          hysiBatchInteraction: butterBatchProcessing,
          basicIssuanceModule,
          threePool: threePoolContract,
        },
        butter,
        componentMap
      );
    console.log({
      butter,
      butterBatch,
      threePool,
      setBasicIssuanceModule,
      yMim,
      yFrax,
      crvMimMetapool,
      crvFraxMetapool,
      minAmountOfButterToMint: formatEther(minAmountOfButter),
    });

    let shouldSubmitTx = false;

    await (async () => {
      try {
        const mintTx = await butterBatchProcessing.estimateGas.batchMint(
          minAmountOfButter
        );
        console.log({ mintTxGas: formatUnits(mintTx, "gwei") });
        shouldSubmitTx = true;
      } catch (e) {
        console.error("Could not estimate gas, cannot submit tx");
      }
    })();

    if (shouldSubmitTx && !Boolean(parseInt(args["dryRun"]))) {
      console.log("Submitting batch mint tx");
      const tx = await butterBatchProcessing.batchMint(minAmountOfButter);
      const receipt = await tx.wait(1);
      console.log("Transaction confirmed: ", receipt.transactionHash);
    }
  });

const getComponentMap = async (
  [crvMimMetapoolContract, crvFraxMetapoolContract],
  [yMimVault, yFraxVault]
): Promise<ComponentMap> => {
  return {
    [yMimVault.address.toLowerCase()]: {
      metaPool: crvMimMetapoolContract,
      yPool: yMimVault,
    },
    [yFraxVault.address.toLowerCase()]: {
      metaPool: crvFraxMetapoolContract,
      yPool: yFraxVault,
    },
  } as ComponentMap;
};

const getContractDependencies = async (hre: HardhatRuntimeEnvironment) => {
  const {
    butterBatch,
    threePool,
    setBasicIssuanceModule,
    yMim,
    yFrax,
    crvMimMetapool,
    crvFraxMetapool,
  } = getNamedAccountsFromNetwork(hre);

  const butterBatchProcessing = await hre.ethers.getContractAt(
    "ButterBatchProcessing",
    butterBatch
  );
  const threePoolContract = await hre.ethers.getContractAt(
    "MockCurveThreepool",
    threePool
  );
  const basicIssuanceModule = await hre.ethers.getContractAt(
    "BasicIssuanceModule",
    setBasicIssuanceModule
  );
  const crvMimMetapoolContract = await hre.ethers.getContractAt(
    "CurveMetapool",
    crvMimMetapool
  );
  const crvFraxMetapoolContract = await hre.ethers.getContractAt(
    "CurveMetapool",
    crvFraxMetapool
  );

  const yMimVault = await hre.ethers.getContractAt("YearnVault", yMim);
  const yFraxVault = await hre.ethers.getContractAt("YearnVault", yFrax);
  return {
    butterBatchProcessing,
    threePoolContract,
    basicIssuanceModule,
    crvMimMetapoolContract,
    crvFraxMetapoolContract,
    yMimVault,
    yFraxVault,
  };
};
