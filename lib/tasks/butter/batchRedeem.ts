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

export default task(
  "butter:batch-redeem",
  "process current batch for redeeming"
)
  .addOptionalParam("dryRun", "will not submit transaction")
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

    const minAmountOf3Crv =
      await ButterBatchAdapter.getMinAmountOf3CrvToReceiveForBatchRedeem(
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
      minAmountOf3Crv: formatEther(minAmountOf3Crv),
    });

    let shouldSubmitTx = false;

    await (async () => {
      try {
        const mintTx = await butterBatchProcessing.estimateGas.batchRedeem(
          minAmountOf3Crv
        );
        console.log({ mintTxGas: formatUnits(mintTx, "gwei") });
        shouldSubmitTx = true;
      } catch (e) {
        console.error("Could not estimate gas, cannot submit tx");
      }
    })();

    if (shouldSubmitTx && !Boolean(parseInt(args["dryRun"]))) {
      console.log("Submitting batch redeem tx");
      const tx = await butterBatchProcessing.batchRedeem(minAmountOf3Crv);
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
