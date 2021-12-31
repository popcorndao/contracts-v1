import { ContractAddresses } from "../../../utils/src/types";
import { getNamedAccountsByChainId } from "./getNamedAccounts";

const butterDependencyContractNames = [
  "yFrax",
  "yMim",
  "crvFrax",
  "crvMim",
  "crvFraxMetapool",
  "crvMimMetapool",
  "threePool",
  "curveAddressProvider",
  "curveFactoryMetapoolDepositZap",
  "uniswapRouter",
  "setBasicIssuanceModule",
  "setTokenCreator",
  "setStreamingFeeModule",
];

const stakingContractNames = ["butterStaking", "popUsdcLpStaking"];

export const mapAccountsFromNamedAccounts = (chainId): ContractAddresses => {
  let contracts: ContractAddresses;
  const contractsForSelectedNetwork = getNamedAccountsByChainId(chainId);
  contracts = Object.keys(contractsForSelectedNetwork).reduce(
    (result, contract) => {
      if (stakingContractNames.includes(contract)) {
        result["staking"]
          ? result["staking"].push(contractsForSelectedNetwork[contract])
          : (result["staking"] = [contractsForSelectedNetwork[contract]]);
      } else if (butterDependencyContractNames.includes(contract)) {
        result["butterDependency"]
          ? (result["butterDependency"][contract] =
              contractsForSelectedNetwork[contract])
          : (result["butterDependency"] = {
              [contract]: contractsForSelectedNetwork[contract],
            });
      } else {
        result[contract] = contractsForSelectedNetwork[contract];
      }

      return result;
    },
    {} as ContractAddresses
  );
  return contracts;
};
export function getChainRelevantContracts(chainId): ContractAddresses {
  return mapAccountsFromNamedAccounts(chainId);
}
