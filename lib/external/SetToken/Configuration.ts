import { BigNumberish } from "@setprotocol/set-protocol-v2/node_modules/ethers";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { getNamedAccountsByChainId } from "../../utils/getNamedAccounts";
import { ZERO } from "./utils/constants";

const {
  yMim,
  crvMimMetapool,
  yFrax,
  crvFraxMetapool,
  setTokenCreator,
  setBasicIssuanceModule,
  setStreamingFeeModule,
  daoTreasury,
  daoAgent,
} = getNamedAccountsByChainId(1);

export interface Configuration {
  targetNAV: BigNumber;
  manager?: string;
  core: {
    SetTokenCreator: {
      address: string;
    };
    modules: {
      BasicIssuanceModule?: {
        address: string;
        config?: {
          preIssueHook?: string;
        };
      };
      StreamingFeeModule: {
        address: string;
        config?: {
          feeRecipient: string;
          maxStreamingFeePercentage: BigNumberish;
          streamingFeePercentage: BigNumberish;
          lastStreamingFeeTimestamp: BigNumberish;
        };
      };
    };
  };
  components: {
    [key: string]: {
      ratio: number; // percent of targetNAV (out of 100)
      address: string;
      oracle: string;
    };
  };
}

export const DefaultConfiguration: Configuration = {
  targetNAV: parseEther("1000"),
  manager: daoAgent,
  core: {
    SetTokenCreator: {
      address: setTokenCreator,
    },
    modules: {
      BasicIssuanceModule: {
        address: setBasicIssuanceModule,
      },
      StreamingFeeModule: {
        address: setStreamingFeeModule,
        config: {
          feeRecipient: daoTreasury,
          maxStreamingFeePercentage: parseEther(".05") as BigNumberish,
          streamingFeePercentage: parseEther(".0272") as BigNumberish,
          lastStreamingFeeTimestamp: ZERO as BigNumberish,
        },
      },
    },
  },
  components: {
    ycrvFRAX: {
      ratio: 50,
      address: yFrax,
      oracle: crvFraxMetapool,
    },
    ycrvMIM: {
      ratio: 50,
      address: yMim,
      oracle: crvMimMetapool,
    },
  },
};
