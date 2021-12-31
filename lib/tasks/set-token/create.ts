import { task } from "hardhat/config";
import { DefaultConfiguration } from "../../external/SetToken/Configuration";
import SetTokenManager from "../../external/SetToken/SetTokenManager";

interface Args {
  debug: string; // 1 or 0
}

export default task("set-token:create", "creates set token")
  .addOptionalParam("debug", "display debug information")
  .setAction(async (args, hre) => {
    const [signer] = await hre.ethers.getSigners();

    console.log(
      "set token configuration:",
      JSON.stringify(DefaultConfiguration, null, 2)
    );

    const manager = new SetTokenManager(
      { ...DefaultConfiguration, manager: await signer.getAddress() },
      hre,
      signer
    );

    const address = await manager.createSet({
      args: { debug: args.debug ? Boolean(parseInt(args.debug)) : false },
    });
    return address;
  });
