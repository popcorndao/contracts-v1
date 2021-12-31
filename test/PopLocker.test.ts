import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { expectValue } from "../lib/utils/expectValue";
import { DAYS } from "../lib/utils/test/constants";
import { timeTravel } from "../lib/utils/test/timeTravel";
import { MockERC20, PopLocker } from "../typechain";
import { RewardsEscrow } from "../typechain/RewardsEscrow";

let stakingFund: BigNumber;

let owner: SignerWithAddress,
  nonOwner: SignerWithAddress,
  staker: SignerWithAddress,
  treasury: SignerWithAddress;

let mockERC20Factory;
let mockPop: MockERC20;
let staking: PopLocker;
let rewardsEscrow: RewardsEscrow;

describe("PopLocker", function () {
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

    rewardsEscrow = (await (
      await (
        await ethers.getContractFactory("RewardsEscrow")
      ).deploy(mockPop.address)
    ).deployed()) as RewardsEscrow;

    const popLockerFactory = await ethers.getContractFactory("PopLocker");
    staking = (await popLockerFactory.deploy(
      mockPop.address,
      rewardsEscrow.address
    )) as PopLocker;
    await staking.deployed();

    await staking.addReward(mockPop.address, owner.address, true);

    await rewardsEscrow.addAuthorizedContract(staking.address);

    stakingFund = parseEther("10");
    await mockPop.transfer(staking.address, stakingFund);
    await mockPop.connect(owner).approve(staking.address, parseEther("100000"));
  });

  describe("constructor", function () {
    it("stores token passed at construction time", async function () {
      await expectValue(await staking.stakingToken(), mockPop.address);
      await expectValue(await staking.rewardTokens(0), mockPop.address);
    });

    it("stores rewards escrow address", async function () {
      await expectValue(await staking.rewardsEscrow(), rewardsEscrow.address);
    });

    it("adds RewardsDistributor", async function () {
      await expectValue(
        await staking.rewardDistributors(mockPop.address, owner.address),
        true
      );
    });
  });

  describe("stake", function () {
    it("reverts on zero amount", async function () {
      await expect(staking.lock(owner.address, 0, 0)).to.be.revertedWith(
        "Cannot stake 0"
      );
    });

    it("reverts if spend ratio is too high", async function () {
      await expect(
        staking.lock(owner.address, parseEther("1"), BigNumber.from("1600"))
      ).to.be.revertedWith("over max spend");
    });

    it("reverts if contract is shut down", async function () {
      await staking.shutdown();
      await expect(
        staking.lock(owner.address, parseEther("1"), 0)
      ).to.be.revertedWith("shutdown");
    });

    it("reverts on insufficient caller balance", async function () {
      await expect(
        staking.lock(owner.address, parseEther("10000000000"), 0)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("transfers tokens on lock", async function () {
      const amount = parseEther("10000");
      const currentBalance = await mockPop.balanceOf(owner.address);
      await staking.connect(owner).lock(owner.address, amount, 0);
      expect(await mockPop.balanceOf(staking.address)).to.equal(
        stakingFund.add(amount)
      );
      expect(await mockPop.balanceOf(owner.address)).to.equal(
        currentBalance.sub(amount)
      );
    });

    it("should lock funds successfully", async function () {
      const amount = parseEther("10000");
      const currentBalance = await mockPop.balanceOf(owner.address);
      await expect(staking.connect(owner).lock(owner.address, amount, 0))
        .to.emit(staking, "Staked")
        .withArgs(owner.address, amount, amount, amount);
      expect(await mockPop.balanceOf(staking.address)).to.equal(
        stakingFund.add(amount)
      );
      expect(await mockPop.balanceOf(owner.address)).to.equal(
        currentBalance.sub(amount)
      );
      expect(await staking.lockedBalanceOf(owner.address)).to.equal(
        parseEther("10000")
      );
    });

    it("balanceOf updates on next epoch", async function () {
      const amount = parseEther("10000");
      const currentBalance = await mockPop.balanceOf(owner.address);
      await staking.connect(owner).lock(owner.address, amount, 0);
      await timeTravel(7 * DAYS);
      expect(await staking.balanceOf(owner.address)).to.equal(
        parseEther("10000")
      );
    });

    it("balanceOf will not update in same epoch when locking tokens", async function () {
      await staking.connect(owner).lock(owner.address, parseEther("10000"), 0);
      expect(await staking.balanceOf(owner.address)).to.equal(parseEther("0"));
    });

    it("should update locked balances when staking", async () => {
      const amount = parseEther("10");
      await mockPop.approve(staking.address, amount);

      await staking.connect(owner).lock(owner.address, amount, 0);
      const lockedBalance = await staking.lockedBalanceOf(owner.address);
      expect(lockedBalance).to.equal(parseEther("10"));
    });
  });

  describe("stakeFor", function () {
    it("should lock funds successfully", async function () {
      const amount = parseEther("10000");
      const currentBalance = await mockPop.balanceOf(owner.address);
      await expect(staking.lock(staker.address, amount, 0))
        .to.emit(staking, "Staked")
        .withArgs(staker.address, amount, amount, amount);
      await timeTravel(6 * DAYS);
      await staking.checkpointEpoch();
      expect(await mockPop.balanceOf(staking.address)).to.equal(
        stakingFund.add(amount)
      );
      expect(await mockPop.balanceOf(owner.address)).to.equal(
        currentBalance.sub(amount)
      );
      expect(await staking.balanceOf(staker.address)).to.equal(
        parseEther("10000")
      );
    });
    it("should update locked balances when staking", async () => {
      const amount = parseEther("10");
      await mockPop.connect(staker).approve(staking.address, amount);

      await staking.lock(staker.address, amount, 0);
      const lockedBalance = await staking.lockedBalanceOf(staker.address);
      expect(lockedBalance).to.equal(parseEther("10"));
    });
  });

  describe("rewards escrow integration", async () => {
    let earnedRewards: BigNumber;
    beforeEach(async () => {
      const amount = parseEther("10");
      await staking
        .connect(owner)
        .notifyRewardAmount(mockPop.address, stakingFund);
      await staking.connect(owner).lock(owner.address, amount, 0);

      await timeTravel(7 * DAYS);
      const [, amountEarned] = (
        await staking.claimableRewards(owner.address)
      )[0];
      earnedRewards = amountEarned;
      await staking.connect(owner).getReward(owner.address);
    });
    it("should set duration to 365 days when rewards are added to escrow", async () => {
      const [escrowId] = await rewardsEscrow.getEscrowIdsByUser(owner.address);
      const escrow = await rewardsEscrow.escrows(escrowId);
      expect(escrow.end).to.equal(escrow.start.add(365 * DAYS));
    });

    it("should add 90% of claimable to escrow", async () => {
      const [escrowId] = await rewardsEscrow.getEscrowIdsByUser(owner.address);
      const escrow = await rewardsEscrow.escrows(escrowId);
      expect(escrow.balance).to.equal(earnedRewards.div(10).mul(9));
    });
  });

  describe("withdraw", function () {
    it("should release funds successfully after lock period has expired", async function () {
      const amount = parseEther("100");
      await staking.connect(owner).lock(owner.address, amount, 0);
      await timeTravel(7 * 13 * DAYS);
      expect(await staking["processExpiredLocks(bool)"](false))
        .to.emit(staking, "Withdrawn")
        .withArgs(owner.address, amount);
      expect(await staking.lockedBalanceOf(owner.address)).to.equal(0);
      expect(await staking.balanceOf(owner.address)).to.equal(0);
    });
    it("should not release funds successfully after lock period has expired", async function () {
      const amount = parseEther("100");
      await staking.connect(owner).lock(owner.address, amount, 0);
      await timeTravel(7 * DAYS);
      await expect(
        staking["processExpiredLocks(bool)"](false)
      ).to.be.revertedWith("no exp locks");
      expect(await staking.lockedBalanceOf(owner.address)).to.equal(amount);
      expect(await staking.balanceOf(owner.address)).to.equal(amount);
    });
  });

  describe("rewards", function () {
    it("should emit a RewardPaid event when rewards are paid out", async function () {
      const amount = parseEther("10");
      await staking
        .connect(owner)
        .notifyRewardAmount(mockPop.address, stakingFund);
      await staking.connect(owner).lock(owner.address, amount, 0);
      await timeTravel(7 * DAYS);
      const [, amountEarned] = (
        await staking.claimableRewards(owner.address)
      )[0];

      const result = await staking.connect(owner).getReward(owner.address);
      expect(result).to.emit(staking, "RewardPaid");
    });
    it("should pay out rewards successfully", async function () {
      const amount = parseEther("10");
      await staking
        .connect(owner)
        .notifyRewardAmount(mockPop.address, stakingFund);
      await staking.connect(owner).lock(owner.address, amount, 0);

      await timeTravel(7 * DAYS);

      const [, amountEarned] = (
        await staking.claimableRewards(owner.address)
      )[0];

      const payout = amountEarned.div(10);
      const popBalance = await mockPop.balanceOf(owner.address);
      await staking.connect(owner).getReward(owner.address);

      expect(await mockPop.balanceOf(owner.address)).to.equal(
        popBalance.add(payout)
      );

      expect(await staking.lockedBalanceOf(owner.address)).to.equal(
        parseEther("10")
      );
      expect(
        (await staking.claimableRewards(owner.address))[0].amount
      ).to.equal(0);
    });

    it("should send 90% of earned rewards to escrow when claimed", async function () {
      const amount = parseEther("10");
      await staking
        .connect(owner)
        .notifyRewardAmount(mockPop.address, stakingFund);
      await staking.connect(owner).lock(owner.address, amount, 0);

      await timeTravel(7 * DAYS);

      const [, amountEarned] = (
        await staking.claimableRewards(owner.address)
      )[0];

      const payout = amountEarned.div(10);
      const popBalance = await mockPop.balanceOf(rewardsEscrow.address);
      await staking.connect(owner).getReward(owner.address);

      expect(await mockPop.balanceOf(rewardsEscrow.address)).to.equal(
        popBalance.add(payout.mul(9))
      );
    });

    it("lowers the reward rate when more user stake", async function () {
      const amount = parseEther("1");
      await staking
        .connect(owner)
        .notifyRewardAmount(mockPop.address, stakingFund);
      await staking.connect(owner).lock(owner.address, amount, 0);
      await mockPop.connect(nonOwner).approve(staking.address, amount);
      await staking.connect(nonOwner).lock(nonOwner.address, amount, 0);
      await timeTravel(7 * DAYS);
      expect(
        (await staking.claimableRewards(owner.address))[0].amount
      ).to.equal(parseEther("5.000008267195605595"));
      expect(
        (await staking.claimableRewards(nonOwner.address))[0].amount
      ).to.equal(parseEther("4.999975198412536813"));
    });
  });

  describe("balanceOf", function () {
    it("should return 0 balance after lockperiod ended", async function () {
      await staking.connect(owner).lock(owner.address, parseEther("1"), 0);
      await timeTravel(13 * 7 * DAYS);
      await staking.checkpointEpoch();
      const voiceCredits = await staking.balanceOf(owner.address);
      expect(voiceCredits.toString()).to.equal("0");
    });
  });

  describe("notifyRewardAmount", function () {
    it("should set rewards", async function () {
      expect(
        await staking.connect(owner).getRewardForDuration(mockPop.address)
      ).to.equal(0);
      await staking
        .connect(owner)
        .notifyRewardAmount(mockPop.address, stakingFund);
      expect(
        await staking.connect(owner).getRewardForDuration(mockPop.address)
      ).to.equal(parseEther("9.999999999999676800"));
    });

    it("should revert if not owner", async function () {
      await expect(
        staking
          .connect(nonOwner)
          .notifyRewardAmount(mockPop.address, stakingFund)
      ).to.be.revertedWith("not authorized");
    });

    it("should be able to increase rewards", async function () {
      await staking.notifyRewardAmount(mockPop.address, parseEther("5"));
      expect(
        await staking.connect(owner).getRewardForDuration(mockPop.address)
      ).to.equal(parseEther("4.999999999999536000"));
      await staking.notifyRewardAmount(mockPop.address, parseEther("5"));
      expect(
        await staking.connect(owner).getRewardForDuration(mockPop.address)
      ).to.equal(parseEther("9.999991732803408000"));
    });
    it("should transfer rewards via notifyRewardAmount", async function () {
      const stakingPopBalance = await mockPop.balanceOf(staking.address);
      await staking.notifyRewardAmount(mockPop.address, parseEther("11"));
      expect(await mockPop.balanceOf(staking.address)).to.equal(
        stakingPopBalance.add(parseEther("11"))
      );
    });
  });
});
