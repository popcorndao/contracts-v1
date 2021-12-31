import { ethers } from "hardhat";
import { DAYS } from "./constants";

export const timeTravel = async (time?: number) => {
  ethers.provider.send("evm_increaseTime", [time || 1 * DAYS]);
  ethers.provider.send("evm_mine", []);
};
