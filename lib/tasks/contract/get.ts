import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface Args {
  contract: string;
  address: string;
  method: string;
  args: string;
}

export default task("contract:get", "call arbitrary methods from contract")
  .addParam("contract", "name of contract")
  .addParam("address", "address of contract")
  .addParam("method", "method to call")
  .addOptionalParam("args", "comma separated list of arguments for method")
  .setAction(async (arg, hre: HardhatRuntimeEnvironment) => {
    const { method, args, contract, address } = arg;
    const staking = hre.ethers.getContractAt(contract, address);
    const argmnts = args ? args.split(",") : undefined;
    if (argmnts) {
      console.log(await staking[method](...argmnts));
    } else {
      console.log(await staking[method]());
    }
  });
