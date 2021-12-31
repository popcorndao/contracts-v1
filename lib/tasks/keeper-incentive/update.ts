import { utils } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
interface Args {
  contract: string;
  index: string;
  reward: string;
  enabled: string;
  permissionless: string;
}
export default task("keeper-incentive:update", "updates keeper incentive")
  .addParam("contract", "name of contract")
  .addParam("index", "index of incentive")
  .addParam("reward", "reward amount")
  .addParam("enabled", "1 for enabled, 0 for disabled")
  .addParam("permissionless", "1 for permissionless, 0 to require keeper role")
  .setAction(async (args: Args, hre) => {
    const signer = hre.ethers.provider.getSigner();
    const keeperIncentive = await hre.ethers.getContractAt(
      "KeeperIncentive",
      (
        await hre.deployments.get("KeeperIncentive")
      ).address,
      signer
    );

    const tx = await keeperIncentive.updateIncentive(
      utils.formatBytes32String(args.contract),
      parseInt(args.index),
      parseEther(args.reward),
      Boolean(parseInt(args.enabled)),
      Boolean(parseInt(args.permissionless))
    );

    const receipt = await tx.wait(1);
    console.log(receipt);
  });
