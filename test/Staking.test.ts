import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  expectEvent,
  expectRevert,
  expectValue,
} from "../lib/utils/expectValue";
import { DAYS, timeTravel } from "../lib/utils/test";
import { MockERC20, Staking } from "../typechain";
import { RewardsEscrow } from "../typechain/RewardsEscrow";

let stakingFund: BigNumber;

let owner: SignerWithAddress,
  nonOwner: SignerWithAddress,
  staker: SignerWithAddress,
  treasury: SignerWithAddress;

let mockERC20Factory;
let stakingToken: MockERC20;
let mockPop: MockERC20;
let staking: Staking;
let rewardsEscrow: RewardsEscrow;

const STAKE_AMOUNT = parseEther("10");
const STAKING_FUND = parseEther("10");

describe("Staking", function () {
  beforeEach(async function () {
    [owner, nonOwner, staker, treasury] = await ethers.getSigners();
    mockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockPop = (await mockERC20Factory.deploy(
      "TestPOP",
      "TPOP",
      18
    )) as MockERC20;
    await mockPop.mint(owner.address, parseEther("1000000"));
    await mockPop.mint(nonOwner.address, parseEther("10"));

    stakingToken = (await mockERC20Factory.deploy(
      "TestStakingToken",
      "TSTAKING",
      18
    )) as MockERC20;
    await stakingToken.mint(owner.address, parseEther("1000000"));
    await stakingToken.mint(nonOwner.address, parseEther("10"));

    rewardsEscrow = (await (
      await (
        await ethers.getContractFactory("RewardsEscrow")
      ).deploy(mockPop.address)
    ).deployed()) as RewardsEscrow;

    const stakingFactory = await ethers.getContractFactory("Staking");
    staking = (await stakingFactory.deploy(
      mockPop.address,
      stakingToken.address,
      rewardsEscrow.address
    )) as Staking;
    await staking.deployed();

    await rewardsEscrow.addAuthorizedContract(staking.address);
    await mockPop.transfer(staking.address, STAKING_FUND);
    await mockPop.connect(owner).approve(staking.address, parseEther("100000"));
  });

  describe("constructor", function () {
    it("has a rewards token", async function () {
      await expectValue(await staking.rewardsToken(), mockPop.address);
    });

    it("has a staking token", async function () {
      await expectValue(await staking.stakingToken(), stakingToken.address);
    });

    it("has a rewards escrow", async function () {
      await expectValue(await staking.rewardsEscrow(), rewardsEscrow.address);
    });

    it("increases rewardsToken allowance of RewardsEscrow to max at construction time", async function () {
      await expectValue(
        await mockPop.allowance(staking.address, rewardsEscrow.address),
        ethers.constants.MaxUint256
      );
    });
  });

  describe("totalSupply", function () {
    context("No tokens staked", function () {
      it("returns zero", async function () {
        await expectValue(await staking.totalSupply(), 0);
      });
    });
  });

  describe("balanceOf", function () {
    context("No tokens staked", function () {
      it("returns zero", async function () {
        await expectValue(await staking.balanceOf(staker.address), 0);
      });
    });
  });

  describe("lastTimeRewardApplicable", function () {
    context("No active rewards", function () {
      it("returns zero", async function () {
        await expectValue(await staking.lastTimeRewardApplicable(), 0);
      });
    });
  });

  describe("lastTimeRewardApplicable", function () {
    context("No active rewards", function () {
      it("returns zero", async function () {
        await expectValue(await staking.lastTimeRewardApplicable(), 0);
      });
    });
  });

  describe("rewardPerToken", function () {
    context("No active rewards", function () {
      it("returns zero", async function () {
        await expectValue(await staking.rewardPerToken(), 0);
      });
    });
  });

  describe("earned", function () {
    context("No tokens staked", function () {
      it("returns zero", async function () {
        await expectValue(await staking.earned(staker.address), 0);
      });
    });
  });

  describe("getRewardForDuration", function () {
    context("No active rewards", function () {
      it("returns zero", async function () {
        await expectValue(await staking.getRewardForDuration(), 0);
      });
    });
  });

  describe("stake", function () {
    context("require statements", function () {
      it("reverts on zero amount", async function () {
        await expectRevert(staking.connect(staker).stake(0), "Cannot stake 0");
      });
    });

    context("successful stake", function () {
      let stakeTx;

      beforeEach(async function () {
        await stakingToken.mint(staker.address, STAKE_AMOUNT);
        await stakingToken
          .connect(staker)
          .increaseAllowance(staking.address, STAKE_AMOUNT);
        stakeTx = staking.connect(staker).stake(STAKE_AMOUNT);
        await stakeTx;
      });

      it("increases total supply", async function () {
        await expectValue(await staking.totalSupply(), STAKE_AMOUNT);
      });

      it("creates a balance for msg.sender", async function () {
        await expectValue(
          await staking.balanceOf(staker.address),
          STAKE_AMOUNT
        );
      });

      it("transfers staking token", async function () {
        await expectValue(await stakingToken.balanceOf(staker.address), 0);
        await expectValue(
          await stakingToken.balanceOf(staking.address),
          STAKE_AMOUNT
        );
      });

      it("emits Staked event", async function () {
        await expectEvent(stakeTx, staking, "Staked", [
          staker.address,
          STAKE_AMOUNT,
        ]);
      });
    });
  });

  describe("withdraw", function () {
    context("require statements", function () {
      it("reverts on zero amount", async function () {
        await expectRevert(
          staking.connect(staker).withdraw(0),
          "Cannot withdraw 0"
        );
      });
    });

    context("successful withdrawals", function () {
      let withdrawTx;

      beforeEach(async function () {
        await stakingToken.mint(staker.address, STAKE_AMOUNT);
        await stakingToken
          .connect(staker)
          .increaseAllowance(staking.address, STAKE_AMOUNT);
        await staking.connect(staker).stake(STAKE_AMOUNT);
      });

      context("full withdrawal", function () {
        beforeEach(async function () {
          withdrawTx = staking.connect(staker).withdraw(STAKE_AMOUNT);
          await withdrawTx;
        });

        it("decreasese total supply by withdrawal amount", async function () {
          await expectValue(await staking.totalSupply(), 0);
        });

        it("reduces msg.sender balance by withdrawal amount", async function () {
          await expectValue(await staking.balanceOf(staker.address), 0);
        });

        it("transfers staking token", async function () {
          await expectValue(await stakingToken.balanceOf(staking.address), 0);
          await expectValue(
            await stakingToken.balanceOf(staker.address),
            STAKE_AMOUNT
          );
        });

        it("emits Withdrawn event", async function () {
          await expectEvent(withdrawTx, staking, "Withdrawn", [
            staker.address,
            STAKE_AMOUNT,
          ]);
        });
      });

      context("partial withdrawal", function () {
        const remainder = parseEther("1");
        const withdrawal = STAKE_AMOUNT.sub(remainder);

        beforeEach(async function () {
          withdrawTx = staking.connect(staker).withdraw(withdrawal);
          await withdrawTx;
        });

        it("decreasese total supply by withdrawal amount", async function () {
          await expectValue(await staking.totalSupply(), remainder);
        });

        it("reduces msg.sender balance by withdrawal amount", async function () {
          await expectValue(await staking.balanceOf(staker.address), remainder);
        });

        it("transfers staking token", async function () {
          await expectValue(
            await stakingToken.balanceOf(staking.address),
            remainder
          );
          await expectValue(
            await stakingToken.balanceOf(staker.address),
            withdrawal
          );
        });

        it("emits Withdrawn event", async function () {
          await expectEvent(withdrawTx, staking, "Withdrawn", [
            staker.address,
            withdrawal,
          ]);
        });
      });
    });
  });

  describe("getReward", function () {
    beforeEach(async function () {
      await stakingToken.mint(staker.address, STAKE_AMOUNT);
      await stakingToken
        .connect(staker)
        .increaseAllowance(staking.address, STAKE_AMOUNT);
      await staking.connect(staker).stake(STAKE_AMOUNT);
    });

    context("no active rewards", function () {
      it("transfers no tokens", async function () {
        await staking.connect(staker).getReward();
        await expectValue(await mockPop.balanceOf(staker.address), 0);
      });
    });

    context("active rewards", function () {
      beforeEach(async function () {
        await staking.connect(owner).notifyRewardAmount(STAKING_FUND);
        timeTravel(7 * DAYS);
      });

      it("transfers 10% of reward", async function () {
        await staking.connect(staker).getReward();
        await expectValue(
          await mockPop.balanceOf(staker.address),
          parseEther("0.999999999999967680")
        );
      });

      it("escrows 90% of reward", async function () {
        await staking.connect(staker).getReward();
        const [escrowId] = await rewardsEscrow.getEscrowIdsByUser(
          staker.address
        );
        const [[_start, _end, balance, _account]] =
          await rewardsEscrow.getEscrows([escrowId]);
        await expectValue(balance, parseEther("8.999999999999709120"));
      });

      it("emits RewardPaid event", async function () {
        await expectEvent(
          await staking.connect(staker).getReward(),
          staking,
          "RewardPaid",
          [staker.address, parseEther("9.999999999999676800")]
        );
      });
    });
  });
  describe("exit", function () {
    let exitTx;
    beforeEach(async function () {
      await stakingToken.mint(staker.address, STAKE_AMOUNT);
      await stakingToken
        .connect(staker)
        .increaseAllowance(staking.address, STAKE_AMOUNT);
      await staking.connect(staker).stake(STAKE_AMOUNT);
      await staking.connect(owner).notifyRewardAmount(STAKING_FUND);
      await timeTravel(8 * DAYS);
      exitTx = staking.connect(staker).exit();
    });
    it("should withdraw staked tokens when exiting", async () => {
      await exitTx;
      await expectValue(
        await stakingToken.balanceOf(staker.address),
        parseEther("10")
      );
    });
    it("should get rewards when exiting", async () => {
      await expectEvent(exitTx, staking, "RewardPaid", [
        staker.address,
        parseEther("9.999999999999676800"),
      ]);
    });
  });
});
